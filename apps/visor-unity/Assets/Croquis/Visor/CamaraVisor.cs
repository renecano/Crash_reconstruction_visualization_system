using System.Collections.Generic;
using Croquis.Core;
using Croquis.Generated;
using UnityEngine;

namespace Croquis.Visor
{
    /// <summary>
    /// Las cámaras del visor: cenital, órbita, cinematográfica, acera y la del conductor. La libre y el
    /// encuadre fino («Ver todo», «Ir al impacto») llegan en U4. Ninguna depende del reloj de la
    /// máquina: la pose sale del instante del caso, así una pausa da siempre la misma imagen.
    /// </summary>
    public sealed class CamaraVisor : MonoBehaviour
    {
        private const float AnguloInicial = -120f;
        private const float AlturaOjos = 1.25f;

        [SerializeField]
        private Camera camara;

        private ZonaInteres zona = new ZonaInteres(0, 0, 20);
        private string modo = "cinematica";
        private string conductor;
        private double inicio;

        public List<VehiculoVista> Vehiculos { get; set; } = new List<VehiculoVista>();
        public VisorCaso Caso { get; set; }

        /// <summary>El árbol más cercano a la acción: la cámara de la acera se para junto a él.</summary>
        public Vector3? Arbol { get; set; }

        /// <summary>Postes y luminarias, en planta (x, y): la cámara de la acera no se para detrás de uno.</summary>
        public List<Vector2> Estorbos { get; } = new List<Vector2>();

        /// <summary>La distancia en planta del estorbo más cercano al tramo que va del ojo a 14 m hacia la mira.</summary>
        private float Despeje(Vector3 ojo, Vector3 mira, float largo = 14f)
        {
            var a = new Vector2(ojo.x, ojo.z);
            var dir = new Vector2(mira.x - ojo.x, mira.z - ojo.z).normalized;
            var menor = float.MaxValue;
            foreach (var e in Estorbos)
            {
                var u = Mathf.Clamp(Vector2.Dot(e - a, dir), 0f, largo);
                menor = Mathf.Min(menor, (e - (a + dir * u)).magnitude);
            }

            return menor;
        }

        /// <summary>Un edificio o una barda en planta: centro, eje a lo largo, medias medidas y alto.</summary>
        public struct Bulto
        {
            public Vector2 C;
            public Vector2 U;
            public float Hw;
            public float Hd;
            public float Alto;
        }

        /// <summary>Lo construido: ninguna cámara se mete en ello ni mira a través.</summary>
        public List<Bulto> Bultos { get; } = new List<Bulto>();

        /// <summary>Las copas de los árboles en planta (x, y, radio): la cinematográfica no mira a través.</summary>
        public List<Vector3> Copas { get; } = new List<Vector3>();

        private float azBase = float.NaN;
        private float giroMax = 8f;
        private float distK = 1f;
        private float altoExtra;

        private bool EnBulto(Vector3 p, float holgura)
        {
            foreach (var b in Bultos)
            {
                if (p.y > b.Alto + 0.3f)
                {
                    continue;
                }

                var dd = new Vector2(p.x, p.z) - b.C;
                var u = Vector2.Dot(dd, b.U);
                var v = -dd.x * b.U.y + dd.y * b.U.x;
                if (Mathf.Abs(u) < b.Hw + holgura && Mathf.Abs(v) < b.Hd + holgura)
                {
                    return true;
                }
            }

            return false;
        }

        /// <summary>Si desde `ojo` se ve `mira` sin estar dentro de algo ni con algo en medio.</summary>
        private bool Despejada(Vector3 ojo, Vector3 mira, bool conCopas = false)
        {
            // El ojo nunca va sobre lo construido, a ninguna altura: una azotea llena el cuadro.
            if (EnBulto(new Vector3(ojo.x, 0f, ojo.z), 0.8f))
            {
                return false;
            }

            for (var k = 0; k < 24; k++)
            {
                var p = Vector3.Lerp(ojo, mira, k / 24f);
                if (k > 0 && EnBulto(p, 0.2f))
                {
                    return false;
                }

                if (conCopas && p.y < 10f)
                {
                    foreach (var c in Copas)
                    {
                        if ((new Vector2(p.x, p.z) - new Vector2(c.x, c.y)).magnitude < c.z)
                        {
                            return false;
                        }
                    }
                }
            }

            return true;
        }

