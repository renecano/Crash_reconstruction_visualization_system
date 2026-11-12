using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace Croquis.Visor
{
    /// <summary>
    /// El vehículo como lo dibuja el minimapa de baja y media (U5, ADR 0115): todas sus piezas opacas
    /// en una sola malla, con el color de cada pieza en los vértices (`Croquis/MinimapaVehiculo`). El
    /// minimapa dibujaba cada vehículo pieza por pieza (de 30 a 60 llamadas por vehículo y por cuadro)
    /// para una figura de unos cuantos pixeles. La malla va en la capa que solo ve el minimapa y es
    /// hija del vehículo: se mueve, gira y se vuelca con él.
    /// </summary>
    public static class VehiculoEnMinimapa
    {
        private static readonly Dictionary<Texture, Color> Promedios = new Dictionary<Texture, Color>();

        public static GameObject Crear(Transform vehiculo)
        {
            var vertices = new List<Vector3>();
            var normales = new List<Vector3>();
            var colores = new List<Color>();
            var indices = new List<int>();
            var aRaiz = vehiculo.worldToLocalMatrix;
            var triangulos = new List<int>();
            foreach (var mr in vehiculo.GetComponentsInChildren<MeshRenderer>(false))
            {
                if (!mr.enabled || mr.shadowCastingMode == ShadowCastingMode.ShadowsOnly || mr.GetComponentInParent<PersonaVista>() != null)
                {
                    continue;
                }

                var mf = mr.GetComponent<MeshFilter>();
                var malla = mf != null ? mf.sharedMesh : null;
                var materiales = mr.sharedMaterials;
                if (malla == null || !malla.isReadable || materiales.Length < malla.subMeshCount)
                {
                    continue;
                }

                var matriz = aRaiz * mr.transform.localToWorldMatrix;
                var puntos = malla.vertices;
                var propias = malla.normals;
                for (var s = 0; s < malla.subMeshCount; s++)
                {
                    var material = materiales[s];
                    // Los vidrios y las calcas (transparentes) no entran: desde arriba se ve lo de abajo.
                    if (material == null || material.renderQueue >= (int)RenderQueue.Transparent || malla.GetTopology(s) != MeshTopology.Triangles)
                    {
                        continue;
                    }

                    var color = ColorDe(material).linear;
                    // Solo los vértices que usa esta pieza: cada material lleva su color.
                    var nuevo = new Dictionary<int, int>();
                    malla.GetTriangles(triangulos, s);
                    foreach (var i in triangulos)
                    {
                        if (!nuevo.TryGetValue(i, out var j))
                        {
                            j = vertices.Count;
                            nuevo[i] = j;
                            vertices.Add(matriz.MultiplyPoint3x4(puntos[i]));
                            normales.Add(propias.Length == puntos.Length ? matriz.MultiplyVector(propias[i]).normalized : Vector3.up);
                            colores.Add(color);
                        }

                        indices.Add(j);
                    }
                }
            }

            if (indices.Count == 0)
            {
                return null;
            }

            var union = new Mesh { name = "vehiculo_en_minimapa", indexFormat = IndexFormat.UInt32 };
            union.SetVertices(vertices);
            union.SetNormals(normales);
            union.SetColors(colores);
            union.SetTriangles(indices, 0);
            union.RecalculateBounds();
            union.UploadMeshData(true);
            var go = new GameObject("vehiculo_en_minimapa") { layer = CamaraVisor.CapaMinimapa };
            go.transform.SetParent(vehiculo, false);
            go.AddComponent<MeshFilter>().sharedMesh = union;
            var r = go.AddComponent<MeshRenderer>();
            r.sharedMaterial = Materiales.MinimapaVehiculo;
            r.shadowCastingMode = ShadowCastingMode.Off;
            r.receiveShadows = false;
            r.reflectionProbeUsage = ReflectionProbeUsage.Off;
            return go;
        }

        /// <summary>El color con que se ve una pieza: su color base por el promedio de su textura, si la lleva.</summary>
        private static Color ColorDe(Material m)
        {
            var color = m.HasProperty("_BaseColor") ? m.GetColor("_BaseColor") : m.HasProperty("_Color") ? m.GetColor("_Color") : Color.gray;
            var textura = m.HasProperty("_BaseMap") ? m.GetTexture("_BaseMap") : null;
            if (textura == null)
            {
                return color;
            }

            if (!Promedios.TryGetValue(textura, out var promedio))
            {
                promedio = Promedio(textura);
                Promedios[textura] = promedio;
            }

            return new Color(color.r * promedio.r, color.g * promedio.g, color.b * promedio.b, 1f);
        }

        /// <summary>El color promedio de una textura: se reduce a 4×4 en la GPU y se leen esos 16 pixeles.</summary>
        private static Color Promedio(Texture textura)
        {
            var rt = RenderTexture.GetTemporary(4, 4, 0, RenderTextureFormat.ARGB32, RenderTextureReadWrite.sRGB);
            var antes = RenderTexture.active;
            Graphics.Blit(textura, rt);
            RenderTexture.active = rt;
            var lectura = new Texture2D(4, 4, TextureFormat.RGBA32, false);
            lectura.ReadPixels(new Rect(0, 0, 4, 4), 0, 0);
            lectura.Apply();
            RenderTexture.active = antes;
            RenderTexture.ReleaseTemporary(rt);
            var suma = Vector4.zero;
            foreach (var c in lectura.GetPixels())
            {
                suma += (Vector4)c;
            }

            Object.Destroy(lectura);
            suma /= 16f;
            return new Color(suma.x, suma.y, suma.z, 1f);
        }
    }
}
