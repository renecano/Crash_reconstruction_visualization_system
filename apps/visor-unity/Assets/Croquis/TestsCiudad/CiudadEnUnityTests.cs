using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using Croquis.Visor;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;

namespace Croquis.TestsCiudad
{
    /// <summary>
    /// La batería de ciudad (René, 2026-11-20: Tollocan tronaba con NullReferenceException en el 3D).
    /// Cada paquete caso-3d de `packages/scene-schema/fixtures/caso3d-ciudad/` (armado con el mismo código
    /// de la web) entra por el mismo camino que en el navegador: la escena del visor, el mensaje
    /// `cargarCaso` al puente y su respuesta («cargado» = el «listo» de la web, o «error»). Corre en el
    /// Editor (PlayMode, en modo batch), con los modelos desde `apps/web/public/modelos/vehiculos/`, sin
    /// red. Anota cada caso, con la pila de cada excepción, en `CROQUIS_BATERIA_SALIDA`.
    /// </summary>
    public class CiudadEnUnityTests
    {
        private const double TopeSegundos = 150;

        private static string Raiz => Path.GetFullPath(Path.Combine(Application.dataPath, "..", "..", ".."));

        private static string Carpeta =>
            Environment.GetEnvironmentVariable("CROQUIS_BATERIA_DIR")
            ?? Path.Combine(Raiz, "packages", "scene-schema", "fixtures", "caso3d-ciudad");

        public static IEnumerable<string> Casos()
        {
            if (!Directory.Exists(Carpeta))
            {
                return new[] { "(sin-casos)" };
            }

            return Directory.GetFiles(Carpeta, "*.json")
                .Select(Path.GetFileNameWithoutExtension)
                .Where(n => n != "indice")
                .OrderBy(n => n, StringComparer.Ordinal)
                .ToArray();
        }

        [UnityTest]
        [Timeout(240000)]
        public IEnumerator LlegaACargado([ValueSource(nameof(Casos))] string caso)
        {
            Assert.AreNotEqual("(sin-casos)", caso, "No está la carpeta de la batería: " + Carpeta);
            // Los errores se juntan aquí (con su pila) en vez de tumbar la prueba al primero.
            LogAssert.ignoreFailingMessages = true;
            var errores = new List<string>();
            var avisos = new List<string>();
            string respuesta = null;

            void Oir(string mensaje, string pila, LogType tipo)
            {
                if (mensaje.StartsWith("[puente] ", StringComparison.Ordinal))
                {
                    try
                    {
                        var t = (string)JObject.Parse(mensaje.Substring(9))["tipo"];
                        if (t == "cargado" || t == "error")
                        {
                            respuesta = mensaje.Substring(9);
                        }
                    }
                    catch (JsonException)
                    {
                    }

                    return;
                }

                if (tipo == LogType.Exception || tipo == LogType.Error || tipo == LogType.Assert)
                {
                    errores.Add(mensaje + "\n" + pila);
                }
                else if (tipo == LogType.Warning)
                {
                    avisos.Add(mensaje);
                }
            }

            Application.logMessageReceived += Oir;
            var reloj = new Stopwatch();
            try
            {
                yield return SceneManager.LoadSceneAsync("Visor", LoadSceneMode.Single);
                yield return null;
                CargadorModelos.BaseLocal = new Uri(
                    Path.Combine(Raiz, "apps", "web", "public", "modelos", "vehiculos") + Path.DirectorySeparatorChar).AbsoluteUri;
                var puente = UnityEngine.Object.FindFirstObjectByType<VisorPuente>();
                Assert.IsNotNull(puente, "La escena Visor no trae el puente.");
                var json = File.ReadAllText(Path.Combine(Carpeta, caso + ".json"));
                reloj.Start();
                puente.cargarCaso(new JObject { { "json", json } }.ToString(Formatting.None));
                while (respuesta == null && reloj.Elapsed.TotalSeconds < TopeSegundos)
                {
                    yield return null;
                }

                reloj.Stop();
                // Unos cuadros después de cargar: lo que truena al dibujar o al reproducir también cuenta.
                for (var i = 0; i < 30 && respuesta != null; i++)
                {
                    yield return null;
                }
            }
            finally
            {
                Application.logMessageReceived -= Oir;
                Anotar(caso, respuesta, reloj.Elapsed.TotalMilliseconds, errores, avisos);
            }

            Assert.IsNotNull(respuesta, $"{caso}: Unity no contestó en {TopeSegundos} s.");
            Assert.That(respuesta, Does.Contain("\"cargado\""), caso + ": " + respuesta + "\n" + string.Join("\n---\n", errores));
            Assert.IsEmpty(errores, caso + ": cargó, pero con errores:\n" + string.Join("\n---\n", errores));
        }

        private static void Anotar(string caso, string respuesta, double ms, List<string> errores, List<string> avisos)
        {
            var salida = Environment.GetEnvironmentVariable("CROQUIS_BATERIA_SALIDA");
            if (string.IsNullOrEmpty(salida))
            {
                return;
            }

            Directory.CreateDirectory(Path.GetDirectoryName(salida) ?? ".");
            var fila = new JObject
            {
                { "caso", caso },
                { "respuesta", respuesta == null ? null : JObject.Parse(respuesta) },
                { "ms", Math.Round(ms) },
                { "errores", new JArray(errores.Cast<object>().ToArray()) },
                { "avisos", new JArray(avisos.Distinct().Take(20).Cast<object>().ToArray()) },
            };
            File.AppendAllText(salida, fila.ToString(Formatting.None) + "\n");
        }
    }
}
