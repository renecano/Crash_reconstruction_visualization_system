using System;
using System.Collections.Generic;
using Croquis.Generated;
using UnityEngine;
using Material = UnityEngine.Material;

namespace Croquis.Visor
{
    /// <summary>
    /// El entorno procedural más allá de la vía (ADR 0112): árboles, edificios con su fachada, postes,
    /// cercas, señales, cerros y perfil urbano. Dónde va cada cosa lo calculó TS con la semilla de la
    /// escena; aquí solo se le da forma. No es el lugar real, y la leyenda lo dice.
    /// </summary>
    public static class EntornoVista
    {
        public static void Construir(Transform padre, EntornoEscenario en, AmbienteEscenario a, long semilla)
        {
            var entorno = new GameObject("entorno_procedural").transform;
            entorno.SetParent(padre, false);
            var azar = new Azar(semilla + 13);
            Arboles(entorno, en.Arboles);
            Edificios(entorno, en.Edificios, a, azar);
            Postes(entorno, en.Postes);
            Cercas(entorno, en.Cercas);
            Senales(entorno, en.Senales);
            Horizonte(entorno, en, a);
        }

        private static Vector3 U(double x, double y, double z)
        {
            return new Vector3((float)x, (float)z, (float)y);
        }

        private static Vector3 Dir(double rumboRad)
        {
            return new Vector3(Mathf.Cos((float)rumboRad), 0f, Mathf.Sin((float)rumboRad));
        }

        // ---- Árboles ----------------------------------------------------------------------------------

        /// <summary>
        /// Cada árbol son tarjetas horneadas del modelo CC0 de su especie: dos de frente cruzadas, una
        /// tercera en diagonal para que no se vea plano al rodearlo, y la planta a media copa.
        /// </summary>
        private static void Arboles(Transform padre, ArbolEscenario[] arboles)
        {
            var frentes = new Dictionary<string, Malla>();
            var plantas = new Dictionary<string, Malla>();
            var palmas = new Malla();
            var troncos = new Malla();
            foreach (var t in arboles)
            {
                var p = U(t.X, t.Y, t.Z);
                if (t.Especie == EspecieArbol.Palmera)
                {
                    Palmera(palmas, troncos, p, t);
                    continue;
                }

                var especie = t.Tipo == 2 ? "pirul" : (t.Especie ?? EspecieArbol.Fresno).ToString().ToLowerInvariant();
                var medidas = Materiales.MedidasArbol(especie);
                var alto = t.Tipo == 2
                    ? (float)t.CopaM * 1.5f
                    : t.AlturaM.HasValue ? (float)t.AlturaM.Value : (float)(t.TroncoM + 2.0 * t.CopaM);
                var k = alto / medidas.y;
                var ancho = medidas.x * k;
                if (!frentes.TryGetValue(especie, out var f))
                {
                    frentes[especie] = f = new Malla();
                    plantas[especie] = new Malla();
                }

                for (var c = 0; c < 3; c++)
                {
                    var d = Dir(t.RumboRad + c * Mathf.PI / 3f) * (ancho / 2f);
                    f.Tarjeta(p - d, p + d, p + d + Vector3.up * alto, p - d + Vector3.up * alto);
                }

                // La planta, a media copa: lo que se ve desde arriba y lo que da sombra de copa.
                var h = p + Vector3.up * (alto * 0.62f);
                var r = ancho * 0.5f;
                plantas[especie].Tarjeta(
                    h + new Vector3(-r, 0, -r), h + new Vector3(r, 0, -r), h + new Vector3(r, 0, r), h + new Vector3(-r, 0, r));
            }

            foreach (var par in frentes)
            {
                par.Value.Poner(padre, "arboles_" + par.Key, Materiales.Arbol(par.Key, "frente"));
                plantas[par.Key].Poner(padre, "copas_" + par.Key, Materiales.Arbol(par.Key, "planta"));
            }

            palmas.Poner(padre, "palmas", Materiales.Liso(new Color(0.2f, 0.34f, 0.14f), 0.25f));
            troncos.Poner(padre, "troncos_palma", Materiales.Liso(new Color(0.36f, 0.3f, 0.23f), 0.08f));
        }

