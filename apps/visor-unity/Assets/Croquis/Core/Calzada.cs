using System;
using System.Collections.Generic;
using Croquis.Generated;

namespace Croquis.Core
{
    /// <summary>
    /// Nada procedural en medio de la carretera (revisión del 2026-11-26): las señales, postes, árboles y
    /// luminarias del entorno que el plan dejó dentro de la calzada (`escenario.via`, capa `calzada`) se
    /// llevan a la orilla más cercana, o se quitan si no hay orilla a menos de 30 m. Los objetos del caso (`resultado.objetos`) no se tocan: son
    /// evidencia y van donde los puso el perito.
    /// </summary>
    public static class Calzada
    {
        /// <summary>Qué tan adentro tiene que estar un punto para contar como «en medio» (m).</summary>
        public const double Margen = 0.6;

        /// <summary>Cuánto más allá de la orilla queda lo que se mueve (m).</summary>
        public const double Holgura = 0.8;

        /// <summary>Hasta dónde se busca la orilla (m); en un cruce enorme puede no haber, y entonces se quita.</summary>
        public const double Busqueda = 30.0;

        private sealed class Triangulos
        {
            public readonly List<(double Ax, double Ay, double Bx, double By, double Cx, double Cy, double X0, double Y0, double X1, double Y1)> Lista =
                new List<(double, double, double, double, double, double, double, double, double, double)>();

            public bool Dentro(double x, double y)
            {
                foreach (var t in Lista)
                {
                    if (x < t.X0 || x > t.X1 || y < t.Y0 || y > t.Y1)
                    {
                        continue;
                    }

                    var d1 = (x - t.Bx) * (t.Ay - t.By) - (t.Ax - t.Bx) * (y - t.By);
                    var d2 = (x - t.Cx) * (t.By - t.Cy) - (t.Bx - t.Cx) * (y - t.Cy);
                    var d3 = (x - t.Ax) * (t.Cy - t.Ay) - (t.Cx - t.Ax) * (y - t.Ay);
                    var neg = d1 < 0 || d2 < 0 || d3 < 0;
                    var pos = d1 > 0 || d2 > 0 || d3 > 0;
                    if (!(neg && pos))
                    {
                        return true;
                    }
                }

                return false;
            }
        }

        /// <summary>Si (x, y) está en medio de la calzada: dentro, y también a `Margen` en las cuatro direcciones.</summary>
        private static bool EnMedio(Triangulos t, double x, double y)
        {
            return t.Dentro(x + Margen, y) && t.Dentro(x - Margen, y) && t.Dentro(x, y + Margen) && t.Dentro(x, y - Margen);
        }

        /// <summary>La orilla más cercana (con `Holgura` de más), o nulo si no hay a menos de `Busqueda` m.</summary>
        private static (double X, double Y)? Orilla(Triangulos t, double x, double y)
        {
            for (var r = 0.5; r <= Busqueda; r += 0.5)
            {
                for (var k = 0; k < 16; k++)
                {
                    var a = k * Math.PI / 8.0;
                    var px = x + Math.Cos(a) * r;
                    var py = y + Math.Sin(a) * r;
                    if (!t.Dentro(px, py))
                    {
                        return (x + Math.Cos(a) * (r + Holgura), y + Math.Sin(a) * (r + Holgura));
                    }
                }
            }

            return null;
        }

        /// <summary>Lleva a la orilla (o quita) lo procedural que quedó en medio de la calzada; devuelve cuántos.</summary>
        public static int Despejar(Escenario e)
        {
            var t = new Triangulos();
            foreach (var capa in e?.Via?.Capas ?? new CapaEscenario[0])
            {
                if (capa.Nombre != NombreCapa.Calzada || capa.Posiciones == null || capa.Indices == null)
                {
                    continue;
                }

                var p = capa.Posiciones;
                var i = capa.Indices;
                for (var k = 0; k + 2 < i.Length; k += 3)
                {
                    double ax = p[2 * i[k]], ay = p[2 * i[k] + 1], bx = p[2 * i[k + 1]], by = p[2 * i[k + 1] + 1], cx = p[2 * i[k + 2]], cy = p[2 * i[k + 2] + 1];
                    t.Lista.Add((ax, ay, bx, by, cx, cy, Math.Min(ax, Math.Min(bx, cx)), Math.Min(ay, Math.Min(by, cy)), Math.Max(ax, Math.Max(bx, cx)), Math.Max(ay, Math.Max(by, cy))));
                }
            }

            if (t.Lista.Count == 0 || e.Entorno == null)
            {
                return 0;
            }

            var movidos = 0;
            // Lo lleva a la orilla; si no hay orilla cerca (en medio de un cruce enorme), dice que se quite.
            bool Quedarse(double x, double y, Action<double, double> poner)
            {
                if (!EnMedio(t, x, y))
                {
                    return true;
                }

                movidos++;
                var o = Orilla(t, x, y);
                if (!o.HasValue)
                {
                    return false;
                }

                poner(o.Value.X, o.Value.Y);
                return true;
            }

            var en = e.Entorno;
            en.Senales = Array.FindAll(en.Senales ?? new SenalEscenario[0], s => Quedarse(s.X, s.Y, (x, y) => { s.X = x; s.Y = y; }));
            en.Postes = Array.FindAll(en.Postes ?? new PosteEscenario[0], s => Quedarse(s.X, s.Y, (x, y) => { s.X = x; s.Y = y; }));
            en.Arboles = Array.FindAll(en.Arboles ?? new ArbolEscenario[0], s => Quedarse(s.X, s.Y, (x, y) => { s.X = x; s.Y = y; }));
            e.Luminarias = Array.FindAll(e.Luminarias ?? new LuminariaEscenario[0], s => Quedarse(s.X, s.Y, (x, y) => { s.X = x; s.Y = y; }));
            return movidos;
        }
    }
}
