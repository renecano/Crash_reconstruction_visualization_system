using System.Collections.Generic;
using System.IO;
using UnityEngine;
using UnityEngine.Networking;

namespace Croquis.Visor
{
    /// <summary>
    /// Los cielos HDRI (día, noche, nublado y crepúsculo). Cada uno es un AssetBundle aparte en
    /// `StreamingAssets/cielos/` y se carga solo el del caso: los cuatro dentro del build eran 8 MB de
    /// la primera descarga en la web (U6, René 2026-11-12). Es la misma textura con el mismo
    /// importador, así que el cielo se ve igual. En el Editor se toman del proyecto.
    /// </summary>
    public static class Cielos
    {
        public static readonly string[] Nombres = { "dia", "nublado", "crepusculo", "noche" };

        /// <summary>Dónde guarda el material de cada cielo «Croquis/Preparar proyecto» (fuera de Resources).</summary>
        public const string Carpeta = "Assets/Croquis/Recursos/Cielos";

        private static readonly Dictionary<string, Material> Cargados = new Dictionary<string, Material>();

        /// <summary>El material del cielo, ya cargado con `CargarAsync`.</summary>
        public static Material Del(string nombre)
        {
            if (Cargados.TryGetValue(nombre, out var m) && m != null)
            {
                return m;
            }

#if UNITY_EDITOR
            m = UnityEditor.AssetDatabase.LoadAssetAtPath<Material>(Carpeta + "/cielo_" + nombre + ".mat");
            if (m != null)
            {
                Cargados[nombre] = m;
                return m;
            }
#endif
            throw new ModeloNoCargo("No se cargó el cielo «" + nombre + "».");
        }

        /// <summary>Carga el AssetBundle del cielo, si no está ya (en la web lo baja de junto al build).</summary>
        public static async Awaitable CargarAsync(string nombre)
        {
            if (Application.isEditor || (Cargados.TryGetValue(nombre, out var ya) && ya != null))
            {
                return;
            }

            var ruta = Path.Combine(Application.streamingAssetsPath, "cielos", nombre);
            AssetBundle bundle;
            if (Application.platform == RuntimePlatform.WebGLPlayer)
            {
                using var pedido = UnityWebRequestAssetBundle.GetAssetBundle(Application.streamingAssetsPath + "/cielos/" + nombre);
                await pedido.SendWebRequest();
                if (pedido.result != UnityWebRequest.Result.Success)
                {
                    throw new ModeloNoCargo("No se pudo bajar el cielo «" + nombre + "»: " + pedido.error);
                }

                bundle = DownloadHandlerAssetBundle.GetContent(pedido);
            }
            else
            {
                var carga = AssetBundle.LoadFromFileAsync(ruta);
                await carga;
                bundle = carga.assetBundle;
            }

            var material = bundle != null ? bundle.LoadAsset<Material>("cielo_" + nombre) : null;
            if (material == null)
            {
                throw new ModeloNoCargo("El paquete del cielo «" + nombre + "» no trae su material.");
            }

            Cargados[nombre] = material;
        }
    }
}
