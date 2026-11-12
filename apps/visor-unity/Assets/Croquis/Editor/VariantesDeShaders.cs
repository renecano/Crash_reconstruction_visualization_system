using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Rendering;
using UnityEngine;
using UnityEngine.Rendering;

namespace Croquis.EditorTools
{
    /// <summary>
    /// Quita del build web las variantes de shaders con palabras clave que el visor nunca enciende
    /// (U6, René 2026-11-12: «quita las variantes de shaders que no se usan», sin cambiar el aspecto).
    /// Corre después del filtrado de URP. Cada palabra de `NuncaSeUsan` lleva el motivo; si alguna
    /// faltara en un caso, el build de prueba con `CROQUIS_VARIANTES=1` activa la coincidencia estricta
    /// de variantes y la consola lo dice. Con esa misma variable deja en `Logs/variantes-<objetivo>.json`
    /// cuántas variantes quedan por shader y pasada, y con qué palabras.
    /// </summary>
    public sealed class VariantesDeShaders : IPreprocessShaders
    {
        /// <summary>Las palabras clave que ninguna escena del visor enciende, con el motivo.</summary>
        internal static readonly Dictionary<string, string> NuncaSeUsan = new Dictionary<string, string>
        {
            // El perfil de posproceso (PrepararEscenario.Posproceso) lleva tono ACES, resplandor sin
            // textura de suciedad, ajuste de color y viñeta; ni el visor ni el puente agregan otros.
            ["_FILM_GRAIN"] = "sin grano de película",
            ["_DISTORTION"] = "sin distorsión de lente",
            ["_CHROMATIC_ABERRATION"] = "sin aberración cromática",
            ["_TONEMAP_NEUTRAL"] = "el tono es ACES (o ninguno, con depurar tono:false)",
            ["_BLOOM_LQ_DIRT"] = "el resplandor no lleva textura de suciedad",
            ["_BLOOM_HQ_DIRT"] = "el resplandor no lleva textura de suciedad",
            // Ninguna cámara del visor enciende el dithering (UniversalAdditionalCameraData.dithering).
            ["_DITHERING"] = "sin dithering en las cámaras",
            // Ninguna luz del visor lleva cookie (Light.cookie): URP solo enciende esta palabra si hay una.
            ["_LIGHT_COOKIES"] = "ninguna luz lleva cookie",
            // Nada usa LODGroup con fundido (ni el visor ni glTFast): la palabra no se enciende nunca.
            ["LOD_FADE_CROSSFADE"] = "sin LODGroup con fundido",
            // La niebla (FOG_EXP2) sí se queda con y sin ella: la vista desde arriba la apaga.
        };

        public int callbackOrder => int.MaxValue;

        private static readonly Dictionary<string, Conteo> Informe = new Dictionary<string, Conteo>();

        private sealed class Conteo
        {
            public int Antes;
            public int Despues;
            public readonly Dictionary<string, int> Palabras = new Dictionary<string, int>();
            public readonly HashSet<string> Juegos = new HashSet<string>();
        }

        private static bool Registrar => Environment.GetEnvironmentVariable("CROQUIS_VARIANTES") == "1";

        public void OnProcessShader(Shader shader, ShaderSnippetData snippet, IList<ShaderCompilerData> datos)
        {
            if (EditorUserBuildSettings.activeBuildTarget != BuildTarget.WebGL)
            {
                return;
            }

            var antes = datos.Count;
            for (var i = datos.Count - 1; i >= 0; i--)
            {
                foreach (var k in datos[i].shaderKeywordSet.GetShaderKeywords())
                {
                    if (NuncaSeUsan.ContainsKey(k.name))
                    {
                        datos.RemoveAt(i);
                        break;
                    }
                }
            }

            if (!Registrar)
            {
                return;
            }

            var llave = shader.name + " | " + snippet.passName + " | " + snippet.shaderType;
            if (!Informe.TryGetValue(llave, out var c))
            {
                c = Informe[llave] = new Conteo();
            }

            c.Antes += antes;
            c.Despues += datos.Count;
            foreach (var d in datos)
            {
                var juego = d.shaderKeywordSet.GetShaderKeywords().Select(k => k.name).OrderBy(n => n, StringComparer.Ordinal);
                if (c.Juegos.Count < 4000)
                {
                    c.Juegos.Add(string.Join(" ", juego));
                }

                foreach (var k in d.shaderKeywordSet.GetShaderKeywords())
                {
                    c.Palabras[k.name] = c.Palabras.TryGetValue(k.name, out var n) ? n + 1 : 1;
                }
            }
        }

        /// <summary>Escribe el informe del último build (solo con `CROQUIS_VARIANTES=1`).</summary>
        internal static void EscribirInforme(BuildTarget objetivo)
        {
            if (!Registrar)
            {
                return;
            }

            var lineas = Informe
                .OrderByDescending(x => x.Value.Despues)
                .Select(x => "  " + Json(x.Key) + ": {\"antes\": " + x.Value.Antes + ", \"despues\": " + x.Value.Despues
                    + ", \"palabras\": {" + string.Join(", ", x.Value.Palabras.OrderByDescending(p => p.Value).Select(p => Json(p.Key) + ": " + p.Value)) + "}"
                    + ", \"juegos\": [" + string.Join(", ", x.Value.Juegos.OrderBy(j => j, StringComparer.Ordinal).Select(Json)) + "]}");
            Directory.CreateDirectory("Logs");
            File.WriteAllText(Path.Combine("Logs", "variantes-" + objetivo + ".json"), "{\n" + string.Join(",\n", lineas) + "\n}\n");
            Informe.Clear();
        }

        private static string Json(string s) => "\"" + s.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\"";
    }
}
