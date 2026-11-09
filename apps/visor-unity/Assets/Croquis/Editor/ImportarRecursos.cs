using UnityEditor;
using UnityEngine;

namespace Croquis.EditorTools
{
    /// <summary>
    /// Cómo se importan los recursos del escenario (tools/unity/recursos.mjs, ADR 0113): las normales
    /// como mapa de normales, las máscaras sin corrección de color, las tarjetas de árbol con su alfa
    /// cuidado en los mipmaps y los cielos como cubo. Todo comprimido con Crunch, que es lo que hace
    /// que el build web pese poco.
    /// </summary>
    public sealed class ImportarRecursos : AssetPostprocessor
    {
        private const string Carpeta = "Assets/Croquis/Recursos/";

        private void OnPreprocessTexture()
        {
            if (!assetPath.StartsWith(Carpeta))
            {
                return;
            }

            var t = (TextureImporter)assetImporter;
            var nombre = System.IO.Path.GetFileNameWithoutExtension(assetPath);
            t.mipmapEnabled = true;
            t.anisoLevel = 8;
            t.wrapMode = TextureWrapMode.Repeat;
            t.maxTextureSize = 1024;
            if (assetPath.EndsWith(".hdr"))
            {
                t.textureShape = TextureImporterShape.TextureCube;
                t.generateCubemap = TextureImporterGenerateCubemap.Cylindrical;
                t.sRGBTexture = false;
                t.wrapMode = TextureWrapMode.Clamp;
                t.maxTextureSize = 1024;
                t.textureCompression = TextureImporterCompression.CompressedHQ;
                return;
            }

            t.crunchedCompression = true;
            t.compressionQuality = 70;
            t.textureCompression = TextureImporterCompression.Compressed;
            if (nombre.EndsWith("_nor"))
            {
                t.textureType = TextureImporterType.NormalMap;
            }
            else if (nombre.EndsWith("_mask"))
            {
                t.sRGBTexture = false;
            }

            if (assetPath.Contains("/arboles/"))
            {
                // Las tarjetas no se repiten, y su alfa no debe adelgazar con la distancia.
                t.wrapMode = TextureWrapMode.Clamp;
                if (nombre.EndsWith("_diff"))
                {
                    t.alphaIsTransparency = true;
                    t.mipMapsPreserveCoverage = true;
                    t.alphaTestReferenceValue = 0.4f;
                }
            }
        }
    }
}
