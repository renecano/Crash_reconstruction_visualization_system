using System;
using System.Collections.Generic;

namespace Croquis.Core
{
    /// <summary>
    /// Parte los triángulos de la zona dañada hasta que ninguno tenga un lado más largo que el pedido,
    /// para que la deformación y sus pliegues se noten en modelos de pocos vértices. Fuera de la zona la
    /// malla no cambia. Los vecinos de un triángulo partido se parten en 2 o 3 (refinamiento rojo-verde):
    /// así no quedan grietas, tampoco en las costuras de UV, donde dos vértices comparten posición.
    /// </summary>
    public static class Refinamiento
    {
        /// <summary>El resultado: las posiciones, los triángulos de cada submalla y los padres de cada vértice nuevo.</summary>
        public sealed class Malla
        {
            public List<V3> Posiciones;
            public int[][] Triangulos;

            /// <summary>Por cada vértice nuevo (desde `Originales`), los dos de los que es el punto medio.</summary>
            public List<(int A, int B)> Padres;
            public int Originales;
        }

        /// <summary>
        /// Refina `pasadas` veces los triángulos con algún vértice en la zona y un lado de más de
        /// `largoMax` (m). `limite` acota los vértices nuevos (memoria y tiempo en WebGL).
        /// </summary>
        public static Malla Partir(V3[] vertices, int[][] submallas, Func<V3, bool> enZona, double largoMax, int pasadas, int limite)
        {
            var pos = new List<V3>(vertices);
            var padres = new List<(int, int)>();
            var tris = new int[submallas.Length][];
            for (var s = 0; s < submallas.Length; s++)
            {
                tris[s] = (int[])submallas[s].Clone();
            }

            var zona = new List<bool>(vertices.Length);
            foreach (var v in vertices)
            {
                zona.Add(enZona(v));
            }

            var max2 = largoMax * largoMax;
            for (var pasada = 0; pasada < pasadas; pasada++)
            {
                // 1. Las aristas que se parten, por posición (así se ven igual de los dos lados de una costura).
                var marcadas = new HashSet<(long, long, long, long, long, long)>();
                for (var s = 0; s < tris.Length; s++)
                {
                    var t = tris[s];
                    for (var k = 0; k + 2 < t.Length; k += 3)
                    {
                        int a = t[k], b = t[k + 1], c = t[k + 2];
                        if (!zona[a] && !zona[b] && !zona[c] && !enZona(Centro(pos[a], pos[b], pos[c])))
                        {
                            continue;
                        }

                        if (D2(pos[a], pos[b]) > max2 || D2(pos[b], pos[c]) > max2 || D2(pos[c], pos[a]) > max2)
                        {
                            marcadas.Add(Llave(pos[a], pos[b]));
                            marcadas.Add(Llave(pos[b], pos[c]));
                            marcadas.Add(Llave(pos[c], pos[a]));
                        }
                    }
                }

                if (marcadas.Count == 0 || pos.Count - vertices.Length > limite)
                {
                    break;
                }

                // 2. Cada triángulo, según cuántas de sus aristas se parten: 1 → 2, 2 → 3, 3 → 4.
                var medios = new Dictionary<(int, int), int>();
                int Medio(int a, int b)
                {
                    var llave = a < b ? (a, b) : (b, a);
                    if (!medios.TryGetValue(llave, out var m))
                    {
                        m = pos.Count;
                        var pa = pos[a];
                        var pb = pos[b];
                        pos.Add(new V3((pa.X + pb.X) / 2, (pa.Y + pb.Y) / 2, (pa.Z + pb.Z) / 2));
                        padres.Add(llave);
                        zona.Add(zona[a] || zona[b]);
                        medios[llave] = m;
                    }

                    return m;
                }

                for (var s = 0; s < tris.Length; s++)
                {
                    var t = tris[s];
                    var nuevos = new List<int>(t.Length * 2);
                    for (var k = 0; k + 2 < t.Length; k += 3)
                    {
                        var v = new[] { t[k], t[k + 1], t[k + 2] };
                        var corta = new bool[3];
                        var n = 0;
                        for (var e = 0; e < 3; e++)
                        {
                            corta[e] = marcadas.Contains(Llave(pos[v[e]], pos[v[(e + 1) % 3]]));
                            n += corta[e] ? 1 : 0;
                        }

                        if (n == 0)
                        {
                            nuevos.Add(v[0]);
                            nuevos.Add(v[1]);
                            nuevos.Add(v[2]);
                            continue;
                        }

                        if (n == 3)
                        {
                            var m01 = Medio(v[0], v[1]);
                            var m12 = Medio(v[1], v[2]);
                            var m20 = Medio(v[2], v[0]);
                            nuevos.AddRange(new[] { v[0], m01, m20, m01, v[1], m12, m20, m12, v[2], m01, m12, m20 });
                            continue;
                        }

                        // Rota para que la primera arista cortada sea la 0 (v0 → v1), con el mismo giro.
                        var r = corta[0] ? (n == 2 && corta[2] ? 2 : 0) : (corta[1] ? 1 : 2);
                        var a = v[r];
                        var b = v[(r + 1) % 3];
                        var c = v[(r + 2) % 3];
                        var mab = Medio(a, b);
                        if (n == 1)
                        {
                            nuevos.AddRange(new[] { a, mab, c, mab, b, c });
                        }
                        else
                        {
                            // Cortadas la 0 (a-b) y la 1 (b-c).
                            var mbc = Medio(b, c);
                            nuevos.AddRange(new[] { a, mab, c, mab, b, mbc, mab, mbc, c });
                        }
                    }

                    tris[s] = nuevos.ToArray();
                }
            }

            return new Malla { Posiciones = pos, Triangulos = tris, Padres = padres, Originales = vertices.Length };
        }

        private static V3 Centro(V3 a, V3 b, V3 c)
        {
            return new V3((a.X + b.X + c.X) / 3, (a.Y + b.Y + c.Y) / 3, (a.Z + b.Z + c.Z) / 3);
        }

        private static double D2(V3 a, V3 b)
        {
            var dx = a.X - b.X;
            var dy = a.Y - b.Y;
            var dz = a.Z - b.Z;
            return dx * dx + dy * dy + dz * dz;
        }

        private static (long, long, long, long, long, long) Llave(V3 a, V3 b)
        {
            var pa = (X: (long)Math.Round(a.X * 1e4), Y: (long)Math.Round(a.Y * 1e4), Z: (long)Math.Round(a.Z * 1e4));
            var pb = (X: (long)Math.Round(b.X * 1e4), Y: (long)Math.Round(b.Y * 1e4), Z: (long)Math.Round(b.Z * 1e4));
            var primero = pa.X < pb.X || (pa.X == pb.X && (pa.Y < pb.Y || (pa.Y == pb.Y && pa.Z <= pb.Z)));
            return primero ? (pa.X, pa.Y, pa.Z, pb.X, pb.Y, pb.Z) : (pb.X, pb.Y, pb.Z, pa.X, pa.Y, pa.Z);
        }
    }
}
