using System.Collections.Generic;
using Croquis.Generated;
using UnityEngine;

namespace Croquis.Visor
{
    /// <summary>
    /// Lo que tiene una carretera además de la vía (segunda pasada de U2, punto 5; ADR 0113): la orilla
    /// de grava fuera del acotamiento, las vialetas sobre las rayas, los reflejantes de la defensa, los
    /// fantasmas donde no hay defensa, el señalamiento genérico (sin texto real) y los matorrales.
    ///
    /// Solo hay carretera si la vía trae acotamiento. Todo sale de la geometría que ya calculó TS y de
    /// la semilla de la escena: nada de esto es dato del caso, y nada cae dentro del claro del hecho.
    /// </summary>
    public static class CarreteraVista
    {
        /// <summary>Una orilla del acotamiento: un tramo recto con su normal hacia afuera de la vía.</summary>
        private struct Orilla
        {
            public Vector2 A;
            public Vector2 B;
            public Vector2 Afuera;
            public bool Mediana;

            public float Largo => (B - A).magnitude;
            public Vector2 Dir => (B - A).normalized;

            /// <summary>Hacia dónde va el tránsito junto a esta orilla: en México se circula por la
            /// derecha, así que la orilla queda a la derecha de quien maneja.</summary>
            public Vector2 Transito
            {
                get
                {
                    // A la derecha de (tx, ty) está (ty, -tx); se busca t con esa derecha = afuera.
                    return new Vector2(-Afuera.y, Afuera.x);
                }
            }
        }

        private sealed class Triangulos
        {
            private readonly List<Vector2> a = new List<Vector2>();
            private readonly List<Vector2> b = new List<Vector2>();
            private readonly List<Vector2> c = new List<Vector2>();

            public Triangulos(CapaEscenario capa)
            {
                if (capa == null)
                {
                    return;
                }

                for (var t = 0; t + 2 < capa.Indices.Length; t += 3)
                {
                    a.Add(Vertice(capa, capa.Indices[t]));
                    b.Add(Vertice(capa, capa.Indices[t + 1]));
                    c.Add(Vertice(capa, capa.Indices[t + 2]));
                }
            }

            public bool Contiene(Vector2 p)
            {
                for (var i = 0; i < a.Count; i++)
                {
                    if (Dentro(p, a[i], b[i], c[i]))
                    {
                        return true;
                    }
                }

                return false;
            }

            private static bool Dentro(Vector2 p, Vector2 a, Vector2 b, Vector2 c)
            {
                float Lado(Vector2 u, Vector2 v, Vector2 w) => (v.x - u.x) * (w.y - u.y) - (v.y - u.y) * (w.x - u.x);
                var d1 = Lado(a, b, p);
                var d2 = Lado(b, c, p);
                var d3 = Lado(c, a, p);
                var neg = d1 < 0f || d2 < 0f || d3 < 0f;
                var pos = d1 > 0f || d2 > 0f || d3 > 0f;
                return !(neg && pos);
            }
        }

        private static Vector2 Vertice(CapaEscenario c, long i)
        {
            return new Vector2((float)c.Posiciones[2 * i], (float)c.Posiciones[2 * i + 1]);
        }

        private static CapaEscenario Capa(ViaEscenario v, NombreCapa nombre)
        {
            foreach (var c in v.Capas)
            {
                if (c.Nombre == nombre)
                {
                    return c;
                }
            }

            return null;
        }

