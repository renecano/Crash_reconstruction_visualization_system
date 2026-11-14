using System;
using System.Collections.Generic;
using System.Globalization;
using Croquis.Core;
using Croquis.Generated;
using UnityEngine;
using UnityEngine.UI;
using Ejes = Croquis.Core.Ejes;
using Material = UnityEngine.Material;

namespace Croquis.Visor
{
    /// <summary>
    /// Las capas de las tomas «de ingeniería» del modo foto (material promocional, René 2026-11-13).
    /// Todo sale del Resultado del caso, nada se inventa: el perfil de aplastamiento, el PDOF y el ΔV
    /// del solver, su trayectoria, sus muestras de Monte Carlo (exportadas por
    /// `tools/unity/paquetes-promo.mts` con la misma semilla), el piso y la visibilidad. Cada capa se
    /// quita y la escena queda como estaba, para la versión «limpia» con la misma cámara.
    /// </summary>
    public sealed class Capa
    {
        private readonly List<GameObject> creados = new List<GameObject>();
        private readonly List<Action> deshacer = new List<Action>();

        public void Agregar(GameObject go)
        {
            creados.Add(go);
        }

        public void AlQuitar(Action a)
        {
            deshacer.Add(a);
        }

        public void Quitar()
        {
            foreach (var go in creados)
            {
                if (go != null)
                {
                    UnityEngine.Object.Destroy(go);
                }
            }

            for (var i = deshacer.Count - 1; i >= 0; i--)
            {
                deshacer[i]();
            }

            creados.Clear();
            deshacer.Clear();
        }
    }

    public static class CapasIngenieria
    {
        private static readonly CultureInfo Inv = CultureInfo.InvariantCulture;

        // ---- Utilidades --------------------------------------------------------------------------------

        /// <summary>Del calor de 0 a 1: amarillo claro, naranja y rojo (el perfil, la velocidad).</summary>
        public static Color Calor(float f)
        {
            f = Mathf.Clamp01(f);
            return f < 0.5f
                ? Color.Lerp(new Color(1f, 0.93f, 0.35f), new Color(1f, 0.55f, 0.08f), f * 2f)
                : Color.Lerp(new Color(1f, 0.55f, 0.08f), new Color(0.86f, 0.08f, 0.06f), (f - 0.5f) * 2f);
        }

        /// <summary>De lento a rápido: azul, verde, amarillo y rojo.</summary>
        public static Color Velocidad(float f)
        {
            f = Mathf.Clamp01(f);
            var paradas = new[]
            {
                new Color(0.16f, 0.36f, 0.95f), new Color(0.1f, 0.78f, 0.62f), new Color(0.98f, 0.86f, 0.2f),
                new Color(0.95f, 0.22f, 0.12f),
            };
            var x = f * (paradas.Length - 1);
            var i = Mathf.Min(paradas.Length - 2, Mathf.FloorToInt(x));
            return Color.Lerp(paradas[i], paradas[i + 1], x - i);
        }

        private static Material Brillo(Color c)
        {
            return Materiales.Emisivo(c, c * 1.4f);
        }

        private static Material Translucido(Color c)
        {
            return Materiales.Calca(c, 0.1f);
        }

        /// <summary>Un tramo de línea en el mundo, como un prisma delgado (se ve en cualquier vista).</summary>
        public static GameObject Linea(Transform padre, Vector3 a, Vector3 b, float grueso, Material m)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
            UnityEngine.Object.Destroy(go.GetComponent<Collider>());
            go.name = "linea";
            go.transform.SetParent(padre, false);
            var d = b - a;
            go.transform.position = (a + b) / 2f;
            go.transform.rotation = d.sqrMagnitude > 1e-8f ? Quaternion.LookRotation(d) : Quaternion.identity;
            go.transform.localScale = new Vector3(grueso, grueso, d.magnitude);
            var r = go.GetComponent<MeshRenderer>();
            r.sharedMaterial = m;
            r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            return go;
        }

        /// <summary>Una flecha: cuerpo y punta, de `desde` a `hasta`.</summary>
        public static GameObject Flecha(Transform padre, Vector3 desde, Vector3 hasta, float grueso, Material m)
        {
            var go = new GameObject("flecha");
            go.transform.SetParent(padre, false);
            var d = hasta - desde;
            var punta = Mathf.Min(d.magnitude * 0.3f, grueso * 6f);
            var base_ = hasta - d.normalized * punta;
            Linea(go.transform, desde, base_, grueso, m);
            var cono = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            UnityEngine.Object.Destroy(cono.GetComponent<Collider>());
            cono.transform.SetParent(go.transform, false);
            cono.transform.position = (base_ + hasta) / 2f;
            cono.transform.rotation = Quaternion.FromToRotation(Vector3.up, d.normalized);
            cono.transform.localScale = new Vector3(grueso * 3.2f, punta / 2f, grueso * 3.2f);
            cono.GetComponent<MeshRenderer>().sharedMaterial = m;
            return go;
        }

