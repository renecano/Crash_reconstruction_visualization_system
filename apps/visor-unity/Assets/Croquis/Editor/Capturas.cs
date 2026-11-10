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

            SessionState.SetString(Clave, Arg("-casos", "Build/casos") + "|" + Arg("-salida", "Build/capturas") + "|" + Arg("-t", "0"));
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
                    var conductor = caso.Resultado.Vehiculos.FirstOrDefault(v => v.Involucrado)?.Id;
                    var vistas = new[] { "cinematica", "acera", "cenital", "orbita" }.Concat(conductor != null ? new[] { "conductor:" + conductor } : new string[0]);
                    foreach (var t in tiempos)
                    foreach (var vista in vistas)
                    {
                        visor.Fijar(t);
                        visor.Camara.Cambiar(vista);
                        // Unos cuadros para que la cámara se coloque y las sombras se pongan al día.
                        for (var k = 0; k < 4; k++)
                        {
                            await Awaitable.NextFrameAsync();
                        }

                        // Con un solo instante, el nombre de siempre; con varios, también el instante.
                        var instante = tiempos.Length > 1 ? "-t" + t.ToString("0.##", System.Globalization.CultureInfo.InvariantCulture) : "";
                        var ruta = Path.Combine(partes[1], nombre + instante + "-" + vista.Replace(":", "-") + ".png");
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