        public static void Construir(Transform padre, ViaEscenario v, AmbienteEscenario a, Terreno terreno, long semilla)
        {
            var acotamiento = Capa(v, NombreCapa.Acotamiento);
            if (acotamiento == null || acotamiento.Indices.Length < 3)
            {
                return;
            }

            var raiz = new GameObject("carretera").transform;
            raiz.SetParent(padre, false);
            var calzada = new Triangulos(Capa(v, NombreCapa.Calzada));
            var orillas = Orillas(acotamiento, calzada);
            var centro = EscenarioVista.CentroDelHecho;
            var claro = EscenarioVista.ClaroDelHecho;

            OrillaDeGrava(raiz, orillas, terreno);
            Vialetas(raiz, v, terreno, a.Noche, centro, claro);
            Reflejantes(raiz, v, orillas, terreno, a.Noche);
            Senalamiento(raiz, orillas, terreno, semilla, centro, claro);
            Matorrales(raiz, orillas, terreno, semilla, a.Noche, centro, claro);
        }

        // ---- Orillas del acotamiento ------------------------------------------------------------------

        /// <summary>
        /// Las orillas exteriores del acotamiento: las aristas de borde que tienen la calzada hacia
        /// adentro y no la tienen hacia afuera. Si del otro lado hay otra calzada a menos de 40 m, la
        /// orilla da a la mediana.
        /// </summary>
        private static List<Orilla> Orillas(CapaEscenario capa, Triangulos calzada)
        {
            var aristas = new Dictionary<long, (int veces, long a, long b, long tercero)>();
            void Arista(long p, long q, long r)
            {
                var llave = System.Math.Min(p, q) * 1000003L + System.Math.Max(p, q);
                aristas[llave] = aristas.TryGetValue(llave, out var x) ? (x.veces + 1, x.a, x.b, x.tercero) : (1, p, q, r);
            }

            for (var t = 0; t + 2 < capa.Indices.Length; t += 3)
            {
                var i0 = capa.Indices[t];
                var i1 = capa.Indices[t + 1];
                var i2 = capa.Indices[t + 2];
                Arista(i0, i1, i2);
                Arista(i1, i2, i0);
                Arista(i2, i0, i1);
            }

            var lista = new List<Orilla>();
            foreach (var x in aristas.Values)
            {
                if (x.veces != 1)
                {
                    continue;
                }

                var a = Vertice(capa, x.a);
                var b = Vertice(capa, x.b);
                var largo = (b - a).magnitude;
                if (largo < 0.5f)
                {
                    continue;
                }

                var d = (b - a) / largo;
                var n = new Vector2(-d.y, d.x);
                var m = (a + b) / 2f;
                if (Vector2.Dot(n, Vertice(capa, x.tercero) - m) > 0f)
                {
                    n = -n;
                }

                // Hacia adentro, pasando el acotamiento, tiene que estar la calzada.
                var adentro = false;
                for (var s = 0.6f; s <= 8f && !adentro; s += 0.6f)
                {
                    adentro = calzada.Contiene(m - n * s);
                }

                if (!adentro || calzada.Contiene(m + n * 0.3f))
                {
                    continue;
                }

                var mediana = false;
                for (var s = 2f; s <= 40f && !mediana; s += 2f)
                {
                    mediana = calzada.Contiene(m + n * s);
                }

                lista.Add(new Orilla { A = a, B = b, Afuera = n, Mediana = mediana });
            }

            return lista;
        }

        /// <summary>
        /// Una franja de grava junto al acotamiento y, más afuera, tierra suelta que se pierde en el
        /// pasto: el asfalto ya no corta en seco contra el prado.
        /// </summary>
        private static void OrillaDeGrava(Transform padre, List<Orilla> orillas, Terreno terreno)
        {
            var grava = new Malla();
            var tierra = new Malla();
            var mosaico = Materiales.Mosaico("grava");
            foreach (var o in orillas)
            {
                var pasos = Mathf.Max(1, Mathf.CeilToInt(o.Largo / 6f));
                for (var k = 0; k < pasos; k++)
                {
                    var p0 = Vector2.Lerp(o.A, o.B, k / (float)pasos);
                    var p1 = Vector2.Lerp(o.A, o.B, (k + 1) / (float)pasos);
                    var s0 = o.Largo * k / pasos;
                    var s1 = o.Largo * (k + 1) / pasos;
                    // El parche fino del suelo va 3 cm abajo de la vía: la grava, 1 cm abajo.
                    Franja(grava, terreno, p0, p1, o.Afuera, 0.02f, 0.95f, -0.01f, s0 / mosaico, s1 / mosaico, 0.93f / mosaico);
                    Franja(tierra, terreno, p0, p1, o.Afuera, 0.85f, 2.4f, -0.014f, s0 / 6f, s1 / 6f, 1f);
                }
            }

            grava.Poner(padre, "orilla_grava", Materiales.Pbr("grava", new Color(0.92f, 0.86f, 0.76f)), false);
            tierra.Poner(padre, "orilla_tierra", Materiales.OrillaDeTierra(), false);
        }