        /// <summary>Un letrero en el mundo que mira a la cámara.</summary>
        public static GameObject Letrero(Transform padre, Vector3 donde, string texto, float alto, Color color, Camera camara)
        {
            var go = new GameObject("letrero");
            go.transform.SetParent(padre, false);
            go.transform.position = donde;
            var canvas = go.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.WorldSpace;
            var rt = (RectTransform)go.transform;
            rt.sizeDelta = new Vector2(1200f, 160f);
            go.transform.localScale = Vector3.one * (alto / 100f);
            var t = new GameObject("texto").AddComponent<Text>();
            t.transform.SetParent(go.transform, false);
            t.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            t.fontSize = 72;
            t.color = color;
            t.alignment = TextAnchor.MiddleCenter;
            t.horizontalOverflow = HorizontalWrapMode.Overflow;
            t.text = texto;
            var trt = t.rectTransform;
            trt.anchorMin = Vector2.zero;
            trt.anchorMax = Vector2.one;
            trt.offsetMin = Vector2.zero;
            trt.offsetMax = Vector2.zero;
            var sombra = t.gameObject.AddComponent<Outline>();
            sombra.effectColor = new Color(0f, 0f, 0f, 0.75f);
            sombra.effectDistance = new Vector2(3f, -3f);
            if (camara != null)
            {
                go.transform.rotation = Quaternion.LookRotation(go.transform.position - camara.transform.position, camara.transform.up);
            }

            return go;
        }

        private static string F(double x, string formato = "0.00")
        {
            return x.ToString(formato, Inv);
        }

        /// <summary>Una copia quieta del vehículo, sin sus scripts, con un material para todas sus piezas.</summary>
        private static GameObject Fantasma(VehiculoVista v, Transform padre, Material m)
        {
            var go = UnityEngine.Object.Instantiate(v.gameObject, padre);
            go.name = "fantasma_" + v.name;
            foreach (var mb in go.GetComponentsInChildren<MonoBehaviour>(true))
            {
                UnityEngine.Object.Destroy(mb);
            }

            foreach (var l in go.GetComponentsInChildren<Light>(true))
            {
                UnityEngine.Object.Destroy(l.gameObject);
            }

            foreach (var r in go.GetComponentsInChildren<Renderer>(true))
            {
                var mats = new Material[r.sharedMaterials.Length];
                for (var i = 0; i < mats.Length; i++)
                {
                    mats[i] = m;
                }

                r.sharedMaterials = mats;
                r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            }

            return go;
        }

        private static void Colocar(Transform t, PoseVehiculo p)
        {
            var u = Ejes.AUnity(p);
            t.SetPositionAndRotation(
                new Vector3((float)u.Px, (float)u.Py, (float)u.Pz),
                Quaternion.Euler((float)u.EulerX, (float)u.EulerY, (float)u.EulerZ));
        }

        private static ResultadoVehiculo Datos(VisorCaso visor, string id, out VehiculoVista vista)
        {
            vista = visor.Camara.Vehiculos.Find(x => x.name == "vehiculo_" + id);
            if (vista == null)
            {
                throw new ArgumentException("No hay un vehículo «" + id + "».");
            }

            return vista.Datos;
        }

        /// <summary>El vehículo con su carrocería translúcida (y sus piezas como estaban, al quitar la capa).</summary>
        private static void Translucir(VehiculoVista v, Capa capa, Color c)
        {
            var m = Translucido(c);
            foreach (var r in v.GetComponentsInChildren<Renderer>(true))
            {
                var antes = r.sharedMaterials;
                var sombra = r.shadowCastingMode;
                var mats = new Material[antes.Length];
                for (var i = 0; i < mats.Length; i++)
                {
                    mats[i] = m;
                }

                r.sharedMaterials = mats;
                r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
                capa.AlQuitar(() =>
                {
                    if (r != null)
                    {
                        r.sharedMaterials = antes;
                        r.shadowCastingMode = sombra;
                    }
                });
            }
        }

