using System;
using System.IO;
using System.Linq;
using Croquis.Core;
using Croquis.Visor;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace Croquis.EditorTools
{
    /// <summary>
    /// Capturas del visor desde el editor, en modo batch, para revisar el escenario sin hacer un build
    /// WebGL cada vez (un build tarda de 5 a 8 minutos; esto, uno o dos). Abre cada paquete caso-3d de
    /// una carpeta, lo pone en el instante pedido y guarda un PNG por cámara.
    ///
    ///   Unity -batchmode -projectPath apps/visor-unity -executeMethod Croquis.EditorTools.Capturas.Tomar
    ///         -casos &lt;carpeta&gt; -salida &lt;carpeta&gt; [-t 0] (varios instantes: -t -1,0.3,3)
    ///         [-vistas "cerca:veh-a:30:4:1.6;orbita"] (separadas por «;»; sin ella, las cinco de siempre)
    ///         [-perfil] (dibuja sobre cada vehículo con daño el perfil C1–C6: blanco, el frente antes
    ///         del golpe; rojo, la profundidad del solver; verde, la que quedó en la malla). Con la vista
    ///         «planta:veh-a», cenital sobre su cara dañada.
    ///
    /// Las capturas que se le enseñan a René salen del build WebGL (tools/unity/capturas.mjs): estas
    /// son para trabajar.
    /// </summary>
    public static class Capturas
    {
        private const string Clave = "croquis.capturas";

        public static void Tomar()
        {
            var args = Environment.GetCommandLineArgs();
            string Arg(string n, string d)
            {
                var i = Array.IndexOf(args, n);
                return i >= 0 && i + 1 < args.Length ? args[i + 1] : d;
            }

            SessionState.SetString(Clave, Arg("-casos", "Build/casos") + "|" + Arg("-salida", "Build/capturas") + "|" + Arg("-t", "0") + "|" + Arg("-vistas", "") + "|" + (Array.IndexOf(args, "-perfil") >= 0 ? "1" : ""));
            ConstruirVisor.Preparar();
            EditorSceneManager.OpenScene(ConstruirVisor.RutaEscena);
            EditorApplication.EnterPlaymode();
        }

        [InitializeOnLoadMethod]
        private static void AlCargar()
        {
            EditorApplication.playModeStateChanged += estado =>
            {
                if (estado == PlayModeStateChange.EnteredPlayMode && SessionState.GetString(Clave, "") != "")
                {
                    _ = Correr();
                }
            };
        }

        private static async Awaitable Correr()
        {
            var codigo = 0;
            try
            {
                var partes = SessionState.GetString(Clave, "").Split('|');
                SessionState.EraseString(Clave);
                var tiempos = partes[2].Split(',').Select(x => double.Parse(x, System.Globalization.CultureInfo.InvariantCulture)).ToArray();
                Directory.CreateDirectory(partes[1]);
                // Las capturas muestran el nivel del destino del build: en WebGL, «media»; en escritorio, «alta».
                Calidad.Forzado = EditorUserBuildSettings.activeBuildTarget == BuildTarget.WebGL
                    ? Croquis.Core.NivelCalidad.Media
                    : Croquis.Core.NivelCalidad.Alta;
                Calidad.Aplicar();
                var visor = UnityEngine.Object.FindFirstObjectByType<VisorCaso>();
                var camara = Camera.main;
                foreach (var archivo in Directory.GetFiles(partes[0], "*.json").OrderBy(x => x))
                {
                    var nombre = Path.GetFileNameWithoutExtension(archivo);
                    var caso = Paquete.Leer(File.ReadAllText(archivo));
                    await visor.CargarAsync(caso);
                    if (partes.Length > 4 && partes[4] == "1")
                    {
                        DibujarPerfiles();
                    }

                    var conductor = caso.Resultado.Vehiculos.FirstOrDefault(v => v.Involucrado)?.Id;
                    var vistas = partes.Length > 3 && partes[3] != ""
                        ? partes[3].Split(';')
                        : new[] { "cinematica", "acera", "cenital", "orbita" }.Concat(conductor != null ? new[] { "conductor:" + conductor } : new string[0]);
                    foreach (var t in tiempos)
                    foreach (var vista in vistas)
                    {
                        visor.Fijar(t);
                        visor.Camara.Cambiar(vista.StartsWith("planta:", StringComparison.Ordinal) ? "orbita" : vista);
                        // Unos cuadros para que la cámara se coloque y las sombras se pongan al día.
                        for (var k = 0; k < 4; k++)
                        {
                            await Awaitable.NextFrameAsync();
                        }

                        // Con un solo instante, el nombre de siempre; con varios, también el instante.
                        var instante = tiempos.Length > 1 ? "-t" + t.ToString("0.##", System.Globalization.CultureInfo.InvariantCulture) : "";
                        var ruta = Path.Combine(partes[1], nombre + instante + "-" + vista.Replace(":", "-").Replace(".", "_") + ".png");
                        if (vista.StartsWith("planta:", StringComparison.Ordinal))
                        {
                            Planta(camara, vista.Substring(7));
                        }

                        Guardar(camara, ruta, 1600, 900);
                        Debug.Log("[captura] " + ruta);
                    }
                }
            }
            catch (Exception e)
            {
                Debug.LogException(e);
                codigo = 1;
            }

            EditorApplication.Exit(codigo);
        }

        /// <summary>
        /// «planta:veh-a»: la cámara a 4 m sobre el centro de la cara dañada del vehículo, mirando hacia abajo,
        /// con su frente hacia arriba de la imagen. Se pone justo antes de tomar la foto.
        /// </summary>
        private static void Planta(Camera camara, string id)
        {
            var vista = UnityEngine.Object.FindObjectsByType<VehiculoVista>(FindObjectsSortMode.None).FirstOrDefault(x => x.Datos?.Id == id && x.Dano != null);
            if (vista == null)
            {
                return;
            }

            var e = vista.Dano.Estaciones();
            var centro = vista.transform.TransformPoint((e[0].Frente + e[5].Frente + e[0].Pedido + e[5].Pedido) / 4f);
            var adelante = vista.transform.TransformDirection((e[0].Frente - e[0].Pedido).normalized);
            camara.transform.SetPositionAndRotation(centro + Vector3.up * 4f, Quaternion.LookRotation(Vector3.down, adelante));
        }

        /// <summary>El perfil C1–C6 de cada vehículo con daño, como líneas a la altura de la estructura, dibujadas encima de todo.</summary>
        private static void DibujarPerfiles()
        {
            foreach (var vista in UnityEngine.Object.FindObjectsByType<VehiculoVista>(FindObjectsSortMode.None))
            {
                if (vista.Dano?.Medido == null || vista.Datos?.Dimensiones == null)
                {
                    continue;
                }

                var estaciones = vista.Dano.Estaciones();
                Debug.Log("[perfil] " + vista.Datos.Id + " " + string.Join(" | ", estaciones.Select(e => e.Frente.ToString("F2") + " " + e.Pedido.ToString("F2"))));
                Linea(vista.transform, "perfil_frente", estaciones.Select(e => e.Frente).ToArray(), Color.white, 0.035f);
                Linea(vista.transform, "perfil_solver", estaciones.Select(e => e.Pedido).ToArray(), new Color(0.95f, 0.15f, 0.1f), 0.07f);
                Linea(vista.transform, "perfil_malla", estaciones.Select(e => e.Medido).ToArray(), new Color(0.2f, 0.9f, 0.3f), 0.035f);
                // Las estaciones: de lo blanco a lo rojo.
                for (var k = 0; k < estaciones.Count; k++)
                {
                    Linea(vista.transform, "estacion_C" + (k + 1), new[] { estaciones[k].Frente, estaciones[k].Pedido }, new Color(1f, 1f, 1f, 0.6f), 0.012f);
                }
            }
        }

        private static void Linea(Transform padre, string nombre, Vector3[] puntos, Color color, float ancho)
        {
            var go = new GameObject(nombre);
            go.transform.SetParent(padre, false);
            var l = go.AddComponent<LineRenderer>();
            l.useWorldSpace = false;
            l.positionCount = puntos.Length;
            l.SetPositions(puntos);
            l.widthMultiplier = ancho;
            // Encima de todo: la línea va a la altura de la estructura, bajo el cofre.
            // La verde (lo que quedó en la malla) va encima de la roja (lo que pide el solver).
            var m = new Material(Shader.Find("Hidden/Internal-Colored")) { color = color, renderQueue = nombre == "perfil_malla" ? 4002 : nombre == "perfil_solver" ? 4001 : 4000 };
            m.SetInt("_ZTest", (int)UnityEngine.Rendering.CompareFunction.Always);
            m.SetInt("_ZWrite", 0);
            m.SetInt("_Cull", 0);
            l.material = m;
            l.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
        }

        private static void Guardar(Camera camara, string ruta, int ancho, int alto)
        {
            var rt = new RenderTexture(ancho, alto, 24, RenderTextureFormat.ARGB32, RenderTextureReadWrite.sRGB) { antiAliasing = 4 };
            var previo = camara.targetTexture;
            camara.targetTexture = rt;
            camara.Render();
            camara.Render();
            // Lo que va encima de la cámara principal (el minimapa de U4), en su rincón de la imagen.
            foreach (var otra in Camera.allCameras)
            {
                if (otra == camara || !otra.enabled || otra.depth <= camara.depth)
                {
                    continue;
                }

                var suya = otra.targetTexture;
                otra.targetTexture = rt;
                otra.Render();
                otra.targetTexture = suya;
            }

            RenderTexture.active = rt;
            var tex = new Texture2D(ancho, alto, TextureFormat.RGB24, false);
            tex.ReadPixels(new Rect(0, 0, ancho, alto), 0, 0);
            tex.Apply();
            RenderTexture.active = null;
            camara.targetTexture = previo;
            File.WriteAllBytes(ruta, tex.EncodeToPNG());
            UnityEngine.Object.Destroy(tex);
            rt.Release();
        }
    }
}
