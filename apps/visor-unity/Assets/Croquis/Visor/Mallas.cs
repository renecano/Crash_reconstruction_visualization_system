using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace Croquis.Visor
{
    /// <summary>
    /// La altura del piso z(x, y) sobre la que se arma todo el escenario. Hoy es plana; con el relieve,
    /// la ondulación y los topes de W5 solo cambia esta función y las vías no se rehacen (plan v4 §3.3).
    /// </summary>
    public sealed class Terreno
    {
        private readonly Func<float, float, float> z;

        public Terreno(Func<float, float, float> z = null)
        {
            this.z = z;
        }

        /// <summary>Si el piso es plano: entonces las mallas en planta no se subdividen.</summary>
        public bool Plano => z == null;

        public float Z(float x, float y)
        {
            return z == null ? 0f : z(x, y);
        }

        /// <summary>Un punto de la escena (x este, y norte, alto sobre el piso) en el marco de Unity.</summary>
        public Vector3 P(double x, double y, double alto = 0)
        {
            return new Vector3((float)x, Z((float)x, (float)y) + (float)alto, (float)y);
        }
    }

    /// <summary>Construcción de mallas con sus coordenadas de textura en metros.</summary>
    public sealed class Malla
    {
        /// <summary>Lado máximo de un triángulo en planta cuando el piso tiene relieve (m).</summary>
        public const float LadoConRelieve = 1.2f;

        private readonly List<Vector3> v = new List<Vector3>();
        private readonly List<Vector2> uv = new List<Vector2>();
        private readonly List<int> t = new List<int>();

        public int Vertices => v.Count;

        public int Vertice(Vector3 p, Vector2 u)
        {
            v.Add(p);
            uv.Add(u);
            return v.Count - 1;
        }

        public void Triangulo(int a, int b, int c)
        {
            t.Add(a);
            t.Add(b);
            t.Add(c);
        }

        /// <summary>Un cuadro a, b, c, d en sentido antihorario visto de frente, con UV en metros.</summary>
        public void Cuadro(Vector3 a, Vector3 b, Vector3 c, Vector3 d, float uvPorMetro = 1f, bool dosCaras = false)
        {
            var ancho = (b - a).magnitude * uvPorMetro;
            var alto = (d - a).magnitude * uvPorMetro;
            var i = Vertice(a, new Vector2(0, 0));
            Vertice(b, new Vector2(ancho, 0));
            Vertice(c, new Vector2(ancho, alto));
            Vertice(d, new Vector2(0, alto));
            Triangulo(i, i + 2, i + 1);
            Triangulo(i, i + 3, i + 2);
            if (dosCaras)
            {
                Triangulo(i, i + 1, i + 2);
                Triangulo(i, i + 2, i + 3);
            }
        }

        /// <summary>Un cuadro con la textura completa de 0 a 1 (tarjetas de árbol, rótulos).</summary>
        public void Tarjeta(Vector3 a, Vector3 b, Vector3 c, Vector3 d)
        {
            var i = Vertice(a, new Vector2(0, 0));
            Vertice(b, new Vector2(1, 0));
            Vertice(c, new Vector2(1, 1));
            Vertice(d, new Vector2(0, 1));
            Triangulo(i, i + 2, i + 1);
            Triangulo(i, i + 3, i + 2);
        }

        /// <summary>Una caja orientada: centro de la base, ejes unitarios y medidas. Sin tapa inferior.</summary>
        public void Caja(Vector3 baseCentro, Vector3 ejeX, Vector3 ejeZ, float ancho, float alto, float fondo, float uvPorMetro = 1f)
        {
            // Las caras miran hacia afuera con cualquier par de ejes: si el par viene al revés (como
            // el de `Cross(up, eje)`), se voltea uno, que da la misma caja.
            var arriba = Vector3.Cross(ejeZ, ejeX);
            if (Vector3.Dot(arriba, Vector3.up) < 0f)
            {
                ejeZ = -ejeZ;
                arriba = -arriba;
            }

            var x = ejeX * (ancho / 2f);
            var z = ejeZ * (fondo / 2f);
            var y = arriba.normalized * alto;
            var p = new[]
            {
                baseCentro - x - z, baseCentro + x - z, baseCentro + x + z, baseCentro - x + z,
            };
            for (var k = 0; k < 4; k++)
            {
                var a = p[k];
                var b = p[(k + 1) % 4];
                Cuadro(a, b, b + y, a + y, uvPorMetro);
            }

            Cuadro(p[0] + y, p[1] + y, p[2] + y, p[3] + y, uvPorMetro);
        }

        /// <summary>Un prisma de n lados sobre el eje vertical (postes, tinacos, discos de señal).</summary>
        public void Prisma(Vector3 baseCentro, float radio, float alto, int lados, float radioArriba = -1f)
        {
            var r1 = radioArriba < 0f ? radio : radioArriba;
            var arriba = Vertice(baseCentro + Vector3.up * alto, new Vector2(0.5f, 0.5f));
            for (var k = 0; k < lados; k++)
            {
                var a0 = 2f * Mathf.PI * k / lados;
                var a1 = 2f * Mathf.PI * (k + 1) / lados;
                var d0 = new Vector3(Mathf.Cos(a0), 0f, Mathf.Sin(a0));
                var d1 = new Vector3(Mathf.Cos(a1), 0f, Mathf.Sin(a1));
                var i = Vertice(baseCentro + d0 * radio, new Vector2(k / (float)lados, 0));
                Vertice(baseCentro + d1 * radio, new Vector2((k + 1) / (float)lados, 0));
                Vertice(baseCentro + d1 * r1 + Vector3.up * alto, new Vector2((k + 1) / (float)lados, alto));
                Vertice(baseCentro + d0 * r1 + Vector3.up * alto, new Vector2(k / (float)lados, alto));
                Triangulo(i, i + 3, i + 2);
                Triangulo(i, i + 2, i + 1);
                Triangulo(arriba, i + 2, i + 3);
            }
        }

        /// <summary>
        /// Una malla en planta (Croquis la da antihoraria desde arriba) a una altura sobre el piso, con UV
        /// planas en metros. Con relieve, los triángulos largos se parten para seguir el piso.
        /// </summary>
        public void Planta(double[] posiciones, long[] indices, float altura, Terreno terreno, float mosaico)
        {
            var b = v.Count;
            for (var i = 0; i + 1 < posiciones.Length; i += 2)
            {
                var x = (float)posiciones[i];
                var y = (float)posiciones[i + 1];
                Vertice(new Vector3(x, terreno.Z(x, y) + altura, y), new Vector2(x, y) / mosaico);
            }

            for (var i = 0; i + 2 < indices.Length; i += 3)
            {
                var a = b + (int)indices[i];
                var c = b + (int)indices[i + 2];
                var d = b + (int)indices[i + 1];
                if (terreno.Plano)
                {
                    Triangulo(a, c, d);
                }
                else
                {
                    Partir(a, c, d, altura, terreno, mosaico, 0);
                }
            }
        }

        private void Partir(int a, int b, int c, float altura, Terreno terreno, float mosaico, int nivel)
        {
            var ab = PlanoXZ(v[a], v[b]);
            var bc = PlanoXZ(v[b], v[c]);
            var ca = PlanoXZ(v[c], v[a]);
            var mayor = Mathf.Max(ab, Mathf.Max(bc, ca));
            if (mayor <= LadoConRelieve || nivel >= 10)
            {
                Triangulo(a, b, c);
                return;
            }

            // Se parte el lado más largo por la mitad, con el punto nuevo sobre el piso.
            if (mayor == bc)
            {
                (a, b, c) = (b, c, a);
            }
            else if (mayor == ca)
            {
                (a, b, c) = (c, a, b);
            }

            var x = (v[a].x + v[b].x) / 2f;
            var y = (v[a].z + v[b].z) / 2f;
            var m = Vertice(new Vector3(x, terreno.Z(x, y) + altura, y), new Vector2(x, y) / mosaico);
            Partir(a, m, c, altura, terreno, mosaico, nivel + 1);
            Partir(m, b, c, altura, terreno, mosaico, nivel + 1);
        }

        private static float PlanoXZ(Vector3 a, Vector3 b)
        {
            return new Vector2(a.x - b.x, a.z - b.z).magnitude;
        }

        public Mesh Cerrar(string nombre)
        {
            var m = new Mesh
            {
                name = nombre,
                indexFormat = v.Count > 65000 ? IndexFormat.UInt32 : IndexFormat.UInt16,
            };
            m.SetVertices(v);
            m.SetUVs(0, uv);
            m.SetTriangles(t, 0);
            m.RecalculateNormals();
            m.RecalculateTangents();
            m.RecalculateBounds();
            return m;
        }

        /// <summary>Cierra la malla y la pone en la escena con su material.</summary>
        public GameObject Poner(Transform padre, string nombre, Material material, bool sombra = true, bool recibe = true)
        {
            var go = new GameObject(nombre);
            go.transform.SetParent(padre, false);
            if (v.Count == 0)
            {
                return go;
            }

            go.AddComponent<MeshFilter>().sharedMesh = Cerrar(nombre);
            var mr = go.AddComponent<MeshRenderer>();
            mr.sharedMaterial = material;
            mr.shadowCastingMode = sombra ? ShadowCastingMode.On : ShadowCastingMode.Off;
            mr.receiveShadows = recibe;
            return go;
        }
    }

    /// <summary>Números al azar con semilla (mulberry32, el mismo del visor web).</summary>
    public sealed class Azar
    {
        private uint a;

        public Azar(long semilla)
        {
            a = unchecked((uint)semilla);
        }

        public float Siguiente()
        {
            unchecked
            {
                a += 0x6d2b79f5;
                var t = a;
                t = (t ^ (t >> 15)) * (t | 1);
                t ^= t + (t ^ (t >> 7)) * (t | 61);
                return ((t ^ (t >> 14)) & 0xffffffff) / 4294967296f;
            }
        }

        public float Entre(float min, float max)
        {
            return min + (max - min) * Siguiente();
        }
    }
}