        /// <summary>Una palmera: tronco en tramos que se curvan y hojas que caen en arco.</summary>
        private static void Palmera(Malla hojas, Malla troncos, Vector3 pie, ArbolEscenario t)
        {
            var alto = t.AlturaM.HasValue ? (float)t.AlturaM.Value : 9f;
            var inclina = Dir(t.RumboRad) * 0.06f;
            var q = pie;
            const int Tramos = 6;
            for (var k = 0; k < Tramos; k++)
            {
                var r0 = Mathf.Lerp(0.2f, 0.12f, k / (float)Tramos);
                var r1 = Mathf.Lerp(0.2f, 0.12f, (k + 1) / (float)Tramos);
                troncos.Prisma(q, r0, alto / Tramos, 8, r1);
                q += Vector3.up * (alto / Tramos) + inclina * (0.4f * k);
            }

            const int Hojas = 11;
            for (var h = 0; h < Hojas; h++)
            {
                var d = Dir(t.RumboRad + 2f * Mathf.PI * h / Hojas);
                var lado = Vector3.Cross(Vector3.up, d);
                var largo = (float)t.CopaM * 1.25f;
                var previo = q;
                const int Segmentos = 5;
                for (var s = 1; s <= Segmentos; s++)
                {
                    var u = s / (float)Segmentos;
                    // Sube un poco y luego cae: el arco de una hoja de palma.
                    var punto = q + d * (largo * u) + Vector3.up * (largo * (0.45f * u - 0.75f * u * u));
                    var w0 = 0.42f * Mathf.Sin(Mathf.PI * Mathf.Max(0.08f, (s - 1) / (float)Segmentos));
                    var w1 = 0.42f * Mathf.Sin(Mathf.PI * Mathf.Min(0.97f, u));
                    hojas.Cuadro(previo - lado * w0, previo + lado * w0, punto + lado * w1, punto - lado * w1, 1f, true);
                    previo = punto;
                }
            }
        }

        // ---- Edificios --------------------------------------------------------------------------------

        private const float AltoPiso = 3f;

        private static void Edificios(Transform padre, EdificioEscenario[] edificios, AmbienteEscenario a, Azar azar)
        {
            var muros = new Dictionary<string, Malla>();
            var colores = new Dictionary<string, Material>();
            var marcos = new Malla();
            var vidrios = new Malla();
            var encendidas = new Malla();
            var lamina = new Malla();
            var concreto = new Malla();
            var negro = new Malla();
            var toldos = new Dictionary<string, Malla>();
            var fierro = new Malla();
            foreach (var b in edificios)
            {
                var llave = b.Material == MaterialFachada.Tabique ? "tabique" : "yeso|" + b.Color;
                if (!muros.TryGetValue(llave, out var muro))
                {
                    muros[llave] = muro = new Malla();
                    colores[llave] = b.Material == MaterialFachada.Tabique
                        ? Materiales.Pbr("tabique", new Color(1.25f, 0.82f, 0.7f))
                        // El aplanado se tiñe con el color de la fachada; su textura es clara.
                        : Materiales.Pbr("yeso", Materiales.Hex(b.Color, Color.white));
                }

                var centro = U(b.X, b.Y, b.Z - 0.3);
                var largo = Dir(b.RumboRad);
                var fondo = Vector3.Cross(Vector3.up, largo);
                var frente = Dir(b.FrenteRad);
                var alto = (float)b.AltoM + 0.3f;
                var w = (float)b.LargoM;
                var d = (float)b.FondoM;
                muro.Caja(centro, largo, fondo, w, alto, d, 0.5f);

                // Las cuatro caras: su normal hacia afuera, el eje a lo largo y su ancho. La que más mira
                // hacia la calle es la fachada; las demás llevan ventanas más chicas y espaciadas.
                var caras = new[]
                {
                    (n: fondo, eje: largo, ancho: w, lejos: d / 2f),
                    (n: -fondo, eje: largo, ancho: w, lejos: d / 2f),
                    (n: largo, eje: fondo, ancho: d, lejos: w / 2f),
                    (n: -largo, eje: fondo, ancho: d, lejos: w / 2f),
                };
                var principal = 0;
                for (var k = 1; k < caras.Length; k++)
                {
                    if (Vector3.Dot(caras[k].n, frente) > Vector3.Dot(caras[principal].n, frente))
                    {
                        principal = k;
                    }
                }

                var pisos = Mathf.Max(1, (int)b.Pisos);
                for (var k = 0; k < caras.Length; k++)
                {
                    var c = caras[k];
                    var cara = centro + c.n * c.lejos;
                    if (k == principal)
                    {
                        Fachada(b, cara, c.eje, c.n, c.ancho, pisos, a, azar, marcos, vidrios, encendidas, lamina, toldos, concreto);
                    }
                    else
                    {
                        Ventanas(cara, c.eje, c.n, c.ancho, pisos, 0, 4.2f, 1.0f, 1.1f, a, azar, marcos, vidrios, encendidas);
                    }
                }

                Azotea(b, centro, largo, fondo, w, d, alto, azar, concreto, negro, fierro);
            }

            foreach (var par in muros)
            {
                par.Value.Poner(padre, "muros_" + par.Key.Replace("|", "_").Replace("#", ""), colores[par.Key]);
            }

            marcos.Poner(padre, "marcos", Materiales.Liso(new Color(0.16f, 0.16f, 0.17f), 0.3f));
            vidrios.Poner(padre, "vidrios", Materiales.Vidrio, false);
            encendidas.Poner(padre, "ventanas_encendidas", Materiales.Emisivo(new Color(0.95f, 0.8f, 0.55f), new Color(2.6f, 1.9f, 1f)), false);
            lamina.Poner(padre, "cortinas", Materiales.Pbr("lamina"));
            concreto.Poner(padre, "azoteas", Materiales.Pbr("concreto", new Color(0.8f, 0.8f, 0.8f)));
            negro.Poner(padre, "tinacos", Materiales.Liso(new Color(0.07f, 0.07f, 0.075f), 0.45f));
            fierro.Poner(padre, "varillas", Materiales.Liso(new Color(0.3f, 0.2f, 0.15f), 0.2f, 0.6f));
            foreach (var par in toldos)
            {
                par.Value.Poner(padre, "toldos", Materiales.Liso(Materiales.Hex(par.Key, Color.gray), 0.15f));
            }
        }

