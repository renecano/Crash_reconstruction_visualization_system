using System;
using System.Collections.Generic;
using Croquis.Generated;

namespace Croquis.Core
{
    /// <summary>
    /// Nada procedural sobre la vía (revisión del 2026-11-26; René, 2026-11-27: en AXA la cerca de alambre
    /// atravesaba los carriles). Ningún objeto que puso el plan del entorno puede tocar la calzada ni el
    /// acotamiento (`escenario.via`, capas `calzada` y `acotamiento`):
    /// - las señales, los postes, las luminarias y los árboles se llevan a la orilla más cercana, o se
    ///   quitan si no hay orilla a menos de 30 m;
    /// - las cercas (postes y alambre) se cortan donde cruzan una vía: quedan los tramos de fuera;
    /// - los edificios y bardas que la tocan se quitan.
    /// Los objetos del caso (`resultado.objetos`) no se tocan: son evidencia y van donde los puso el perito.
    /// </summary>
    public static class Calzada
    {
        /// <summary>Cuánto más allá de la orilla queda lo que se mueve (m).</summary>
        public const double Holgura = 0.5;

        /// <summary>Hasta dónde se busca la orilla (m); en un cruce enorme puede no haber, y entonces se quita.</summary>
        public const double Busqueda = 30.0;

        /// <summary>El radio de lo que ocupa en el piso un poste, una señal o una luminaria (m).</summary>
        public const double RadioPoste = 0.3;

        /// <summary>El de un árbol: el tronco y el arranque de las raíces (m).</summary>
        public const double RadioArbol = 0.5;

        /// <summary>El tramo de cerca más corto que vale la pena dibujar (m).</summary>
        public const double CercaMinima = 1.5;

        private const double Celda = 4.0;

        /// <summary>Cuánto adentro de la vía tiene que estar una defensa para cortarla (m): en la orilla, se queda.</summary>
        public const double MargenBarrera = 0.4;

        /// <summary>Los triángulos de la vía, con una rejilla de 4 m para buscar rápido.</summary>
        public sealed class Via
        {
            private readonly List<(double Ax, double Ay, double Bx, double By, double Cx, double Cy, double X0, double Y0, double X1, double Y1)> lista =
                new List<(double, double, double, double, double, double, double, double, double, double)>();

            private readonly Dictionary<(long, long), List<int>> rejilla = new Dictionary<(long, long), List<int>>();

            public int Triangulos => lista.Count;

            public static Via De(Escenario e)
            {
                return De(e?.Via);
            }

            public static Via De(ViaEscenario via)
            {
                var v = new Via();
                foreach (var capa in via?.Capas ?? new CapaEscenario[0])
                {
                    if ((capa.Nombre != NombreCapa.Calzada && capa.Nombre != NombreCapa.Acotamiento) || capa.Posiciones == null || capa.Indices == null)
                    {
                        continue;
                    }

                    var p = capa.Posiciones;
                    var i = capa.Indices;
                    for (var k = 0; k + 2 < i.Length; k += 3)
                    {
                        v.Agregar(p[2 * i[k]], p[2 * i[k] + 1], p[2 * i[k + 1]], p[2 * i[k + 1] + 1], p[2 * i[k + 2]], p[2 * i[k + 2] + 1]);
                    }
                }

                return v;
            }

            private void Agregar(double ax, double ay, double bx, double by, double cx, double cy)
            {
                var t = (ax, ay, bx, by, cx, cy, Math.Min(ax, Math.Min(bx, cx)), Math.Min(ay, Math.Min(by, cy)), Math.Max(ax, Math.Max(bx, cx)), Math.Max(ay, Math.Max(by, cy)));
                lista.Add(t);
                for (var gx = (long)Math.Floor(t.Item7 / Celda); gx <= (long)Math.Floor(t.Item9 / Celda); gx++)
                {
                    for (var gy = (long)Math.Floor(t.Item8 / Celda); gy <= (long)Math.Floor(t.Item10 / Celda); gy++)
                    {
                        if (!rejilla.TryGetValue((gx, gy), out var l))
                        {
                            rejilla[(gx, gy)] = l = new List<int>();
                        }

                        l.Add(lista.Count - 1);
                    }
                }
            }

