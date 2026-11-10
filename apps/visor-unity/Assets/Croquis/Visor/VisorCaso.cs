using System;
using System.Collections.Generic;
using Croquis.Core;
using Croquis.Generated;
using UnityEngine;
using Ejes = Croquis.Core.Ejes;
using Material = UnityEngine.Material;

namespace Croquis.Visor
{
    /// <summary>El caso abierto: sus vehículos, su escenario y la línea de tiempo. Solo reproduce el Resultado.</summary>
    [RequireComponent(typeof(CamaraVisor))]
    public sealed class VisorCaso : MonoBehaviour
    {
        private readonly List<VehiculoVista> vehiculos = new List<VehiculoVista>();
        private readonly CargadorModelos modelos = new CargadorModelos();
        private Transform raiz;
        private GameObject piso;
        private Light sol;
        private EscenaDinamica dinamica;
        private double inicio;
        private double fin;

        public double Tiempo { get; private set; }
        public bool Reproduciendo { get; set; }
        public float Velocidad { get; set; } = 1f;
        public CamaraVisor Camara { get; private set; }

        private void Awake()
        {
            Camara = GetComponent<CamaraVisor>();
            piso = GameObject.Find("Piso");
            sol = FindFirstObjectByType<Light>();
        }

        public async Awaitable CargarAsync(Caso3D caso)
        {
            Reproduciendo = false;
            if (raiz != null)
            {
                Destroy(raiz.gameObject);
            }

            vehiculos.Clear();
            dinamica = null;
            raiz = new GameObject("Caso").transform;
            var r = caso.Resultado;
            var e = caso.Escenario;
            var noche = e != null && e.Ambiente.Noche;
            inicio = r.TInicio;
            fin = r.TFin;
            foreach (var v in r.Vehiculos)
            {
                var go = new GameObject("vehiculo_" + v.Id);
                go.transform.SetParent(raiz, false);
                var vista = go.AddComponent<VehiculoVista>();
                vista.Trayectoria = v.Trayectoria;
                var extra = e?.Vehiculos != null ? Array.Find(e.Vehiculos, x => x.Id == v.Id) : null;
                var color = extra?.Color != null ? Materiales.Hex(extra.Color, Color.gray) : (Color?)null;
                vista.Partes = await modelos.ArmarAsync(go.transform, v, color);
                vista.Frenado = extra?.Frenado;
                vista.Luces(noche, extra == null || extra.Faros, (float)v.Dimensiones.LargoM);
                foreach (var tr in go.GetComponentsInChildren<Transform>(true))
                {
                    tr.gameObject.layer = EscenarioVista.CapaVehiculos;
                }

                if (e != null)
                {
                    SombraDeContacto(go.transform, (float)v.Dimensiones.LargoM, (float)v.Dimensiones.AnchoM, noche);
                }
                vehiculos.Add(vista);
            }

            // Con escenario (ADR 0112) se dibuja lo que calculó TS y se esconde el piso liso de U1.
            // El piso es plano salvo que la escena declare terreno (C3): entonces todo se arma sobre él.
            var terreno = TerrenoVista.De(e?.Terreno);
            var zona = Encuadre.ZonaDeInteres(r);
            EscenarioVista.CentroDelHecho = new Vector2((float)zona.CentroX, (float)zona.CentroY);
            EscenarioVista.ClaroDelHecho = (float)zona.Lado * 0.6f + 4f;
            if (e != null)
            {
                EscenarioVista.Construir(raiz, e, sol, Camera.main, terreno);
            }

            TerrenoVista.Dibujar(raiz, e?.Terreno, terreno, e != null && e.Ambiente.Mojado);
            dinamica = CasoVista.Construir(raiz, caso, terreno, noche);
            foreach (var v in vehiculos)
            {
                v.Terreno = terreno;
            }

            if (piso != null)
            {
                piso.SetActive(e == null);
            }

            Camara.Abrir(r);
            Camara.Vehiculos = vehiculos;
            Camara.Caso = this;
            Camara.Arbol = ArbolCercano(e, Camara.Centro);
            Camara.Estorbos.Clear();
            Camara.Bultos.Clear();
            Camara.Copas.Clear();
            foreach (var arbol in e?.Entorno?.Arboles ?? new ArbolEscenario[0])
            {
                if (arbol.Tipo != 2)
                {
                    Camara.Copas.Add(new Vector3((float)arbol.X, (float)arbol.Y, Mathf.Max(1.6f, (float)arbol.CopaM * 1.3f)));
                }
            }

            foreach (var ed in e?.Entorno?.Edificios ?? new EdificioEscenario[0])
            {
                Camara.Bultos.Add(new CamaraVisor.Bulto
                {
                    C = new Vector2((float)ed.X, (float)ed.Y),
                    U = new Vector2(Mathf.Cos((float)ed.RumboRad), Mathf.Sin((float)ed.RumboRad)),
                    Hw = (float)ed.LargoM / 2f,
                    Hd = (float)ed.FondoM / 2f,
                    Alto = ed.Tipo == TipoLote.Baldio ? 2.3f : (float)ed.AltoM,
                });
            }

            foreach (var l in e?.Luminarias ?? new LuminariaEscenario[0])
            {
                Camara.Estorbos.Add(new Vector2((float)l.X, (float)l.Y));
            }

            foreach (var p in e?.Entorno?.Postes ?? new PosteEscenario[0])
            {
                Camara.Estorbos.Add(new Vector2((float)p.X, (float)p.Y));
            }
            Fijar(inicio);
        }