        private static void Fachada(
            EdificioEscenario b, Vector3 cara, Vector3 eje, Vector3 normal, float ancho, int pisos,
            AmbienteEscenario a, Azar azar, Malla marcos, Malla vidrios, Malla encendidas, Malla lamina,
            Dictionary<string, Malla> toldos, Malla concreto)
        {
            var piso0 = cara + Vector3.up * 0.3f;
            if (b.Cortina)
            {
                // Planta baja de local: cortina metálica casi a todo lo ancho y su puerta al lado.
                var wCortina = Mathf.Min(ancho * 0.55f, 4.2f);
                var c = piso0 - eje * (ancho * 0.12f) + normal * 0.03f;
                lamina.Cuadro(
                    c - eje * (wCortina / 2f), c + eje * (wCortina / 2f),
                    c + eje * (wCortina / 2f) + Vector3.up * 2.6f, c - eje * (wCortina / 2f) + Vector3.up * 2.6f, 0.37f, true);
                Hueco(marcos, c + Vector3.up * 2.6f, eje, normal, wCortina + 0.2f, 0.3f, 0.12f);
                Puerta(marcos, piso0 + eje * (ancho * 0.34f), eje, normal);
            }
            else
            {
                Puerta(marcos, piso0 + eje * (ancho * 0.3f), eje, normal);
                Ventanas(cara, eje, normal, ancho * 0.55f, 1, 0, 2.8f, 1.5f, 1.3f, a, azar, marcos, vidrios, encendidas, -ancho * 0.18f);
            }

            if (b.Toldo)
            {
                var color = ColorToldo(azar);
                if (!toldos.TryGetValue(color, out var t))
                {
                    toldos[color] = t = new Malla();
                }

                var w = Mathf.Min(ancho * 0.6f, 4.6f);
                var p = piso0 - eje * (ancho * 0.12f) + Vector3.up * 2.75f + normal * 0.02f;
                var afuera = normal * 1.2f - Vector3.up * 0.45f;
                t.Cuadro(p - eje * (w / 2f), p + eje * (w / 2f), p + eje * (w / 2f) + afuera, p - eje * (w / 2f) + afuera, 1f, true);
            }

            if (b.Letrero)
            {
                // El letrero es una tabla lisa: sin texto ni marcas.
                var p = piso0 - eje * (ancho * 0.12f) + Vector3.up * 3.0f + normal * 0.06f;
                concreto.Caja(p, eje, normal, Mathf.Min(ancho * 0.5f, 3.6f), 0.55f, 0.08f);
            }

            if (pisos > 1)
            {
                Ventanas(cara, eje, normal, ancho, pisos, 1, 2.7f, 1.3f, 1.25f, a, azar, marcos, vidrios, encendidas);
            }
        }

