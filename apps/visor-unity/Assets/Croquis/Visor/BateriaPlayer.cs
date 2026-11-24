using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Croquis.Core;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace Croquis.Visor
{
    /// <summary>
    /// La batería de ciudad en un build (René, 2026-11-20: en el Editor Tollocan carga; en el build web
    /// tronaba). Con `-bateria <carpeta>` el visor de escritorio carga cada paquete caso-3d de la carpeta
    /// por el mismo camino que el puente, anota cada uno en `-salida` (con la pila de cada excepción y de
    /// cada error del registro) y se cierra. `-modelos <url>` lee los modelos de una carpeta local, sin
    /// Blob. Sin `-bateria`, no hace nada.
    /// </summary>
    public sealed class BateriaPlayer : MonoBehaviour
    {
        private static string Arg(string nombre)
        {
            var a = Environment.GetCommandLineArgs();
            for (var i = 0; i + 1 < a.Length; i++)
            {
                if (a[i] == "-" + nombre)
                {
                    return a[i + 1];
                }
            }

            return null;
        }

        /// <summary>Si el programa se abrió con `-bateria`.</summary>
        public static bool Pedida => !Application.isEditor && Arg("bateria") != null;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void Instalar()
        {
            if (Pedida)
            {
                new GameObject("bateria").AddComponent<BateriaPlayer>();
            }
        }

        private readonly List<string> errores = new List<string>();

        private void Oir(string mensaje, string pila, LogType tipo)
        {
            if (tipo == LogType.Exception || tipo == LogType.Error || tipo == LogType.Assert)
            {
                errores.Add(mensaje + "\n" + pila);
            }
        }

        private async void Start()
        {
            var carpeta = Arg("bateria");
            var salida = Arg("salida") ?? Path.Combine(carpeta, "bateria-player.jsonl");
            var modelos = Arg("modelos");
            if (modelos != null)
            {
                CargadorModelos.BaseLocal = modelos;
            }

            var visor = FindFirstObjectByType<VisorCaso>();
            Application.logMessageReceived += Oir;
            var fallas = 0;
            foreach (var archivo in Directory.GetFiles(carpeta, "*.json")
                         .Where(f => Path.GetFileNameWithoutExtension(f) != "indice")
                         .OrderBy(f => f, StringComparer.Ordinal))
            {
                errores.Clear();
                var reloj = System.Diagnostics.Stopwatch.StartNew();
                string excepcion = null;
                try
                {
                    await visor.CargarAsync(Paquete.Leer(File.ReadAllText(archivo)));
                    // Unos cuadros dibujados: lo que truena al dibujar o al reproducir también cuenta.
                    for (var i = 0; i < 30; i++)
                    {
                        await Awaitable.NextFrameAsync();
                    }
                }
                catch (Exception e)
                {
                    excepcion = e.ToString();
                }

                if (excepcion != null || errores.Count > 0)
                {
                    fallas++;
                }

                var fila = new JObject
                {
                    { "caso", Path.GetFileNameWithoutExtension(archivo) },
                    { "estado", excepcion == null ? "cargado" : "error" },
                    { "ms", Math.Round(reloj.Elapsed.TotalMilliseconds) },
                    { "excepcion", excepcion },
                    { "errores", new JArray(errores.Distinct().Cast<object>().ToArray()) },
                    { "nivel", Calidad.Nivel.ToString() },
                    { "gpu", SystemInfo.graphicsDeviceName },
                };
                File.AppendAllText(salida, fila.ToString(Formatting.None) + "\n");
            }

            Application.logMessageReceived -= Oir;
            Application.Quit(fallas == 0 ? 0 : 2);
        }
    }
}
