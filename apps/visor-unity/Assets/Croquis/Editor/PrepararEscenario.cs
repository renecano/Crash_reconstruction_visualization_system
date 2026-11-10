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
                Tarjeta(e, "atlas");
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
                m.SetFloat("_Smoothness", n == "asfalto" ? 0.72f : 0.6f);
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
            lluvia.SetColor("_BaseColor", new Color(0.82f, 0.87f, 0.94f, 0.16f));
            lluvia.SetFloat("_Surface", 1f);
            lluvia.SetFloat("_Blend", 0f);
            lluvia.SetFloat("_SrcBlend", (float)BlendMode.SrcAlpha);
            lluvia.SetFloat("_DstBlend", (float)BlendMode.OneMinusSrcAlpha);
            lluvia.SetFloat("_ZWrite", 0f);
            lluvia.EnableKeyword("_SURFACE_TYPE_TRANSPARENT");
            lluvia.renderQueue = (int)RenderQueue.Transparent;
            Guardar(lluvia, "lluvia");

            // Las matas de pasto: recorte por alfa, dos caras y sin mapa de normales. Va como asset
            // porque esa combinación no la usa ningún otro material: copiando la tarjeta de árbol y
            // quitándole la normal en ejecución, el build de WebGL no traía la variante y las matas
            // salían como cuadros negros (visto en el build del 2026-11-09; en el Editor no pasa).
            var mata = new Material(Lit);
            mata.SetFloat("_AlphaClip", 1f);
            mata.SetFloat("_Cutoff", 0.4f);
            mata.EnableKeyword("_ALPHATEST_ON");
            mata.SetFloat("_Cull", (float)CullMode.Off);
            mata.SetFloat("_Smoothness", 0.05f);
            mata.SetOverrideTag("RenderType", "TransparentCutout");
            mata.renderQueue = (int)RenderQueue.AlphaTest;
            Guardar(mata, "mata");

            // La salpicadura de cada gota en el piso: un anillo que se abre y se apaga.
            var salpica = new Material(lluvia) { name = "salpicadura" };
            salpica.SetColor("_BaseColor", new Color(0.85f, 0.9f, 0.96f, 0.5f));
            Guardar(salpica, "salpicadura");

            // La sombra de contacto bajo cada vehículo: una mancha suave, sin luz ni reflejo.
            var unlit = Shader.Find("Universal Render Pipeline/Unlit");
            var sombra = new Material(unlit);
            sombra.SetColor("_BaseColor", Color.black);
            Transparente(sombra);
            sombra.SetFloat("_Cull", (float)CullMode.Off);
            Guardar(sombra, "sombra");

            // El charco de luz de una luminaria lejana: se suma al piso, sin costar una luz real.
            var halo = new Material(unlit);
            halo.SetColor("_BaseColor", Color.white);
            Transparente(halo);
            halo.SetFloat("_Blend", 2f);
            halo.SetFloat("_SrcBlend", (float)BlendMode.SrcAlpha);
            halo.SetFloat("_DstBlend", (float)BlendMode.One);
            halo.SetFloat("_Cull", (float)CullMode.Off);
            Guardar(halo, "halo");
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
            // La de frente se ve por los dos lados; la planta solo desde arriba: desde abajo era una
            // losa oscura sobre la cabeza.
            m.SetFloat("_Cull", (float)(vista == "planta" ? CullMode.Back : CullMode.Off));
            m.SetFloat("_Smoothness", 0.08f);
            if (vista == "atlas")
            {
                // El impostor no recibe sombra: sus tarjetas de sombra lo cruzan por el eje y le
                // dejaban una franja oscura. En URP esto lo decide el material, no el renderer.
                m.SetFloat("_ReceiveShadows", 0f);
                m.EnableKeyword("_RECEIVE_SHADOWS_OFF");
            }

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
            bloom.threshold.Override(1.15f);
            bloom.intensity.Override(0.3f);
            bloom.scatter.Override(0.62f);
            // Con tope: un reflejo especular de miles de nits no debe regarse por toda la imagen.
            bloom.clamp.Override(6f);
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
            // El build de la web es el nivel «media» (`Calidad`): mismo aspecto, menos costo. Medido el
            // 2026-11-09 en la laptop de 8 GB: con lo de alta, la noche urbana bajaba de 12 fps.
            var media = EditorUserBuildSettings.activeBuildTarget == BuildTarget.WebGL;
            urp.supportsHDR = true;
            urp.msaaSampleCount = media ? 2 : 4;
            urp.shadowDistance = media ? 80f : 110f;
            urp.shadowCascadeCount = media ? 2 : 4;
            urp.mainLightShadowmapResolution = media ? 2048 : 4096;
            urp.maxAdditionalLightsCount = media ? 4 : 8;
            urp.supportsCameraDepthTexture = true;
            var so = new SerializedObject(urp);
            Poner(so, "m_SoftShadowsSupported", true);
            Poner(so, "m_AdditionalLightsRenderingMode", (int)LightRenderingMode.PerPixel);
            Poner(so, "m_AdditionalLightShadowsSupported", !media);
            Poner(so, "m_AdditionalLightsShadowmapResolution", 2048);
            Poner(so, "m_SoftShadowQuality", media ? 1 : 2);
            // Sesgos bajos: la sombra nace pegada a la llanta, no despegada del vehículo.
            Poner(so, "m_ShadowDepthBias", 0.6f);
            Poner(so, "m_ShadowNormalBias", 0.35f);
            // La sonda de reflejos de la escena, con proyección de caja y mezcla con el cielo.
            Poner(so, "m_ReflectionProbeBlending", true);
            Poner(so, "m_ReflectionProbeBoxProjection", true);
            so.ApplyModifiedPropertiesWithoutUndo();
            EditorUtility.SetDirty(urp);

            // Un renderer creado por código nace sin los datos de posproceso: sin ellos no hay tono de
            // cine ni resplandor.
            if (renderer.postProcessData == null)
            {
                renderer.postProcessData = AssetDatabase.LoadAssetAtPath<PostProcessData>(
                    "Packages/com.unity.render-pipelines.universal/Runtime/Data/PostProcessData.asset");
                EditorUtility.SetDirty(renderer);
            }

            // La oclusión ambiental es interna de URP: se agrega por su tipo.
            var tipo = Type.GetType(
                "UnityEngine.Rendering.Universal.ScreenSpaceAmbientOcclusion, Unity.RenderPipelines.Universal.Runtime");
            var previa = tipo == null ? null : renderer.rendererFeatures.Find(f => f != null && f.GetType() == tipo);
            if (previa != null)
            {
                Oclusion(previa, media);
            }

            if (tipo != null && previa == null)
            {
                var ssao = (ScriptableRendererFeature)ScriptableObject.CreateInstance(tipo);
                ssao.name = "OclusionAmbiental";
                Oclusion(ssao, media);
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

        /// <summary>
        /// La oclusión ambiental a escala de calle: el radio de fábrica (3.5 cm) no oscurece nada a la
        /// distancia de una cámara de escena. Con 0.18 m se marcan los bajos del vehículo, las
        /// guarniciones y los rincones de las fachadas. Más ancho, a media resolución, manchaba la
        /// carrocería vista de cerca como si tuviera hollín: en un visor forense eso no puede pasar.
        /// </summary>
        private static void Oclusion(ScriptableRendererFeature ssao, bool media)
        {
            var so = new SerializedObject(ssao);
            Poner(so, "m_Settings.Radius", 0.18f);
            Poner(so, "m_Settings.Intensity", 0.9f);
            // Ruido de gradiente intercalado: con el ruido azul quedaba un moteado en la pintura clara.
            Poner(so, "m_Settings.AOMethod", 1);
            Poner(so, "m_Settings.Samples", media ? 1 : 0);
            Poner(so, "m_Settings.BlurQuality", 0);
            Poner(so, "m_Settings.DirectLightingStrength", 0.4f);
            Poner(so, "m_Settings.Falloff", 70f);
            Poner(so, "m_Settings.Downsample", media);
            so.ApplyModifiedPropertiesWithoutUndo();
            EditorUtility.SetDirty(ssao);
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
            else if (valor is float f)
            {
                p.floatValue = f;
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
            // Un pixel sin número (una normal de largo cero, una división entre cero) se regaba con el
            // resplandor a toda la imagen en WebGL: se corta antes del posproceso.
            datos.stopNaN = true;
            camara.allowHDR = true;
            camara.allowMSAA = true;
            var volumen = new GameObject("Posproceso").AddComponent<Volume>();
            volumen.isGlobal = true;
            volumen.sharedProfile = AssetDatabase.LoadAssetAtPath<VolumeProfile>(RutaPerfil);
        }
    }
}