        /// <summary>
        /// Esconde un hijo de la raíz del caso hasta quitar la capa. La leyenda ilustrativa vive en el
        /// escenario: se pasa a la raíz mientras tanto, para que salga en todas las fotos.
        /// </summary>
        private static void Esconder(VisorCaso visor, Transform hijo, Capa capa)
        {
            var leyenda = hijo.Find("leyenda");
            if (leyenda != null)
            {
                leyenda.SetParent(visor.Raiz, false);
                capa.AlQuitar(() =>
                {
                    if (leyenda != null && hijo != null)
                    {
                        leyenda.SetParent(hijo, false);
                    }
                });
            }

            var activo = hijo.gameObject.activeSelf;
            hijo.gameObject.SetActive(false);
            capa.AlQuitar(() =>
            {
                if (hijo != null)
                {
                    hijo.gameObject.SetActive(activo);
                }
            });
        }

        // ---- 1. Rayos X del daño ---------------------------------------------------------------------

        /// <summary>
        /// La carrocería translúcida, el perfil de aplastamiento del solver (C1 a C6, `dano.perfil_m`)
        /// como mapa de calor por profundidad sobre la cara golpeada (con `CampoDano`, el mismo mapeo
        /// del daño visual) y la flecha del impulso del impacto: en la dirección del PDOF del solver y
        /// con su magnitud m·ΔV (la masa y el ΔV del Resultado).
        /// </summary>
        public static Capa RayosX(VisorCaso visor, string id, Camera camara)
        {
            var capa = new Capa();
            var v = Datos(visor, id, out var vista);
            var raiz = new GameObject("capa_rayos_x").transform;
            raiz.SetParent(vista.transform, false);
            capa.Agregar(raiz.gameObject);
            Translucir(vista, capa, new Color(0.62f, 0.8f, 1f, 0.16f));
            var d = v.Dimensiones;
            var dano = v.Dano;
            if (dano?.PerfilM != null && dano.PerfilM.Length == 6 && dano.Cdc != null)
            {
                var lado = dano.Cdc.Lado.ToString()[0];
                if ("FBLR".IndexOf(lado) >= 0)
                {
                    var entrada = new EntradaDano
                    {
                        Lado = lado,
                        Perfil = dano.PerfilM,
                        Ancho = dano.AnchoM,
                        Centro = dano.CentroM,
                        ZonaVertical = dano.Cdc.ZonaVertical.HasValue ? dano.Cdc.ZonaVertical.Value.ToString()[0] : (char?)null,
                    };
                    var medidas = new MedidasVehiculo(d.LargoM, d.AnchoM, d.AltoM, d.DistanciaEntreEjesM);
                    var campo = new CampoDano(entrada, v.Clase, medidas);
                    var maximo = 0.0;
                    foreach (var c in dano.PerfilM)
                    {
                        maximo = Math.Max(maximo, c);
                    }

                    var cara = lado == 'F' || lado == 'B' ? d.LargoM / 2.0 : d.AnchoM / 2.0;
                    var medio = lado == 'F' || lado == 'B' ? d.AnchoM / 2.0 : d.LargoM / 2.0;
                    // Marco del daño (x adelante, y arriba, z a la derecha) → local de Unity (x der., y arriba, z adelante).
                    Vector3 Local(V3 p) => new Vector3((float)p.Z, (float)p.Y, (float)p.X);
                    const int Tramos = 48;
                    var y0 = Math.Max(0.15, campo.Banda0);
                    var y1 = Math.Max(y0 + 0.2, campo.Banda1);
                    for (var k = 0; k < Tramos; k++)
                    {
                        var ua = -medio + 2.0 * medio * k / Tramos;
                        var ub = -medio + 2.0 * medio * (k + 1) / Tramos;
                        var um = (ua + ub) / 2.0;
                        var c = campo.Aplastamiento(um);
                        // La cara como estaba, y donde quedó con el aplastamiento.
                        var a = campo.Afuera * (cara - c) + campo.ALoLargo * ua;
                        var b = campo.Afuera * (cara - c) + campo.ALoLargo * ub;
                        var mitad = (y0 + y1) / 2.0;
                        var color = c > 0.002 ? Calor((float)(c / Math.Max(1e-6, maximo))) : new Color(0.75f, 0.85f, 1f);
                        var tramo = GameObject.CreatePrimitive(PrimitiveType.Cube);
                        UnityEngine.Object.Destroy(tramo.GetComponent<Collider>());
                        tramo.transform.SetParent(raiz, false);
                        var pa = Local(a + new V3(0, mitad, 0));
                        var pb = Local(b + new V3(0, mitad, 0));
                        tramo.transform.localPosition = (pa + pb) / 2f;
                        tramo.transform.localRotation = Quaternion.LookRotation(pb - pa);
                        // Hondo como el aplastamiento, para que se lea la profundidad.
                        var hondo = (float)Math.Max(0.02, c);
                        tramo.transform.localScale = new Vector3(0.02f, (float)(y1 - y0), (pb - pa).magnitude);
                        tramo.GetComponent<MeshRenderer>().sharedMaterial = Brillo(color);
                        if (c > 0.002)
                        {
                            // El volumen hundido: de la cara original a la deformada, translúcido.
                            var vol = GameObject.CreatePrimitive(PrimitiveType.Cube);
                            UnityEngine.Object.Destroy(vol.GetComponent<Collider>());
                            vol.transform.SetParent(raiz, false);
                            var centro = campo.Afuera * (cara - c / 2.0) + campo.ALoLargo * um + new V3(0, mitad, 0);
                            vol.transform.localPosition = Local(centro);
                            vol.transform.localRotation = Quaternion.LookRotation(pb - pa);
                            vol.transform.localScale = new Vector3(hondo, (float)(y1 - y0), (pb - pa).magnitude);
                            vol.GetComponent<MeshRenderer>().sharedMaterial = Translucido(new Color(color.r, color.g, color.b, 0.45f));
                        }
                    }

                    // La cara original, como línea de referencia.
                    var fa = Local(campo.Afuera * cara + campo.ALoLargo * -medio + new V3(0, y1 + 0.02, 0));
                    var fb = Local(campo.Afuera * cara + campo.ALoLargo * medio + new V3(0, y1 + 0.02, 0));
                    var linea = Linea(raiz, vista.transform.TransformPoint(fa), vista.transform.TransformPoint(fb), 0.012f, Brillo(Color.white));
                    linea.transform.SetParent(raiz, true);

                    // El impulso: hacia el vehículo, desde la dirección del PDOF (12 = de frente).
                    if (v.PdofHoras.HasValue)
                    {
                        var ang = -v.PdofHoras.Value * 30.0 * Math.PI / 180.0;
                        var deDonde = new V3(Math.Cos(ang), 0, -Math.Sin(ang));
                        var centroDano = campo.Afuera * (cara - campo.Aplastamiento(dano.CentroM)) + campo.ALoLargo * dano.CentroM
                            + new V3(0, (y0 + y1) / 2.0, 0);
                        var impulso = d.MasaKg * v.DeltaVKmh / 3.6;
                        var largo = (float)Math.Max(0.9, Math.Min(3.0, impulso / 6000.0));
                        var hasta = vista.transform.TransformPoint(Local(centroDano));
                        var desdeLocal = Local(centroDano + deDonde * largo);
                        var desde = vista.transform.TransformPoint(desdeLocal);
                        var flecha = Flecha(raiz, desde, hasta, 0.05f, Brillo(new Color(1f, 0.25f, 0.2f)));
                        flecha.transform.SetParent(raiz, true);
                        var texto = "impulso " + F(impulso / 1000.0, "0.0") + " kN·s · ΔV " + F(v.DeltaVKmh, "0.0")
                            + " km/h · PDOF " + F(v.PdofHoras.Value, "0.#") + " h";
                        var l = Letrero(raiz, vista.transform.position + Vector3.up * (float)(d.AltoM + 0.75), texto, 0.11f, Color.white, camara);
                        l.transform.SetParent(raiz, true);
                    }

                    var etiqueta = Letrero(raiz, vista.transform.position + Vector3.up * (float)(d.AltoM + 0.45),
                        "aplastamiento máx. " + F(maximo * 100.0, "0") + " cm (C1–C6 del solver)", 0.1f, Calor(1f), camara);
                    etiqueta.transform.SetParent(raiz, true);
                }
            }

            return capa;
        }