        /// <summary>
        /// La sombra de contacto: una mancha suave bajo la carrocería, que asienta el vehículo en el piso
        /// con cualquier luz. La sombra del sol sigue saliendo del mapa de sombras.
        /// </summary>
        private static void SombraDeContacto(Transform vehiculo, float largo, float ancho, bool noche)
        {
            var m = new Malla();
            var w = ancho / 2f + 0.3f;
            var l = largo / 2f + 0.3f;
            m.Tarjeta(new Vector3(-w, 0.035f, -l), new Vector3(w, 0.035f, -l), new Vector3(w, 0.035f, l), new Vector3(-w, 0.035f, l));
            m.Poner(vehiculo, "sombra_contacto", Materiales.SombraContacto(noche ? 0.55f : 0.7f), false, false);
        }

        /// <summary>El árbol más cercano a la acción, para la cámara de la acera.</summary>
        private static Vector3? ArbolCercano(Escenario e, Vector3 centro)
        {
            Vector3? mejor = null;
            var distancia = float.MaxValue;
            foreach (var a in e?.Entorno?.Arboles ?? new ArbolEscenario[0])
            {
                if (a.Tipo == 2)
                {
                    continue;
                }

                var p = new Vector3((float)a.X, (float)a.Z, (float)a.Y);
                var d = (p - centro).magnitude;
                if (d < distancia)
                {
                    distancia = d;
                    mejor = p;
                }
            }

            return mejor;
        }

        public void Marcadores(bool visibles)
        {
            if (dinamica != null && dinamica.Marcadores != null)
            {
                dinamica.Marcadores.SetActive(visibles);
            }
        }

        public void Fijar(double t)
        {
            Tiempo = Math.Max(inicio, Math.Min(fin, t));
            foreach (var v in vehiculos)
            {
                v.Colocar(Tiempo);
            }

            if (dinamica != null)
            {
                dinamica.Actualizar(Tiempo);
            }
        }

        private void Update()
        {
            if (!Reproduciendo)
            {
                return;
            }

            Fijar(Tiempo + Time.unscaledDeltaTime * Velocidad);
            if (Tiempo >= fin)
            {
                Reproduciendo = false;
            }
        }
    }

    /// <summary>Las piezas de un vehículo que cambian: calaveras y faros.</summary>
    public sealed class PartesVehiculo
    {
        public readonly List<MeshRenderer> Calaveras = new List<MeshRenderer>();
        public readonly List<MeshRenderer> Faros = new List<MeshRenderer>();
        public readonly Dictionary<MeshRenderer, Material[]> Originales = new Dictionary<MeshRenderer, Material[]>();
    }

    /// <summary>Un vehículo en la escena: su Transform sigue la trayectoria, y sus luces, lo que dice el paquete.</summary>
    public sealed class VehiculoVista : MonoBehaviour
    {
        private static readonly Color Rojo = new Color(0.9f, 0.05f, 0.03f);
        private bool noche;
        private bool frenando;

