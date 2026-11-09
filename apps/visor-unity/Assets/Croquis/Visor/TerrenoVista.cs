using System.Collections.Generic;
using Croquis.Generated;
using UnityEngine;
using Material = UnityEngine.Material;

namespace Croquis.Visor
{
    /// <summary>
    /// El terreno de C3 que declara la escena: la altura del piso con sus ondulaciones y sus topes, y
    /// las zonas de otra superficie. Aquí solo se le da forma para dibujarlo: cómo afecta al movimiento
    /// lo decide el solver (W5), y llega en la trayectoria.
    /// </summary>
    public static class TerrenoVista
    {
        /// <summary>La función de altura del piso; plana si la escena no declara terreno.</summary>
        public static Terreno De(TerrenoEscenario t)
        {
            if (t == null || (t.Ondulaciones.Length == 0 && t.Topes.Length == 0))
            {
                return new Terreno();
            }

            return new Terreno((x, y) =>
            {
                var z = 0f;
                foreach (var o in t.Ondulaciones)
                {
                    var borde = DistanciaAlBorde(o.Poligono, x, y);
                    if (borde <= 0f)
                    {
                        continue;
                    }

                    // Crestas perpendiculares al rumbo; se desvanecen en 3 m hacia la orilla de la zona.
                    var r = (float)o.RumboDeg * Mathf.Deg2Rad;
                    var s = x * Mathf.Cos(r) + y * Mathf.Sin(r);
                    var onda = 0.5f + 0.5f * Mathf.Sin(2f * Mathf.PI * s / (float)o.LongitudOndaM);
                    z += (float)o.AmplitudM * onda * Mathf.Clamp01(borde / 3f);
                }

                foreach (var tp in t.Topes)
                {
                    var a = new Vector2((float)tp.Ax, (float)tp.Ay);
                    var b = new Vector2((float)tp.Bx, (float)tp.By);
                    var ab = b - a;
                    var u = Vector2.Dot(new Vector2(x, y) - a, ab) / ab.sqrMagnitude;
                    if (u < 0f || u > 1f)
                    {
                        continue;
                    }

                    var d = (new Vector2(x, y) - (a + ab * u)).magnitude;
                    var medio = (float)tp.LargoM / 2f;
                    if (d < medio)
                    {
                        var c = Mathf.Cos(Mathf.PI * d / (2f * medio));
                        z += (float)tp.AltoM * c * c;
                    }
                }

                return z;
            });
        }

        public static void Dibujar(Transform raiz, TerrenoEscenario t, Terreno terreno, bool mojado)
        {
            if (t == null)
            {
                return;
            }

            var padre = new GameObject("terreno").transform;
            padre.SetParent(raiz, false);
            var porMaterial = new Dictionary<string, Malla>();
            foreach (var s in t.Superficies)
            {
                var nombre = MaterialDe(s.Tipo);
                if (!porMaterial.TryGetValue(nombre, out var m))
                {
                    porMaterial[nombre] = m = new Malla();
                }

                Triangular(s.Poligono, out var pos, out var idx);
                m.Planta(pos, idx, 0.006f, terreno, Materiales.Mosaico(nombre));
            }

            foreach (var par in porMaterial)
            {
                var tinte = par.Key == "tierra" ? new Color(0.82f, 0.74f, 0.62f) : Color.white;
                par.Value.Poner(padre, "superficie_" + par.Key, Materiales.Pbr(par.Key, tinte), false);
            }

            // Los topes: su lomo, con franjas amarillas y negras.
            var amarillo = new Malla();
            var negro = new Malla();
            foreach (var tp in t.Topes)
            {
                var a = new Vector3((float)tp.Ax, 0f, (float)tp.Ay);
                var b = new Vector3((float)tp.Bx, 0f, (float)tp.By);
                var ancho = (b - a).magnitude;
                var eje = (b - a) / ancho;
                var marcha = Vector3.Cross(Vector3.up, eje);
                var medio = (float)tp.LargoM / 2f;
                const int Pasos = 10;
                var franjas = Mathf.Max(2, Mathf.RoundToInt(ancho / 0.5f));
                for (var f = 0; f < franjas; f++)
                {
                    var m = f % 2 == 0 ? amarillo : negro;
                    for (var k = 0; k < Pasos; k++)
                    {
                        Vector3 P(int paso, int franja)
                        {
                            var d = -medio + 2f * medio * paso / Pasos;
                            var q = a + eje * (ancho * franja / franjas) + marcha * d;
                            return new Vector3(q.x, terreno.Z(q.x, q.z) + 0.008f, q.z);
                        }

                        m.Cuadro(P(k, f), P(k, f + 1), P(k + 1, f + 1), P(k + 1, f), 1f, true);
                    }
                }
            }

            amarillo.Poner(padre, "topes_amarillo", Materiales.Liso(new Color(0.85f, 0.66f, 0.08f), mojado ? 0.6f : 0.3f), false);
            negro.Poner(padre, "topes_negro", Materiales.Liso(new Color(0.05f, 0.05f, 0.05f), mojado ? 0.6f : 0.3f), false);
        }

