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
    /// «Dicho en la narración → se ve en el 3D» (René, 2026-11-21): cada narración de la ronda 4 y
    /// Tollocan, armadas por el camino del navegador (`bateria-narraciones.test.ts` →
    /// `fixtures/caso3d-narraciones/`), cargadas en la escena del visor. Comprueba en Unity lo narrado
    /// (el objeto frente al golpe y el vehículo ahí, la losa del puente, el relieve, la curva, el énfasis
    /// del impacto), deja una captura renderizada del impacto y una fila por narración en
    /// `eval/results/unity_narraciones/narraciones.jsonl`.
    /// </summary>
    public class NarracionEnUnityTests
    {
        private static string Raiz => Path.GetFullPath(Path.Combine(Application.dataPath, "..", "..", ".."));

        private static string Carpeta => Path.Combine(Raiz, "packages", "scene-schema", "fixtures", "caso3d-narraciones");

        private static string Salida => Path.Combine(Raiz, "eval", "results", "unity_narraciones");

        /// <summary>Lo que dice cada narración que tiene que verse.</summary>
        private static readonly Dictionary<string, string[]> Esperado = new Dictionary<string, string[]>
        {
            { "arbol", new[] { "objeto:arbol" } },
            { "poste", new[] { "objeto:poste" } },
            { "puente", new[] { "puente" } },
            { "subida", new[] { "relieve" } },
            { "bajada", new[] { "relieve", "objeto:barrera" } },
            { "curva", new[] { "curva" } },
            { "tollocan", new[] { "objeto:arbol" } },
        };

        public static IEnumerable<string> Casos() => Esperado.Keys;

        [UnityTest]
        [Timeout(240000)]
        public IEnumerator LoNarradoSeVe([ValueSource(nameof(Casos))] string clave)
        {
            LogAssert.ignoreFailingMessages = true;
            var archivo = Path.Combine(Carpeta, clave + ".json");
            Assert.IsTrue(File.Exists(archivo), "Falta el paquete " + archivo);
            var json = File.ReadAllText(archivo);
            var paquete = JObject.Parse(json);
            string respuesta = null;
            var errores = new List<string>();

            void Oir(string mensaje, string pila, LogType tipo)
            {
                if (mensaje.StartsWith("[puente] ", StringComparison.Ordinal))
                {
                    var t = (string)JObject.Parse(mensaje.Substring(9))["tipo"];
                    if (t == "cargado" || t == "error")
                    {
                        respuesta = mensaje.Substring(9);
                    }
                }
                else if ((tipo == LogType.Exception || tipo == LogType.Error)
                    && !mensaje.StartsWith("UpdateVolumeStack must not be called before VolumeManager", StringComparison.Ordinal))
                {
                    errores.Add(mensaje);
                }
            }

            Application.logMessageReceived += Oir;
            var fila = new JObject { { "clave", clave } };
            var faltan = new List<string>();
            try
            {
                yield return SceneManager.LoadSceneAsync("Visor", LoadSceneMode.Single);
                yield return null;
                CargadorModelos.BaseLocal = new Uri(
                    Path.Combine(Raiz, "apps", "web", "public", "modelos", "vehiculos") + Path.DirectorySeparatorChar).AbsoluteUri;
                var puente = UnityEngine.Object.FindFirstObjectByType<VisorPuente>();
                var visor = UnityEngine.Object.FindFirstObjectByType<VisorCaso>();
                puente.cargarCaso(new JObject { { "json", json } }.ToString(Formatting.None));
                var reloj = Stopwatch.StartNew();
                while (respuesta == null && reloj.Elapsed.TotalSeconds < 150)
                {
                    yield return null;
                }

                fila["respuesta"] = respuesta;
                Assert.That(respuesta, Does.Contain("\"cargado\""), clave + ": " + respuesta);

                var res = (JObject)paquete["resultado"];
                var impacto = res["punto_impacto"];
                var tImpacto = visor.TImpacto;
                // El énfasis del impacto: su marca en el piso, que aparece desde el instante del choque (antes
                // está inactiva, y GameObject.Find no ve lo inactivo).
                visor.Fijar(double.IsNaN(tImpacto) ? (double)res["t_fin"] : tImpacto + 0.3);
                yield return null;
                fila["enfasis"] = Resources.FindObjectsOfTypeAll<GameObject>().Any(g => g.name == "impacto_marca" && g.scene.IsValid());
                if (!(bool)fila["enfasis"])
                {
                    faltan.Add("el énfasis del impacto");
                }

                foreach (var e in Esperado[clave])
                {
                    if (e.StartsWith("objeto:", StringComparison.Ordinal))
                    {
                        var tipo = e.Substring(7);
                        var malla = tipo == "arbol" ? "troncos_colocados" : tipo == "poste" ? "postes_colocados" : tipo == "barrera" ? "barreras_colocadas" : "muros_colocados";
                        var obj = ((JArray)res["objetos"] ?? new JArray()).FirstOrDefault(o => (string)o["tipo"] == tipo);
                        fila["objeto_" + tipo] = obj != null;
                        if (obj == null)
                        {
                            var hay = string.Join(", ", ((JArray)res["objetos"] ?? new JArray()).Select(o => (string)o["tipo"]).Distinct());
                            faltan.Add($"el objeto «{tipo}» (el caso trae: {(hay.Length > 0 ? hay : "ninguno")})");
                            continue;
                        }

                        var ox = (double)obj["x"];
                        var oy = (double)obj["y"];
                        var aImpacto = impacto == null ? double.NaN : Math.Sqrt(Math.Pow(ox - (double)impacto["x"], 2) + Math.Pow(oy - (double)impacto["y"], 2));
                        fila["objeto_al_impacto_m"] = Math.Round(aImpacto, 2);
                        fila["malla_" + tipo] = GameObject.Find(malla) != null;
                        // El vehículo en el instante del impacto, junto al objeto.
                        visor.Fijar(double.IsNaN(tImpacto) ? 0 : tImpacto);
                        yield return null;
                        var vistas = UnityEngine.Object.FindObjectsByType<VehiculoVista>(FindObjectsSortMode.None);
                        var cerca = vistas.Length == 0
                            ? double.NaN
                            : vistas.Min(v => Math.Sqrt(Math.Pow(v.transform.position.x - ox, 2) + Math.Pow(v.transform.position.z - oy, 2)));
                        fila["vehiculo_al_objeto_m"] = Math.Round(cerca, 2);
                        if (!(bool)fila["malla_" + tipo])
                        {
                            faltan.Add($"la malla del {tipo} en la escena");
                        }

                        if (!(aImpacto <= 3.0))
                        {
                            faltan.Add($"el {tipo} frente al golpe (está a {aImpacto:0.0} m del punto de impacto)");
                        }

                        if (!(cerca <= 4.5))
                        {
                            faltan.Add($"el vehículo chocando con el {tipo} (a {cerca:0.0} m en el impacto)");
                        }
                    }
                    else if (e == "puente")
                    {
                        fila["losa"] = GameObject.Find("puente_estructura") != null;
                        if (!(bool)fila["losa"])
                        {
                            faltan.Add("la losa del puente");
                        }
                    }
                    else if (e == "relieve")
                    {
                        // El vehículo sube o baja a lo largo de su recorrido: el piso no es plano.
                        var alturas = new List<float>();
                        var inicio = (double)res["t_inicio"];
                        var fin = (double)res["t_fin"];
                        for (var i = 0; i <= 10; i++)
                        {
                            visor.Fijar(inicio + (fin - inicio) * i / 10.0);
                            yield return null;
                            var v = UnityEngine.Object.FindObjectsByType<VehiculoVista>(FindObjectsSortMode.None).FirstOrDefault();
                            if (v != null)
                            {
                                alturas.Add(v.transform.position.y);
                            }
                        }

                        var desnivel = alturas.Count > 0 ? alturas.Max() - alturas.Min() : 0f;
                        fila["desnivel_recorrido_m"] = Math.Round(desnivel, 2);
                        fila["con_malla_de_relieve"] = paquete["relieve"] != null && paquete["relieve"].Type != JTokenType.Null;
                        if (!(desnivel > 0.2f))
                        {
                            faltan.Add($"el relieve (el vehículo sube o baja {desnivel:0.00} m en su recorrido)");
                        }
                    }
                    else if (e == "curva")
                    {
                        // La curva: el vehículo gira siguiendo la calle antes del impacto (no basta que la calle
                        // del mapa sea curva si el vehículo llega recto).
                        var inicio = (double)res["t_inicio"];
                        var hasta = double.IsNaN(tImpacto) ? (double)res["t_fin"] : tImpacto;
                        var rumbos = new List<float>();
                        for (var i = 0; i <= 10; i++)
                        {
                            visor.Fijar(inicio + (hasta - inicio) * i / 10.0);
                            yield return null;
                            var v = UnityEngine.Object.FindObjectsByType<VehiculoVista>(FindObjectsSortMode.None).FirstOrDefault();
                            if (v != null)
                            {
                                rumbos.Add(v.transform.eulerAngles.y);
                            }
                        }

                        var giro = 0f;
                        for (var i = 1; i < rumbos.Count; i++)
                        {
                            giro += Mathf.Abs(Mathf.DeltaAngle(rumbos[i - 1], rumbos[i]));
                        }

                        fila["giro_antes_del_impacto_deg"] = Math.Round(giro, 1);
                        if (!(giro > 10f))
                        {
                            faltan.Add($"la curva (el vehículo gira {giro:0} ° antes del impacto: llega recto)");
                        }
                    }
                }

                // La captura renderizada del impacto: la cámara del visor, en el instante del choque, a una
                // textura (en modo batch el Editor no corre el fin de cuadro que espera `Captura`).
                Directory.CreateDirectory(Salida);
                visor.Fijar(double.IsNaN(tImpacto) ? (double)res["t_fin"] : tImpacto + 0.3);
                yield return null;
                yield return null;
                try
                {
                    var cam = Camera.main;
                    var rt = new RenderTexture(960, 540, 24);
                    var antes = cam.targetTexture;
                    cam.targetTexture = rt;
                    cam.Render();
                    var previo = RenderTexture.active;
                    RenderTexture.active = rt;
                    var tex = new Texture2D(960, 540, TextureFormat.RGB24, false);
                    tex.ReadPixels(new Rect(0, 0, 960, 540), 0, 0);
                    tex.Apply();
                    cam.targetTexture = antes;
                    RenderTexture.active = previo;
                    File.WriteAllBytes(Path.Combine(Salida, clave + ".png"), tex.EncodeToPNG());
                    UnityEngine.Object.Destroy(tex);
                    rt.Release();
                    fila["captura"] = "eval/results/unity_narraciones/" + clave + ".png";
                }
                catch (Exception ex)
                {
                    fila["captura"] = "no se pudo: " + ex.Message;
                }
            }
            finally
            {
                Application.logMessageReceived -= Oir;
                fila["faltan"] = new JArray(faltan.Cast<object>().ToArray());
                fila["errores"] = new JArray(errores.Distinct().Take(10).Cast<object>().ToArray());
                Directory.CreateDirectory(Salida);
                File.AppendAllText(Path.Combine(Salida, "narraciones.jsonl"), fila.ToString(Formatting.None) + "\n");
            }

            Assert.IsEmpty(errores, clave + ": con errores: " + string.Join(" | ", errores));
            Assert.IsEmpty(faltan, clave + ": no se ve " + string.Join("; ", faltan));
        }
    }
}
