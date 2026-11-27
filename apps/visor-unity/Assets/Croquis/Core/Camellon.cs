using System;
using System.Collections.Generic;
using Croquis.Generated;

namespace Croquis.Core
{
    /// <summary>
    /// El camellón de una avenida de dos cuerpos (Tollocan, Reforma), sacado de las calles de
    /// OpenStreetMap del caso (`escena.lugar.red_vial`), no a mano. En OSM una vía con camellón son dos
    /// `way` de un sentido, casi paralelos y en sentidos contrarios, separados más que la suma de sus
    /// medios anchos: lo que queda entre las dos orillas de adentro es el camellón. Donde otra calle lo
    /// cruza (un retorno o una intersección) se corta.
    ///
    /// El ancho de cada calzada es el mismo de la web (`viaWidthM` en packages/scene-schema): `width`
    /// de OSM o carriles × ancho de carril, con los carriles típicos por tipo de `red_vial.json`.
    /// </summary>
    public static class Camellon
    {
        /// <summary>Cada cuánto se muestrea el eje de una calzada (m).</summary>
        public const double PasoM = 3.0;

        /// <summary>El camellón más angosto que se dibuja (m) y la separación más grande entre ejes que se busca.</summary>
        public const double AnchoMinimoM = 1.0;
        public const double SeparacionMaximaM = 70.0;

        /// <summary>Los carriles típicos de una calle de OSM sin `lanes` (la misma tabla de `red_vial.json`).</summary>
        private static readonly Dictionary<string, int> CarrilesPorTipo = new Dictionary<string, int>
        {
            { "motorway", 6 }, { "trunk", 4 }, { "primary", 4 }, { "secondary", 3 }, { "tertiary", 2 },
            { "unclassified", 2 }, { "residential", 2 }, { "living_street", 1 }, { "service", 1 },
        };

        /// <summary>Las vías que llevan camellón: las principales, sin enlaces.</summary>
        private static readonly HashSet<string> Principales = new HashSet<string> { "motorway", "trunk", "primary", "secondary", "tertiary" };

        /// <summary>Un punto del eje del camellón, con su dirección y su ancho (m).</summary>
        public struct Punto
        {
            public double X;
            public double Y;
            public double DirX;
            public double DirY;
            public double Ancho;
        }

        /// <summary>El ancho de una calzada de OSM (m), como `viaWidthM` de la web.</summary>
        public static double AnchoDe(ViaElement v, double anchoCarril)
        {
            if (v.AnchoM.HasValue)
            {
                return v.AnchoM.Value;
            }

            var tipo = (v.Tipo ?? "").Replace("_link", "");
            var carriles = v.Carriles ?? (CarrilesPorTipo.TryGetValue(tipo, out var c) ? c : 2);
            return carriles * anchoCarril;
        }

        /// <summary>
        /// Los camellones del lugar dentro de `radio` metros de (cx, cy): cada uno, una lista de puntos
        /// seguidos de su eje. Vacío si la vía no tiene dos cuerpos.
        /// </summary>
        public static List<List<Punto>> Buscar(ViaElement[] vias, double anchoCarril, double cx, double cy, double radio)
        {
            var salida = new List<List<Punto>>();
            if (vias == null)
            {
                return salida;
            }

            var cuerpos = new List<ViaElement>();
            foreach (var v in vias)
            {
                if (v?.UnSentido == true && v.Puntos != null && v.Puntos.Length >= 2 && Principales.Contains(v.Tipo ?? ""))
                {
                    cuerpos.Add(v);
                }
            }

            foreach (var a in cuerpos)
            {
                var anchoA = AnchoDe(a, anchoCarril);
                var tramo = new List<Punto>();
                foreach (var (px, py, dx, dy) in Muestras(a.Puntos))
                {
                    var p = Frente(a, anchoA, px, py, dx, dy, cuerpos, anchoCarril);
                    var vale = p.HasValue
                        && Math.Sqrt((p.Value.X - cx) * (p.Value.X - cx) + (p.Value.Y - cy) * (p.Value.Y - cy)) <= radio
                        && !Cruzado(p.Value, vias, a);
                    if (vale && (tramo.Count == 0 || Distancia(tramo[tramo.Count - 1], p.Value) <= 2.5 * PasoM))
                    {
                        tramo.Add(p.Value);
                        continue;
                    }

                    Cerrar(salida, tramo);
                    tramo = new List<Punto>();
                    if (vale)
                    {
                        tramo.Add(p.Value);
                    }
                }

                Cerrar(salida, tramo);
            }

            return salida;
        }