        // ---- 2. Estroboscópica -------------------------------------------------------------------

        /// <summary>
        /// Cada vehículo involucrado en su pose cada 0.1 s de su trayectoria, coloreado por su rapidez
        /// (de la trayectoria del Resultado: vx, vy).
        /// </summary>
        public static Capa Estroboscopica(VisorCaso visor, double paso, double desde, double hasta, Camera camara)
        {
            var capa = new Capa();
            var raiz = new GameObject("capa_estroboscopica").transform;
            raiz.SetParent(visor.Raiz, false);
            capa.Agregar(raiz.gameObject);
            var maxima = 1.0;
            foreach (var vista in visor.Camara.Vehiculos)
            {
                var tr = vista.Trayectoria;
                for (var i = 0; i < tr.T.Length; i++)
                {
                    maxima = Math.Max(maxima, Math.Sqrt(tr.Vx[i] * tr.Vx[i] + tr.Vy[i] * tr.Vy[i]) * 3.6);
                }
            }

            foreach (var vista in visor.Camara.Vehiculos)
            {
                if (vista.Datos != null && !vista.Datos.Involucrado)
                {
                    continue;
                }

                var tr = vista.Trayectoria;
                var t0 = Math.Max(desde, tr.T[0]);
                var t1 = Math.Min(hasta, tr.T[tr.T.Length - 1]);
                var materiales = new Dictionary<int, Material>();
                for (var t = t0; t <= t1 + 1e-9; t += paso)
                {
                    Muestreo.Tramo(tr.T, t, out var i, out var f);
                    var j = Math.Min(i + 1, tr.T.Length - 1);
                    var vx = tr.Vx[i] + (tr.Vx[j] - tr.Vx[i]) * f;
                    var vy = tr.Vy[i] + (tr.Vy[j] - tr.Vy[i]) * f;
                    var kmh = Math.Sqrt(vx * vx + vy * vy) * 3.6;
                    var cubeta = (int)Math.Round(kmh / maxima * 20.0);
                    if (!materiales.TryGetValue(cubeta, out var m))
                    {
                        var c = Velocidad(cubeta / 20f);
                        materiales[cubeta] = m = Translucido(new Color(c.r, c.g, c.b, 0.42f));
                    }

                    var g = Fantasma(vista, raiz, m);
                    Colocar(g.transform, Muestreo.Pose(tr, t));
                }
            }

            // La escala: de 0 a la rapidez más alta del caso.
            var centro = visor.Camara.Centro;
            var escala = Letrero(raiz, centro + Vector3.up * 6f,
                "rapidez cada " + F(paso, "0.0") + " s: azul 0 → rojo " + F(maxima, "0") + " km/h", 0.5f, Color.white, camara);
            escala.transform.SetParent(raiz, true);
            return capa;
        }

