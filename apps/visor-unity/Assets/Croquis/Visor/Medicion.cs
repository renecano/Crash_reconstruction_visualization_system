using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using Croquis.Core;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.Profiling;

namespace Croquis.Visor
{
    /// <summary>
    /// La medición E6 del programa de escritorio (U5, ADR 0115), para la computadora con tarjeta de
    /// video: sin la web, el mismo visor abre un caso con un nivel fijo, lo reproduce en bucle con la
    /// cámara cinematográfica y guarda los tiempos de cuadro. La orquesta `medir-escritorio.ps1`, que
    /// corre un proceso nuevo por medición (como el navegador nuevo de E6).
    ///
    ///   VisorCroquis.exe -screen-width 1920 -screen-height 1080 -screen-fullscreen 1
    ///     -caso casos\axa-dia.json -calidad alta -segundos 12 -salida medicion.json
    /// </summary>
    public sealed class Medicion : MonoBehaviour
    {
        private const float Calentamiento = 3f;

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

        /// <summary>Solo si el programa se abrió con `-caso`: el visor de siempre no mide nada.</summary>
        public static bool Pedida => !Application.isEditor && Arg("caso") != null;

        private async void Start()
        {
            if (!Pedida)
            {
                enabled = false;
                return;
            }

            var salida = Arg("salida") ?? "medicion.json";
            var resultado = new JObject
            {
                { "caso", Path.GetFileNameWithoutExtension(Arg("caso")) },
                { "gpu", SystemInfo.graphicsDeviceName },
                { "api", SystemInfo.graphicsDeviceType.ToString() },
                { "memoria_gpu_mb", SystemInfo.graphicsMemorySize },
                { "cpu", SystemInfo.processorType },
                { "ram_mb", SystemInfo.systemMemorySize },
                { "so", SystemInfo.operatingSystem },
            };
            try
            {
                var nivelTexto = Arg("calidad") ?? "alta";
                if (!Calidades.TryLeer(nivelTexto, out var nivel))
                {
                    throw new ArgumentException("Nivel desconocido: " + nivelTexto);
                }

                Calidad.Fijar(nivel);
                var segundos = float.Parse(Arg("segundos") ?? "12", CultureInfo.InvariantCulture);
                var visor = GetComponent<VisorCaso>();
                var inicio = Time.realtimeSinceStartup;
                var caso = Paquete.Leer(File.ReadAllText(Arg("caso")));
                await visor.CargarAsync(caso);
                Calidad.Aplicar();
                resultado["carga_s"] = Math.Round(Time.realtimeSinceStartup - inicio, 2);
                visor.Camara.Cambiar("cinematica");
                visor.Bucle = true;
                visor.Reproduciendo = true;

                var fin = Time.realtimeSinceStartup + Calentamiento;
                while (Time.realtimeSinceStartup < fin)
                {
                    await Awaitable.NextFrameAsync();
                }

                var cuadros = new List<double>(4096);
                fin = Time.realtimeSinceStartup + segundos;
                while (Time.realtimeSinceStartup < fin)
                {
                    await Awaitable.NextFrameAsync();
                    cuadros.Add(Time.unscaledDeltaTime * 1000.0);
                }

                var orden = new List<double>(cuadros);
                orden.Sort();
                double total = 0;
                foreach (var c in cuadros)
                {
                    total += c;
                }

                double P(double q) => orden[Math.Min(orden.Count - 1, Math.Max(0, (int)Math.Ceiling(q * orden.Count) - 1))];
                resultado["nivel"] = Calidades.Nombre(Calidad.Perfil.Nivel);
                resultado["resolucion"] = $"{Screen.width}x{Screen.height}";
                resultado["escala"] = Calidad.EscalaDibujo;
                resultado["cuadros"] = cuadros.Count;
                resultado["fps_promedio"] = Math.Round(cuadros.Count * 1000.0 / total, 1);
                resultado["fps_mediana"] = Math.Round(1000.0 / P(0.5), 1);
                resultado["fps_1pct_bajo"] = Math.Round(1000.0 / P(0.99), 1);
                resultado["ms_p95"] = Math.Round(P(0.95), 2);
                resultado["cuadros_mas_50ms"] = cuadros.FindAll(c => c > 50.0).Count;
                resultado["memoria_mb"] = Profiler.GetTotalReservedMemoryLong() / 1048576;
            }
            catch (Exception e)
            {
                resultado["error"] = e.GetType().Name + ": " + e.Message;
            }

            File.WriteAllText(salida, resultado.ToString());
            Application.Quit(resultado["error"] == null ? 0 : 1);
        }
    }
}
