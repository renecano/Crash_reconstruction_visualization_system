using System;
using System.Collections.Generic;
using System.Reflection;
using System.Text.RegularExpressions;
using Newtonsoft.Json.Linq;
using Unity.Profiling;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace Croquis.Visor
{
    /// <summary>
    /// Interruptores para perfilar un build (U5, ADR 0115), por el mensaje `depurar`, que no es parte
    /// del contrato: qué hay en la escena por grupo, apagar un grupo o una parte de la canalización y
    /// leer los contadores de dibujo. Con ellos `eval/u5_perfil.mjs` mide cuánto cuesta cada cosa en un
    /// solo build. No cambian nada si nadie los manda.
    /// </summary>
    public static class Perfilado
    {
        private static readonly Regex Sufijo = new Regex(@"[_-]?[0-9a-f]*[0-9]+[0-9a-z_-]*$", RegexOptions.Compiled);
        private static ProfilerRecorder llamadas;
        private static ProfilerRecorder lotes;
        private static ProfilerRecorder pasadas;
        private static ProfilerRecorder triangulos;
        private static ProfilerRecorder vertices;
        private static bool midiendo;

        private static UniversalRenderPipelineAsset Urp => QualitySettings.renderPipeline as UniversalRenderPipelineAsset;

        /// <summary>Aplica los interruptores de `j`. Devuelve qué contestar a la web, o null.</summary>
        public static JObject Aplicar(JObject j, Transform caso)
        {
            var urp = Urp;
            if (j["escala"] != null && urp != null)
            {
                // Una escala fija apaga la automática de media; `"escala": null` se la devuelve.
                Calidad.FijarEscala(j["escala"].Type == JTokenType.Null ? (double?)null : (double)j["escala"]);
            }

            if (j["sombra_distancia"] != null && urp != null)
            {
                urp.shadowDistance = (float)j["sombra_distancia"];
            }

            if (j["cascadas"] != null && urp != null)
            {
                urp.shadowCascadeCount = (int)j["cascadas"];
            }

            if (j["mapa_sombras"] != null && urp != null)
            {
                urp.mainLightShadowmapResolution = (int)j["mapa_sombras"];
            }

            if (j["luces_max"] != null && urp != null)
            {
                urp.maxAdditionalLightsCount = (int)j["luces_max"];
            }

            if (j["msaa_urp"] != null && urp != null)
            {
                urp.msaaSampleCount = (int)j["msaa_urp"];
            }

            if (j["hdr_urp"] != null && urp != null)
            {
                urp.supportsHDR = (bool)j["hdr_urp"];
            }

            if (j["profundidad"] != null && urp != null)
            {
                urp.supportsCameraDepthTexture = (bool)j["profundidad"];
            }

            if (j["ssao"] != null && urp != null)
            {
                foreach (var datos in urp.rendererDataList)
                {
                    foreach (var f in datos.rendererFeatures)
                    {
                        if (f != null && f.name == "OclusionAmbiental")
                        {
                            f.SetActive((bool)j["ssao"]);
                        }
                    }
                }
            }

            if (j["ssao_ajuste"] is JObject ajuste && urp != null)
            {
                foreach (var datos in urp.rendererDataList)
                {
                    foreach (var f in datos.rendererFeatures)
                    {
                        if (f != null && f.name == "OclusionAmbiental")
                        {
                            Ajustar(f, "m_Settings", ajuste);
                        }
                    }
                }
            }

            if (j["sombra_suave"] != null && urp != null)
            {
                Ajustar(urp, null, new JObject { { "m_SoftShadowQuality", j["sombra_suave"] } });
            }

            if (j["filtro"] != null && urp != null)
            {
                urp.upscalingFilter = (UpscalingFilterSelection)(int)j["filtro"];
            }

            if (j["fxaa"] != null && Camera.main != null)
            {
                Camera.main.GetComponent<UniversalAdditionalCameraData>().antialiasing =
                    (bool)j["fxaa"] ? AntialiasingMode.FastApproximateAntialiasing : AntialiasingMode.None;
            }

            var volumen = UnityEngine.Object.FindFirstObjectByType<Volume>();
            if (volumen != null && volumen.profile.TryGet<Bloom>(out var bloom))
            {
                if (j["bloom_iter"] != null)
                {
                    bloom.maxIterations.Override((int)j["bloom_iter"]);
                }

                if (j["bloom_cuarto"] != null)
                {
                    bloom.downscale.Override((bool)j["bloom_cuarto"] ? BloomDownscaleMode.Quarter : BloomDownscaleMode.Half);
                }
            }

            if (j["sombras_duras"] != null)
            {
                foreach (var luz in UnityEngine.Object.FindObjectsByType<Light>(FindObjectsSortMode.None))
                {
                    if (luz.type == LightType.Directional)
                    {
                        luz.shadows = (bool)j["sombras_duras"] ? LightShadows.Hard : LightShadows.Soft;
                    }
                }
            }

            if (j["volumen_por_cuadro"] != null && Camera.main != null)
            {
                Camera.main.SetVolumeFrameworkUpdateMode(
                    (bool)j["volumen_por_cuadro"] ? VolumeFrameworkUpdateMode.EveryFrame : VolumeFrameworkUpdateMode.ViaScripting);
            }

            // Antes de cargar el caso: cómo se arma la escena.
            if (j["capas_separadas"] != null)
            {
                EscenarioVista.CapasSeparadas = (bool)j["capas_separadas"];
            }

            if (j["sombras_separadas"] != null)
            {
                SombrasUnidas.Separadas = (bool)j["sombras_separadas"];
            }

            if (j["luces"] != null)
            {
                foreach (var luz in UnityEngine.Object.FindObjectsByType<Light>(FindObjectsInactive.Include, FindObjectsSortMode.None))
                {
                    if (luz.type != LightType.Directional)
                    {
                        luz.enabled = (bool)j["luces"];
                    }
                }
            }

            if (j["sombras_sol"] != null)
            {
                foreach (var luz in UnityEngine.Object.FindObjectsByType<Light>(FindObjectsSortMode.None))
                {
                    if (luz.type == LightType.Directional)
                    {
                        luz.shadows = (bool)j["sombras_sol"] ? LightShadows.Soft : LightShadows.None;
                    }
                }
            }

            if (caso != null && j["ocultar"] != null)
            {
                Activar(caso, (string)j["ocultar"], false);
            }

            if (caso != null && j["mostrar"] != null)
            {
                Activar(caso, (string)j["mostrar"], true);
            }

            if (caso != null && j["sin_sombra_de"] != null)
            {
                foreach (var t in Grupo(caso, (string)j["sin_sombra_de"]))
                {
                    foreach (var r in t.GetComponentsInChildren<Renderer>(true))
                    {
                        r.shadowCastingMode = ShadowCastingMode.Off;
                    }
                }
            }

            if (j["lejos"] != null && Camera.main != null)
            {
                Camera.main.farClipPlane = (float)j["lejos"];
            }

            if (j["lluvia_particulas"] != null)
            {
                // Baja y media: la lluvia de partículas de antes, para comparar con la malla.
                EscenarioVista.LluviaDeParticulas?.Invoke((bool)j["lluvia_particulas"]);
            }

            if (j["minimapa_vehiculos_unidos"] != null)
            {
                var camaraVisor = UnityEngine.Object.FindFirstObjectByType<CamaraVisor>();
                if (camaraVisor != null)
                {
                    camaraVisor.VehiculosUnidos = (bool)j["minimapa_vehiculos_unidos"];
                }
            }

            if (j["inventario"] != null && caso != null)
            {
                return Inventario(caso);
            }

            if (j["estadisticas"] != null)
            {
                return Estadisticas();
            }

            if (j["tirones"] != null)
            {
                // La primera vez lo enciende; después devuelve los cuadros lentos desde la consulta anterior.
                Tirones.Encender();
                return Tirones.Informe();
            }

            return null;
        }

        /// <summary>
        /// Cambia campos internos de un objeto de URP (los ajustes de la oclusión no tienen API): los
        /// nombres son los de sus campos serializados. Un campo que no existe se avisa y se salta.
        /// </summary>
        private static void Ajustar(object objeto, string contenedor, JObject valores)
        {
            const BindingFlags Todos = BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic;
            var destino = objeto;
            if (contenedor != null)
            {
                destino = objeto.GetType().GetField(contenedor, Todos)?.GetValue(objeto);
            }

            if (destino == null)
            {
                Debug.LogWarning("[perfil] no encuentro " + contenedor);
                return;
            }

            foreach (var par in valores)
            {
                var campo = destino.GetType().GetField(par.Key, Todos);
                if (campo == null)
                {
                    Debug.LogWarning("[perfil] no hay campo " + par.Key);
                    continue;
                }

                var t = campo.FieldType;
                object v = t.IsEnum ? Enum.ToObject(t, (int)par.Value)
                    : t == typeof(bool) ? (object)(bool)par.Value
                    : t == typeof(float) ? (object)(float)par.Value
                    : (object)(int)par.Value;
                campo.SetValue(destino, v);
            }
        }

        /// <summary>Los grupos de la escena: los hijos de «Caso» y, dentro de «escenario», los suyos.</summary>
        private static IEnumerable<Transform> Grupos(Transform caso)
        {
            foreach (Transform a in caso)
            {
                if (a.name == "escenario" || a.name == "caso")
                {
                    foreach (Transform b in a)
                    {
                        if (b.name == "via" || b.name == "carretera" || b.name == "entorno_procedural")
                        {
                            foreach (Transform c in b)
                            {
                                yield return c;
                            }
                        }
                        else
                        {
                            yield return b;
                        }
                    }
                }
                else
                {
                    yield return a;
                }
            }
        }

        private static string Clave(Transform t)
        {
            var padre = t.parent != null && t.parent.name != "Caso" && t.parent.name != "escenario" ? t.parent.name + "/" : string.Empty;
            return padre + Sufijo.Replace(t.name, string.Empty);
        }

        private static IEnumerable<Transform> Grupo(Transform caso, string clave)
        {
            foreach (var t in Grupos(caso))
            {
                if (Clave(t) == clave || t.name == clave || (clave.EndsWith("*", StringComparison.Ordinal) && Clave(t).StartsWith(clave.TrimEnd('*'), StringComparison.Ordinal)))
                {
                    yield return t;
                }
            }
        }

        private static void Activar(Transform caso, string clave, bool si)
        {
            foreach (var t in new List<Transform>(Grupo(caso, clave)))
            {
                t.gameObject.SetActive(si);
            }
        }

        private static JObject Inventario(Transform caso)
        {
            var grupos = new SortedDictionary<string, long[]>(StringComparer.Ordinal);
            var materiales = new Dictionary<string, HashSet<int>>();
            foreach (var t in Grupos(caso))
            {
                var k = Clave(t);
                if (!grupos.TryGetValue(k, out var g))
                {
                    grupos[k] = g = new long[6];
                    materiales[k] = new HashSet<int>();
                }

                g[0]++;
                foreach (var r in t.GetComponentsInChildren<Renderer>(false))
                {
                    if (!r.enabled)
                    {
                        continue;
                    }

                    g[1]++;
                    Mesh malla = null;
                    if (r is MeshRenderer)
                    {
                        var mf = r.GetComponent<MeshFilter>();
                        malla = mf != null ? mf.sharedMesh : null;
                    }
                    else if (r is SkinnedMeshRenderer s)
                    {
                        malla = s.sharedMesh;
                    }

                    if (malla != null)
                    {
                        for (var i = 0; i < malla.subMeshCount; i++)
                        {
                            g[2] += malla.GetIndexCount(i) / 3;
                        }
                    }

                    // Cada material de un renderer es una llamada de dibujo.
                    g[3] += r.sharedMaterials.Length;
                    if (r.shadowCastingMode != ShadowCastingMode.Off)
                    {
                        g[4] += r.sharedMaterials.Length;
                    }

                    foreach (var m in r.sharedMaterials)
                    {
                        if (m != null)
                        {
                            materiales[k].Add(m.GetInstanceID());
                            if (m.renderQueue >= (int)RenderQueue.Transparent)
                            {
                                g[5]++;
                            }
                        }
                    }
                }
            }

            var salida = new JObject();
            foreach (var par in grupos)
            {
                salida[par.Key] = new JObject
                {
                    { "objetos", par.Value[0] },
                    { "renderers", par.Value[1] },
                    { "triangulos", par.Value[2] },
                    { "llamadas", par.Value[3] },
                    { "con_sombra", par.Value[4] },
                    { "transparentes", par.Value[5] },
                    { "materiales", materiales[par.Key].Count },
                };
            }

            var luces = 0;
            foreach (var luz in UnityEngine.Object.FindObjectsByType<Light>(FindObjectsSortMode.None))
            {
                luces += luz.enabled && luz.type != LightType.Directional ? 1 : 0;
            }

            return new JObject { { "grupos", salida }, { "luces", luces } };
        }

        private static JObject Estadisticas()
        {
            if (!midiendo)
            {
                llamadas = ProfilerRecorder.StartNew(ProfilerCategory.Render, "Draw Calls Count");
                lotes = ProfilerRecorder.StartNew(ProfilerCategory.Render, "Batches Count");
                pasadas = ProfilerRecorder.StartNew(ProfilerCategory.Render, "SetPass Calls Count");
                triangulos = ProfilerRecorder.StartNew(ProfilerCategory.Render, "Triangles Count");
                vertices = ProfilerRecorder.StartNew(ProfilerCategory.Render, "Vertices Count");
                midiendo = true;
            }

            return new JObject
            {
                { "valido", llamadas.Valid },
                { "llamadas", llamadas.Valid ? llamadas.LastValue : -1 },
                { "lotes", lotes.Valid ? lotes.LastValue : -1 },
                { "pasadas", pasadas.Valid ? pasadas.LastValue : -1 },
                { "triangulos", triangulos.Valid ? triangulos.LastValue : -1 },
                { "vertices", vertices.Valid ? vertices.LastValue : -1 },
                { "ancho", Screen.width },
                { "alto", Screen.height },
                { "escala", Urp != null ? Urp.renderScale : 1f },
                { "escala_automatica", Calidad.EscalaAuto != null },
                { "escala_estable", Calidad.EscalaAuto == null || Calidad.EscalaAuto.Estable },
                { "escala_cambios", Calidad.EscalaAuto?.Cambios ?? 0 },
                { "escala_en_el_piso_sin_llegar", Calidad.EscalaAuto?.EnElPisoSinLlegar ?? false },
            };
        }
    }
}