        // ---- 3. Nube de incertidumbre -------------------------------------------------------------

        /// <summary>
        /// Las poses finales de cada muestra del Monte Carlo (del archivo `.nube.json` que exporta
        /// `paquetes-promo.mts` con la semilla del caso), como fantasmas alrededor de la pose de mejor
        /// ajuste (el vehículo del Resultado, en su reposo).
        /// </summary>
        public static Capa Nube(VisorCaso visor, Newtonsoft.Json.Linq.JObject nube, Camera camara)
        {
            var capa = new Capa();
            var raiz = new GameObject("capa_nube").transform;
            raiz.SetParent(visor.Raiz, false);
            capa.Agregar(raiz.gameObject);
            var colores = new[] { new Color(0.35f, 0.75f, 1f, 0.12f), new Color(1f, 0.6f, 0.25f, 0.12f), new Color(0.6f, 1f, 0.5f, 0.12f) };
            var k = 0;
            foreach (var par in (Newtonsoft.Json.Linq.JObject)nube["vehiculos"])
            {
                var vista = visor.Camara.Vehiculos.Find(x => x.name == "vehiculo_" + par.Key);
                if (vista == null)
                {
                    continue;
                }

                var m = Translucido(colores[k++ % colores.Length]);
                foreach (var q in (Newtonsoft.Json.Linq.JArray)par.Value)
                {
                    var g = Fantasma(vista, raiz, m);
                    Colocar(g.transform, new PoseVehiculo((double)q[0], (double)q[1], 0.0, (double)q[2] * Math.PI / 180.0, 0.0, 0.0));
                }
            }

            var muestras = (int)nube["validas"];
            var l = Letrero(raiz, visor.Camara.Centro + Vector3.up * 5f,
                muestras + " simulaciones del Monte Carlo (semilla " + (long)nube["semilla"] + "): dónde quedó cada una", 0.45f, Color.white, camara);
            l.transform.SetParent(raiz, true);
            return capa;
        }

        // ---- 4. Terreno desnudo ----------------------------------------------------------------------