        private static string MaterialDe(TipoSuperficie tipo)
        {
            switch (tipo)
            {
                case TipoSuperficie.Grava:
                    return "grava";
                case TipoSuperficie.Pasto:
                    return "pasto";
                case TipoSuperficie.Concreto:
                case TipoSuperficie.Adoquin:
                case TipoSuperficie.Empedrado:
                    return "concreto";
                case TipoSuperficie.Asfalto:
                    return "asfalto";
                default:
                    return "tierra";
            }
        }

        /// <summary>Cuánto falta para la orilla del polígono desde adentro (m); 0 o menos si está fuera.</summary>
        private static float DistanciaAlBorde(PuntoPlano[] p, float x, float y)
        {
            var dentro = false;
            var minima = float.MaxValue;
            for (int i = 0, j = p.Length - 1; i < p.Length; j = i++)
            {
                var a = new Vector2((float)p[i].X, (float)p[i].Y);
                var b = new Vector2((float)p[j].X, (float)p[j].Y);
                if ((a.y > y) != (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x)
                {
                    dentro = !dentro;
                }

                var ab = b - a;
                var u = Mathf.Clamp01(Vector2.Dot(new Vector2(x, y) - a, ab) / ab.sqrMagnitude);
                minima = Mathf.Min(minima, (new Vector2(x, y) - (a + ab * u)).magnitude);
            }

            return dentro ? minima : 0f;
        }

        /// <summary>Triangula un polígono simple por orejas; lo entrega antihorario visto desde arriba.</summary>
        private static void Triangular(PuntoPlano[] p, out double[] posiciones, out long[] indices)
        {
            var area = 0.0;
            for (int i = 0, j = p.Length - 1; i < p.Length; j = i++)
            {
                area += (p[j].X + p[i].X) * (p[j].Y - p[i].Y);
            }

            // `area` positiva aquí es sentido horario: se recorre al revés.
            var orden = new List<int>();
            for (var i = 0; i < p.Length; i++)
            {
                orden.Add(area > 0 ? p.Length - 1 - i : i);
            }

            posiciones = new double[p.Length * 2];
            for (var i = 0; i < p.Length; i++)
            {
                posiciones[2 * i] = p[i].X;
                posiciones[2 * i + 1] = p[i].Y;
            }

            var tri = new List<long>();
            var guarda = 0;
            while (orden.Count > 3 && guarda++ < 10000)
            {
                var cortada = false;
                for (var i = 0; i < orden.Count; i++)
                {
                    var a = orden[(i + orden.Count - 1) % orden.Count];
                    var b = orden[i];
                    var c = orden[(i + 1) % orden.Count];
                    if (Cruz(p[a], p[b], p[c]) <= 0 || HayPuntoDentro(p, orden, a, b, c))
                    {
                        continue;
                    }

                    tri.Add(a);
                    tri.Add(b);
                    tri.Add(c);
                    orden.RemoveAt(i);
                    cortada = true;
                    break;
                }

                if (!cortada)
                {
                    break;
                }
            }

            if (orden.Count == 3)
            {
                tri.Add(orden[0]);
                tri.Add(orden[1]);
                tri.Add(orden[2]);
            }

            indices = tri.ToArray();
        }

        private static double Cruz(PuntoPlano a, PuntoPlano b, PuntoPlano c)
        {
            return (b.X - a.X) * (c.Y - a.Y) - (b.Y - a.Y) * (c.X - a.X);
        }

        private static bool HayPuntoDentro(PuntoPlano[] p, List<int> orden, int a, int b, int c)
        {
            foreach (var k in orden)
            {
                if (k == a || k == b || k == c)
                {
                    continue;
                }

                if (Cruz(p[a], p[b], p[k]) >= 0 && Cruz(p[b], p[c], p[k]) >= 0 && Cruz(p[c], p[a], p[k]) >= 0)
                {
                    return true;
                }
            }

            return false;
        }
    }
}
