using System;
using System.IO;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace Croquis.EditorTools
{
    /// <summary>
    /// Lo que el escenario necesita ya hecho antes del build (ADR 0113): los materiales, el perfil de
    /// posproceso y los ajustes de luz de URP. Se crean aquí como assets, y no al vuelo, porque el build
    /// solo lleva las variantes de sombreador que algún material del proyecto usa: un material creado
    /// en tiempo de ejecución con normales o transparencia saldría sin ellas en WebGL.
    /// </summary>
    public static class PrepararEscenario
    {
        private const string Carpeta = "Assets/Croquis/Recursos/Resources/materiales";
        private const string RutaPerfil = "Assets/Croquis/Recursos/Resources/posproceso.asset";

        public static void Todo(UniversalRenderPipelineAsset urp, UniversalRendererData renderer)
        {
            if (!Directory.Exists("Assets/Croquis/Recursos/Resources/texturas"))
            {
                throw new InvalidOperationException(
                    "Faltan los recursos del escenario. Corre `node tools/unity/recursos.mjs`.");
            }

            AssetDatabase.Refresh();
            Directory.CreateDirectory(Carpeta);
            Canalizacion(urp, renderer);
            foreach (var n in new[] { "asfalto", "concreto", "pasto", "grava", "yeso", "tabique", "lamina", "tierra" })
            {
                Pbr(n);
            }

            Mojado();
            Simples();
            foreach (var e in new[] { "jacaranda", "fresno", "pirul" })
            {
                Tarjeta(e, "frente");
                Tarjeta(e, "planta");
            }

            foreach (var c in new[] { "dia", "nublado", "crepusculo", "noche" })
            {
                Cielo(c);
            }

            Posproceso();
            AssetDatabase.SaveAssets();
        }

        private static Shader Lit => Shader.Find("Universal Render Pipeline/Lit");

        private static T Tex<T>(string ruta) where T : Texture
        {
            var t = AssetDatabase.LoadAssetAtPath<T>("Assets/Croquis/Recursos/Resources/" + ruta);
            if (t == null)
            {
                throw new FileNotFoundException("No está el recurso " + ruta);
            }

            return t;
        }

        private static Material Guardar(Material m, string nombre)
        {
            var ruta = Carpeta + "/" + nombre + ".mat";
            var previo = AssetDatabase.LoadAssetAtPath<Material>(ruta);
            if (previo != null)
            {
                previo.shader = m.shader;
                previo.CopyPropertiesFromMaterial(m);
                previo.shaderKeywords = m.shaderKeywords;
                previo.renderQueue = m.renderQueue;
                previo.enableInstancing = true;
                EditorUtility.SetDirty(previo);
                return previo;
            }

            m.enableInstancing = true;
            AssetDatabase.CreateAsset(m, ruta);
            return m;
        }

        /// <summary>URP Lit con color, normales y máscara (metal, oclusión, lisura).</summary>
        private static Material Pbr(string nombre)
        {
            var m = new Material(Lit);
            m.SetTexture("_BaseMap", Tex<Texture2D>("texturas/" + nombre + "_diff.jpg"));
            m.SetTexture("_BumpMap", Tex<Texture2D>("texturas/" + nombre + "_nor.jpg"));
            m.SetFloat("_BumpScale", 1f);
            m.EnableKeyword("_NORMALMAP");
            var mask = Tex<Texture2D>("texturas/" + nombre + "_mask.png");
            m.SetTexture("_MetallicGlossMap", mask);
            m.EnableKeyword("_METALLICSPECGLOSSMAP");
            m.SetTexture("_OcclusionMap", mask);
            m.EnableKeyword("_OCCLUSIONMAP");
            m.SetFloat("_Smoothness", 1f);
            m.SetFloat("_OcclusionStrength", 1f);
            return Guardar(m, nombre);
        }

        /// <summary>El asfalto y el concreto mojados: más oscuros y lisos, con la misma rugosidad fina.</summary>
        private static void Mojado()
        {
            foreach (var n in new[] { "asfalto", "concreto" })
            {
                var m = new Material(AssetDatabase.LoadAssetAtPath<Material>(Carpeta + "/" + n + ".mat"));
                m.SetColor("_BaseColor", new Color(0.62f, 0.63f, 0.66f));
                // Sin la máscara, la lisura es pareja: una película de agua. La normal se queda, suave.
                m.SetTexture("_MetallicGlossMap", null);
                m.DisableKeyword("_METALLICSPECGLOSSMAP");
                m.SetFloat("_Smoothness", n == "asfalto" ? 0.86f : 0.7f);
                m.SetFloat("_BumpScale", 0.45f);
                Guardar(m, n + "_mojado");
            }

            // Charcos: agua quieta sobre el asfalto, casi un espejo oscuro.
            var charco = new Material(Lit);
            charco.SetColor("_BaseColor", new Color(0.03f, 0.035f, 0.04f, 0.82f));
            charco.SetFloat("_Smoothness", 0.97f);
            Transparente(charco);
            Guardar(charco, "charco");
        }

        private static void Transparente(Material m)
        {
            m.SetFloat("_Surface", 1f);
            m.SetFloat("_Blend", 0f);
            m.SetFloat("_SrcBlend", (float)BlendMode.SrcAlpha);
            m.SetFloat("_DstBlend", (float)BlendMode.OneMinusSrcAlpha);
            m.SetFloat("_SrcBlendAlpha", (float)BlendMode.One);
            m.SetFloat("_DstBlendAlpha", (float)BlendMode.OneMinusSrcAlpha);
            m.SetFloat("_ZWrite", 0f);
            m.EnableKeyword("_SURFACE_TYPE_TRANSPARENT");
            m.SetOverrideTag("RenderType", "Transparent");
            m.renderQueue = (int)RenderQueue.Transparent;
        }

        private static void Simples()
        {
            Guardar(new Material(Lit), "liso");

            var emisivo = new Material(Lit);
            emisivo.EnableKeyword("_EMISSION");
            emisivo.SetColor("_EmissionColor", Color.white);
            emisivo.globalIlluminationFlags = MaterialGlobalIlluminationFlags.None;
            Guardar(emisivo, "emisivo");

            var vidrio = new Material(Lit);
            vidrio.SetColor("_BaseColor", new Color(0.08f, 0.11f, 0.13f, 0.72f));
            vidrio.SetFloat("_Smoothness", 0.95f);
            Transparente(vidrio);
            Guardar(vidrio, "vidrio");

            // Rayas y huellas: geometría pegada al piso, con transparencia para su desgaste.
            var calca = new Material(Lit);
            calca.SetFloat("_Smoothness", 0.35f);
            Transparente(calca);
            Guardar(calca, "calca");

            var lluvia = new Material(Shader.Find("Universal Render Pipeline/Particles/Unlit"));
            lluvia.SetColor("_BaseColor", new Color(0.8f, 0.85f, 0.92f, 0.3f));
            lluvia.SetFloat("_Surface", 1f);
            lluvia.SetFloat("_Blend", 0f);
            lluvia.SetFloat("_SrcBlend", (float)BlendMode.SrcAlpha);
            lluvia.SetFloat("_DstBlend", (float)BlendMode.OneMinusSrcAlpha);
            lluvia.SetFloat("_ZWrite", 0f);
            lluvia.EnableKeyword("_SURFACE_TYPE_TRANSPARENT");
            lluvia.renderQueue = (int)RenderQueue.Transparent;
            Guardar(lluvia, "lluvia");
        }

        /// <summary>La tarjeta de un árbol: recorte por alfa, dos caras y su normal horneada.</summary>
        private static void Tarjeta(string especie, string vista)
        {
            var m = new Material(Lit);
            m.SetTexture("_BaseMap", Tex<Texture2D>("arboles/" + especie + "_" + vista + "_diff.png"));
            m.SetTexture("_BumpMap", Tex<Texture2D>("arboles/" + especie + "_" + vista + "_nor.png"));
            m.EnableKeyword("_NORMALMAP");
            m.SetFloat("_AlphaClip", 1f);
            m.SetFloat("_Cutoff", 0.4f);
            m.EnableKeyword("_ALPHATEST_ON");
            m.SetFloat("_Cull", (float)CullMode.Off);
            m.SetFloat("_Smoothness", 0.08f);
            m.SetOverrideTag("RenderType", "TransparentCutout");
            m.renderQueue = (int)RenderQueue.AlphaTest;
            Guardar(m, "arbol_" + especie + "_" + vista);
        }

        private static void Cielo(string nombre)
        {
            var m = new Material(Shader.Find("Skybox/Cubemap"));
            m.SetTexture("_Tex", Tex<Cubemap>("hdri/" + nombre + ".hdr"));
            Guardar(m, "cielo_" + nombre);
        }

        /// <summary>Tono de cine, un poco de resplandor y viñeta; lo demás lo ajusta cada escena.</summary>
        private static void Posproceso()
        {
            var perfil = AssetDatabase.LoadAssetAtPath<VolumeProfile>(RutaPerfil);
            if (perfil == null)
            {
                perfil = ScriptableObject.CreateInstance<VolumeProfile>();
                AssetDatabase.CreateAsset(perfil, RutaPerfil);
            }

            T Componente<T>() where T : VolumeComponent
            {
                if (perfil.TryGet<T>(out var c))
                {
                    return c;
                }

                c = perfil.Add<T>(true);
                AssetDatabase.AddObjectToAsset(c, perfil);
                return c;
            }

            var tono = Componente<Tonemapping>();
            tono.mode.Override(TonemappingMode.ACES);
            var bloom = Componente<Bloom>();
            bloom.threshold.Override(1.05f);
            bloom.intensity.Override(0.35f);
            bloom.scatter.Override(0.6f);
            var color = Componente<ColorAdjustments>();
            color.postExposure.Override(0f);
            color.contrast.Override(8f);
            color.saturation.Override(4f);
            var vineta = Componente<Vignette>();
            vineta.intensity.Override(0.18f);
            vineta.smoothness.Override(0.5f);
            EditorUtility.SetDirty(perfil);
        }

        /// <summary>
        /// Luz de URP para el escenario: HDR, sombras suaves en 4 cascadas hasta 150 m, luces adicionales
        /// por pixel con sombra (luminarias y faros) y oclusión ambiental. Todo en Forward: en WebGL 2 no
        /// hay Deferred. La calidad por nivel llega en U5.
        /// </summary>
        private static void Canalizacion(UniversalRenderPipelineAsset urp, UniversalRendererData renderer)
        {
            urp.supportsHDR = true;
            urp.msaaSampleCount = 4;
            urp.shadowDistance = 150f;
            urp.shadowCascadeCount = 4;
            urp.mainLightShadowmapResolution = 4096;
            urp.supportsSoftShadows = true;
            urp.additionalLightsRenderingMode = LightRenderingMode.PerPixel;
            urp.maxAdditionalLightsCount = 8;
            urp.supportsCameraDepthTexture = true;
            var so = new SerializedObject(urp);
            Poner(so, "m_AdditionalLightShadowsSupported", true);
            Poner(so, "m_AdditionalLightsShadowmapResolution", 2048);
            Poner(so, "m_SoftShadowQuality", 2);
            so.ApplyModifiedPropertiesWithoutUndo();
            EditorUtility.SetDirty(urp);

            // La oclusión ambiental es interna de URP: se agrega por su tipo.
            var tipo = Type.GetType(
                "UnityEngine.Rendering.Universal.ScreenSpaceAmbientOcclusion, Unity.RenderPipelines.Universal.Runtime");
            if (tipo != null && !renderer.rendererFeatures.Exists(f => f != null && f.GetType() == tipo))
            {
                var ssao = (ScriptableRendererFeature)ScriptableObject.CreateInstance(tipo);
                ssao.name = "OclusionAmbiental";
                AssetDatabase.AddObjectToAsset(ssao, renderer);
                renderer.rendererFeatures.Add(ssao);
                var datos = new SerializedObject(renderer);
                var mapa = datos.FindProperty("m_RendererFeatureMap");
                AssetDatabase.TryGetGUIDAndLocalFileIdentifier(ssao, out _, out long id);
                mapa.arraySize++;
                mapa.GetArrayElementAtIndex(mapa.arraySize - 1).longValue = id;
                datos.ApplyModifiedPropertiesWithoutUndo();
                EditorUtility.SetDirty(renderer);
            }
        }

        private static void Poner(SerializedObject so, string nombre, object valor)
        {
            var p = so.FindProperty(nombre);
            if (p == null)
            {
                Debug.LogWarning("[escenario] URP ya no tiene " + nombre);
                return;
            }

            if (valor is bool b)
            {
                p.boolValue = b;
            }
            else
            {
                p.intValue = (int)valor;
            }
        }

        /// <summary>El volumen global de posproceso y la cámara que lo usa.</summary>
        public static void EnEscena(Camera camara)
        {
            var datos = camara.GetComponent<UniversalAdditionalCameraData>();
            datos.renderPostProcessing = true;
            datos.antialiasing = AntialiasingMode.None;
            camara.allowHDR = true;
            camara.allowMSAA = true;
            var volumen = new GameObject("Posproceso").AddComponent<Volume>();
            volumen.isGlobal = true;
            volumen.sharedProfile = AssetDatabase.LoadAssetAtPath<VolumeProfile>(RutaPerfil);
        }
    }
}