        /// <summary>
        /// Quita del entorno procedural lo que cayó dentro de un camellón (el plan de la web lo toma por una
        /// cuadra y le pone casas y postes): edificios, postes, señales y cercas. Los árboles
        /// que ya estaban se quedan: son parte del camellón.
        /// </summary>
        public static void Despejar(Escenario e, List<List<Punto>> camellones)
        {
            var en = e?.Entorno;
            if (en == null || camellones.Count == 0)
            {
                return;
            }

            en.Edificios = Array.FindAll(en.Edificios ?? new EdificioEscenario[0], b => !Dentro(camellones, b.X, b.Y, Math.Max(b.LargoM, b.FondoM) / 2.0));
            en.Postes = Array.FindAll(en.Postes ?? new PosteEscenario[0], b => !Dentro(camellones, b.X, b.Y));
            en.Senales = Array.FindAll(en.Senales ?? new SenalEscenario[0], b => !Dentro(camellones, b.X, b.Y));
            en.Cercas = Array.FindAll(en.Cercas ?? new SegmentoPlano[0], c => !Dentro(camellones, c.Ax, c.Ay) && !Dentro(camellones, c.Bx, c.By));
        }

        /// <summary>
        /// Los árboles del camellón: fresnos y jacarandas cada 9 a 13 m sobre el eje, en dos hileras si
        /// mide más de 8 m, y nada a menos de 3 m de otro árbol (de `existentes`). Con semilla.
        /// </summary>
        public static List<ArbolEscenario> Arbolado(List<List<Punto>> camellones, IList<ArbolEscenario> existentes, long semilla)
        {
            var azar = new Random((int)(semilla % int.MaxValue) + 4241);
            var nuevos = new List<ArbolEscenario>();
            bool Libre(double x, double y)
            {
                foreach (var a in existentes ?? new ArbolEscenario[0])
                {
                    if ((a.X - x) * (a.X - x) + (a.Y - y) * (a.Y - y) < 9.0)
                    {
                        return false;
                    }
                }

                foreach (var a in nuevos)
                {
                    if ((a.X - x) * (a.X - x) + (a.Y - y) * (a.Y - y) < 9.0)
                    {
                        return false;
                    }
                }

                return true;
            }

            foreach (var c in camellones)
            {
                if (c.Count == 0 || c[0].Ancho < 1.6)
                {
                    continue; // Angosto: solo pasto y matas.
                }

                var siguiente = azar.NextDouble() * 6.0;
                var recorrido = 0.0;
                for (var i = 0; i < c.Count; i++)
                {
                    if (i > 0)
                    {
                        recorrido += Math.Sqrt((c[i].X - c[i - 1].X) * (c[i].X - c[i - 1].X) + (c[i].Y - c[i - 1].Y) * (c[i].Y - c[i - 1].Y));
                    }

                    if (recorrido < siguiente)
                    {
                        continue;
                    }

                    siguiente = recorrido + 9.0 + 4.0 * azar.NextDouble();
                    var p = c[i];
                    var hileras = p.Ancho > 8.0 ? new[] { -0.25, 0.25 } : new[] { 0.0 };
                    foreach (var h in hileras)
                    {
                        // A lo ancho, del lado izquierdo al derecho del eje.
                        var x = p.X - p.DirY * h * p.Ancho + (azar.NextDouble() - 0.5) * Math.Min(1.0, p.Ancho * 0.1);
                        var y = p.Y + p.DirX * h * p.Ancho + (azar.NextDouble() - 0.5) * Math.Min(1.0, p.Ancho * 0.1);
                        if (!Libre(x, y))
                        {
                            continue;
                        }

                        var jacaranda = azar.NextDouble() < 0.4;
                        nuevos.Add(new ArbolEscenario
                        {
                            X = x,
                            Y = y,
                            Z = 0,
                            AlturaM = 6.0 + 5.0 * azar.NextDouble(),
                            CopaM = 1.6 + 0.8 * azar.NextDouble(),
                            TroncoM = 2.6 + 0.8 * azar.NextDouble(),
                            RumboRad = azar.NextDouble() * 2.0 * Math.PI,
                            Tipo = 0,
                            Especie = jacaranda ? EspecieArbol.Jacaranda : EspecieArbol.Fresno,
                        });
                    }
                }
            }

            return nuevos;
        }

        /// <summary>Si (x, y) cae dentro de algún camellón, con `margen` metros de más.</summary>
        public static bool Dentro(List<List<Punto>> camellones, double x, double y, double margen = 0.0)
        {
            foreach (var c in camellones)
            {
                for (var i = 0; i + 1 < c.Count; i++)
                {
                    var a = c[i];
                    var b = c[i + 1];
                    var lx = b.X - a.X;
                    var ly = b.Y - a.Y;
                    var l2 = lx * lx + ly * ly;
                    var t = l2 > 0 ? Math.Max(0, Math.Min(1, ((x - a.X) * lx + (y - a.Y) * ly) / l2)) : 0;
                    var qx = a.X + t * lx - x;
                    var qy = a.Y + t * ly - y;
                    var ancho = a.Ancho + t * (b.Ancho - a.Ancho);
                    if (Math.Sqrt(qx * qx + qy * qy) <= ancho / 2.0 + margen)
                    {
                        return true;
                    }
                }
            }

            return false;
        }

        private static void Cerrar(List<List<Punto>> salida, List<Punto> tramo)
        {
            // Un solo punto no hace franja; dos (6 m) ya es un remate de camellón.
            if (tramo.Count >= 2)
            {
                salida.Add(tramo);
            }
        }