        private static void Franja(Malla m, Terreno terreno, Vector2 p0, Vector2 p1, Vector2 n, float desde, float hasta, float alto, float u0, float u1, float v1)
        {
            var i = m.Vertice(terreno.P(p0.x + n.x * desde, p0.y + n.y * desde, alto), new Vector2(u0, 0f));
            m.Vertice(terreno.P(p1.x + n.x * desde, p1.y + n.y * desde, alto), new Vector2(u1, 0f));
            m.Vertice(terreno.P(p1.x + n.x * hasta, p1.y + n.y * hasta, alto), new Vector2(u1, v1));
            m.Vertice(terreno.P(p0.x + n.x * hasta, p0.y + n.y * hasta, alto), new Vector2(u0, v1));
            // Vista desde arriba: el orden depende de hacia dónde queda «afuera».
            var cruz = (p1 - p0).x * n.y - (p1 - p0).y * n.x;
            if (cruz > 0f)
            {
                m.Triangulo(i, i + 2, i + 1);
                m.Triangulo(i, i + 3, i + 2);
            }
            else
            {
                m.Triangulo(i, i + 1, i + 2);
                m.Triangulo(i, i + 2, i + 3);
            }
        }

        // ---- Vialetas ----------------------------------------------------------------------------------

        private struct Pieza
        {
            public Vector2 Centro;
            public Vector2 Dir;
            public float Medio;
        }

