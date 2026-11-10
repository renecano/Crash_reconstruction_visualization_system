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
            Edificios(entorno, en.Edificios, a, azar, en.Zona == ZonaEntorno.Urbana);
            Postes(entorno, en.Postes);
            Cercas(entorno, en.Cercas);
            Senales(entorno, en.Senales);
            Horizonte(entorno, en, a, semilla);
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
        /// Cada árbol es un impostor del modelo CC0 de su especie (`ArbolesVista`): un cuadro que mira a
        /// la cámara con la vista horneada que toca, más la planta a media copa para verlo desde arriba.
        /// </summary>
        private static void Arboles(Transform padre, ArbolEscenario[] arboles)
        {
            var impostores = padre.gameObject.AddComponent<ArbolesVista>();
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
                if (!plantas.ContainsKey(especie))
                {
                    plantas[especie] = new Malla();
                }

                impostores.Agregar(especie, p, alto, (float)t.RumboRad);

                // La planta, a media copa: lo que se ve desde arriba y lo que da sombra de copa.
                var h = p + Vector3.up * (alto * 0.62f);
                var r = ancho * 0.5f;
                plantas[especie].Tarjeta(
                    h + new Vector3(-r, 0, -r), h + new Vector3(r, 0, -r), h + new Vector3(r, 0, r), h + new Vector3(-r, 0, r));
            }

            impostores.Cerrar();
            foreach (var par in plantas)
            {
                // La planta ya no da sombra: la dan las tarjetas de sombra del impostor.
                par.Value.Poner(padre, "copas_" + par.Key, Materiales.Arbol(par.Key, "planta"), false);
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

        private static void Edificios(Transform padre, EdificioEscenario[] edificios, AmbienteEscenario a, Azar azar, bool cuadras)
        {
            var rejas = new Malla();
            var portones = new Malla();
            var oscuras = new Malla();
            var ac = new Acabados();
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
                        : Materiales.Pbr("yeso", Color.Lerp(Materiales.Hex(b.Color, Color.white), Color.white, 0.15f));
                }

                var centro = U(b.X, b.Y, b.Z - 0.3);
                var largo = Dir(b.RumboRad);
                var fondo = Vector3.Cross(Vector3.up, largo);
                var frente = Dir(b.FrenteRad);
                var alto = (float)b.AltoM + 0.3f;
                var w = (float)b.LargoM;
                var d = (float)b.FondoM;
                if (cuadras)
                {
                    // En la cuadra los lotes van pegados: solo la cara de la calle lleva fachada.
                    var n = Vector3.Dot(fondo, frente) > 0f ? fondo : -fondo;
                    if (b.Tipo == TipoLote.Baldio)
                    {
                        Barda(b, centro, largo, n, w, d, muro, lamina);
                        continue;
                    }

                    muro.Caja(centro, largo, fondo, w, alto, d, 0.5f);
                    var calle = centro + n * (d / 2f);
                    var niveles = Mathf.Max(1, (int)b.Pisos);
                    if (b.Tipo == TipoLote.Fondo)
                    {
                        // Las cuadras de atrás: el volumen y sus ventanas como manchas, sin marcos.
                        for (var piso = 0; piso < niveles; piso++)
                        {
                            for (var k = 0; k < 2; k++)
                            {
                                var c = calle + largo * ((k - 0.5f) * w * 0.45f) + Vector3.up * (0.3f + piso * AltoPiso + 1.1f) + n * 0.02f;
                                var m = a.Noche && azar.Siguiente() < 0.25f ? encendidas : oscuras;
                                m.Cuadro(c - largo * 0.6f, c + largo * 0.6f, c + largo * 0.6f + Vector3.up * 1.2f, c - largo * 0.6f + Vector3.up * 1.2f, 1f, true);
                            }
                        }

                        continue;
                    }

                    Fachada(b, calle, largo, n, w, niveles, a, azar, marcos, vidrios, encendidas, lamina, toldos, concreto, rejas, portones, ac);
                    Azotea(b, centro, largo, fondo, w, d, alto, azar, concreto, negro, fierro);
                    if (b.RemetimientoM > 0.2)
                    {
                        Reja(calle + n * (float)b.RemetimientoM, largo, n, w, muro, rejas);
                    }

                    continue;
                }

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
                        Fachada(b, cara, c.eje, c.n, c.ancho, pisos, a, azar, marcos, vidrios, encendidas, lamina, toldos, concreto, null, null, null);
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
            encendidas.Poner(padre, "ventanas_encendidas", Materiales.Emisivo(new Color(0.95f, 0.8f, 0.55f), new Color(1.25f, 0.82f, 0.38f)), false);
            lamina.Poner(padre, "cortinas", Materiales.Pbr("lamina"));
            rejas.Poner(padre, "herreria", Materiales.Liso(new Color(0.07f, 0.07f, 0.08f), 0.35f, 0.6f), false);
            portones.Poner(padre, "zaguanes", Materiales.Pbr("lamina", new Color(0.62f, 0.7f, 0.66f)));
            oscuras.Poner(padre, "ventanas_de_fondo", Materiales.Liso(new Color(0.05f, 0.06f, 0.07f), 0.8f), false);
            ac.Molduras.Poner(padre, "molduras", Materiales.Liso(new Color(0.8f, 0.78f, 0.74f), 0.15f));
            ac.Zoclos.Poner(padre, "zoclos", Materiales.Calca(new Color(0.1f, 0.085f, 0.07f, 0.4f), 0.1f), false);
            ac.Escurridos.Poner(padre, "escurrimientos", Materiales.Escurrido(), false);
            ac.Descarapelados.Poner(padre, "descarapelados", Materiales.Descarapelado(), false);
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
            Dictionary<string, Malla> toldos, Malla concreto, Malla rejas, Malla portones, Acabados ac)
        {
            var piso0 = cara + Vector3.up * 0.3f;
            var molduras = ac?.Molduras;
            var escurridos = ac?.Escurridos;
            if (ac != null)
            {
                Acabado(b, piso0, eje, normal, ancho, azar, ac, concreto);
            }

            if (b.Tipo == TipoLote.Taller && portones != null)
            {
                // Taller o bodega: un portón alto de lámina y nada más.
                var wP = Mathf.Min(ancho * 0.6f, 3.6f);
                var c = piso0 + normal * 0.03f - eje * (ancho * 0.08f);
                portones.Cuadro(
                    c - eje * (wP / 2f), c + eje * (wP / 2f),
                    c + eje * (wP / 2f) + Vector3.up * 3.2f, c - eje * (wP / 2f) + Vector3.up * 3.2f, 0.37f, true);
                Hueco(marcos, c + Vector3.up * 3.2f, eje, normal, wP + 0.2f, 0.25f, 0.12f);
                Puerta(marcos, piso0 + eje * (ancho * 0.38f), eje, normal, molduras);
                return;
            }

            if (b.Zaguan && portones != null && !b.Cortina)
            {
                // Casa con cochera: el zaguán de un lado y la puerta del otro.
                var c = piso0 + normal * 0.03f - eje * (ancho * 0.2f);
                portones.Cuadro(
                    c - eje * 1.3f, c + eje * 1.3f,
                    c + eje * 1.3f + Vector3.up * 2.3f, c - eje * 1.3f + Vector3.up * 2.3f, 0.37f, true);
                Hueco(marcos, c + Vector3.up * 2.3f, eje, normal, 2.8f, 0.12f, 0.1f);
                Puerta(marcos, piso0 + eje * (ancho * 0.36f), eje, normal, molduras);
            }
            else if (b.Cortina)
            {
                // Planta baja de local: cortina metálica casi a todo lo ancho y su puerta al lado.
                var wCortina = Mathf.Min(ancho * 0.55f, 4.2f);
                var c = piso0 - eje * (ancho * 0.12f) + normal * 0.03f;
                lamina.Cuadro(
                    c - eje * (wCortina / 2f), c + eje * (wCortina / 2f),
                    c + eje * (wCortina / 2f) + Vector3.up * 2.6f, c - eje * (wCortina / 2f) + Vector3.up * 2.6f, 0.37f, true);
                Hueco(marcos, c + Vector3.up * 2.6f, eje, normal, wCortina + 0.2f, 0.3f, 0.12f);
                Puerta(marcos, piso0 + eje * (ancho * 0.34f), eje, normal, molduras);
            }
            else
            {
                Puerta(marcos, piso0 + eje * (ancho * 0.3f), eje, normal, molduras);
                Ventanas(cara, eje, normal, ancho * 0.55f, 1, 0, 2.8f, 1.5f, 1.3f, a, azar, marcos, vidrios, encendidas, -ancho * 0.18f, b.Herreria ? rejas : null, escurridos, molduras);
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
                Ventanas(cara, eje, normal, ancho, pisos, 1, 2.7f, 1.3f, 1.25f, a, azar, marcos, vidrios, encendidas, 0f, null, escurridos, molduras);
            }
        }

        /// <summary>Las mallas del acabado de las fachadas de una cuadra.</summary>
        private sealed class Acabados
        {
            public readonly Malla Molduras = new Malla();
            public readonly Malla Zoclos = new Malla();
            public readonly Malla Escurridos = new Malla();
            public readonly Malla Descarapelados = new Malla();
        }

        /// <summary>Una lámina pegada a la fachada: baja `largo` desde `arriba`, con la textura entera a lo alto.</summary>
        private static void Lamina(Malla m, Vector3 arriba, Vector3 eje, Vector3 normal, float ancho, float largo, float repite)
        {
            var c = arriba + normal * 0.014f;
            var i = m.Vertice(c - eje * (ancho / 2f) - Vector3.up * largo, new Vector2(0f, 0f));
            m.Vertice(c + eje * (ancho / 2f) - Vector3.up * largo, new Vector2(repite, 0f));
            m.Vertice(c + eje * (ancho / 2f), new Vector2(repite, 1f));
            m.Vertice(c - eje * (ancho / 2f), new Vector2(0f, 1f));
            m.Triangulo(i, i + 2, i + 1);
            m.Triangulo(i, i + 3, i + 2);
            m.Triangulo(i, i + 1, i + 2);
            m.Triangulo(i, i + 2, i + 3);
        }

        /// <summary>
        /// El relieve y el desgaste de una fachada, con la semilla de la escena: zoclo, cornisa y remate
        /// del pretil, escurrimientos del pretil y de los tinacos, y pintura descarapelada.
        /// </summary>
        private static void Acabado(EdificioEscenario b, Vector3 pie, Vector3 eje, Vector3 normal, float ancho, Azar azar, Acabados ac, Malla concreto)
        {
            var alto = (float)b.AltoM;
            // Zoclo: la franja baja, pintada más oscura.
            Lamina(ac.Zoclos, pie + Vector3.up * 0.9f, eje, normal, ancho, 0.9f, 1f);
            // Cornisa a la altura de la losa y remate sobre el pretil: lo que rompe la caja.
            concreto.Caja(pie + Vector3.up * (alto - 0.14f) + normal * 0.06f, eje, normal, ancho, 0.16f, 0.14f);
            concreto.Caja(pie + Vector3.up * (alto + 0.45f) - normal * 0.05f, eje, normal, ancho + 0.04f, 0.06f, 0.28f);
            var tabique = b.Material == MaterialFachada.Tabique;
            if (azar.Siguiente() < 0.6f)
            {
                // La humedad que baja del pretil a todo lo ancho.
                Lamina(ac.Escurridos, pie + Vector3.up * (alto - 0.16f), eje, normal, ancho, azar.Entre(0.7f, 1.4f), ancho / 2.5f);
            }

            var u = azar.Siguiente();
            var chorro = azar.Entre(0.9f, 1.5f);
            var caida = Mathf.Min(alto - 0.5f, azar.Entre(1.8f, 3.2f));
            if (b.Tinacos > 0 && u < 0.75f)
            {
                // Bajo el tinaco, la chorreadura larga.
                Lamina(ac.Escurridos, pie + Vector3.up * (alto - 0.16f) + eje * ((u - 0.37f) * ancho * 0.8f), eje, normal, chorro, caida, 1f);
            }

            var parches = tabique ? 0 : (int)(azar.Siguiente() * 2.6f);
            for (var k = 0; k < 2; k++)
            {
                var x = azar.Entre(-0.4f, 0.4f) * ancho;
                var w = azar.Entre(1f, 2.4f);
                var h = azar.Entre(0.5f, 1.5f);
                if (k < parches)
                {
                    Lamina(ac.Descarapelados, pie + Vector3.up * (h + 0.04f) + eje * x, eje, normal, Mathf.Min(w, ancho * 0.6f), h, 1f);
                }
            }
        }

        private static string ColorToldo(Azar azar)
        {
            var colores = new[] { "#9b2f2a", "#1f5b8a", "#2f6b3c", "#c9a227", "#6b6f73" };
            return colores[(int)(azar.Siguiente() * colores.Length) % colores.Length];
        }

        /// <summary>Un terreno baldío: su barda perimetral y el portón de lámina a la calle.</summary>
        private static void Barda(EdificioEscenario b, Vector3 centro, Vector3 largo, Vector3 n, float w, float d, Malla muro, Malla lamina)
        {
            const float H = 2.6f;
            muro.Caja(centro + n * (d / 2f - 0.08f), largo, n, w, H, 0.16f, 0.5f);
            muro.Caja(centro - n * (d / 2f - 0.08f), largo, n, w, H, 0.16f, 0.5f);
            muro.Caja(centro + largo * (w / 2f - 0.08f), n, largo, d, H, 0.16f, 0.5f);
            muro.Caja(centro - largo * (w / 2f - 0.08f), n, largo, d, H, 0.16f, 0.5f);
            var p = centro + n * (d / 2f + 0.03f) + Vector3.up * 0.3f + largo * (w * 0.2f);
            lamina.Cuadro(p - largo * 1.2f, p + largo * 1.2f, p + largo * 1.2f + Vector3.up * 2.1f, p - largo * 1.2f + Vector3.up * 2.1f, 0.37f, true);
        }

        /// <summary>El frente de una casa remetida: barda baja y reja de herrería hasta 2 m.</summary>
        private static void Reja(Vector3 linea, Vector3 largo, Vector3 n, float w, Malla muro, Malla rejas)
        {
            var pie = linea - n * 0.08f;
            muro.Caja(pie, largo, n, w, 1.1f, 0.16f, 0.5f);
            for (var x = -w / 2f + 0.1f; x < w / 2f; x += 0.22f)
            {
                rejas.Caja(pie + Vector3.up * 1.1f + largo * x, largo, n, 0.02f, 1.2f, 0.02f);
            }

            rejas.Caja(pie + Vector3.up * 2.28f, largo, n, w, 0.03f, 0.03f);
        }

        /// <summary>Un marco hundido: el hueco oscuro de una ventana o una puerta.</summary>
        private static void Hueco(Malla marcos, Vector3 baseCentro, Vector3 eje, Vector3 normal, float ancho, float alto, float saliente)
        {
            marcos.Caja(baseCentro + normal * (saliente / 2f - 0.02f), eje, normal, ancho, alto, saliente);
        }

        private static void Puerta(Malla marcos, Vector3 pie, Vector3 eje, Vector3 normal, Malla molduras = null)
        {
            marcos.Caja(pie + normal * 0.01f, eje, normal, 1.0f, 2.15f, 0.06f);
            if (molduras != null)
            {
                // El marco de la puerta: dos jambas y el dintel, salidos del muro.
                molduras.Caja(pie - eje * 0.56f, eje, normal, 0.12f, 2.27f, 0.1f);
                molduras.Caja(pie + eje * 0.56f, eje, normal, 0.12f, 2.27f, 0.1f);
                molduras.Caja(pie + Vector3.up * 2.15f, eje, normal, 1.24f, 0.12f, 0.12f);
            }
        }

        /// <summary>Ventanas con marco, repisa y vidrio, repartidas a lo ancho de una cara, por piso.</summary>
        private static void Ventanas(
            Vector3 cara, Vector3 eje, Vector3 normal, float ancho, int pisos, int desdePiso, float paso,
            float w, float h, AmbienteEscenario a, Azar azar, Malla marcos, Malla vidrios, Malla encendidas,
            float corrimiento = 0f, Malla rejas = null, Malla escurridos = null, Malla molduras = null)
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
                    if (molduras != null)
                    {
                        // La moldura alrededor: dintel, repisa y jambas, salidos del muro.
                        molduras.Caja(c + Vector3.up * (h + G), eje, normal, w + 0.4f, 0.12f, 0.12f);
                        molduras.Caja(c - Vector3.up * (G + 0.1f), eje, normal, w + 0.4f, 0.1f, 0.16f);
                        molduras.Caja(c - eje * (w / 2f + G + 0.06f) - Vector3.up * G, eje, normal, 0.12f, h + 2f * G, 0.1f);
                        molduras.Caja(c + eje * (w / 2f + G + 0.06f) - Vector3.up * G, eje, normal, 0.12f, h + 2f * G, 0.1f);
                    }

                    if (escurridos != null && azar.Siguiente() < 0.5f)
                    {
                        // El agua que escurre de la repisa deja su mancha.
                        Lamina(escurridos, c - Vector3.up * (G + 0.1f), eje, normal, w + 0.2f, azar.Entre(0.6f, 1.1f), 1f);
                    }

                    if (rejas != null)
                    {
                        // Protección de herrería: barrotes y dos travesaños, por fuera del marco.
                        var r0 = c + normal * 0.12f;
                        for (var r = 0; r <= 6; r++)
                        {
                            rejas.Caja(r0 + eje * (-w / 2f + w * r / 6f), eje, normal, 0.022f, h, 0.022f);
                        }

                        rejas.Caja(r0 + Vector3.up * (h * 0.2f), eje, normal, w, 0.022f, 0.022f);
                        rejas.Caja(r0 + Vector3.up * (h * 0.8f), eje, normal, w, 0.022f, 0.022f);
                    }
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

        private static void Horizonte(Transform padre, EntornoEscenario en, AmbienteEscenario a, long semilla)
        {
            // Cada capa es una ladera con pendiente (la luz del sol la modela) y textura de pasto, tierra,
            // monte y roca. Cuanto más lejos, más se funde con el aire: la perspectiva atmosférica.
            // De noche la alumbra la luna como al resto del campo: es una ladera oscura que se lee
            // contra el cielo, no una silueta negra.
            // De noche el «aire» es un gris azulado claro: con la luna encima queda una ladera oscura
            // pero con textura; con el azul casi negro del cielo, los cerros lejanos salían negros.
            var aire = a.Noche ? new Color(0.17f, 0.18f, 0.22f) : Color.Lerp(RenderSettings.fogColor, new Color(0.55f, 0.66f, 0.75f), 0.35f);
            var azar = new Azar(semilla + 503);
            for (var i = 0; i < en.Cerros.Length; i++)
            {
                var c = en.Cerros[i];
                var n = c.AlturasM.Length;
                // La niebla de URP es global (el material no la puede apagar) y a 720 o 1,100 m ya los
                // dejaba del color del aire: azules de día y negros de noche. Las capas lejanas se
                // acercan a menos de 530 m con la misma altura aparente (todo se escala por `k`); la
                // diferencia de paralaje no se nota dentro de la escena.
                var r0 = (float)c.RadioM;
                var r = r0 <= 450f ? r0 : 450f + (r0 - 450f) * 0.12f;
                var escala = r / r0;
                var maximo = 0f;
                foreach (var h in c.AlturasM)
                {
                    maximo = Mathf.Max(maximo, (float)h * escala);
                }

                // La cresta, con tres puntos por cada uno del contrato y un poco de quiebre.
                const int Sub = 3;
                var crestas = new List<(float ang, float alto)>();
                for (var k = 0; k + 1 < n; k++)
                {
                    for (var s = 0; s < Sub; s++)
                    {
                        var f = s / (float)Sub;
                        var ang = (float)(c.DesdeRad + (c.HastaRad - c.DesdeRad) * (k + f) / Math.Max(1, n - 1));
                        var h0 = (float)c.AlturasM[k] * escala;
                        var h1 = (float)c.AlturasM[k + 1] * escala;
                        var alto = Mathf.Lerp(h0, h1, f * f * (3f - 2f * f));
                        if (s > 0)
                        {
                            alto += azar.Entre(-0.012f, 0.012f) * maximo;
                        }

                        crestas.Add((ang, Mathf.Max(alto, 2f)));
                    }
                }

                crestas.Add(((float)c.HastaRad, (float)c.AlturasM[n - 1] * escala));
                var m = new Malla();
                var repeticion = Mathf.Max(60f, maximo + 6f) * 1.6f;
                // Cuatro hileras de la base (abajo del piso, más cerca) a la cresta (más lejos).
                var filas = new[] { 0f, 0.3f, 0.65f, 1f };
                var recorrido = 0f;
                for (var k = 0; k < crestas.Count; k++)
                {
                    var (ang, alto) = crestas[k];
                    if (k > 0)
                    {
                        recorrido += Mathf.Abs(ang - crestas[k - 1].ang) * r;
                    }

                    var dir = new Vector3(Mathf.Cos(ang), 0f, Mathf.Sin(ang));
                    foreach (var f in filas)
                    {
                        var y = Mathf.Lerp(-6f, alto, Mathf.Pow(f, 0.85f));
                        var radio = r * Mathf.Lerp(0.94f, 1.02f, f);
                        m.Vertice(dir * radio + Vector3.up * y, new Vector2(recorrido / repeticion, Mathf.Clamp01((y + 6f) / (maximo + 6f))));
                    }

                    if (k > 0)
                    {
                        var b0 = (k - 1) * filas.Length;
                        var b1 = k * filas.Length;
                        for (var f = 0; f + 1 < filas.Length; f++)
                        {
                            // Mira hacia el centro de la escena.
                            m.Triangulo(b0 + f, b1 + f, b0 + f + 1);
                            m.Triangulo(b0 + f + 1, b1 + f, b1 + f + 1);
                        }
                    }
                }

                var lejos = Mathf.InverseLerp(400f, 1100f, r0);
                var textura = Materiales.Ladera(i, repeticion, maximo + 6f, lejos, aire, a.Noche);
                var mat = new Material(Materiales.Liso(Color.white, 0.02f)) { name = "cerros_" + i };
                mat.SetTexture("_BaseMap", textura);
                m.Poner(padre, "cerros_" + i, mat, false, false);
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
