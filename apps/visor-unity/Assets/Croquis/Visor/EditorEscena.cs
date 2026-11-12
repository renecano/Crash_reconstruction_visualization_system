using System;
using System.Collections.Generic;
using Croquis.Core;
using Croquis.Generated;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.Rendering;

namespace Croquis.Visor
{
    /// <summary>
    /// El modo edición en 3D (U6, C2 y C1; mensaje `modoEdicion` del puente 1.2.0).
    ///
    /// - **Mover** (la herramienta de omisión): se arrastra un objeto colocado (poste, muro, árbol,
    ///   barrera, señal, vehículo estacionado) por el piso; la rueda o dos dedos lo giran; con
    ///   mayúsculas la rueda cambia su largo. Mientras tanto se ve un fantasma en el lugar nuevo y, al
    ///   soltar, sale `objetoEditado`. Esc cancela.
    /// - **Puntos** (`punto_inicial`, `choque_intermedio`, `punto_paso`): un clic en el piso manda
    ///   `puntoMarcado` con el vehículo que pidió la web.
    ///
    /// Unity nunca recalcula: la web actualiza la escena, corre el solver y vuelve a mandar el caso, y
    /// el objeto aparece en su lugar nuevo. Mientras se arrastra, la cámara no se mueve.
    /// </summary>
    [DefaultExecutionOrder(-50)]
    public sealed class EditorEscena : MonoBehaviour
    {
        /// <summary>Lo que cuenta como clic y no como arrastre (pixeles).</summary>
        private const float Clic = 6f;

        private readonly List<ResultadoObjeto> objetos = new List<ResultadoObjeto>();
        private PiezaEditable[] piezas = Array.Empty<PiezaEditable>();
        private Terreno terreno = new Terreno();
        private bool activo;
        private string herramienta = "mover";
        private string vehiculoId;

        // El arrastre en curso.
        private int elegido = -1;
        private Vector2 desde;
        private bool movio;
        private double x;
        private double y;
        private double rumbo;
        private double largo;
        private double offX;
        private double offY;
        private float anguloDedos = float.NaN;
        private GameObject fantasma;

        /// <summary>Alguien arrastra un objeto: `CamaraVisor` no debe moverse.</summary>
        public static bool Arrastrando { get; private set; }

        /// <summary>Los objetos del caso que se acaba de cargar.</summary>
        public void Preparar(ResultadoObjeto[] lista, Terreno t)
        {
            Cancelar();
            objetos.Clear();
            if (lista != null)
            {
                objetos.AddRange(lista);
            }

            terreno = t ?? new Terreno();
            piezas = new PiezaEditable[objetos.Count];
            for (var i = 0; i < objetos.Count; i++)
            {
                var o = objetos[i];
                piezas[i] = new PiezaEditable(
                    o.Id, o.X, o.Y, terreno.Z((float)o.X, (float)o.Y), o.RumboDeg, o.LargoM, o.AnchoM, o.AltoM,
                    o.Forma == Forma.Cilindro ? o.RadioM ?? Math.Max(o.LargoM, o.AnchoM) / 2.0 : (double?)null);
            }
        }

        public void Modo(bool on, string queHerramienta, string vehiculo)
        {
            activo = on;
            herramienta = string.IsNullOrEmpty(queHerramienta) ? "mover" : queHerramienta;
            vehiculoId = vehiculo;
            if (!on)
            {
                Cancelar();
            }
        }

        private void Update()
        {
            if (!activo || Camera.main == null)
            {
                return;
            }

            if (elegido >= 0 && Input.GetKeyDown(KeyCode.Escape))
            {
                Cancelar();
                return;
            }

            if (Input.GetMouseButtonDown(0))
            {
                Empezar(Input.mousePosition);
            }
            else if (elegido >= 0 && Input.GetMouseButton(0))
            {
                Arrastrar(Input.mousePosition);
            }
            else if (Input.GetMouseButtonUp(0))
            {
                Soltar(Input.mousePosition);
            }
        }

        private void Empezar(Vector2 pantalla)
        {
            desde = pantalla;
            movio = false;
            if (herramienta != "mover")
            {
                return;
            }

            var (o, d) = Rayo(pantalla);
            elegido = Edicion.Elegir(piezas, o.x, o.z, o.y, d.x, d.z, d.y);
            if (elegido < 0)
            {
                return;
            }

            var p = piezas[elegido];
            x = p.X;
            y = p.Y;
            rumbo = p.RumboDeg;
            largo = p.Largo;
            var pega = Edicion.AlPlano(o.x, o.z, o.y, d.x, d.z, d.y, p.Piso);
            offX = pega.HasValue ? p.X - pega.Value.X : 0.0;
            offY = pega.HasValue ? p.Y - pega.Value.Y : 0.0;
            Arrastrando = true;
            anguloDedos = float.NaN;
            Fantasma();
        }

