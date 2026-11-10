using System.Collections.Generic;
using System.IO;
using System.Linq;
using Croquis.Core;
using Croquis.Visor;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace Croquis.EditorTools
{
    /// <summary>
    /// Deja el proyecto listo y hace los builds desde el modo batch (tools/unity/). La escena, la
    /// canalización y los ajustes salen de aquí, no de pasos a mano: así otra computadora da lo mismo.
    /// </summary>
    public static class ConstruirVisor
    {
        private const string CarpetaRender = "Assets/Croquis/Render";
        internal const string RutaEscena = "Assets/Croquis/Escenas/Visor.unity";
        private const string RutaRecursos = "Assets/Resources/recursos_visor.json";

        [MenuItem("Croquis/Preparar proyecto")]
        public static void Preparar()
        {
            var canalizaciones = Canalizaciones();
            GraphicsSettings.defaultRenderPipeline = canalizaciones[NivelCalidad.Alta].Urp;
            Niveles(canalizaciones);

            AjustesJugador();
            IncluirShadersDeGltf();
            Recursos();
            PrepararEscenario.Todo(canalizaciones);
            Escena();
            AssetDatabase.SaveAssets();
        }

        public static void Web()
        {
            Preparar();
            Construir(BuildTarget.WebGL, "Build/web");
        }

        public static void Windows()
        {
            Preparar();
            Construir(BuildTarget.StandaloneWindows64, "Build/windows/VisorCroquis.exe");
        }

        private static void Construir(BuildTarget objetivo, string salida)
        {
            var reporte = BuildPipeline.BuildPlayer(new BuildPlayerOptions
            {
                scenes = new[] { RutaEscena },
                locationPathName = salida,
                target = objetivo,
                options = BuildOptions.None,
            });
            var s = reporte.summary;
            Debug.Log($"[build] {s.result}: {s.totalSize} bytes, {s.totalTime}, {s.totalErrors} errores");
            if (s.result != BuildResult.Succeeded)
            {
                EditorApplication.Exit(1);
            }
        }

        /// <summary>
        /// Una canalización URP por nivel (U5, ADR 0115). Alta conserva `URP.asset` y `URP_Renderer.asset`
        /// de antes; ultra comparte el renderer de alta (la misma oclusión completa); baja y media tienen
        /// el suyo, porque la oclusión de media es a media resolución y baja no la lleva.
        /// </summary>
        private static Dictionary<NivelCalidad, (UniversalRenderPipelineAsset Urp, UniversalRendererData Renderer)> Canalizaciones()
        {
            Directory.CreateDirectory(CarpetaRender);
            UniversalRendererData Renderer(string ruta)
            {
                var r = AssetDatabase.LoadAssetAtPath<UniversalRendererData>(ruta);
                if (r == null)
                {
                    r = ScriptableObject.CreateInstance<UniversalRendererData>();
                    AssetDatabase.CreateAsset(r, ruta);
                }

                return r;
            }

            UniversalRenderPipelineAsset Urp(string ruta, UniversalRendererData r)
            {
                var a = AssetDatabase.LoadAssetAtPath<UniversalRenderPipelineAsset>(ruta);
                if (a == null)
                {
                    a = UniversalRenderPipelineAsset.Create(r);
                    AssetDatabase.CreateAsset(a, ruta);
                }

                return a;
            }

            var alto = Renderer(CarpetaRender + "/URP_Renderer.asset");
            var medio = Renderer(CarpetaRender + "/URP_Renderer_media.asset");
            var bajo = Renderer(CarpetaRender + "/URP_Renderer_baja.asset");
            return new Dictionary<NivelCalidad, (UniversalRenderPipelineAsset, UniversalRendererData)>
            {
                [NivelCalidad.Baja] = (Urp(CarpetaRender + "/URP_baja.asset", bajo), bajo),
                [NivelCalidad.Media] = (Urp(CarpetaRender + "/URP_media.asset", medio), medio),
                [NivelCalidad.Alta] = (Urp(CarpetaRender + "/URP.asset", alto), alto),
                [NivelCalidad.Ultra] = (Urp(CarpetaRender + "/URP_ultra.asset", alto), alto),
            };
        }

        /// <summary>
        /// Los niveles de `QualitySettings`: baja, media, alta y ultra, cada uno con su canalización, sin
        /// vsync (para medir capacidad; el navegador y la pantalla ya ponen su tope) y con lo demás igual
        /// en los cuatro (huesos por vértice, texturas completas, sondas en tiempo real). La web arranca
        /// en media y el escritorio en alta; `Calidad` ajusta según la GPU.
        /// </summary>
        private static void Niveles(Dictionary<NivelCalidad, (UniversalRenderPipelineAsset Urp, UniversalRendererData Renderer)> canalizaciones)
        {
            var so = new SerializedObject(AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/QualitySettings.asset")[0]);
            var lista = so.FindProperty("m_QualitySettings");
            while (lista.arraySize > Calidades.Todos.Count)
            {
                lista.DeleteArrayElementAtIndex(0);
            }

            for (var i = 0; i < Calidades.Todos.Count; i++)
            {
                var n = Calidades.Todos[i];
                var e = lista.GetArrayElementAtIndex(i);
                e.FindPropertyRelative("name").stringValue = Calidades.Nombre(n);
                e.FindPropertyRelative("customRenderPipeline").objectReferenceValue = canalizaciones[n].Urp;
                e.FindPropertyRelative("vSyncCount").intValue = 0;
                e.FindPropertyRelative("antiAliasing").intValue = 0;
                e.FindPropertyRelative("skinWeights").intValue = 4;
                e.FindPropertyRelative("globalTextureMipmapLimit").intValue = 0;
                e.FindPropertyRelative("anisotropicTextures").intValue = 2;
                e.FindPropertyRelative("realtimeReflectionProbes").boolValue = true;
                e.FindPropertyRelative("softParticles").boolValue = true;
                e.FindPropertyRelative("billboardsFaceCameraPosition").boolValue = true;
                e.FindPropertyRelative("lodBias").floatValue = 1.5f;
                e.FindPropertyRelative("maximumLODLevel").intValue = 0;
                e.FindPropertyRelative("pixelLightCount").intValue = 8;
                e.FindPropertyRelative("shadows").intValue = 2;
            }

            so.FindProperty("m_CurrentQuality").intValue = (int)NivelCalidad.Alta;
            var porPlataforma = so.FindProperty("m_PerPlatformDefaultQuality");
            for (var i = 0; i < porPlataforma.arraySize; i++)
            {
                var par = porPlataforma.GetArrayElementAtIndex(i);
                var plataforma = par.FindPropertyRelative("first").stringValue;
                var nivel = plataforma == "WebGL" ? NivelCalidad.Media
                    : plataforma == "Android" || plataforma == "iPhone" || plataforma == "tvOS" ? NivelCalidad.Baja
                    : NivelCalidad.Alta;
                par.FindPropertyRelative("second").intValue = (int)nivel;
            }

            so.ApplyModifiedPropertiesWithoutUndo();
            AssetDatabase.SaveAssets();
        }

        private static void AjustesJugador()
        {
            PlayerSettings.companyName = "Croquis";
            PlayerSettings.productName = "Visor de Croquis";
            PlayerSettings.colorSpace = ColorSpace.Linear;
            PlayerSettings.runInBackground = true;
            PlayerSettings.SplashScreen.show = false;
            PlayerSettings.SplashScreen.showUnityLogo = false;

            PlayerSettings.WebGL.template = "PROJECT:Croquis";
            // Sin comprimir aquí: la comprimen quien la sirve; se decide en U6 (ADR 0111).
            PlayerSettings.WebGL.compressionFormat = WebGLCompressionFormat.Disabled;
            PlayerSettings.WebGL.decompressionFallback = false;
            PlayerSettings.WebGL.nameFilesAsHashes = true;
            PlayerSettings.WebGL.dataCaching = true;
            PlayerSettings.WebGL.exceptionSupport = WebGLExceptionSupport.ExplicitlyThrownExceptionsOnly;
            PlayerSettings.WebGL.maximumMemorySize = 2048;
            PlayerSettings.SetGraphicsAPIs(BuildTarget.WebGL, new[] { GraphicsDeviceType.OpenGLES3 });
            PlayerSettings.SetManagedStrippingLevel(NamedBuildTarget.WebGL, ManagedStrippingLevel.Medium);
            PlayerSettings.SetIl2CppCodeGeneration(NamedBuildTarget.WebGL, Il2CppCodeGeneration.OptimizeSize);

            // Mono en escritorio (ADR 0115): IL2CPP necesita las herramientas de C++ de Visual Studio, que
            // la laptop de desarrollo no tiene; el costo que se mide es de la GPU, igual con los dos.
            PlayerSettings.SetScriptingBackend(NamedBuildTarget.Standalone, ScriptingImplementation.Mono2x);
            PlayerSettings.fullScreenMode = FullScreenMode.FullScreenWindow;
            PlayerSettings.defaultScreenWidth = 1920;
            PlayerSettings.defaultScreenHeight = 1080;
        }

        /// <summary>glTFast busca sus shaders por nombre al abrir un modelo: deben ir en el build.</summary>
        private static void IncluirShadersDeGltf()
        {
            var ajustes = new SerializedObject(AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/GraphicsSettings.asset")[0]);
            var lista = ajustes.FindProperty("m_AlwaysIncludedShaders");
            var shaders = AssetDatabase.FindAssets("t:Shader", new[] { "Packages/com.unity.cloud.gltfast/Runtime/Shader" })
                .Select(AssetDatabase.GUIDToAssetPath)
                .Where(r => !r.Contains("/Built-In/") && !r.Contains("/HDRP/") && !r.Contains("/Export/"))
                .Select(AssetDatabase.LoadAssetAtPath<Shader>)
                .Append(Shader.Find("Universal Render Pipeline/Lit"))
                .Append(Shader.Find("Skybox/Cubemap"))
                .Where(s => s != null);
            foreach (var s in shaders)
            {
                var ya = false;
                for (var i = 0; i < lista.arraySize; i++)
                {
                    ya |= lista.GetArrayElementAtIndex(i).objectReferenceValue == s;
                }

                if (!ya)
                {
                    lista.InsertArrayElementAtIndex(lista.arraySize);
                    lista.GetArrayElementAtIndex(lista.arraySize - 1).objectReferenceValue = s;
                }
            }

            ajustes.ApplyModifiedPropertiesWithoutUndo();
        }

        /// <summary>De dónde salen los modelos: de la misma huella que usa la web (apps/web/recursos.json).</summary>
        private static void Recursos()
        {
            var r = JObject.Parse(File.ReadAllText("../web/recursos.json"));
            var url = (string)r["base"] + "/recursos/modelos/vehiculos/" + (string)r["carpetas"]["modelos/vehiculos"] + "/";
            Directory.CreateDirectory(Path.GetDirectoryName(RutaRecursos));
            File.WriteAllText(RutaRecursos, new JObject { { "vehiculos", url } }.ToString());
            AssetDatabase.ImportAsset(RutaRecursos);
        }

        private static void Escena()
        {
            Directory.CreateDirectory(Path.GetDirectoryName(RutaEscena));
            var escena = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

            var camara = new GameObject("Camara");
            var c = camara.AddComponent<Camera>();
            c.tag = "MainCamera";
            c.nearClipPlane = 0.1f;
            c.farClipPlane = 2000f;
            c.fieldOfView = 40f;
            c.clearFlags = CameraClearFlags.SolidColor;
            c.backgroundColor = new Color(0.56f, 0.65f, 0.74f);
            camara.AddComponent<UniversalAdditionalCameraData>();
            PrepararEscenario.EnEscena(c);

            var sol = new GameObject("Sol").AddComponent<Light>();
            sol.type = LightType.Directional;
            sol.intensity = 1.6f;
            sol.shadows = LightShadows.Soft;
            sol.transform.rotation = Quaternion.Euler(50f, -30f, 0f);

            var piso = GameObject.CreatePrimitive(PrimitiveType.Plane);
            piso.name = "Piso";
            piso.transform.localScale = new Vector3(60f, 1f, 60f);
            Object.DestroyImmediate(piso.GetComponent<Collider>());
            // Se reusa el material si ya existe: así la escena no cambia de GUID en cada build.
            var rutaMaterial = CarpetaRender + "/Piso.mat";
            var material = AssetDatabase.LoadAssetAtPath<Material>(rutaMaterial);
            if (material == null)
            {
                material = new Material(Shader.Find("Universal Render Pipeline/Lit")) { color = new Color(0.32f, 0.33f, 0.34f) };
                AssetDatabase.CreateAsset(material, rutaMaterial);
            }

            piso.GetComponent<MeshRenderer>().sharedMaterial = material;

            var puente = new GameObject("VisorPuente");
            puente.AddComponent<CamaraVisor>().Asignar(c);
            puente.AddComponent<VisorCaso>();
            puente.AddComponent<VisorPuente>();
            puente.AddComponent<PanelDiagnostico>();
            puente.AddComponent<Medicion>();

            // Con niebla en la escena guardada: URP quita del build los modos de niebla que ninguna
            // escena usa, y el escenario la enciende en tiempo de ejecución.
            RenderSettings.fog = true;
            RenderSettings.fogMode = FogMode.ExponentialSquared;
            RenderSettings.fogDensity = 0.0005f;
            EditorSceneManager.SaveScene(escena, RutaEscena);
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(RutaEscena, true) };
        }
    }
}
