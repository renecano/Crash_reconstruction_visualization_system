using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using Croquis.Core;
using Croquis.Generated;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using UnityEngine.UI;
using Material = UnityEngine.Material;

namespace Croquis.Visor
{
    /// <summary>
    /// El modo foto del programa de escritorio (material promocional, René 2026-11-13). Solo con
    /// argumento; no cambia el visor del perito:
    ///
    ///   VisorCroquis.exe -fotos tomas.json -salida fotos -ancho 3840 -alto 2160 -calidad ultra
    ///
    /// Cada toma de `tomas.json` abre su paquete caso-3d, fija el instante y la cámara y se dibuja
    /// aparte a la resolución pedida, sin minimapa ni panel, sin desenfoque ni profundidad de campo,
    /// con la leyenda ilustrativa pequeña en una esquina. Las tomas de ingeniería
    /// (`CapasIngenieria`) salen dos veces con la misma cámara: con su capa y «limpia». Al final
    /// escribe `fotos.json` con lo que hizo y sale.
    /// </summary>
    public sealed class Fotos : MonoBehaviour
    {
        private const int CuadrosDeAsiento = 8;
        private static readonly CultureInfo Inv = CultureInfo.InvariantCulture;

        private static string Arg(string nombre)
        {
            var a = Environment.GetCommandLineArgs();
            for (var i = 0; i < a.Length - 1; i++)
            {
                if (a[i] == "-" + nombre)
                {
                    return a[i + 1];
                }
            }

            return null;
        }

        /// <summary>Solo si el programa se abrió con `-fotos`.</summary>
        public static bool Pedidas => !Application.isEditor && Arg("fotos") != null;

        private VisorCaso visor;
        private Camera camara;

        private async void Start()
        {
            if (!Pedidas)
            {
                enabled = false;
                return;
            }

            var archivo = Path.GetFullPath(Arg("fotos"));
            var carpeta = Path.GetDirectoryName(archivo) ?? ".";
            var plan = JObject.Parse(File.ReadAllText(archivo));
            var salida = Path.GetFullPath(Arg("salida") ?? Path.Combine(carpeta, "fotos"));
            Directory.CreateDirectory(salida);
            var ancho = int.Parse(Arg("ancho") ?? (string)plan["ancho"] ?? "3840", Inv);
            var alto = int.Parse(Arg("alto") ?? (string)plan["alto"] ?? "2160", Inv);
            var nivelTexto = Arg("calidad") ?? (string)plan["calidad"] ?? "ultra";
            var solo = Arg("solo");
            var informe = new JObject
            {
                { "gpu", SystemInfo.graphicsDeviceName },
                { "calidad", nivelTexto },
                { "resolucion", ancho + "x" + alto },
            };
            var hechas = new JArray();
            informe["tomas"] = hechas;
            var errores = 0;
            visor = GetComponent<VisorCaso>();
            var reloj = System.Diagnostics.Stopwatch.StartNew();
            try
            {
                if (!Calidades.TryLeer(nivelTexto, out var nivel))
                {
                    throw new ArgumentException("Nivel desconocido: " + nivelTexto);
                }

                Calidad.Fijar(nivel);
                string cargado = null;
                Caso3D caso = null;
                foreach (JObject toma in (JArray)plan["tomas"])
                {
                    var id = (string)toma["id"];
                    if (solo != null && Array.IndexOf(solo.Split(','), id) < 0)
                    {
                        continue;
                    }

                    var hecha = new JObject { { "id", id } };
                    hechas.Add(hecha);
                    var inicio = reloj.Elapsed.TotalSeconds;
                    try
                    {
                        var ruta = Path.GetFullPath(Path.Combine(carpeta, (string)toma["caso"]));
                        if (ruta != cargado)
                        {
                            caso = Paquete.Leer(File.ReadAllText(ruta));
                            await visor.CargarAsync(caso);
                            Calidad.Aplicar();
                            cargado = ruta;
                            // Que bajen los modelos, se compilen los sombreadores y se asiente la escala.
                            for (var i = 0; i < 90; i++)
                            {
                                await Awaitable.NextFrameAsync();
                            }
                        }

                        camara = Camera.main;
                        visor.Reproduciendo = false;
                        // El instante: segundos desde el impacto, o «fin» (el reposo).
                        var t = toma["t"] == null ? 0.0
                            : (string)toma["t"] == "fin" ? visor.Fin
                            : (double)toma["t"];

                        visor.Fijar(t);
                        var conductor = Apuntar((JObject)toma["camara"], caso);
                        var capaNombre = (string)toma["capa"];
                        Capa capa = null;
                        if (!string.IsNullOrEmpty(capaNombre))
                        {
                            await Asentar();
                            capa = Capa(capaNombre, toma, caso, t);
                        }

                        await Asentar();
                        Guardar(Path.Combine(salida, id + ".png"), ancho, alto);
                        if (capa != null)
                        {
                            capa.Quitar();
                            await Asentar();
                            Guardar(Path.Combine(salida, id + "-limpia.png"), ancho, alto);
                        }

                        if (conductor)
                        {
                            visor.Camara.Cambiar("cinematica");
                        }

                        hecha["s"] = Math.Round(reloj.Elapsed.TotalSeconds - inicio, 1);
                    }
                    catch (Exception e)
                    {
                        errores++;
                        hecha["error"] = e.GetType().Name + ": " + e.Message;
                        Debug.LogException(e);
                    }
                }
            }
            catch (Exception e)
            {
                errores++;
                informe["error"] = e.GetType().Name + ": " + e.Message;
            }

            informe["segundos"] = Math.Round(reloj.Elapsed.TotalSeconds, 1);
            File.WriteAllText(Path.Combine(salida, "fotos.json"), informe.ToString());
            Application.Quit(errores == 0 ? 0 : 1);
        }