        /// <summary>
        /// Vialetas: botones reflejantes sobre las rayas. En las rayas discontinuas va una a la mitad
        /// de cada espacio; en las continuas, una cada 12 m. Las rayas vienen en piezas de 1 m: se
        /// juntan por línea (mismo eje, a menos de 14 m) y se recorren en orden.
        /// </summary>
        private static void Vialetas(Transform padre, ViaEscenario v, Terreno terreno, bool noche, Vector2 centro, float claro)
        {
            var piezas = new List<Pieza>();
            foreach (var capa in v.Capas)
            {
                if (capa.Nombre != NombreCapa.RayasBlancas && capa.Nombre != NombreCapa.RayasAmarillas)
                {
                    continue;
                }

                // Cada pieza es un cuadro de 4 vértices propios.
                for (var t = 0; t + 5 < capa.Indices.Length; t += 6)
                {
                    var vs = new HashSet<long>
                    {
                        capa.Indices[t], capa.Indices[t + 1], capa.Indices[t + 2],
                        capa.Indices[t + 3], capa.Indices[t + 4], capa.Indices[t + 5],
                    };
                    if (vs.Count != 4)
                    {
                        continue;
                    }

                    var p = new List<Vector2>();
                    foreach (var i in vs)
                    {
                        p.Add(Vertice(capa, i));
                    }

                    var c = (p[0] + p[1] + p[2] + p[3]) / 4f;
                    // El eje largo: la arista más larga que sale del primer vértice, sin la diagonal.
                    var d1 = p[1] - p[0];
                    var d2 = p[2] - p[0];
                    var d3 = p[3] - p[0];
                    var lados = new List<Vector2> { d1, d2, d3 };
                    lados.Sort((x, y) => x.sqrMagnitude.CompareTo(y.sqrMagnitude));
                    var eje = lados[1];
                    if (eje.magnitude < 0.3f || lados[0].magnitude > 0.45f)
                    {
                        // Ni una raya ni una pieza de raya: flechas, letreros o restos.
                        continue;
                    }

                    piezas.Add(new Pieza { Centro = c, Dir = eje.normalized, Medio = eje.magnitude / 2f });
                }
            }

            if (piezas.Count == 0)
            {
                return;
            }

            // Líneas: piezas en el mismo eje (a menos de 15 cm de lado) y a menos de 14 m.
            var padres = new int[piezas.Count];
            for (var i = 0; i < padres.Length; i++)
            {
                padres[i] = i;
            }

            int Raiz(int x)
            {
                while (padres[x] != x)
                {
                    padres[x] = padres[padres[x]];
                    x = padres[x];
                }

                return x;
            }

            var celdas = new Dictionary<long, List<int>>();
            long Celda(int cx, int cy) => cx * 1000003L + cy;
            const float Lado = 15f;
            for (var i = 0; i < piezas.Count; i++)
            {
                var llave = Celda(Mathf.FloorToInt(piezas[i].Centro.x / Lado), Mathf.FloorToInt(piezas[i].Centro.y / Lado));
                if (!celdas.TryGetValue(llave, out var l))
                {
                    celdas[llave] = l = new List<int>();
                }

                l.Add(i);
            }

            for (var i = 0; i < piezas.Count; i++)
            {
                var pi = piezas[i];
                var cx = Mathf.FloorToInt(pi.Centro.x / Lado);
                var cy = Mathf.FloorToInt(pi.Centro.y / Lado);
                for (var dx = -1; dx <= 1; dx++)
                {
                    for (var dy = -1; dy <= 1; dy++)
                    {
                        if (!celdas.TryGetValue(Celda(cx + dx, cy + dy), out var l))
                        {
                            continue;
                        }

                        foreach (var j in l)
                        {
                            if (j <= i)
                            {
                                continue;
                            }

                            var pj = piezas[j];
                            var r = pj.Centro - pi.Centro;
                            var a = Vector2.Dot(r, pi.Dir);
                            var lado = Mathf.Abs(r.x * pi.Dir.y - r.y * pi.Dir.x);
                            if (Mathf.Abs(Vector2.Dot(pi.Dir, pj.Dir)) > 0.98f && lado < 0.15f && Mathf.Abs(a) < 14f)
                            {
                                padres[Raiz(i)] = Raiz(j);
                            }
                        }
                    }
                }
            }

            var lineas = new Dictionary<int, List<int>>();
            for (var i = 0; i < piezas.Count; i++)
            {
                var r = Raiz(i);
                if (!lineas.TryGetValue(r, out var l))
                {
                    lineas[r] = l = new List<int>();
                }

                l.Add(i);
            }

            var puntos = new List<(Vector2 p, Vector2 dir)>();
            foreach (var l in lineas.Values)
            {
                if (l.Count < 3)
                {
                    continue;
                }

                var dir = piezas[l[0]].Dir;
                var origen = piezas[l[0]].Centro;
                l.Sort((x, y) => Vector2.Dot(piezas[x].Centro - origen, dir).CompareTo(Vector2.Dot(piezas[y].Centro - origen, dir)));
                // Los tramos pintados, de punta a punta.
                var tramos = new List<(Vector2 a, Vector2 b)>();
                var ini = piezas[l[0]].Centro - dir * piezas[l[0]].Medio;
                var fin = piezas[l[0]].Centro + dir * piezas[l[0]].Medio;
                for (var k = 1; k < l.Count; k++)
                {
                    var p = piezas[l[k]];
                    var a = p.Centro - dir * p.Medio;
                    if (Vector2.Dot(a - fin, dir) > 0.4f)
                    {
                        tramos.Add((ini, fin));
                        ini = a;
                    }

                    fin = p.Centro + dir * p.Medio;
                }

                tramos.Add((ini, fin));
                for (var k = 0; k < tramos.Count; k++)
                {
                    var largo = (tramos[k].b - tramos[k].a).magnitude;
                    if (largo > 20f)
                    {
                        // Raya continua: una cada 12 m.
                        for (var s = 6f; s < largo; s += 12f)
                        {
                            puntos.Add((tramos[k].a + dir * s, dir));
                        }
                    }

                    if (k + 1 < tramos.Count)
                    {
                        var hueco = (tramos[k + 1].a - tramos[k].b).magnitude;
                        if (hueco > 2f && hueco < 14f)
                        {
                            puntos.Add(((tramos[k].b + tramos[k + 1].a) / 2f, dir));
                        }
                    }
                }
            }

            var cuerpo = new Malla();
            var ojo = new Malla();
            foreach (var (p, dir) in puntos)
            {
                if ((p - centro).magnitude < claro)
                {
                    continue;
                }

                var d = new Vector3(dir.x, 0f, dir.y);
                var lado = Vector3.Cross(Vector3.up, d);
                var pie = terreno.P(p.x, p.y, 0.004);
                cuerpo.Caja(pie, d, lado, 0.1f, 0.022f, 0.1f);
                // Los dos reflejantes, uno hacia cada sentido.
                foreach (var s in new[] { -1f, 1f })
                {
                    var c = pie + d * (0.051f * s) + Vector3.up * 0.011f;
                    var x = lado * 0.04f;
                    var y = Vector3.up * 0.01f;
                    if (s > 0f)
                    {
                        ojo.Cuadro(c - x - y, c + x - y, c + x + y, c - x + y, 1f, true);
                    }
                    else
                    {
                        ojo.Cuadro(c + x - y, c - x - y, c - x + y, c + x + y, 1f, true);
                    }
                }
            }

            cuerpo.Poner(padre, "vialetas", Materiales.Liso(new Color(0.86f, 0.86f, 0.84f), 0.35f), false);
            // Reflejan los faros: de noche, un punto de brillo; de día, solo el color.
            var blanco = new Color(0.95f, 0.95f, 0.92f);
            // De noche brillan sobre el umbral del resplandor: un punto de luz, como con los faros encima.
            ojo.Poner(padre, "vialetas_reflejante", Materiales.Emisivo(blanco, noche ? blanco * 2.6f : Color.black), false);
        }