        /// <summary>
        /// El piso del caso en alambre, cada `paso` metros, con la pendiente en color (del piso que
        /// arma el visor: el terreno declarado, sus topes y el relieve del lugar). Esconde el escenario.
        /// </summary>
        public static Capa Alambre(VisorCaso visor, Terreno terreno, float lado, float paso, Camera camara)
        {
            var capa = new Capa();
            var raiz = new GameObject("capa_alambre").transform;
            raiz.SetParent(visor.Raiz, false);
            capa.Agregar(raiz.gameObject);
            var esconder = new List<Transform>();
            foreach (Transform hijo in visor.Raiz)
            {
                if (hijo.name == "escenario" || hijo.name == "terreno" || hijo.name.StartsWith("estacionado_", StringComparison.Ordinal))
                {
                    esconder.Add(hijo);
                }
            }

            foreach (var h in esconder)
            {
                Esconder(visor, h, capa);
            }

            // Fondo oscuro y sin cielo, como lámina técnica.
            var limpia = camara.clearFlags;
            var fondo = camara.backgroundColor;
            camara.clearFlags = CameraClearFlags.SolidColor;
            camara.backgroundColor = new Color(0.035f, 0.045f, 0.06f);
            var niebla = RenderSettings.fog;
            RenderSettings.fog = false;
            capa.AlQuitar(() =>
            {
                camara.clearFlags = limpia;
                camara.backgroundColor = fondo;
                RenderSettings.fog = niebla;
            });

            var c = visor.Camara.Centro;
            var cubetas = new[] { 0.01f, 0.03f, 0.06f, 0.10f, float.MaxValue };
            var colores = new[]
            {
                new Color(0.35f, 0.55f, 0.85f), new Color(0.25f, 0.8f, 0.5f), new Color(0.95f, 0.85f, 0.25f),
                new Color(1f, 0.5f, 0.15f), new Color(0.95f, 0.15f, 0.12f),
            };
            var mats = Array.ConvertAll(colores, Brillo);
            var n = Mathf.CeilToInt(lado / paso);
            float Z(float x, float y) => terreno != null ? terreno.Z(x, y) : 0f;
            float Pendiente(float x, float y)
            {
                const float H = 0.25f;
                var gx = (Z(x + H, y) - Z(x - H, y)) / (2f * H);
                var gy = (Z(x, y + H) - Z(x, y - H)) / (2f * H);
                return Mathf.Sqrt(gx * gx + gy * gy);
            }

            int Cubeta(float s)
            {
                for (var i = 0; i < cubetas.Length; i++)
                {
                    if (s < cubetas[i])
                    {
                        return i;
                    }
                }

                return cubetas.Length - 1;
            }

            // Líneas en x y en y; cada tramo corto con el color de su pendiente. Sub-pasos de 0.25 m
            // para que los topes se lean.
            const float Sub = 0.25f;
            for (var a = 0; a <= n; a++)
            {
                for (var eje = 0; eje < 2; eje++)
                {
                    for (var s = -lado / 2f; s < lado / 2f - 1e-3f; s += Sub)
                    {
                        var fijo = -lado / 2f + a * paso;
                        float x0, y0, x1, y1;
                        if (eje == 0)
                        {
                            x0 = c.x + s; x1 = c.x + s + Sub; y0 = y1 = c.z + fijo;
                        }
                        else
                        {
                            y0 = c.z + s; y1 = c.z + s + Sub; x0 = x1 = c.x + fijo;
                        }

                        var p0 = new Vector3(x0, Z(x0, y0) + 0.02f, y0);
                        var p1 = new Vector3(x1, Z(x1, y1) + 0.02f, y1);
                        var cb = Cubeta(Pendiente((x0 + x1) / 2f, (y0 + y1) / 2f));
                        Linea(raiz, p0, p1, 0.04f, mats[cb]);
                    }
                }
            }

            var l = Letrero(raiz, c + Vector3.up * (lado * 0.12f),
                "pendiente: azul < 1 % · verde < 3 % · amarillo < 6 % · naranja < 10 % · rojo ≥ 10 %", lado * 0.012f, Color.white, camara);
            l.transform.SetParent(raiz, true);
            return capa;
        }

        // ---- 5. Ficha técnica -----------------------------------------------------------------------