        /// <summary>
        /// Dónde se para la cinematográfica: el rumbo más cercano al de siempre desde el que la acción
        /// se ve entera durante todo el giro. En una calle con fachadas eso es sobre la vía; si no hay
        /// lugar, se acerca, y al final sube como una grúa.
        /// </summary>
        private void Elegir(Vector3 centro, float dist, float alto)
        {
            foreach (var extra in new[] { 0f, 4f, 9f })
            {
                foreach (var k in new[] { 1f, 0.75f, 0.55f })
                {
                    for (var i = 0; i < 72; i++)
                    {
                        var a0 = AnguloInicial + ((i + 1) / 2) * 5f * (i % 2 == 0 ? 1f : -1f);
                        var d = Mathf.Max(8f, dist * k);
                        // El giro lento mueve la cámara a lo más 1.5 m a cada lado: cabe en una calle.
                        var g0 = Mathf.Min(8f, Mathf.Atan(1.5f / d) * Mathf.Rad2Deg);
                        var libre = true;
                        foreach (var g in new[] { -g0, 0f, g0 })
                        {
                            var az = (a0 + g) * Mathf.Deg2Rad;
                            var ojo = centro + new Vector3(Mathf.Cos(az) * d, alto + extra, Mathf.Sin(az) * d);
                            libre &= Despejada(ojo, centro + Vector3.up * 0.9f, true);
                            // Tampoco con un poste en medio.
                            libre &= Despeje(ojo, centro, d - 3f) > 0.7f;
                        }

                        if (libre)
                        {
                            giroMax = g0;
                            azBase = a0;
                            distK = d / dist;
                            altoExtra = extra;
                            return;
                        }
                    }
                }
            }

            azBase = AnguloInicial;
            distK = 1f;
            altoExtra = 14f;
        }

        public Vector3 Centro => new Vector3((float)zona.CentroX, 0f, (float)zona.CentroY);

        public bool Cambiar(string nuevo)
        {
            if (nuevo == "cenital" || nuevo == "orbita" || nuevo == "cinematica" || nuevo == "acera")
            {
                modo = nuevo;
                return true;
            }

            if (nuevo != null && nuevo.StartsWith("conductor:"))
            {
                var id = nuevo.Substring("conductor:".Length);
                if (Vehiculos.Exists(v => v.name == "vehiculo_" + id))
                {
                    modo = "conductor";
                    conductor = id;
                    return true;
                }
            }

            return false;
        }

        public void Abrir(Caso3DResultado r)
        {
            zona = Encuadre.ZonaDeInteres(r);
            inicio = r.TInicio;
            azBase = float.NaN;
        }

        public void Encuadrar(string _)
        {
        }

        public void Asignar(Camera c)
        {
            camara = c;
        }

        /// <summary>El campo de visión vertical de una lente de `mm` en formato de 35 mm.</summary>
        private static float CampoDeLente(float mm)
        {
            return 2f * Mathf.Atan(12f / mm) * Mathf.Rad2Deg;
        }