        private void Arrastrar(Vector2 pantalla)
        {
            var p = piezas[elegido];
            if ((pantalla - desde).magnitude > Clic)
            {
                movio = true;
            }

            var (o, d) = Rayo(pantalla);
            var pega = Edicion.AlPlano(o.x, o.z, o.y, d.x, d.z, d.y, p.Piso);
            if (movio && pega.HasValue)
            {
                x = pega.Value.X + offX;
                y = pega.Value.Y + offY;
            }

            var rueda = Input.mouseScrollDelta.y;
            if (rueda != 0f)
            {
                movio = true;
                if (Input.GetKey(KeyCode.LeftShift) || Input.GetKey(KeyCode.RightShift))
                {
                    largo = Edicion.Alargar(largo, rueda);
                }
                else
                {
                    rumbo = Edicion.Girar(rumbo, rueda);
                }
            }

            if (Input.touchCount >= 2)
            {
                var a = Input.GetTouch(0).position;
                var b = Input.GetTouch(1).position;
                var angulo = Mathf.Atan2(b.y - a.y, b.x - a.x) * Mathf.Rad2Deg;
                if (!float.IsNaN(anguloDedos))
                {
                    rumbo = Edicion.GirarConDedos(rumbo, anguloDedos, angulo);
                    movio = true;
                }

                anguloDedos = angulo;
            }
            else
            {
                anguloDedos = float.NaN;
            }

            Fantasma();
        }

        private void Soltar(Vector2 pantalla)
        {
            if (herramienta != "mover")
            {
                if ((pantalla - desde).magnitude <= Clic)
                {
                    Marcar(pantalla);
                }

                return;
            }

            if (elegido < 0)
            {
                return;
            }

            var p = piezas[elegido];
            if (movio)
            {
                VisorPuente.Avisar("objetoEditado", new JObject
                {
                    { "id", p.Id },
                    { "x", Edicion.AlCentimetro(x) },
                    { "y", Edicion.AlCentimetro(y) },
                    { "rumbo_deg", Math.Round(rumbo, 1) },
                    { "largo", Edicion.AlCentimetro(largo) },
                    { "ancho", Edicion.AlCentimetro(p.Ancho) },
                });
            }

            // El fantasma se queda hasta que llegue el caso recalculado (`Preparar` lo quita).
            elegido = -1;
            Arrastrando = false;
            if (!movio)
            {
                Cancelar();
            }
        }

        private void Marcar(Vector2 pantalla)
        {
            var (o, d) = Rayo(pantalla);
            // Primero contra el piso plano; con relieve, se corrige con la altura en ese punto.
            var pega = Edicion.AlPlano(o.x, o.z, o.y, d.x, d.z, d.y, 0.0);
            if (!pega.HasValue)
            {
                return;
            }

            var z = terreno.Z((float)pega.Value.X, (float)pega.Value.Y);
            if (Math.Abs(z) > 1e-3)
            {
                pega = Edicion.AlPlano(o.x, o.z, o.y, d.x, d.z, d.y, z) ?? pega;
            }

            var m = new JObject
            {
                { "tipo", herramienta },
                { "x", Edicion.AlCentimetro(pega.Value.X) },
                { "y", Edicion.AlCentimetro(pega.Value.Y) },
            };
            if (!string.IsNullOrEmpty(vehiculoId))
            {
                m["vehiculo_id"] = vehiculoId;
            }

            // Un choque intermedio es contra algo: el objeto que hay bajo el cursor, si hay.
            if (herramienta == "choque_intermedio")
            {
                var i = Edicion.Elegir(piezas, o.x, o.z, o.y, d.x, d.z, d.y);
                if (i >= 0)
                {
                    m["objeto_id"] = piezas[i].Id;
                }
            }

            VisorPuente.Avisar("puntoMarcado", m);
        }

        private void Cancelar()
        {
            elegido = -1;
            Arrastrando = false;
            if (fantasma != null)
            {
                Destroy(fantasma);
                fantasma = null;
            }
        }

        /// <summary>Una caja translúcida donde quedará el objeto.</summary>
        private void Fantasma()
        {
            var p = piezas[elegido];
            if (fantasma == null)
            {
                fantasma = GameObject.CreatePrimitive(PrimitiveType.Cube);
                fantasma.name = "fantasma_edicion";
                Destroy(fantasma.GetComponent<Collider>());
                var r = fantasma.GetComponent<MeshRenderer>();
                r.sharedMaterial = Materiales.Calca(new Color(1f, 0.55f, 0.2f, 0.45f));
                r.shadowCastingMode = ShadowCastingMode.Off;
                r.receiveShadows = false;
            }

            var ancho = p.Radio.HasValue ? 2.0 * p.Radio.Value : p.Ancho;
            var l = p.Radio.HasValue ? 2.0 * p.Radio.Value : largo;
            var pie = terreno.P(x, y);
            fantasma.transform.SetPositionAndRotation(
                pie + Vector3.up * (float)(p.Alto / 2.0),
                Quaternion.Euler(0f, -(float)rumbo, 0f));
            fantasma.transform.localScale = new Vector3((float)l, (float)p.Alto, (float)ancho);
        }

        /// <summary>El rayo del cursor, en el marco de Unity (y hacia arriba).</summary>
        private static (Vector3 Origen, Vector3 Direccion) Rayo(Vector2 pantalla)
        {
            var r = Camera.main.ScreenPointToRay(pantalla);
            return (r.origin, r.direction);
        }
    }
}
