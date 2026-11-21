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
    /// Las carreras entre la web y Unity (René, 2026-11-20, después de Tollocan): cada mensaje que la web
    /// puede mandar, llegando a media carga de un caso de ciudad; recargar con el modo edición encendido;
    /// y alternar con una versión superpuesta (Versiones). La carga tiene que llegar a «cargado», ningún
    /// «error» puede ser de ella (`de` = cargarCaso) y no puede haber excepciones.
    /// </summary>
    public class CarrerasEnUnityTests
    {
        private const double TopeSegundos = 150;

        private static string Raiz => Path.GetFullPath(Path.Combine(Application.dataPath, "..", "..", ".."));

        private static string Carpeta => Path.Combine(Raiz, "packages", "scene-schema", "fixtures", "caso3d-ciudad");

        /// <summary>Cada mensaje de la web, con datos como los que manda (`visor-puente.md`).</summary>
        public static IEnumerable<string> Mensajes() => new[]
        {
            "camara|{\"modo\":\"conductor_V9\"}",
            "camara|{\"modo\":\"cinematica\"}",
            "encuadrar|{\"zona\":\"todo\"}",
            "fijarTiempo|{\"t\":1.0}",
            "reproducir|{}",
            "pausar|{}",
            "velocidad|{\"x\":2}",
            "marcadores|{\"visibles\":false}",
            "calidad|{\"nivel\":\"alta\"}",
            "modoEdicion|{\"on\":true,\"herramienta\":\"mover\"}",
            "piso|{\"imagen\":null}",
            "depurar|{\"minimapa\":false}",
            "capturar|{\"vista\":\"impacto\",\"ancho\":320,\"alto\":180}",
        };

        private sealed class Oido
        {
            public readonly List<JObject> Respuestas = new List<JObject>();
            public readonly List<string> Errores = new List<string>();

            public void Oir(string mensaje, string pila, LogType tipo)
            {
                if (mensaje.StartsWith("[puente] ", StringComparison.Ordinal))
                {
                    try
                    {
                        var j = JObject.Parse(mensaje.Substring(9));
                        var t = (string)j["tipo"];
                        if (t == "cargado" || t == "error" || t == "captura")
                        {
                            Respuestas.Add(j);
                        }
                    }
                    catch (JsonException)
                    {
                    }

                    return;
                }

                if ((tipo == LogType.Exception || tipo == LogType.Error || tipo == LogType.Assert)
                    && !mensaje.StartsWith("UpdateVolumeStack must not be called before VolumeManager", StringComparison.Ordinal))
                {
                    Errores.Add(mensaje + "\n" + pila);
                }
            }

            public int Cargados => Respuestas.Count(r => (string)r["tipo"] == "cargado");

            public IEnumerable<JObject> ErroresDeLaCarga =>
                Respuestas.Where(r => (string)r["tipo"] == "error" && ((string)r["de"] ?? "cargarCaso") == "cargarCaso");
        }

        private static IEnumerator Escena()
        {
            yield return SceneManager.LoadSceneAsync("Visor", LoadSceneMode.Single);
            yield return null;
            CargadorModelos.BaseLocal = new Uri(
                Path.Combine(Raiz, "apps", "web", "public", "modelos", "vehiculos") + Path.DirectorySeparatorChar).AbsoluteUri;
        }

        private static string Sobre(string archivo) =>
            new JObject { { "json", File.ReadAllText(Path.Combine(Carpeta, archivo)) } }.ToString(Formatting.None);

        private static IEnumerator EsperarCargados(Oido o, int cuantos)
        {
            var reloj = Stopwatch.StartNew();
            while (o.Cargados < cuantos && !o.ErroresDeLaCarga.Any() && reloj.Elapsed.TotalSeconds < TopeSegundos)
            {
                yield return null;
            }

            for (var i = 0; i < 30; i++)
            {
                yield return null;
            }
        }

        private static void Revisar(string que, Oido o, int cargados)
        {
            Assert.IsFalse(o.ErroresDeLaCarga.Any(), que + ": la carga contestó «error»: " + string.Join(" | ", o.ErroresDeLaCarga));
            Assert.GreaterOrEqual(o.Cargados, cargados, que + ": no llegó a «cargado».");
            // La cámara que no existe sí contesta su propio error (de = camara): eso es lo esperado.
            var excepciones = o.Errores.Where(e => !e.Contains("No hay una cámara")).ToList();
            Assert.IsEmpty(excepciones, que + ": con errores:\n" + string.Join("\n---\n", excepciones));
        }

        [UnityTest]
        [Timeout(240000)]
        public IEnumerator MensajeAMediaCarga([ValueSource(nameof(Mensajes))] string mensaje, [Values(0, 2)] int cuadros)
        {
            LogAssert.ignoreFailingMessages = true;
            var o = new Oido();
            Application.logMessageReceived += o.Oir;
            try
            {
                yield return Escena();
                var puente = UnityEngine.Object.FindFirstObjectByType<VisorPuente>();
                puente.cargarCaso(Sobre("tollocan.json"));
                for (var i = 0; i < cuadros; i++)
                {
                    yield return null;
                }

                var partes = mensaje.Split(new[] { '|' }, 2);
                typeof(VisorPuente).GetMethod(partes[0]).Invoke(puente, new object[] { partes[1] });
                yield return EsperarCargados(o, 1);
            }
            finally
            {
                Application.logMessageReceived -= o.Oir;
            }

            Revisar(mensaje + " a " + cuadros + " cuadros", o, 1);
        }

        [UnityTest]
        [Timeout(240000)]
        public IEnumerator RecargaConElModoEdicion([Values(0, 2, 30)] int cuadros)
        {
            LogAssert.ignoreFailingMessages = true;
            var o = new Oido();
            Application.logMessageReceived += o.Oir;
            try
            {
                yield return Escena();
                var puente = UnityEngine.Object.FindFirstObjectByType<VisorPuente>();
                puente.cargarCaso(Sobre("toluca-poste.json"));
                yield return EsperarCargados(o, 1);
                // El perito mueve un objeto en 3D: la web recalcula y vuelve a cargar con la edición encendida.
                puente.modoEdicion("{\"on\":true,\"herramienta\":\"mover\"}");
                yield return null;
                puente.cargarCaso(Sobre("toluca-poste.json"));
                for (var i = 0; i < cuadros; i++)
                {
                    yield return null;
                }

                puente.modoEdicion("{\"on\":true,\"herramienta\":\"punto_inicial\",\"vehiculo_id\":\"veh-a\"}");
                yield return EsperarCargados(o, 2);
            }
            finally
            {
                Application.logMessageReceived -= o.Oir;
            }

            Revisar("recarga con la edición encendida", o, 2);
        }

        [UnityTest]
        [Timeout(240000)]
        public IEnumerator AlternarConUnaVersion([Values(0, 1, 30)] int cuadros)
        {
            LogAssert.ignoreFailingMessages = true;
            var o = new Oido();
            Application.logMessageReceived += o.Oir;
            try
            {
                yield return Escena();
                var puente = UnityEngine.Object.FindFirstObjectByType<VisorPuente>();
                // Versiones: la reconstrucción con la versión superpuesta y, enseguida, sin ella.
                var paquete = JObject.Parse(File.ReadAllText(Path.Combine(Carpeta, "axa.json")));
                var conVersion = (JObject)paquete.DeepClone();
                conVersion["fantasma"] = new JObject { { "etiqueta", "Declaración de A" }, { "resultado", paquete["resultado"].DeepClone() } };
                puente.cargarCaso(new JObject { { "json", conVersion.ToString(Formatting.None) } }.ToString(Formatting.None));
                for (var i = 0; i < cuadros; i++)
                {
                    yield return null;
                }

                puente.cargarCaso(new JObject { { "json", paquete.ToString(Formatting.None) } }.ToString(Formatting.None));
                yield return EsperarCargados(o, 1);
            }
            finally
            {
                Application.logMessageReceived -= o.Oir;
            }

            Revisar("alternar con una versión", o, 1);
        }
    }
}