        private static string ColorToldo(Azar azar)
        {
            var colores = new[] { "#9b2f2a", "#1f5b8a", "#2f6b3c", "#c9a227", "#6b6f73" };
            return colores[(int)(azar.Siguiente() * colores.Length) % colores.Length];
        }

        /// <summary>Un marco hundido: el hueco oscuro de una ventana o una puerta.</summary>
        private static void Hueco(Malla marcos, Vector3 baseCentro, Vector3 eje, Vector3 normal, float ancho, float alto, float saliente)
        {
            marcos.Caja(baseCentro + normal * (saliente / 2f - 0.02f), eje, normal, ancho, alto, saliente);
        }

        private static void Puerta(Malla marcos, Vector3 pie, Vector3 eje, Vector3 normal)
        {
            marcos.Caja(pie + normal * 0.01f, eje, normal, 1.0f, 2.15f, 0.06f);
        }

        /// <summary>Ventanas con marco, repisa y vidrio, repartidas a lo ancho de una cara, por piso.</summary>
        private static void Ventanas(
            Vector3 cara, Vector3 eje, Vector3 normal, float ancho, int pisos, int desdePiso, float paso,
            float w, float h, AmbienteEscenario a, Azar azar, Malla marcos, Malla vidrios, Malla encendidas,
            float corrimiento = 0f)
        {
            var n = Mathf.Max(1, Mathf.FloorToInt((ancho - 0.8f) / paso));
            for (var piso = desdePiso; piso < pisos; piso++)
            {
                for (var k = 0; k < n; k++)
                {
                    var u = (k + 0.5f) / n - 0.5f;
                    var c = cara + eje * (u * (ancho - 0.8f) + corrimiento) + Vector3.up * (0.3f + piso * AltoPiso + 1.0f);
                    // Marco: cuatro tiras alrededor del vidrio, y la repisa abajo.
                    const float G = 0.07f;
                    marcos.Caja(c + normal * 0.01f - Vector3.up * G, eje, normal, w + 2 * G, G, 0.1f);
                    marcos.Caja(c + normal * 0.01f + Vector3.up * h, eje, normal, w + 2 * G, G, 0.08f);
                    marcos.Caja(c + normal * 0.01f - eje * (w / 2f + G / 2f), eje, normal, G, h, 0.08f);
                    marcos.Caja(c + normal * 0.01f + eje * (w / 2f + G / 2f), eje, normal, G, h, 0.08f);
                    marcos.Caja(c + normal * 0.01f, eje, normal, 0.04f, h, 0.05f);
                    var vidrio = a.Noche && azar.Siguiente() < 0.32f ? encendidas : vidrios;
                    var q = c + normal * 0.025f;
                    vidrio.Cuadro(q - eje * (w / 2f), q + eje * (w / 2f), q + eje * (w / 2f) + Vector3.up * h, q - eje * (w / 2f) + Vector3.up * h, 1f, true);
                }
            }
        }

