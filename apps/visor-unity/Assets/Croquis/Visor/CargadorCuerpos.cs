using System;
using System.Collections.Generic;
using Croquis.Core;
using GLTFast;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.Networking;

namespace Croquis.Visor
{
    /// <summary>
    /// Los cuerpos de las personas (U3): los mismos glTF de MakeHuman (CC0) del visor web, con su
    /// esqueleto de 16 segmentos y la región de cada vértice (piel, camisa, pantalón…). Se bajan una
    /// vez por variante; si no se pueden bajar, `PersonaVista` usa un maniquí de piezas.
    /// </summary>
    public sealed class CargadorCuerpos
    {
        /// <summary>De dónde salen fuera del navegador (el editor y el escritorio).</summary>
        private const string Produccion = "https://croquis-sage.vercel.app/modelos/personas/";

        private readonly Dictionary<string, Awaitable<Plantilla>> plantillas = new Dictionary<string, Awaitable<Plantilla>>();
        private readonly Dictionary<string, Plantilla> listas = new Dictionary<string, Plantilla>();

        private sealed class Plantilla
        {
            public GltfImport Gltf;
            public float[] Region;
        }

        /// <summary>
        /// En el navegador, la misma ruta del sitio que abrió el visor; fuera, la de producción o la que
        /// diga `recursos_visor.json` («personas»).
        /// </summary>
        private static string Base()
        {
            if (Application.platform == RuntimePlatform.WebGLPlayer && !string.IsNullOrEmpty(Application.absoluteURL))
            {
                return new Uri(new Uri(Application.absoluteURL), "/modelos/personas/").ToString();
            }

            var recursos = Resources.Load<TextAsset>("recursos_visor");
            var url = recursos != null ? (string)JObject.Parse(recursos.text)["personas"] : null;
            return string.IsNullOrEmpty(url) ? Produccion : url;
        }

        private async Awaitable<Plantilla> Bajar(string variante)
        {
            var url = Base() + variante + ".glb";
            using var pedido = UnityWebRequest.Get(url);
            await pedido.SendWebRequest();
            if (pedido.result != UnityWebRequest.Result.Success)
            {
                Debug.LogWarning("[personas] No se pudo bajar " + url + ": " + pedido.error + ". Va el maniquí.");
                return null;
            }

            var bytes = pedido.downloadHandler.data;
            var gltf = new GltfImport();
            if (!await gltf.Load(bytes, new Uri(url)))
            {
                Debug.LogWarning("[personas] No se pudo abrir " + url + ". Va el maniquí.");
                return null;
            }

            return new Plantilla { Gltf = gltf, Region = Cuerpos.Atributo(bytes, "_REGION") };
        }

        /// <summary>
        /// Un cuerpo de la variante, hijo de `padre`, con los pies en y = 0, mirando a +Z y de 1 m de
        /// alto (el que llama lo escala a la estatura), pintado por región con la paleta de `id`. null
        /// si no se pudo bajar.
        /// </summary>
        public async Awaitable<GameObject> CrearAsync(Transform padre, string variante, string id)
        {
            if (!listas.TryGetValue(variante, out var p))
            {
                p = await Bajar(variante);
                listas[variante] = p;
            }

            if (p == null)
            {
                return null;
            }

            var go = new GameObject("cuerpo_" + variante);
            go.transform.SetParent(padre, false);
            if (!await p.Gltf.InstantiateMainSceneAsync(go.transform))
            {
                UnityEngine.Object.Destroy(go);
                return null;
            }

            Pintar(go, p.Region, Cuerpos.Paleta(id));
            return go;
        }

        /// <summary>Parte la malla en una submalla por región y le da a cada una su color.</summary>
        private static void Pintar(GameObject go, float[] region, string[] paleta)
        {
            var materiales = new Material[paleta.Length];
            for (var k = 0; k < paleta.Length; k++)
            {
                // La piel y el cabello, un poco más lisos que la ropa.
                materiales[k] = Materiales.Liso(Materiales.Hex(paleta[k], Color.gray), k == 0 || k == 4 ? 0.35f : 0.18f);
            }

            foreach (var smr in go.GetComponentsInChildren<SkinnedMeshRenderer>(true))
            {
                var original = smr.sharedMesh;
                if (original == null || region == null || !original.isReadable || original.vertexCount != region.Length)
                {
                    // Sin regiones, todo con el color de la camisa.
                    smr.sharedMaterials = new[] { materiales[1] };
                    continue;
                }

                var malla = UnityEngine.Object.Instantiate(original);
                var por = Cuerpos.TriangulosPorRegion(malla.triangles, region);
                malla.subMeshCount = por.Length;
                for (var k = 0; k < por.Length; k++)
                {
                    malla.SetTriangles(por[k], k);
                }

                smr.sharedMesh = malla;
                smr.sharedMaterials = materiales;
                smr.updateWhenOffscreen = true;
            }
        }
    }
}
