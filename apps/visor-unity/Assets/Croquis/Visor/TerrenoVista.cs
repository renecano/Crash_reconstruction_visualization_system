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
                // Sobre las rayas de la vía: una terracería no lleva carriles pintados.
                m.Planta(pos, idx, 0.02f, terreno, Materiales.Mosaico(nombre));
            }

            Terraceria(padre, t, terreno);
            foreach (var par in porMaterial)
            {
                var tinte = par.Key == "tierra" ? new Color(0.5f, 0.52f, 0.5f) : Color.white;
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
                            return new Vector3(q.x, terreno.Z(q.x, q.z) + 0.03f, q.z);
                        }

                        m.Cuadro(P(k, f), P(k, f + 1), P(k + 1, f + 1), P(k + 1, f), 1f, true);
                    }
                }
            }

            amarillo.Poner(padre, "topes_amarillo", Materiales.Liso(new Color(0.85f, 0.66f, 0.08f), mojado ? 0.6f : 0.3f), false);
            negro.Poner(padre, "topes_negro", Materiales.Liso(new Color(0.05f, 0.05f, 0.05f), mojado ? 0.6f : 0.3f), false);
        }

        /// <summary>
        /// Lo que hace que una terracería se lea como tal: rodadas marcadas a lo largo y baches. Las
        /// rodadas siguen el lado más largo de la zona; los baches no caen en el claro del hecho.
        /// </summary>
        private static void Terraceria(Transform padre, TerrenoEscenario t, Terreno terreno)
        {
            var rodadas = new Malla();
            var baches = new Malla();
            var azar = new Azar(431);
            foreach (var s in t.Superficies)
            {
                if (MaterialDe(s.Tipo) != "tierra" || s.Poligono.Length < 3)
                {
                    continue;
                }

                // El eje: el lado más largo del polígono. Sus medidas, sobre ese eje y su normal.
                var eje = Vector2.right;
                var mayor = 0f;
                for (var i = 0; i < s.Poligono.Length; i++)
                {
                    var p = s.Poligono[i];
                    var q = s.Poligono[(i + 1) % s.Poligono.Length];
                    var d = new Vector2((float)(q.X - p.X), (float)(q.Y - p.Y));
                    if (d.magnitude > mayor)
                    {
                        mayor = d.magnitude;
                        eje = d.normalized;
                    }
                }

                var normal = new Vector2(-eje.y, eje.x);
                float u0 = float.MaxValue, u1 = float.MinValue, v0 = float.MaxValue, v1 = float.MinValue;
                foreach (var p in s.Poligono)
                {
                    var q = new Vector2((float)p.X, (float)p.Y);
                    u0 = Mathf.Min(u0, Vector2.Dot(q, eje));
                    u1 = Mathf.Max(u1, Vector2.Dot(q, eje));
                    v0 = Mathf.Min(v0, Vector2.Dot(q, normal));
                    v1 = Mathf.Max(v1, Vector2.Dot(q, normal));
                }

                var carriles = Mathf.Max(1, Mathf.RoundToInt((v1 - v0) / 3.5f));
                for (var c = 0; c < carriles; c++)
                {
                    var medio = v0 + (v1 - v0) * (c + 0.5f) / carriles;
                    foreach (var rueda in new[] { -0.78f, 0.78f })
                    {
                        for (var u = u0; u < u1; u += 3f)
                        {
                            var fin = Mathf.Min(u1, u + 3f);
                            Vector3 P(float a, float b) => terreno.P((eje * a + normal * b).x, (eje * a + normal * b).y, 0.032f);
                            var i = rodadas.Vertice(P(u, medio + rueda - 0.3f), new Vector2(u / 3f, 0f));
                            rodadas.Vertice(P(fin, medio + rueda - 0.3f), new Vector2(fin / 3f, 0f));
                            rodadas.Vertice(P(fin, medio + rueda + 0.3f), new Vector2(fin / 3f, 1f));
                            rodadas.Vertice(P(u, medio + rueda + 0.3f), new Vector2(u / 3f, 1f));
                            rodadas.Triangulo(i, i + 2, i + 1);
                            rodadas.Triangulo(i, i + 3, i + 2);
                        }
                    }
                }

                var cuantos = Mathf.Min(60, Mathf.RoundToInt((u1 - u0) * (v1 - v0) / 14f));
                for (var k = 0; k < cuantos; k++)
                {
                    var q = eje * azar.Entre(u0 + 0.8f, u1 - 0.8f) + normal * azar.Entre(v0 + 0.5f, v1 - 0.5f);
                    var r = azar.Entre(0.35f, 0.95f);
                    var giro = azar.Entre(0f, Mathf.PI);
                    if ((q - EscenarioVista.CentroDelHecho).magnitude < EscenarioVista.ClaroDelHecho)
                    {
                        continue;
                    }

                    EscenarioVista.Calca(baches, terreno, q, giro, r * 2f, r * azar.Entre(1.1f, 1.7f), 0.034f);
                }
            }

            rodadas.Poner(padre, "rodadas_terraceria", Materiales.Rodada(new Color(0.16f, 0.12f, 0.08f, 0.55f)), false);
            baches.Poner(padre, "baches", Materiales.ManchaOscura(0.5f), false);
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