        /// <summary>La azotea mexicana: pretil, tinacos sobre su base, antena y varillas de espera.</summary>
        private static void Azotea(
            EdificioEscenario b, Vector3 centro, Vector3 largo, Vector3 fondo, float w, float d, float alto,
            Azar azar, Malla concreto, Malla negro, Malla fierro)
        {
            var arriba = centro + Vector3.up * alto;
            const float Pretil = 0.45f;
            concreto.Caja(arriba + fondo * (d / 2f - 0.08f), largo, fondo, w, Pretil, 0.16f);
            concreto.Caja(arriba - fondo * (d / 2f - 0.08f), largo, fondo, w, Pretil, 0.16f);
            concreto.Caja(arriba + largo * (w / 2f - 0.08f), fondo, largo, d, Pretil, 0.16f);
            concreto.Caja(arriba - largo * (w / 2f - 0.08f), fondo, largo, d, Pretil, 0.16f);
            for (var i = 0; i < b.Tinacos; i++)
            {
                var p = arriba + largo * (w * (azar.Siguiente() - 0.5f) * 0.6f) + fondo * (d * (azar.Siguiente() - 0.5f) * 0.5f);
                concreto.Caja(p, largo, fondo, 1.2f, 0.9f, 1.2f);
                negro.Prisma(p + Vector3.up * 0.9f, 0.55f, 1.05f, 14, 0.5f);
                negro.Prisma(p + Vector3.up * 1.95f, 0.5f, 0.22f, 14, 0.2f);
            }

            if (b.Antena)
            {
                var p = arriba + largo * (w * 0.3f) - fondo * (d * 0.25f);
                fierro.Prisma(p, 0.025f, 2.6f, 6);
                fierro.Caja(p + Vector3.up * 2.2f, largo, fondo, 0.9f, 0.03f, 0.03f);
                fierro.Caja(p + Vector3.up * 1.9f, largo, fondo, 0.6f, 0.03f, 0.03f);
            }

            if (b.Varillas)
            {
                // Las varillas que se dejan para el siguiente piso, en las esquinas.
                foreach (var (sx, sz) in new[] { (1, 1), (1, -1), (-1, 1), (-1, -1) })
                {
                    var esquina = arriba + largo * (sx * (w / 2f - 0.2f)) + fondo * (sz * (d / 2f - 0.2f));
                    for (var k = 0; k < 4; k++)
                    {
                        var o = largo * ((k % 2) * 0.12f - 0.06f) + fondo * ((k / 2) * 0.12f - 0.06f);
                        fierro.Prisma(esquina + o, 0.012f, azar.Entre(0.7f, 1.1f), 5);
                    }
                }
            }
        }

        // ---- Postes, cercas y señales -----------------------------------------------------------------

        private static void Postes(Transform padre, PosteEscenario[] postes)
        {
            if (postes.Length == 0)
            {
                return;
            }

            var madera = new Malla();
            var cables = new Malla();
            Vector3? previo = null;
            foreach (var p in postes)
            {
                var pie = U(p.X, p.Y, p.Z);
                var d = Dir(p.RumboRad);
                var lado = Vector3.Cross(Vector3.up, d);
                madera.Prisma(pie, 0.14f, 9f, 8, 0.1f);
                madera.Caja(pie + Vector3.up * 8.3f, d, lado, 1.8f, 0.1f, 0.1f);
                madera.Caja(pie + Vector3.up * 7.6f, d, lado, 1.2f, 0.08f, 0.08f);
                var punta = pie + Vector3.up * 8.42f;
                if (previo.HasValue && (previo.Value - punta).magnitude < 80f)
                {
                    // Dos cables con su catenaria entre postes vecinos.
                    foreach (var desvio in new[] { -0.75f, 0.75f })
                    {
                        Cable(cables, previo.Value + d * desvio, punta + d * desvio);
                    }
                }

                previo = punta;
            }

            madera.Poner(padre, "postes", Materiales.Liso(new Color(0.3f, 0.25f, 0.2f), 0.1f));
            cables.Poner(padre, "cables", Materiales.Liso(new Color(0.05f, 0.05f, 0.05f), 0.3f), false);
        }

        private static void Cable(Malla m, Vector3 a, Vector3 b)
        {
            const int Tramos = 8;
            var caida = (b - a).magnitude * 0.03f;
            var previo = a;
            for (var k = 1; k <= Tramos; k++)
            {
                var u = k / (float)Tramos;
                var p = Vector3.Lerp(a, b, u) - Vector3.up * (caida * 4f * u * (1f - u));
                m.Cuadro(previo - Vector3.up * 0.012f, p - Vector3.up * 0.012f, p + Vector3.up * 0.012f, previo + Vector3.up * 0.012f, 1f, true);
                previo = p;
            }
        }

