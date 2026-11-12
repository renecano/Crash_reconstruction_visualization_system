using UnityEngine;
using UnityEngine.Rendering;

namespace Croquis.Visor
{
    /// <summary>
    /// La lluvia de baja y media (U5, ADR 0115): una malla fija con un rectángulo por gota, que el
    /// shader `Croquis/Lluvia` mueve en la GPU. Tiene las mismas gotas, con los mismos números, que el
    /// sistema de partículas de alta y ultra (`EscenarioVista.Lluvia`), sin simularlas ni volverlas
    /// geometría en la CPU en cada cuadro.
    ///
    /// Aquí solo se le dice al shader dónde está la caja de lluvia: delante de la cámara, como antes.
    /// </summary>
    public sealed class LluviaEnMalla : MonoBehaviour
    {
        /// <summary>Lado de la caja donde llueve (m): el de la forma del sistema de partículas.</summary>
        public const float Lado = 46f;

        /// <summary>Las gotas se reparten siempre igual: semilla fija.</summary>
        private const int Semilla = 20261111;

        private static readonly int Centro = Shader.PropertyToID("_LluviaCentro");

        public Transform Camara { get; set; }

        public float Altura { get; set; }

        public static GameObject Crear(Transform padre, int gotas, Camera camara, int capa)
        {
            var go = new GameObject("lluvia") { layer = capa };
            go.transform.SetParent(padre, false);
            var azar = new System.Random(Semilla);
            var vertices = new Vector3[gotas * 4];
            var esquinas = new Vector2[gotas * 4];
            var datos = new Vector2[gotas * 4];
            var indices = new int[gotas * 6];
            for (var i = 0; i < gotas; i++)
            {
                var lugar = new Vector3(((float)azar.NextDouble() - 0.5f) * Lado, 0f, ((float)azar.NextDouble() - 0.5f) * Lado);
                // En qué momento de su vida va cada gota, y su ancho: de 3 a 6 mm, como las partículas.
                var dato = new Vector2((float)azar.NextDouble(), Mathf.Lerp(0.003f, 0.006f, (float)azar.NextDouble()));
                for (var k = 0; k < 4; k++)
                {
                    vertices[i * 4 + k] = lugar;
                    datos[i * 4 + k] = dato;
                }

                esquinas[i * 4] = new Vector2(-0.5f, 0f);
                esquinas[i * 4 + 1] = new Vector2(0.5f, 0f);
                esquinas[i * 4 + 2] = new Vector2(0.5f, 1f);
                esquinas[i * 4 + 3] = new Vector2(-0.5f, 1f);
                indices[i * 6] = i * 4;
                indices[i * 6 + 1] = i * 4 + 1;
                indices[i * 6 + 2] = i * 4 + 2;
                indices[i * 6 + 3] = i * 4;
                indices[i * 6 + 4] = i * 4 + 2;
                indices[i * 6 + 5] = i * 4 + 3;
            }

            var malla = new Mesh { name = "lluvia", indexFormat = IndexFormat.UInt32 };
            malla.vertices = vertices;
            malla.uv = esquinas;
            malla.uv2 = datos;
            malla.triangles = indices;
            // El shader pone cada gota alrededor de la cámara: la malla nunca queda fuera de cuadro.
            malla.bounds = new Bounds(Vector3.zero, Vector3.one * 1e5f);
            go.AddComponent<MeshFilter>().sharedMesh = malla;
            var r = go.AddComponent<MeshRenderer>();
            r.sharedMaterial = Materiales.LluviaMalla;
            r.shadowCastingMode = ShadowCastingMode.Off;
            r.receiveShadows = false;
            r.lightProbeUsage = LightProbeUsage.Off;
            r.reflectionProbeUsage = ReflectionProbeUsage.Off;
            var sigue = go.AddComponent<LluviaEnMalla>();
            sigue.Camara = camara.transform;
            sigue.Altura = 14f;
            sigue.LateUpdate();
            return go;
        }

        private void LateUpdate()
        {
            if (Camara == null)
            {
                return;
            }

            // Como `SiempreVertical`: 16 m adelante de la cámara, y las gotas nacen 14 m arriba de ella.
            var adelante = Camara.forward;
            adelante.y = 0f;
            var p = Camara.position + adelante.normalized * 16f;
            Shader.SetGlobalVector(Centro, new Vector4(p.x, p.y + Altura, p.z, 0f));
            // La malla está en coordenadas del mundo.
            transform.SetPositionAndRotation(Vector3.zero, Quaternion.identity);
        }
    }
}