        private async Awaitable Asentar()
        {
            for (var i = 0; i < CuadrosDeAsiento; i++)
            {
                await Awaitable.NextFrameAsync();
            }
        }

        private static Vector3 V(JToken t, Vector3 siFalta)
        {
            return t is JArray a ? new Vector3((float)a[0], a.Count > 2 ? (float)a[2] : 0f, (float)a[1]) : siFalta;
        }

        /// <summary>
        /// La cámara de la toma. `modo` usa una de las del visor («conductor:veh-a», «cerca:…»); si no,
        /// se coloca: `objetivo` (un vehículo, «impacto» o [x, y] en metros), `azimut` (grados desde el
        /// norte hacia el este, o desde el frente del vehículo con `relativo`), `distancia`, `altura`,
        /// `mira` (la altura a la que mira), `fov`, y `orto` (medio alto, para una vista de plano).
        /// Devuelve si la cámara es la de un conductor (la mueve el visor).
        /// </summary>
        private bool Apuntar(JObject c, Caso3D caso)
        {
            var modo = (string)c["modo"];
            if (!string.IsNullOrEmpty(modo))
            {
                visor.Camara.enabled = true;
                camara.orthographic = false;
                if (!visor.Camara.Cambiar(modo))
                {
                    throw new ArgumentException("No hay una cámara «" + modo + "».");
                }

                return modo.StartsWith("conductor:", StringComparison.Ordinal);
            }

            visor.Camara.enabled = false;
            var objetivo = c["objetivo"];
            Vector3 centro;
            var rumbo = 0f;
            if (objetivo is JArray)
            {
                centro = V(objetivo, Vector3.zero);
            }
            else if ((string)objetivo == "impacto" || objetivo == null)
            {
                var p = caso.Resultado.PuntoImpacto;
                centro = p != null ? new Vector3((float)p.X, 0f, (float)p.Y) : visor.Camara.Centro;
            }
            else
            {
                var v = visor.Camara.Vehiculos.Find(x => x.name == "vehiculo_" + (string)objetivo);
                if (v == null)
                {
                    throw new ArgumentException("No hay un vehículo «" + objetivo + "».");
                }

                centro = v.transform.position;
                rumbo = v.transform.eulerAngles.y;
            }

            var azimut = (float)(c["azimut"] ?? 0.0);
            if ((bool?)c["relativo"] == true)
            {
                azimut += rumbo;
            }

            var distancia = (float)(c["distancia"] ?? 8.0);
            var altura = (float)(c["altura"] ?? 1.6);
            var mira = (float)(c["mira"] ?? 0.8);
            centro += V(c["desplazar"], Vector3.zero);
            var dir = Quaternion.Euler(0f, azimut, 0f) * Vector3.forward;
            var ojo = centro + dir * distancia + Vector3.up * altura;
            var hacia = centro + Vector3.up * mira;
            // Mirando recto hacia abajo (una planta), el «arriba» de la foto es la izquierda del azimut:
            // el vehículo sale de lado, con su frente a la derecha.
            var vista = (hacia - ojo).normalized;
            var arriba = Mathf.Abs(Vector3.Dot(vista, Vector3.up)) > 0.98f
                ? Quaternion.Euler(0f, azimut - 90f, 0f) * Vector3.forward
                : Vector3.up;
            camara.transform.SetPositionAndRotation(ojo, Quaternion.LookRotation(hacia - ojo, arriba));
            camara.fieldOfView = (float)(c["fov"] ?? 35.0);
            if (c["orto"] != null)
            {
                camara.orthographic = true;
                camara.orthographicSize = (float)c["orto"];
            }
            else
            {
                camara.orthographic = false;
            }

            return false;
        }