        private static void Cercas(Transform padre, SegmentoPlano[] cercas)
        {
            if (cercas.Length == 0)
            {
                return;
            }

            var postes = new Malla();
            var alambre = new Malla();
            foreach (var c in cercas)
            {
                var a = new Vector3((float)c.Ax, 0f, (float)c.Ay);
                var b = new Vector3((float)c.Bx, 0f, (float)c.By);
                var largo = (b - a).magnitude;
                if (largo < 0.1f)
                {
                    continue;
                }

                var dir = (b - a) / largo;
                var lado = Vector3.Cross(Vector3.up, dir);
                for (var s = 0f; s <= largo; s += 2.5f)
                {
                    postes.Caja(a + dir * s, dir, lado, 0.09f, 1.25f, 0.09f);
                }

                foreach (var h in new[] { 0.45f, 0.8f, 1.15f })
                {
                    alambre.Cuadro(
                        a + Vector3.up * (h - 0.008f), b + Vector3.up * (h - 0.008f),
                        b + Vector3.up * (h + 0.008f), a + Vector3.up * (h + 0.008f), 1f, true);
                }
            }

            postes.Poner(padre, "postes_cerca", Materiales.Liso(new Color(0.34f, 0.29f, 0.23f), 0.08f));
            alambre.Poner(padre, "alambre", Materiales.Liso(new Color(0.42f, 0.42f, 0.4f), 0.4f, 0.7f), false);
        }

        private static void Senales(Transform padre, SenalEscenario[] senales)
        {
            if (senales.Length == 0)
            {
                return;
            }

            var postes = new Malla();
            var placas = new Dictionary<TipoSenal, Malla>();
            var reverso = new Malla();
            foreach (var s in senales)
            {
                var pie = U(s.X, s.Y, s.Z);
                var mira = Dir(s.RumboRad);
                var lado = Vector3.Cross(Vector3.up, mira);
                postes.Prisma(pie, 0.035f, 2.9f, 8);
                if (!placas.TryGetValue(s.Tipo, out var placa))
                {
                    placas[s.Tipo] = placa = new Malla();
                }

                var c = pie + Vector3.up * 2.45f + mira * 0.045f;
                switch (s.Tipo)
                {
                    case TipoSenal.Alto:
                        Poligono(placa, reverso, c, lado, mira, 0.38f, 8, Mathf.PI / 8f);
                        break;
                    case TipoSenal.Ceda:
                        Poligono(placa, reverso, c, lado, mira, 0.46f, 3, -Mathf.PI / 2f);
                        break;
                    case TipoSenal.Informativa:
                        placa.Cuadro(c - lado * 0.75f - Vector3.up * 0.3f, c + lado * 0.75f - Vector3.up * 0.3f, c + lado * 0.75f + Vector3.up * 0.3f, c - lado * 0.75f + Vector3.up * 0.3f);
                        reverso.Cuadro(c + lado * 0.75f - Vector3.up * 0.3f - mira * 0.01f, c - lado * 0.75f - Vector3.up * 0.3f - mira * 0.01f, c - lado * 0.75f + Vector3.up * 0.3f - mira * 0.01f, c + lado * 0.75f + Vector3.up * 0.3f - mira * 0.01f);
                        break;
                    default:
                        Poligono(placa, reverso, c, lado, mira, 0.36f, 20, 0f);
                        break;
                }
            }

            postes.Poner(padre, "postes_senal", Materiales.Liso(new Color(0.55f, 0.56f, 0.58f), 0.5f, 0.8f));
            reverso.Poner(padre, "reverso_senales", Materiales.Liso(new Color(0.5f, 0.51f, 0.52f), 0.4f, 0.7f));
            foreach (var par in placas)
            {
                Color color;
                switch (par.Key)
                {
                    case TipoSenal.Alto:
                        color = new Color(0.62f, 0.07f, 0.07f);
                        break;
                    case TipoSenal.Informativa:
                        color = new Color(0.06f, 0.32f, 0.17f);
                        break;
                    default:
                        color = new Color(0.9f, 0.9f, 0.88f);
                        break;
                }

                // Las señales son reflejantes: un poco de brillo propio para que se lean de noche.
                par.Value.Poner(padre, "senales_" + par.Key.ToString().ToLowerInvariant(), Materiales.Emisivo(color, color * 0.12f));
            }
        }