            /// <summary>Si el punto cae sobre la calzada o el acotamiento.</summary>
            public bool Dentro(double x, double y)
            {
                if (!rejilla.TryGetValue(((long)Math.Floor(x / Celda), (long)Math.Floor(y / Celda)), out var l))
                {
                    return false;
                }

                foreach (var k in l)
                {
                    var t = lista[k];
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

            /// <summary>Si un disco de radio r (un poste, un tronco) toca la vía: su centro y 8 puntos de su orilla.</summary>
            public bool TocaDisco(double x, double y, double r)
            {
                if (Dentro(x, y))
                {
                    return true;
                }

                for (var k = 0; k < 8; k++)
                {
                    var a = k * Math.PI / 4.0;
                    if (Dentro(x + Math.Cos(a) * r, y + Math.Sin(a) * r))
                    {
                        return true;
                    }
                }

                return false;
            }

            /// <summary>Si un rectángulo (centro, eje largo con rumbo, medidas) toca la vía: una rejilla de puntos a menos de 1 m.</summary>
            public bool TocaRectangulo(double cx, double cy, double rumbo, double largo, double fondo)
            {
                var c = Math.Cos(rumbo);
                var s = Math.Sin(rumbo);
                var nu = Math.Max(1, (int)Math.Ceiling(largo / 1.0));
                var nv = Math.Max(1, (int)Math.Ceiling(fondo / 1.0));
                for (var i = 0; i <= nu; i++)
                {
                    for (var j = 0; j <= nv; j++)
                    {
                        var u = -largo / 2.0 + largo * i / nu;
                        var v = -fondo / 2.0 + fondo * j / nv;
                        if (Dentro(cx + u * c - v * s, cy + u * s + v * c))
                        {
                            return true;
                        }
                    }
                }

                return false;
            }

            /// <summary>Si un tramo toca la vía, cada 25 cm y con el grueso de un poste.</summary>
            public bool TocaTramo(double ax, double ay, double bx, double by)
            {
                var largo = Math.Sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay));
                var n = Math.Max(1, (int)Math.Ceiling(largo / 0.25));
                for (var k = 0; k <= n; k++)
                {
                    if (TocaDisco(ax + (bx - ax) * k / n, ay + (by - ay) * k / n, 0.1))
                    {
                        return true;
                    }
                }

                return false;
            }

            /// <summary>El lugar libre más cercano para un disco de radio r (con `Holgura`), o nulo si no hay a menos de `Busqueda` m.</summary>
            public (double X, double Y)? Orilla(double x, double y, double r)
            {
                for (var d = 0.5; d <= Busqueda; d += 0.5)
                {
                    for (var k = 0; k < 16; k++)
                    {
                        var a = k * Math.PI / 8.0;
                        var px = x + Math.Cos(a) * d;
                        var py = y + Math.Sin(a) * d;
                        if (!TocaDisco(px, py, r + Holgura))
                        {
                            return (px, py);
                        }
                    }
                }

                return null;
            }

            /// <summary>Si un punto está metido en la vía: dentro y también a `MargenBarrera` en las cuatro direcciones.</summary>
            public bool EnMedio(double x, double y)
            {
                return Dentro(x, y) && Dentro(x + MargenBarrera, y) && Dentro(x - MargenBarrera, y) && Dentro(x, y + MargenBarrera) && Dentro(x, y - MargenBarrera);
            }

            /// <summary>
            /// Los pedazos de una defensa que no se meten en la vía (cada uno de `CercaMinima` o más). Una defensa
            /// va en la orilla y puede tocarla; lo que se corta es lo que cruza los carriles.
            /// </summary>
            public List<List<PuntoPlano>> CortarBarrera(PuntoPlano[] linea) => CortarLinea(linea, EnMedio);

            /// <summary>Si una defensa se mete en la vía en algún punto (cada 25 cm).</summary>
            public bool BarreraEnMedio(PuntoPlano[] linea)
            {
                for (var i = 0; i + 1 < (linea?.Length ?? 0); i++)
                {
                    var a = linea[i];
                    var b = linea[i + 1];
                    var l = Math.Sqrt((b.X - a.X) * (b.X - a.X) + (b.Y - a.Y) * (b.Y - a.Y));
                    var n = Math.Max(1, (int)Math.Ceiling(l / 0.25));
                    for (var k = 0; k <= n; k++)
                    {
                        if (EnMedio(a.X + (b.X - a.X) * k / n, a.Y + (b.Y - a.Y) * k / n))
                        {
                            return true;
                        }
                    }
                }

                return false;
            }