        // ---- Defensa y fantasmas ------------------------------------------------------------------------

        /// <summary>
        /// Un reflejante ámbar en uno de cada tres postes de la defensa (cada 12 m) y, en las orillas
        /// sin defensa, fantasmas: postes blancos con banda negra y reflejante, cada 20 m.
        /// </summary>
        private static void Reflejantes(Transform padre, ViaEscenario v, List<Orilla> orillas, Terreno terreno, bool noche)
        {
            var placas = new Malla();
            var defensas = new List<(Vector2 a, Vector2 b)>();
            foreach (var b in v.Barreras)
            {
                var recorrido = 0f;
                var siguiente = 0f;
                var poste = 0;
                for (var i = 0; i + 1 < b.Length; i++)
                {
                    var q0 = new Vector2((float)b[i].X, (float)b[i].Y);
                    var q1 = new Vector2((float)b[i + 1].X, (float)b[i + 1].Y);
                    defensas.Add((q0, q1));
                    var p0 = terreno.P(q0.x, q0.y);
                    var p1 = terreno.P(q1.x, q1.y);
                    var largo = (p1 - p0).magnitude;
                    if (largo < 1e-3f)
                    {
                        continue;
                    }

                    var dir = (p1 - p0) / largo;
                    var lado = Vector3.Cross(Vector3.up, dir);
                    while (siguiente <= recorrido + largo)
                    {
                        if (poste % 3 == 0)
                        {
                            // Sobre el poste, por encima de la viga (como los de la NOM-034).
                            var p = p0 + dir * (siguiente - recorrido) - lado * 0.06f + Vector3.up * 0.76f;
                            placas.Caja(p, dir, lado, 0.04f, 0.12f, 0.1f);
                        }

                        poste++;
                        siguiente += 4f;
                    }

                    recorrido += largo;
                }
            }

            var ambar = new Color(0.95f, 0.6f, 0.08f);
            placas.Poner(padre, "defensa_reflejantes", Materiales.Emisivo(ambar, noche ? ambar * 0.6f : ambar * 0.05f), false);

            var blancos = new Malla();
            var bandas = new Malla();
            var ojos = new Malla();
            foreach (var o in orillas)
            {
                if (o.Mediana)
                {
                    continue;
                }

                for (var s = 10f; s < o.Largo; s += 20f)
                {
                    var q = o.A + o.Dir * s + o.Afuera * 0.7f;
                    var conDefensa = false;
                    foreach (var (a, b) in defensas)
                    {
                        if (Distancia(q, a, b) < 3f)
                        {
                            conDefensa = true;
                            break;
                        }
                    }

                    if (conDefensa)
                    {
                        continue;
                    }

                    var t = new Vector3(o.Transito.x, 0f, o.Transito.y);
                    var lado = new Vector3(o.Afuera.x, 0f, o.Afuera.y);
                    var pie = terreno.P(q.x, q.y);
                    blancos.Caja(pie, lado, t, 0.1f, 0.88f, 0.1f);
                    bandas.Caja(pie + Vector3.up * 0.88f, lado, t, 0.1f, 0.16f, 0.1f);
                    var c = pie + Vector3.up * 0.96f - t * 0.052f;
                    var x = lado * 0.035f;
                    var y = Vector3.up * 0.05f;
                    ojos.Cuadro(c + x - y, c - x - y, c - x + y, c + x + y, 1f, true);
                }
            }

            blancos.Poner(padre, "fantasmas", Materiales.Liso(new Color(0.85f, 0.85f, 0.83f), 0.3f));
            bandas.Poner(padre, "fantasmas_banda", Materiales.Liso(new Color(0.04f, 0.04f, 0.04f), 0.3f));
            ojos.Poner(padre, "fantasmas_reflejante", Materiales.Emisivo(ambar, noche ? ambar * 0.6f : ambar * 0.05f), false);
        }