        /// <summary>Una placa plana de n lados que mira hacia `mira`, con su reverso.</summary>
        private static void Poligono(Malla frente, Malla reverso, Vector3 c, Vector3 lado, Vector3 mira, float radio, int n, float giro)
        {
            var f0 = frente.Vertice(c, new Vector2(0.5f, 0.5f));
            var r0 = reverso.Vertice(c - mira * 0.01f, new Vector2(0.5f, 0.5f));
            for (var k = 0; k <= n; k++)
            {
                var ang = giro + 2f * Mathf.PI * k / n;
                var p = c + lado * (Mathf.Cos(ang) * radio) + Vector3.up * (Mathf.Sin(ang) * radio);
                frente.Vertice(p, Vector2.zero);
                reverso.Vertice(p - mira * 0.01f, Vector2.zero);
                if (k > 0)
                {
                    frente.Triangulo(f0, f0 + k + 1, f0 + k);
                    reverso.Triangulo(r0, r0 + k, r0 + k + 1);
                }
            }
        }

        // ---- Horizonte --------------------------------------------------------------------------------

        private static void Horizonte(Transform padre, EntornoEscenario en, AmbienteEscenario a)
        {
            // Cada capa de cerros es más clara y azulada cuanto más lejos: la perspectiva del aire.
            for (var i = 0; i < en.Cerros.Length; i++)
            {
                var c = en.Cerros[i];
                var m = new Malla();
                var n = c.AlturasM.Length;
                var r = (float)c.RadioM;
                for (var k = 0; k < n; k++)
                {
                    var ang = (float)(c.DesdeRad + (c.HastaRad - c.DesdeRad) * k / Math.Max(1, n - 1));
                    var x = Mathf.Cos(ang) * r;
                    var z = Mathf.Sin(ang) * r;
                    m.Vertice(new Vector3(x, -6f, z), new Vector2(0.5f, 0.02f));
                    m.Vertice(new Vector3(x * 1.02f, (float)c.AlturasM[k], z * 1.02f), new Vector2(0.5f, 0.98f));
                    if (k > 0)
                    {
                        var b = 2 * (k - 1);
                        m.Triangulo(b, b + 1, b + 2);
                        m.Triangulo(b + 1, b + 3, b + 2);
                        m.Triangulo(b, b + 2, b + 1);
                        m.Triangulo(b + 1, b + 2, b + 3);
                    }
                }

                var lejos = Mathf.InverseLerp(400f, 1100f, r);
                var color = a.Noche
                    ? Color.Lerp(new Color(0.03f, 0.04f, 0.05f), new Color(0.05f, 0.06f, 0.09f), lejos)
                    : Color.Lerp(new Color(0.2f, 0.27f, 0.18f), new Color(0.3f, 0.37f, 0.4f), lejos);
                // La base se vela un poco con el aire; si se vela de más, el anillo parece una pared clara.
                var base0 = Color.Lerp(color, RenderSettings.fogColor, 0.25f);
                var degradado = new Texture2D(1, 32, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
                for (var y = 0; y < 32; y++)
                {
                    degradado.SetPixel(0, y, Color.Lerp(base0, color * 0.8f, Mathf.Pow(y / 31f, 0.7f)));
                }

                degradado.Apply();
                var mat = new Material(Materiales.Liso(Color.white, 0.02f)) { name = "cerros_" + i };
                mat.SetTexture("_BaseMap", degradado);
                var cerro = m.Poner(padre, "cerros_" + i, mat, false, false);
                // La niebla por distancia los dejaba del color del cielo: su velo ya va en el degradado.
                mat.DisableKeyword("FOG_EXP2");
                mat.SetFloat("_ReceiveFog", 0f);
                _ = cerro;
            }

            if (en.Silueta.Length == 0)
            {
                return;
            }

            var urbano = new Malla();
            foreach (var s in en.Silueta)
            {
                const float Radio = 420f;
                var ang = (float)s.AnguloRad;
                var haciaAfuera = new Vector3(Mathf.Cos(ang), 0f, Mathf.Sin(ang));
                var tangente = Vector3.Cross(Vector3.up, haciaAfuera);
                var ancho = 2f * Radio * Mathf.Sin((float)s.AberturaRad / 2f);
                urbano.Caja(haciaAfuera * Radio - Vector3.up * 2f, tangente, haciaAfuera, ancho, (float)s.AltoM + 2f, 24f);
            }

            urbano.Poner(
                padre,
                "perfil_urbano",
                Materiales.Liso(a.Noche ? new Color(0.045f, 0.05f, 0.065f) : new Color(0.5f, 0.53f, 0.57f), 0.05f),
                false);
        }
    }
}