            /// <summary>Los tramos de una cerca que quedan fuera de la vía (cada uno de `CercaMinima` o más).</summary>
            public List<(double Ax, double Ay, double Bx, double By)> Cortar(double ax, double ay, double bx, double by)
            {
                var tramos = new List<(double, double, double, double)>();
                var largo = Math.Sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay));
                var n = Math.Max(1, (int)Math.Ceiling(largo / 0.25));
                var inicio = -1;
                for (var k = 0; k <= n + 1; k++)
                {
                    var libre = k <= n && !TocaDisco(ax + (bx - ax) * k / n, ay + (by - ay) * k / n, Holgura);
                    if (libre && inicio < 0)
                    {
                        inicio = k;
                    }
                    else if (!libre && inicio >= 0)
                    {
                        var fin = k - 1;
                        if (largo * (fin - inicio) / n >= CercaMinima)
                        {
                            tramos.Add((ax + (bx - ax) * inicio / n, ay + (by - ay) * inicio / n, ax + (bx - ax) * fin / n, ay + (by - ay) * fin / n));
                        }

                        inicio = -1;
                    }
                }

                return tramos;
            }
        }

        /// <summary>
        /// Lo procedural que toca la calzada o el acotamiento, como «tipo (x, y)». Vacío si nada. Es la medida
        /// de la prueba: después de `Despejar` debe quedar vacío en todo paquete.
        /// </summary>
        public static List<string> Invasores(Escenario e)
        {
            var lista = new List<string>();
            var v = Via.De(e);
            if (v.Triangulos == 0)
            {
                return lista;
            }

            var en = e.Entorno;
            void Disco(string que, double x, double y, double r)
            {
                if (v.TocaDisco(x, y, r))
                {
                    lista.Add(que + " (" + x.ToString("0.0") + ", " + y.ToString("0.0") + ")");
                }
            }

            foreach (var s in en?.Senales ?? new SenalEscenario[0])
            {
                Disco("señal", s.X, s.Y, RadioPoste);
            }

            foreach (var s in en?.Postes ?? new PosteEscenario[0])
            {
                Disco("poste", s.X, s.Y, RadioPoste);
            }

            foreach (var s in en?.Arboles ?? new ArbolEscenario[0])
            {
                Disco("árbol", s.X, s.Y, RadioArbol);
            }

            foreach (var s in e.Luminarias ?? new LuminariaEscenario[0])
            {
                Disco("luminaria", s.X, s.Y, RadioPoste);
            }

            foreach (var c in en?.Cercas ?? new SegmentoPlano[0])
            {
                if (v.TocaTramo(c.Ax, c.Ay, c.Bx, c.By))
                {
                    lista.Add("cerca (" + c.Ax.ToString("0.0") + ", " + c.Ay.ToString("0.0") + ") → (" + c.Bx.ToString("0.0") + ", " + c.By.ToString("0.0") + ")");
                }
            }

            foreach (var linea in e.Via?.Barreras ?? new PuntoPlano[0][])
            {
                if (v.BarreraEnMedio(linea))
                {
                    lista.Add("defensa (" + linea[0].X.ToString("0.0") + ", " + linea[0].Y.ToString("0.0") + ")");
                }
            }

            foreach (var b in en?.Edificios ?? new EdificioEscenario[0])
            {
                if (v.TocaRectangulo(b.X, b.Y, b.RumboRad, b.LargoM, b.FondoM))
                {
                    lista.Add("edificio (" + b.X.ToString("0.0") + ", " + b.Y.ToString("0.0") + ")");
                }
            }

            return lista;
        }

        /// <summary>Lleva a la orilla, corta o quita lo procedural que toca la vía; devuelve cuántos objetos cambió.</summary>
        /// <summary>
        /// Los pedazos de una línea (cada 25 cm) que quedan fuera de lo que marca `quitar`, cada uno de
        /// `CercaMinima` o más.
        /// </summary>
        public static List<List<PuntoPlano>> CortarLinea(PuntoPlano[] linea, Func<double, double, bool> quitar)
        {
            var pedazos = new List<List<PuntoPlano>>();
            var actual = new List<PuntoPlano>();
            var largo = 0.0;
            void Cerrar()
            {
                if (actual.Count >= 2 && largo >= CercaMinima)
                {
                    pedazos.Add(actual);
                }

                actual = new List<PuntoPlano>();
                largo = 0.0;
            }

            for (var i = 0; i + 1 < (linea?.Length ?? 0); i++)
            {
                var a = linea[i];
                var b = linea[i + 1];
                var l = Math.Sqrt((b.X - a.X) * (b.X - a.X) + (b.Y - a.Y) * (b.Y - a.Y));
                var n = Math.Max(1, (int)Math.Ceiling(l / 0.25));
                for (var k = i == 0 ? 0 : 1; k <= n; k++)
                {
                    var x = a.X + (b.X - a.X) * k / n;
                    var y = a.Y + (b.Y - a.Y) * k / n;
                    if (quitar(x, y))
                    {
                        Cerrar();
                        continue;
                    }

                    if (actual.Count > 0)
                    {
                        var q = actual[actual.Count - 1];
                        largo += Math.Sqrt((x - q.X) * (x - q.X) + (y - q.Y) * (y - q.Y));
                    }

                    actual.Add(new PuntoPlano { X = x, Y = y });
                }
            }

            Cerrar();
            return pedazos;
        }

        /// <summary>Lo que recorre un vehículo del caso en planta y su medio ancho con holgura.</summary>
        public sealed class Recorrido
        {
            public double[] X = new double[0];
            public double[] Y = new double[0];
            public double Medio;
        }

        /// <summary>Cuánto se agrega al medio ancho del vehículo: la defensa no roza el coche que pasa.</summary>
        public const double HolguraRecorrido = 0.5;

        /// <summary>La distancia del punto al recorrido.</summary>
        private static double AlRecorrido(Recorrido r, double x, double y)
        {
            var mejor = double.MaxValue;
            for (var i = 0; i + 1 < r.X.Length; i++)
            {
                var dx = r.X[i + 1] - r.X[i];
                var dy = r.Y[i + 1] - r.Y[i];
                var l2 = dx * dx + dy * dy;
                var t = l2 > 0 ? Math.Max(0, Math.Min(1, ((x - r.X[i]) * dx + (y - r.Y[i]) * dy) / l2)) : 0;
                var ex = x - r.X[i] - t * dx;
                var ey = y - r.Y[i] - t * dy;
                mejor = Math.Min(mejor, Math.Sqrt(ex * ex + ey * ey));
            }

            return r.X.Length == 1 ? Math.Sqrt((x - r.X[0]) * (x - r.X[0]) + (y - r.Y[0]) * (y - r.Y[0])) : mejor;
        }

        /// <summary>
        /// Las defensas se cortan donde pasa un vehículo del caso: el visor no lo pone atravesando una
        /// (René, 2026-11-27: en Paseo Matlatzincas el coche cruzaba la defensa para llegar al árbol). Las
        /// defensas son del mapa, no evidencia; las del caso (`objetos`) no se tocan. Devuelve cuántas cortó.
        /// </summary>
        public static int AbrirPasoEnBarreras(Escenario e, IReadOnlyList<Recorrido> recorridos)
        {
            if (e?.Via?.Barreras == null || recorridos == null || recorridos.Count == 0)
            {
                return 0;
            }

            bool EnPaso(double x, double y)
            {
                foreach (var r in recorridos)
                {
                    if (AlRecorrido(r, x, y) <= r.Medio)
                    {
                        return true;
                    }
                }

                return false;
            }

            var cortadas = 0;
            var barreras = new List<PuntoPlano[]>();
            foreach (var linea in e.Via.Barreras)
            {
                var toca = false;
                for (var i = 0; i + 1 < (linea?.Length ?? 0) && !toca; i++)
                {
                    var a = linea[i];
                    var b = linea[i + 1];
                    var n = Math.Max(1, (int)Math.Ceiling(Math.Sqrt((b.X - a.X) * (b.X - a.X) + (b.Y - a.Y) * (b.Y - a.Y)) / 0.25));
                    for (var k = 0; k <= n && !toca; k++)
                    {
                        toca = EnPaso(a.X + (b.X - a.X) * k / n, a.Y + (b.Y - a.Y) * k / n);
                    }
                }

                if (!toca)
                {
                    barreras.Add(linea);
                    continue;
                }

                cortadas++;
                foreach (var pedazo in CortarLinea(linea, EnPaso))
                {
                    barreras.Add(pedazo.ToArray());
                }
            }

            e.Via.Barreras = barreras.ToArray();
            return cortadas;
        }

        public static int Despejar(Escenario e)
        {
            var v = Via.De(e);
            if (v.Triangulos == 0 || e == null)
            {
                return 0;
            }

            var cambiados = 0;
            // Lo lleva a la orilla; si no hay orilla cerca (en medio de un cruce enorme), dice que se quite.
            bool Quedarse(double x, double y, double r, Action<double, double> poner)
            {
                if (!v.TocaDisco(x, y, r))
                {
                    return true;
                }

                cambiados++;
                var o = v.Orilla(x, y, r);
                if (!o.HasValue)
                {
                    return false;
                }

                poner(o.Value.X, o.Value.Y);
                return true;
            }

            if (e.Entorno != null)
            {
                var en = e.Entorno;
                en.Senales = Array.FindAll(en.Senales ?? new SenalEscenario[0], s => Quedarse(s.X, s.Y, RadioPoste, (x, y) => { s.X = x; s.Y = y; }));
                en.Postes = Array.FindAll(en.Postes ?? new PosteEscenario[0], s => Quedarse(s.X, s.Y, RadioPoste, (x, y) => { s.X = x; s.Y = y; }));
                en.Arboles = Array.FindAll(en.Arboles ?? new ArbolEscenario[0], s => Quedarse(s.X, s.Y, RadioArbol, (x, y) => { s.X = x; s.Y = y; }));
                e.Luminarias = Array.FindAll(e.Luminarias ?? new LuminariaEscenario[0], s => Quedarse(s.X, s.Y, RadioPoste, (x, y) => { s.X = x; s.Y = y; }));

                // Las cercas se cortan donde cruzan una vía, nunca la atraviesan.
                var cercas = new List<SegmentoPlano>();
                foreach (var c in en.Cercas ?? new SegmentoPlano[0])
                {
                    if (!v.TocaTramo(c.Ax, c.Ay, c.Bx, c.By))
                    {
                        cercas.Add(c);
                        continue;
                    }

                    cambiados++;
                    foreach (var t in v.Cortar(c.Ax, c.Ay, c.Bx, c.By))
                    {
                        cercas.Add(new SegmentoPlano { Ax = t.Ax, Ay = t.Ay, Bx = t.Bx, By = t.By });
                    }
                }

                en.Cercas = cercas.ToArray();

                // Un edificio o una barda sobre la vía no se puede mover sin chocar con otro lote: se quita.
                en.Edificios = Array.FindAll(en.Edificios ?? new EdificioEscenario[0], b =>
                {
                    var toca = v.TocaRectangulo(b.X, b.Y, b.RumboRad, b.LargoM, b.FondoM);
                    cambiados += toca ? 1 : 0;
                    return !toca;
                });
            }

            // Las defensas (guardarrieles) se cortan donde cruzan los carriles; en la orilla se quedan
            // (René, 2026-11-27: en Paseo Matlatzincas sus postes quedaban en medio de los carriles).
            if (e.Via?.Barreras != null)
            {
                var barreras = new List<PuntoPlano[]>();
                foreach (var linea in e.Via.Barreras)
                {
                    if (!v.BarreraEnMedio(linea))
                    {
                        barreras.Add(linea);
                        continue;
                    }

                    cambiados++;
                    foreach (var pedazo in v.CortarBarrera(linea))
                    {
                        barreras.Add(pedazo.ToArray());
                    }
                }

                e.Via.Barreras = barreras.ToArray();
            }

            return cambiados;
        }
    }
}