        /// <summary>
        /// Las medidas del vehículo acotadas (largo, ancho, alto y distancia entre ejes del Resultado) y
        /// su centro de masa: en planta, el centro de la huella (el punto que sigue el solver); en
        /// altura, 0.37 del alto (el supuesto del solver, `rollover.py`). Esconde el escenario.
        /// </summary>
        public static Capa Ficha(VisorCaso visor, string id, bool lateral, Camera camara)
        {
            var capa = new Capa();
            var v = Datos(visor, id, out var vista);
            var esconder = new List<Transform>();
            foreach (Transform hijo in visor.Raiz)
            {
                if (hijo != vista.transform)
                {
                    esconder.Add(hijo);
                }
            }

            foreach (var h in esconder)
            {
                Esconder(visor, h, capa);
            }

            var limpia = camara.clearFlags;
            var fondo = camara.backgroundColor;
            camara.clearFlags = CameraClearFlags.SolidColor;
            camara.backgroundColor = new Color(0.05f, 0.07f, 0.1f);
            var niebla = RenderSettings.fog;
            RenderSettings.fog = false;
            capa.AlQuitar(() =>
            {
                camara.clearFlags = limpia;
                camara.backgroundColor = fondo;
                RenderSettings.fog = niebla;
            });

            var raiz = new GameObject("capa_ficha").transform;
            raiz.SetParent(vista.transform, false);
            capa.Agregar(raiz.gameObject);
            var d = v.Dimensiones;
            float L = (float)d.LargoM, W = (float)d.AnchoM, H = (float)d.AltoM;
            var cota = Brillo(new Color(0.55f, 0.85f, 1f));
            var t = vista.transform;
            Vector3 P(float x, float y, float z) => t.TransformPoint(new Vector3(x, y, z));
            const float G = 0.012f;
            var alto = lateral ? 0.13f : 0.2f;
            EjesVehiculo.Posiciones(v.Clase, new MedidasVehiculo(d.LargoM, d.AnchoM, d.AltoM, d.DistanciaEntreEjesM), out var del, out var tras);
            var cgAlto = 0.37f * H;
            if (lateral)
            {
                // Vista del costado derecho: +x local hacia la cámara.
                var x = W / 2f + 0.05f;
                Linea(raiz, P(x, -0.25f, -L / 2f), P(x, -0.25f, L / 2f), G, cota);
                Letrero(raiz, P(x, -0.45f, 0f), "largo " + F(L) + " m", alto, Color.white, camara);
                Linea(raiz, P(x, 0f, L / 2f + 0.3f), P(x, H, L / 2f + 0.3f), G, cota);
                Letrero(raiz, P(x, H / 2f, L / 2f + 0.9f), "alto " + F(H) + " m", alto, Color.white, camara);
                Linea(raiz, P(x, 0.12f, (float)tras), P(x, 0.12f, (float)del), G, Brillo(new Color(1f, 0.85f, 0.3f)));
                Letrero(raiz, P(x, 0.3f, (float)((del + tras) / 2.0)), "entre ejes " + F(d.DistanciaEntreEjesM) + " m", alto, new Color(1f, 0.85f, 0.3f), camara);
                Marca(raiz, P(x, cgAlto, 0f), camara, "CG · h = 0.37 × alto (supuesto del solver)");
            }
            else
            {
                // Vista de planta: la cámara arriba.
                var y = H + 0.05f;
                Linea(raiz, P(-W / 2f - 0.3f, y, -L / 2f), P(-W / 2f - 0.3f, y, L / 2f), G, cota);
                Letrero(raiz, P(-W / 2f - 0.9f, y, 0f), "largo " + F(L) + " m", alto, Color.white, camara);
                Linea(raiz, P(-W / 2f, y, -L / 2f - 0.3f), P(W / 2f, y, -L / 2f - 0.3f), G, cota);
                Letrero(raiz, P(0f, y, -L / 2f - 0.6f), "ancho " + F(W) + " m", alto, Color.white, camara);
                Linea(raiz, P(W / 2f + 0.15f, y, (float)tras), P(W / 2f + 0.15f, y, (float)del), G, Brillo(new Color(1f, 0.85f, 0.3f)));
                Letrero(raiz, P(W / 2f + 0.9f, y, (float)((del + tras) / 2.0)), "entre ejes " + F(d.DistanciaEntreEjesM) + " m", alto, new Color(1f, 0.85f, 0.3f), camara);
                Marca(raiz, P(0f, y, 0f), camara, "CG · centro de la huella (el punto que sigue el solver)");
            }

            Letrero(raiz, P(0f, H + 0.6f, 0f), v.Clase.Replace('_', ' ') + " · " + F(d.MasaKg, "0") + " kg", alto * 1.2f, Color.white, camara);
            return capa;
        }

        private static void Marca(Transform raiz, Vector3 donde, Camera camara, string texto)
        {
            var m = Brillo(new Color(1f, 0.3f, 0.3f));
            var esfera = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            UnityEngine.Object.Destroy(esfera.GetComponent<Collider>());
            esfera.transform.SetParent(raiz, false);
            esfera.transform.position = donde;
            esfera.transform.localScale = Vector3.one * 0.09f;
            esfera.GetComponent<MeshRenderer>().sharedMaterial = m;
            Letrero(raiz, donde + Vector3.up * 0.18f, texto, 0.07f, new Color(1f, 0.6f, 0.6f), camara);
        }