        private static float Distancia(Vector2 p, Vector2 a, Vector2 b)
        {
            var ab = b - a;
            var t = Mathf.Clamp01(Vector2.Dot(p - a, ab) / Mathf.Max(ab.sqrMagnitude, 1e-6f));
            return (p - (a + ab * t)).magnitude;
        }

        // ---- Señalamiento -------------------------------------------------------------------------------

        /// <summary>
        /// Un tablero informativo verde por sentido, entre 90 y 150 m adelante del hecho, a la derecha de
        /// quien maneja. Es genérico: orla, una flecha y franjas blancas, sin texto. Un nombre de lugar
        /// o una velocidad inventados se leerían como datos del sitio, y no lo son.
        /// </summary>
        private static void Senalamiento(Transform padre, List<Orilla> orillas, Terreno terreno, long semilla, Vector2 centro, float claro)
        {
            if (orillas.Count == 0)
            {
                return;
            }

            var azar = new Azar(semilla + 401);
            var postes = new Malla();
            var tableros = new Malla();
            var blanco = new Malla();
            var reversos = new Malla();
            Vector2? sentidoUno = null;
            foreach (var lado in new[] { 1f, -1f })
            {
                // Adelante del hecho (antes negativo): así lo ve quien maneja y lo ve la cinematográfica.
                var antes = -azar.Entre(90f, 150f);
                var mejor = float.MaxValue;
                Orilla? cual = null;
                var punto = Vector2.zero;
                foreach (var o in orillas)
                {
                    if (o.Mediana)
                    {
                        continue;
                    }

                    if (sentidoUno == null)
                    {
                        sentidoUno = o.Transito;
                    }

                    if (Vector2.Dot(o.Transito, sentidoUno.Value) * lado <= 0f)
                    {
                        continue;
                    }

                    // El punto de la orilla que queda `antes` metros antes del hecho.
                    var s = Vector2.Dot(centro - o.A, o.Dir) - Vector2.Dot(o.Transito, o.Dir) * antes;
                    if (s < 0f || s > o.Largo)
                    {
                        continue;
                    }

                    var q = o.A + o.Dir * s;
                    var error = Mathf.Abs(Vector2.Dot(centro - q, o.Transito) - antes) + Mathf.Abs(Vector2.Dot(centro - q, o.Afuera)) * 0.1f;
                    if (error < mejor)
                    {
                        mejor = error;
                        cual = o;
                        punto = q;
                    }
                }

                if (cual == null || (punto - centro).magnitude < claro + 10f)
                {
                    continue;
                }

                var or = cual.Value;
                var t = new Vector3(or.Transito.x, 0f, or.Transito.y);
                var afuera = new Vector3(or.Afuera.x, 0f, or.Afuera.y);
                const float Ancho = 3.2f;
                const float Alto = 1.6f;
                const float Bajo = 2.2f;
                var q0 = punto + or.Afuera * 1.3f;
                var q1 = punto + or.Afuera * (1.3f + Ancho);
                var pie0 = terreno.P(q0.x, q0.y);
                var pie1 = terreno.P(q1.x, q1.y);
                var piso = Mathf.Max(pie0.y, pie1.y);
                postes.Prisma(pie0 + afuera * 0.35f, 0.055f, piso - pie0.y + Bajo + Alto, 10);
                postes.Prisma(pie1 - afuera * 0.35f, 0.055f, piso - pie1.y + Bajo + Alto, 10);
                // La cara mira hacia quien viene: contra el sentido del tránsito.
                var c0 = new Vector3(pie0.x, piso + Bajo, pie0.z) - t * 0.08f;
                var ar = Vector3.up * Alto;
                var an = afuera * Ancho;
                tableros.Cuadro(c0 + an, c0, c0 + ar, c0 + an + ar, 1f, true);
                reversos.Cuadro(c0 + t * 0.03f, c0 + an + t * 0.03f, c0 + an + ar + t * 0.03f, c0 + ar + t * 0.03f, 1f, true);
                var f = c0 - t * 0.006f;
                void Rect(float x0, float y0, float x1, float y1)
                {
                    blanco.Cuadro(f + afuera * x1 + Vector3.up * y0, f + afuera * x0 + Vector3.up * y0, f + afuera * x0 + Vector3.up * y1, f + afuera * x1 + Vector3.up * y1, 1f, true);
                }

                // Orla.
                Rect(0.06f, 0.06f, Ancho - 0.06f, 0.12f);
                Rect(0.06f, Alto - 0.12f, Ancho - 0.06f, Alto - 0.06f);
                Rect(0.06f, 0.06f, 0.12f, Alto - 0.06f);
                Rect(Ancho - 0.12f, 0.06f, Ancho - 0.06f, Alto - 0.06f);
                // Flecha hacia arriba del lado de la vía (siga de frente) y dos franjas en lugar de texto.
                Rect(0.42f, 0.32f, 0.56f, 1.0f);
                var punta = f + afuera * 0.49f + Vector3.up * 1.3f;
                var i0 = blanco.Vertice(f + afuera * 0.27f + Vector3.up * 0.98f, Vector2.zero);
                blanco.Vertice(f + afuera * 0.71f + Vector3.up * 0.98f, Vector2.zero);
                blanco.Vertice(punta, Vector2.zero);
                blanco.Triangulo(i0, i0 + 2, i0 + 1);
                blanco.Triangulo(i0, i0 + 1, i0 + 2);
                Rect(0.9f, 0.95f, 0.9f + azar.Entre(1.6f, 2.0f), 1.13f);
                Rect(0.9f, 0.5f, 0.9f + azar.Entre(1.1f, 1.7f), 0.68f);
            }

            postes.Poner(padre, "senal_postes", Materiales.Liso(new Color(0.55f, 0.56f, 0.58f), 0.5f, 0.8f));
            reversos.Poner(padre, "senal_reverso", Materiales.Liso(new Color(0.5f, 0.51f, 0.52f), 0.4f, 0.7f));
            // Reflejantes, como las señales de la ciudad: un poco de brillo propio.
            var verde = new Color(0.04f, 0.3f, 0.15f);
            tableros.Poner(padre, "senal_tablero", Materiales.Emisivo(verde, verde * 0.12f));
            var b = new Color(0.92f, 0.93f, 0.9f);
            blanco.Poner(padre, "senal_leyenda", Materiales.Emisivo(b, b * 0.12f), false);
        }

