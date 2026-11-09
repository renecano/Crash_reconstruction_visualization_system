using System.IO;
using System.Linq;
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
            var pipeline = Canalizacion();
            GraphicsSettings.defaultRenderPipeline = pipeline;
            for (var i = 0; i < QualitySettings.names.Length; i++)
            {
                QualitySettings.SetQualityLevel(i, false);
                QualitySettings.renderPipeline = pipeline;
            }

            AjustesJugador();
            IncluirShadersDeGltf();
            Recursos();
            PrepararEscenario.Todo(
                (UniversalRenderPipelineAsset)pipeline,
                AssetDatabase.LoadAssetAtPath<UniversalRendererData>(CarpetaRender + "/URP_Renderer.asset"));
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

        private static RenderPipelineAsset Canalizacion()
        {
            var ruta = CarpetaRender + "/URP.asset";
            var asset = AssetDatabase.LoadAssetAtPath<UniversalRenderPipelineAsset>(ruta);
            if (asset == null)
            {
                Directory.CreateDirectory(CarpetaRender);
                var datos = ScriptableObject.CreateInstance<UniversalRendererData>();
                AssetDatabase.CreateAsset(datos, CarpetaRender + "/URP_Renderer.asset");
                asset = UniversalRenderPipelineAsset.Create(datos);
                AssetDatabase.CreateAsset(asset, ruta);
            }

            // Luminarias y faros de noche (U2): hasta 8 luces adicionales por objeto, y sombras hasta
            // 150 m. La calidad por nivel llega en U5.
            asset.maxAdditionalLightsCount = 8;
            asset.shadowDistance = 150f;
            EditorUtility.SetDirty(asset);
            return asset;
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

            PlayerSettings.SetScriptingBackend(NamedBuildTarget.Standalone, ScriptingImplementation.IL2CPP);
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