        // ---- 6. Cono de visibilidad -----------------------------------------------------------------

        /// <summary>
        /// Desde el ojo del conductor (a la altura del análisis de visibilidad del Resultado) hasta el
        /// contorno del otro en el instante: verde si lo veía, rojo si no, con la fracción visible y
        /// la distancia que calculó el solver.
        /// </summary>
        public static Capa Cono(VisorCaso visor, Caso3D caso, string observador, double t, Camera camara)
        {
            var capa = new Capa();
            var raiz = new GameObject("capa_cono").transform;
            raiz.SetParent(visor.Raiz, false);
            capa.Agregar(raiz.gameObject);
            var vis = Array.Find(caso.Resultado.Visibilidad ?? new VisibilidadElement[0], x => x.Observador == observador);
            if (vis == null)
            {
                return capa;
            }

            var i = 0;
            for (var k = 0; k < vis.T.Length; k++)
            {
                if (Math.Abs(vis.T[k] - t) < Math.Abs(vis.T[i] - t))
                {
                    i = k;
                }
            }

            var obs = visor.Camara.Vehiculos.Find(x => x.name == "vehiculo_" + observador);
            var obj = visor.Camara.Vehiculos.Find(x => x.name == "vehiculo_" + vis.Objetivo);
            if (obs == null || obj == null)
            {
                return capa;
            }

            var ojo = obs.transform.TransformPoint(new Vector3(-(float)(0.22 * obs.Datos.Dimensiones.AnchoM), (float)vis.AlturaOjoM, (float)(-0.04 * obs.Datos.Dimensiones.LargoM)));
            var dims = obj.Datos.Dimensiones;
            var esquinas = new List<Vector3>();
            foreach (var sx in new[] { -1f, 1f })
            {
                foreach (var sz in new[] { -1f, 1f })
                {
                    esquinas.Add(obj.transform.TransformPoint(new Vector3(sx * (float)dims.AnchoM / 2f, (float)dims.AltoM * 0.5f, sz * (float)dims.LargoM / 2f)));
                }
            }

            // Los dos bordes que ve el ojo: el de más a la izquierda y el de más a la derecha.
            var adelante = (obj.transform.position - ojo).normalized;
            var derecha = Vector3.Cross(Vector3.up, adelante);
            esquinas.Sort((a, b) => Vector3.Dot(a - ojo, derecha).CompareTo(Vector3.Dot(b - ojo, derecha)));
            var izq = esquinas[0];
            var der = esquinas[esquinas.Count - 1];
            var visible = vis.Visible[i];
            var fraccion = vis.Fraccion != null && vis.Fraccion.Length > i ? vis.Fraccion[i] : (visible ? 1.0 : 0.0);
            var color = visible ? new Color(0.25f, 0.95f, 0.45f, 0.22f) : new Color(1f, 0.25f, 0.2f, 0.22f);
            var malla = new Mesh { name = "cono" };
            malla.vertices = new[] { ojo, izq, der, izq + Vector3.up * 0.6f, der + Vector3.up * 0.6f };
            malla.triangles = new[] { 0, 1, 2, 0, 2, 1, 0, 3, 4, 0, 4, 3, 0, 1, 3, 0, 3, 1, 0, 2, 4, 0, 4, 2 };
            malla.RecalculateNormals();
            var go = new GameObject("cono");
            go.transform.SetParent(raiz, false);
            go.AddComponent<MeshFilter>().sharedMesh = malla;
            var r = go.AddComponent<MeshRenderer>();
            r.sharedMaterial = Translucido(color);
            r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            var borde = Brillo(new Color(color.r, color.g, color.b));
            Linea(raiz, ojo, izq, 0.015f, borde);
            Linea(raiz, ojo, der, 0.015f, borde);
            var distancia = vis.DistanciaM != null && vis.DistanciaM.Length > i ? vis.DistanciaM[i] : Vector3.Distance(ojo, obj.transform.position);
            var texto = (visible ? "lo ve" : "no lo ve") + " · " + F(fraccion * 100.0, "0") + " % visible · "
                + F(distancia, "0.0") + " m · t = " + F(vis.T[i], "0.0") + " s";
            Letrero(raiz, (ojo + (izq + der) / 2f) / 2f + Vector3.up * 2.2f, texto, 0.22f, Color.white, camara);
            return capa;
        }
    }
}