        public VehiculoTrayectoria Trayectoria { get; set; }
        public PartesVehiculo Partes { get; set; }
        public TramoFreno[] Frenado { get; set; }

        /// <summary>El piso, para posar el vehículo sobre él cuando la trayectoria no trae altura.</summary>
        public Terreno Terreno { get; set; }

        /// <summary>Faros y calaveras de noche: brillan, y un foco ilumina el asfalto de adelante.</summary>
        public void Luces(bool esDeNoche, bool farosEncendidos, float largo)
        {
            noche = esDeNoche && farosEncendidos;
            if (Partes == null || !noche)
            {
                return;
            }

            foreach (var f in Partes.Faros)
            {
                Poner(f, Materiales.Emisivo(new Color(1f, 0.97f, 0.9f), new Color(9f, 8.5f, 7.5f)));
            }

            Calaveras(false);
            foreach (var lado in new[] { -0.55f, 0.55f })
            {
                var luz = new GameObject("faro").AddComponent<Light>();
                luz.transform.SetParent(transform, false);
                luz.transform.localPosition = new Vector3(lado, 0.68f, largo / 2f - 0.15f);
                luz.transform.localRotation = Quaternion.Euler(7f, lado * 3f, 0f);
                luz.type = LightType.Spot;
                luz.spotAngle = 70f;
                luz.innerSpotAngle = 12f;
                luz.range = 55f;
                // Moderada: a quemarropa contra otra carrocería no debe tapar el punto de contacto.
                luz.intensity = 650f;
                luz.color = new Color(1f, 0.95f, 0.86f);
                luz.shadows = LightShadows.None;
            }
        }

        private static void Poner(MeshRenderer r, Material m)
        {
            var ms = r.sharedMaterials;
            for (var i = 0; i < ms.Length; i++)
            {
                ms[i] = m;
            }

            r.sharedMaterials = ms;
        }

        private void Calaveras(bool freno)
        {
            if (Partes == null)
            {
                return;
            }

            foreach (var c in Partes.Calaveras)
            {
                if (freno)
                {
                    Poner(c, Materiales.Emisivo(Rojo, Rojo * 7f));
                }
                else if (noche)
                {
                    // De noche van encendidas tenues aunque no frene.
                    Poner(c, Materiales.Emisivo(Rojo * 0.7f, Rojo * 1.3f));
                }
                else
                {
                    c.sharedMaterials = Partes.Originales[c];
                }
            }
        }

        public void Colocar(double t)
        {
            var p = Ejes.AUnity(Muestreo.Pose(Trayectoria, t));
            var posicion = new Vector3((float)p.Px, (float)p.Py, (float)p.Pz);
            var giro = Quaternion.Euler((float)p.EulerX, (float)p.EulerY, (float)p.EulerZ);
            if (Terreno != null && !Terreno.Plano && (Trayectoria.Z == null || Trayectoria.Z.Length == 0))
            {
                // Provisional hasta W5: el solver todavía no entrega z, cabeceo ni alabeo, así que el
                // vehículo se posa sobre el piso dibujado. No cambia x, y ni el rumbo del Resultado.
                var adelante = giro * Vector3.forward;
                var derecha = giro * Vector3.right;
                float Z(Vector3 q) => Terreno.Z(q.x, q.z);
                var zf = Z(posicion + adelante * 1.3f);
                var zt = Z(posicion - adelante * 1.3f);
                var zd = Z(posicion + derecha * 0.75f);
                var zi = Z(posicion - derecha * 0.75f);
                posicion.y = (zf + zt + zd + zi) / 4f;
                giro *= Quaternion.Euler(-Mathf.Atan2(zf - zt, 2.6f) * Mathf.Rad2Deg, 0f, Mathf.Atan2(zd - zi, 1.5f) * Mathf.Rad2Deg);
            }

            transform.SetPositionAndRotation(posicion, giro);
            var frena = false;
            if (Frenado != null)
            {
                foreach (var f in Frenado)
                {
                    frena |= t >= f.Desde && t <= f.Hasta;
                }
            }

            if (frena != frenando)
            {
                frenando = frena;
                Calaveras(frena);
            }
        }
    }
}