        // ---- Matorrales --------------------------------------------------------------------------------

        /// <summary>
        /// Matorrales a lo largo de las orillas exteriores, de 3 a 14 m afuera del acotamiento, a veces
        /// en grupo. Tres tarjetas cruzadas cada uno, con tres follajes (verde, olivo y seco).
        /// </summary>
        private static void Matorrales(Transform padre, List<Orilla> orillas, Terreno terreno, long semilla, bool noche, Vector2 centro, float claro)
        {
            var total = 0f;
            foreach (var o in orillas)
            {
                if (!o.Mediana)
                {
                    total += o.Largo;
                }
            }

            if (total < 1f)
            {
                return;
            }

            var azar = new Azar(semilla + 409);
            var mallas = new[] { new Malla { NormalArriba = true }, new Malla { NormalArriba = true }, new Malla { NormalArriba = true } };
            var cuantos = Mathf.RoundToInt(total / 100f * (Calidad.Media ? 7f : 11f));
            for (var k = 0; k < cuantos; k++)
            {
                var s = azar.Siguiente() * total;
                Orilla o = default;
                foreach (var x in orillas)
                {
                    if (x.Mediana)
                    {
                        continue;
                    }

                    o = x;
                    if (s <= x.Largo)
                    {
                        break;
                    }

                    s -= x.Largo;
                }

                var q = o.A + o.Dir * Mathf.Min(s, o.Largo) + o.Afuera * azar.Entre(3f, 14f);
                var grupo = azar.Siguiente() < 0.4f ? 1 + (int)azar.Entre(1f, 3f) : 1;
                for (var g = 0; g < grupo; g++)
                {
                    var p = q + new Vector2(azar.Entre(-1.8f, 1.8f), azar.Entre(-1.8f, 1.8f)) * (g == 0 ? 0f : 1f);
                    var ancho = azar.Entre(0.9f, 2.3f);
                    var alto = ancho * azar.Entre(0.55f, 0.8f);
                    var giro = azar.Entre(0f, Mathf.PI);
                    var cual = (int)Mathf.Min(2f, azar.Entre(0f, 3f));
                    if ((p - centro).magnitude < claro)
                    {
                        continue;
                    }

                    var pie = terreno.P(p.x, p.y, -0.05);
                    for (var h = 0; h < 3; h++)
                    {
                        var ang = giro + h * Mathf.PI / 3f;
                        var d = new Vector3(Mathf.Cos(ang), 0f, Mathf.Sin(ang)) * (ancho / 2f);
                        mallas[cual].Tarjeta(pie - d, pie + d, pie + d + Vector3.up * alto, pie - d + Vector3.up * alto);
                    }
                }
            }

            for (var i = 0; i < 3; i++)
            {
                mallas[i].Poner(padre, "matorrales_" + i, Materiales.Matorral(i, noche), false);
            }
        }
    }
}