        private void LateUpdate()
        {
            if (camara == null)
            {
                return;
            }

            var centro = Centro;
            var lado = (float)zona.Lado;
            var t = Caso != null ? (float)(Caso.Tiempo - inicio) : 0f;
            switch (modo)
            {
                case "cenital":
                    camara.fieldOfView = 40f;
                    camara.transform.SetPositionAndRotation(centro + Vector3.up * lado * 1.5f, Quaternion.Euler(90f, 0f, 0f));
                    return;
                case "conductor":
                {
                    var v = Vehiculos.Find(x => x.name == "vehiculo_" + conductor);
                    if (v != null)
                    {
                        // El ojo va un poco adelante del centro, a la altura de una persona sentada.
                        camara.fieldOfView = 60f;
                        var tr = v.transform;
                        camara.transform.SetPositionAndRotation(
                            tr.position + tr.up * AlturaOjos + tr.forward * 0.4f,
                            Quaternion.LookRotation(tr.forward, Vector3.up) * Quaternion.Euler(4f, 0f, 0f));
                        return;
                    }

                    break;
                }

                case "acera":
                {
                    // De pie junto al árbol más cercano, con la acción detrás: para juzgar el entorno de
                    // cerca. Sin árboles, a la orilla de la vía.
                    camara.fieldOfView = 55f;
                    if (Arbol.HasValue)
                    {
                        var haciaCentro = centro - Arbol.Value;
                        haciaCentro.y = 0f;
                        var d = haciaCentro.normalized;
                        var costado = Vector3.Cross(Vector3.up, d);
                        // De los lugares posibles, el primero fuera de los edificios y más despejado de postes.
                        var mira = Arbol.Value + d * 6f + Vector3.up * 3.2f;
                        var ojo = Arbol.Value - d * 9f + costado * 4.5f + Vector3.up * 1.7f;
                        var mejor = float.MinValue;
                        foreach (var atras in new[] { 9f, 6f, 12f })
                        {
                            foreach (var alLado in new[] { 4.5f, -4.5f, 2.5f, -2.5f, 1f, -1f })
                            {
                                var otro = Arbol.Value - d * atras + costado * alLado + Vector3.up * 1.7f;
                                var nota = Mathf.Min(Despeje(otro, mira), 1.5f);
                                if (EnBulto(otro, 1f))
                                {
                                    nota -= 100f;
                                }
                                else if (!Despejada(otro, mira))
                                {
                                    nota -= 50f;
                                }

                                if (nota > mejor)
                                {
                                    mejor = nota;
                                    ojo = otro;
                                }
                            }
                        }

                        camara.transform.position = ojo;
                        camara.transform.LookAt(mira);
                    }
                    else
                    {
                        var a0 = AnguloInicial * Mathf.Deg2Rad;
                        var d0 = Mathf.Max(11f, lado * 0.55f);
                        camara.transform.position = centro + new Vector3(Mathf.Cos(a0) * d0, 1.7f, Mathf.Sin(a0) * d0);
                        camara.transform.LookAt(centro + Vector3.up);
                    }

                    return;
                }

                case "cinematica":
                {
                    // Como la del visor web: una lente de 50 mm en acciones chicas y de 35 mm en grandes,
                    // baja, a tres cuartos, girando despacio con el tiempo del caso.
                    var k = Mathf.Clamp01((lado - 12f) / 30f);
                    var vfov = CampoDeLente(Mathf.Lerp(50f, 35f, k));
                    camara.fieldOfView = vfov;
                    var hfov = 2f * Mathf.Atan(Mathf.Tan(vfov * Mathf.Deg2Rad / 2f) * 16f / 9f);
                    var dist = Mathf.Clamp(lado * 0.5f / Mathf.Tan(hfov / 2f), 12f, 60f);
                    var alto = Mathf.Lerp(2.4f, 6f, k);
                    var objetivo = centro;
                    if (Vehiculos.Count > 0)
                    {
                        var suma = Vector3.zero;
                        foreach (var v in Vehiculos)
                        {
                            suma += v.transform.position;
                        }

                        // A medio camino entre el impacto y los vehículos: el encuadre no brinca.
                        objetivo = (centro + suma / Vehiculos.Count) / 2f;
                    }

                    if (float.IsNaN(azBase))
                    {
                        Elegir(centro, dist, alto);
                    }

                    // Gira despacio con el tiempo del caso, sin salirse del tramo que se revisó.
                    var az = (azBase + Mathf.Clamp(2.2f * t, -giroMax, giroMax)) * Mathf.Deg2Rad;
                    dist *= distK;
                    alto += altoExtra;
                    camara.transform.position = objetivo + new Vector3(Mathf.Cos(az) * dist, alto, Mathf.Sin(az) * dist);
                    camara.transform.LookAt(objetivo + Vector3.up * 0.9f);
                    return;
                }
            }

            camara.fieldOfView = 40f;
            var a = (AnguloInicial + 3f * t) * Mathf.Deg2Rad;
            var dd = Mathf.Max(14f, lado * 0.9f);
            camara.transform.position = centro + new Vector3(Mathf.Cos(a) * dd, dd * 0.35f, Mathf.Sin(a) * dd);
            camara.transform.LookAt(centro + Vector3.up * 0.8f);
        }
    }
}