        private Capa Capa(string nombre, JObject toma, Caso3D caso, double t)
        {
            var id = (string)toma["vehiculo"];
            switch (nombre)
            {
                case "rayos_x":
                    return CapasIngenieria.RayosX(visor, id, camara);
                case "estroboscopica":
                    return CapasIngenieria.Estroboscopica(visor, (double)(toma["paso"] ?? 0.1),
                        (double)(toma["desde"] ?? -3.0), (double)(toma["hasta"] ?? visor.Fin), camara);
                case "nube":
                {
                    var carpeta = Path.GetDirectoryName(Path.GetFullPath(Arg("fotos"))) ?? ".";
                    var nube = JObject.Parse(File.ReadAllText(Path.Combine(carpeta, (string)toma["nube"])));
                    return CapasIngenieria.Nube(visor, nube, camara);
                }

                case "alambre":
                {
                    var v = visor.Camara.Vehiculos.Count > 0 ? visor.Camara.Vehiculos[0] : null;
                    return CapasIngenieria.Alambre(visor, v?.Terreno, (float)(toma["lado"] ?? 40.0),
                        (float)(toma["malla"] ?? 1.0), camara);
                }

                case "ficha_lateral":
                    return CapasIngenieria.Ficha(visor, id, true, camara);
                case "ficha_planta":
                    return CapasIngenieria.Ficha(visor, id, false, camara);
                case "cono":
                    return CapasIngenieria.Cono(visor, caso, id, t, camara);
                default:
                    throw new ArgumentException("No hay una capa «" + nombre + "».");
            }
        }

        /// <summary>
        /// La cámara principal dibujada en una textura del tamaño pedido, con la leyenda ilustrativa en
        /// una esquina (pasa a dibujarse con esa cámara mientras dura), y guardada en PNG.
        /// </summary>
        private void Guardar(string ruta, int ancho, int alto)
        {
            var leyenda = GameObject.Find("leyenda")?.GetComponent<Canvas>();
            var modo = leyenda != null ? leyenda.renderMode : RenderMode.ScreenSpaceOverlay;
            Text texto = leyenda != null ? leyenda.GetComponentInChildren<Text>() : null;
            var tamano = texto != null ? texto.fontSize : 0;
            RenderTexture rt = null;
            Texture2D lectura = null;
            var aspecto = camara.aspect;
            try
            {
                if (leyenda != null)
                {
                    leyenda.renderMode = RenderMode.ScreenSpaceCamera;
                    leyenda.worldCamera = camara;
                    leyenda.planeDistance = camara.nearClipPlane + 0.05f;
                    if (texto != null)
                    {
                        // Pequeña: unos 1.2 % del alto de la foto.
                        texto.fontSize = 11;
                    }
                }

                rt = new RenderTexture(ancho, alto, 24, RenderTextureFormat.ARGB32, RenderTextureReadWrite.sRGB)
                {
                    name = "foto",
                    antiAliasing = 1,
                };
                rt.Create();
                var pedido = new UniversalRenderPipeline.SingleCameraRequest { destination = rt };
                if (!RenderPipeline.SupportsRenderRequest(camara, pedido))
                {
                    throw new InvalidOperationException("La canalización no puede dibujar la cámara en una textura.");
                }

                camara.aspect = (float)ancho / alto;
                RenderPipeline.SubmitRenderRequest(camara, pedido);
                var antes = RenderTexture.active;
                RenderTexture.active = rt;
                lectura = new Texture2D(ancho, alto, TextureFormat.RGB24, false);
                lectura.ReadPixels(new Rect(0, 0, ancho, alto), 0, 0);
                lectura.Apply(false);
                RenderTexture.active = antes;
                File.WriteAllBytes(ruta, lectura.EncodeToPNG());
            }
            finally
            {
                camara.aspect = aspecto;
                camara.ResetAspect();
                if (leyenda != null)
                {
                    leyenda.renderMode = modo;
                    if (texto != null)
                    {
                        texto.fontSize = tamano;
                    }
                }

                if (rt != null)
                {
                    rt.Release();
                    Destroy(rt);
                }

                if (lectura != null)
                {
                    Destroy(lectura);
                }
            }
        }
    }
}