        /// <summary>
        /// La calzada de enfrente de un punto del eje de `a` y el centro del camellón entre las dos, o nulo.
        /// La pareja se toma una sola vez (la de id menor), para no dibujar dos veces el mismo camellón.
        /// </summary>
        private static Punto? Frente(ViaElement a, double anchoA, double px, double py, double dx, double dy, List<ViaElement> cuerpos, double anchoCarril)
        {
            Punto? mejor = null;
            var menor = double.PositiveInfinity;
            foreach (var b in cuerpos)
            {
                if (ReferenceEquals(a, b) || (!string.IsNullOrWhiteSpace(a.Nombre) && !string.IsNullOrWhiteSpace(b.Nombre) && a.Nombre != b.Nombre))
                {
                    continue;
                }

                for (var i = 0; i + 1 < b.Puntos.Length; i++)
                {
                    var q0 = b.Puntos[i];
                    var q1 = b.Puntos[i + 1];
                    var lx = q1.X - q0.X;
                    var ly = q1.Y - q0.Y;
                    var l = Math.Sqrt(lx * lx + ly * ly);
                    if (l < 1e-6 || (dx * lx + dy * ly) / l > -0.85)
                    {
                        continue; // Solo la que va en sentido contrario, casi paralela.
                    }

                    var t = Math.Max(0, Math.Min(1, ((px - q0.X) * lx + (py - q0.Y) * ly) / (l * l)));
                    var qx = q0.X + t * lx;
                    var qy = q0.Y + t * ly;
                    var d = Math.Sqrt((qx - px) * (qx - px) + (qy - py) * (qy - py));
                    // Fuera de las puntas de la otra calzada no hay frente.
                    if (d >= menor || d > SeparacionMaximaM || (t <= 0.0 && i == 0) || (t >= 1.0 && i + 2 >= b.Puntos.Length))
                    {
                        continue;
                    }

                    var anchoB = AnchoDe(b, anchoCarril);
                    var ancho = d - anchoA / 2.0 - anchoB / 2.0;
                    menor = d;
                    if (ancho < AnchoMinimoM || a.IdOsm > b.IdOsm)
                    {
                        mejor = null;
                        continue;
                    }

                    // Entre la orilla de adentro de cada calzada.
                    var ux = (qx - px) / d;
                    var uy = (qy - py) / d;
                    var desde = anchoA / 2.0;
                    mejor = new Punto
                    {
                        X = px + ux * (desde + ancho / 2.0),
                        Y = py + uy * (desde + ancho / 2.0),
                        DirX = dx,
                        DirY = dy,
                        Ancho = ancho,
                    };
                }
            }

            return mejor;
        }

        /// <summary>Si otra calle (que no es ninguno de los dos cuerpos) pasa por el camellón ahí.</summary>
        private static bool Cruzado(Punto p, ViaElement[] vias, ViaElement a)
        {
            foreach (var v in vias)
            {
                if (v?.Puntos == null || ReferenceEquals(v, a) || (v.Nombre != null && v.Nombre == a.Nombre && v.UnSentido == true))
                {
                    continue;
                }

                for (var i = 0; i + 1 < v.Puntos.Length; i++)
                {
                    var q0 = v.Puntos[i];
                    var q1 = v.Puntos[i + 1];
                    var lx = q1.X - q0.X;
                    var ly = q1.Y - q0.Y;
                    var l2 = lx * lx + ly * ly;
                    if (l2 < 1e-9)
                    {
                        continue;
                    }

                    // Solo las que lo atraviesan: casi paralelas (las laterales) no cortan nada.
                    var cos = Math.Abs(lx * p.DirX + ly * p.DirY) / Math.Sqrt(l2);
                    if (cos > 0.7)
                    {
                        continue;
                    }

                    var t = Math.Max(0, Math.Min(1, ((p.X - q0.X) * lx + (p.Y - q0.Y) * ly) / l2));
                    var ex = q0.X + t * lx - p.X;
                    var ey = q0.Y + t * ly - p.Y;
                    if (Math.Sqrt(ex * ex + ey * ey) < Math.Max(4.0, p.Ancho / 2.0 + 2.0) && t > 0.0 && t < 1.0)
                    {
                        return true;
                    }
                }
            }

            return false;
        }

        /// <summary>Puntos cada `PasoM` sobre una polilínea, con la dirección de su tramo.</summary>
        private static IEnumerable<(double X, double Y, double Dx, double Dy)> Muestras(Posicion[] puntos)
        {
            for (var i = 0; i + 1 < puntos.Length; i++)
            {
                var lx = puntos[i + 1].X - puntos[i].X;
                var ly = puntos[i + 1].Y - puntos[i].Y;
                var l = Math.Sqrt(lx * lx + ly * ly);
                if (l < 1e-6)
                {
                    continue;
                }

                for (var s = 0.0; s < l; s += PasoM)
                {
                    yield return (puntos[i].X + lx * s / l, puntos[i].Y + ly * s / l, lx / l, ly / l);
                }
            }
        }

        private static double Distancia(Punto a, Punto b)
        {
            return Math.Sqrt((a.X - b.X) * (a.X - b.X) + (a.Y - b.Y) * (a.Y - b.Y));
        }
    }
}
