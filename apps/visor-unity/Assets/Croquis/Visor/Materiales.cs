using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace Croquis.Visor
{
    /// <summary>
    /// Los materiales del escenario. Son reglas de dibujo, no datos del caso (ADR 0112). Las bases se
    /// preparan como assets antes del build (`PrepararEscenario`, ADR 0113), para que el build lleve sus
    /// variantes de sombreador; aquí solo se copian y se tiñen, una vez por combinación.
    /// </summary>
    public static class Materiales
    {
        private static readonly Dictionary<string, Material> Cache = new Dictionary<string, Material>();
        private static JObject manifiesto;

        private static Material Base(string nombre)
        {
            var m = Resources.Load<Material>("materiales/" + nombre);
            if (m == null)
            {
                throw new System.InvalidOperationException(
                    "Falta el material «" + nombre + "». Corre «Croquis/Preparar proyecto».");
            }

            return m;
        }

        /// <summary>Cuántos metros cubre una repetición de la textura (de `recursos_escenario.json`).</summary>
        public static float Mosaico(string textura)
        {
            if (manifiesto == null)
            {
                var t = Resources.Load<TextAsset>("recursos_escenario");
                manifiesto = t != null ? JObject.Parse(t.text) : new JObject();
            }

            return (float?)manifiesto["texturas"]?[textura]?["mosaico_m"] ?? 2f;
        }

        /// <summary>Un material PBR con sus texturas, teñido. `nombre` es el de `materiales/`.</summary>
        public static Material Pbr(string nombre, Color? tinte = null)
        {
            var c = tinte ?? Color.white;
            var llave = "pbr|" + nombre + "|" + ColorUtility.ToHtmlStringRGBA(c);
            if (Cache.TryGetValue(llave, out var m))
            {
                return m;
            }

            var b = Base(nombre);
            if (tinte == null)
            {
                Cache[llave] = b;
                return b;
            }

            m = new Material(b) { name = llave };
            m.SetColor("_BaseColor", b.GetColor("_BaseColor") * c);
            Cache[llave] = m;
            return m;
        }

        /// <summary>
        /// El suelo de baja y media (`Croquis/Suelo`): el material de `Pbr` con sus dos capas encima en la
        /// misma pasada. Una copia por parche de suelo, porque las capas son suyas.
        /// </summary>
        public static Material SueloCapas(string nombre, Color tinte)
        {
            var m = new Material(Base(nombre + "_capas")) { name = "suelo|" + nombre };
            m.SetColor("_BaseColor", Base(nombre).GetColor("_BaseColor") * tinte);
            m.SetTexture("_TonosMap", Transparente1x1());
            m.SetTexture("_ParcelasMap", Transparente1x1());
            return m;
        }

        private static Texture2D transparente;

        private static Texture2D Transparente1x1()
        {
            if (transparente == null)
            {
                transparente = new Texture2D(1, 1, TextureFormat.RGBA32, false) { name = "transparente" };
                transparente.SetPixels32(new[] { new Color32(0, 0, 0, 0) });
                transparente.Apply(false, true);
            }

            return transparente;
        }

        /// <summary>Para las mallas que solo proyectan sombra (`SombrasUnidas`): con el recorte de caras pedido.</summary>
        public static Material SoloSombra(int recorte)
        {
            var llave = "solo_sombra|" + recorte;
            if (!Cache.TryGetValue(llave, out var m))
            {
                m = new Material(Base("liso")) { name = llave };
                m.SetFloat("_Cull", recorte);
                Cache[llave] = m;
            }

            return m;
        }

        /// <summary>Un material opaco de un solo color.</summary>
        public static Material Liso(Color color, float lisura = 0.2f, float metal = 0f)
        {
            var llave = "liso|" + ColorUtility.ToHtmlStringRGBA(color) + "|" + lisura + "|" + metal;
            if (Cache.TryGetValue(llave, out var m))
            {
                return m;
            }

            m = new Material(Base("liso")) { name = llave };
            m.SetColor("_BaseColor", color);
            m.SetFloat("_Smoothness", lisura);
            m.SetFloat("_Metallic", metal);
            Cache[llave] = m;
            return m;
        }

        /// <summary>Un material que brilla solo: focos de luminaria, ventanas de noche.</summary>
        public static Material Emisivo(Color color, Color brillo)
        {
            var llave = "emisivo|" + ColorUtility.ToHtmlStringRGBA(color) + "|" + brillo;
            if (Cache.TryGetValue(llave, out var m))
            {
                return m;
            }

            m = new Material(Base("emisivo")) { name = llave };
            m.SetColor("_BaseColor", color);
            m.SetColor("_EmissionColor", brillo);
            Cache[llave] = m;
            return m;
        }

        /// <summary>Pintura sobre el piso (rayas, huellas), con su desgaste como transparencia.</summary>
        public static Material Calca(Color color, float lisura = 0.35f)
        {
            var llave = "calca|" + ColorUtility.ToHtmlStringRGBA(color) + "|" + lisura;
            if (Cache.TryGetValue(llave, out var m))
            {
                return m;
            }

            m = new Material(Base("calca")) { name = llave };
            m.SetColor("_BaseColor", color);
            m.SetFloat("_Smoothness", lisura);
            Cache[llave] = m;
            return m;
        }

        public static Material Vidrio => Base("vidrio");

        /// <summary>El vidrio de los vehículos: neutro, sin el reflejo de la sonda (ADR 0114).</summary>
        public static Material VidrioVehiculo => Base("vidrio_vehiculo");
        public static Material Charco => Base("charco");

        /// <summary>El fondo horneado del minimapa: una textura sin luz ni niebla (`Croquis/MinimapaFondo`).</summary>
        public static Material MinimapaFondo => Base("minimapa_fondo");
        public static Material Lluvia => Base("lluvia");

        /// <summary>La lluvia de baja y media: el mismo color, con las gotas movidas en la GPU (`Croquis/Lluvia`).</summary>
        public static Material LluviaMalla => Base("lluvia_malla");

        /// <summary>El vehículo en el minimapa de baja y media: una malla con el color en los vértices.</summary>
        public static Material MinimapaVehiculo => Base("minimapa_vehiculo");

        /// <summary>Una mancha redonda que se desvanece hacia la orilla (alfa), para sombras y halos.</summary>
        public static Texture2D Mancha(string nombre, float nucleo, float potencia, bool anillo = false)
        {
            if (Texturas.TryGetValue(nombre, out var t))
            {
                return t;
            }

            const int N = 64;
            t = new Texture2D(N, N, TextureFormat.RGBA32, true) { wrapMode = TextureWrapMode.Clamp, name = nombre };
            var px = new Color32[N * N];
            for (var j = 0; j < N; j++)
            {
                for (var i = 0; i < N; i++)
                {
                    var r = new Vector2((i + 0.5f) / N * 2f - 1f, (j + 0.5f) / N * 2f - 1f).magnitude;
                    var a = anillo
                        ? Mathf.Clamp01(1f - Mathf.Abs(r - 0.72f) / 0.2f)
                        : Mathf.Pow(Mathf.Clamp01((1f - r) / (1f - nucleo)), potencia);
                    px[j * N + i] = new Color(1f, 1f, 1f, a);
                }
            }

            t.SetPixels32(px);
            t.Apply(true, true);
            Texturas[nombre] = t;
            return t;
        }

        private static readonly Dictionary<string, Texture2D> Texturas = new Dictionary<string, Texture2D>();

        private static Texture2D Pintar(string nombre, int n, bool repite, System.Func<float, float, Color> pixel)
        {
            if (Texturas.TryGetValue(nombre, out var t))
            {
                return t;
            }

            t = new Texture2D(n, n, TextureFormat.RGBA32, true)
            {
                wrapMode = repite ? TextureWrapMode.Repeat : TextureWrapMode.Clamp,
                name = nombre,
            };
            var px = new Color[n * n];
            for (var j = 0; j < n; j++)
            {
                for (var i = 0; i < n; i++)
                {
                    px[j * n + i] = pixel((i + 0.5f) / n, (j + 0.5f) / n);
                }
            }

            t.SetPixels(px);
            t.Apply(true, true);
            Texturas[nombre] = t;
            return t;
        }

        /// <summary>
        /// Rampa suave de 0 (en `desde`) a 1 (en `hasta`), como `smoothstep` de los sombreadores.
        /// `Mathf.SmoothStep` no es eso: interpola entre sus dos primeros argumentos, y con él las
        /// texturas de desgaste salían como cuadros parejos (encontrado el 2026-11-10; ADR 0113).
        /// </summary>
        private static float Paso(float desde, float hasta, float x)
        {
            var t = Mathf.Clamp01((x - desde) / (hasta - desde));
            return t * t * (3f - 2f * t);
        }

        /// <summary>Ruido de valor que se repite sin costura, en [0, 1]; `celdas` por lado.</summary>
        private static float Ruido(float u, float v, int celdas, int semilla)
        {
            float En(int i, int j)
            {
                i = ((i % celdas) + celdas) % celdas;
                j = ((j % celdas) + celdas) % celdas;
                var h = (uint)(i * 374761393 + j * 668265263 + semilla * 1274126177);
                h = (h ^ (h >> 13)) * 1274126177u;
                return ((h ^ (h >> 16)) & 0xffff) / 65535f;
            }

            var x = u * celdas;
            var y = v * celdas;
            var i0 = Mathf.FloorToInt(x);
            var j0 = Mathf.FloorToInt(y);
            var fx = x - i0;
            var fy = y - j0;
            fx = fx * fx * (3f - 2f * fx);
            fy = fy * fy * (3f - 2f * fy);
            return Mathf.Lerp(Mathf.Lerp(En(i0, j0), En(i0 + 1, j0), fx), Mathf.Lerp(En(i0, j0 + 1), En(i0 + 1, j0 + 1), fx), fy);
        }

        /// <summary>Pintura gastada: la raya pierde pedazos donde más se pisa. Se repite cada 4 m.</summary>
        public static Material RayaGastada(Color color)
        {
            var tex = Pintar("raya_gastada", 128, true, (u, v) =>
            {
                var r = 0.6f * Ruido(u, v, 8, 3) + 0.4f * Ruido(u, v, 32, 5);
                // Solo aclara: una raya continua nunca se debe ver cortada (se leería discontinua).
                return new Color(1f, 1f, 1f, Mathf.Lerp(0.62f, 1f, Paso(0.3f, 0.55f, r)));
            });
            var llave = "raya|" + ColorUtility.ToHtmlStringRGBA(color);
            if (!Cache.TryGetValue(llave, out var m))
            {
                m = new Material(Base("calca")) { name = llave };
                m.SetTexture("_BaseMap", tex);
                m.SetTextureScale("_BaseMap", new Vector2(0.25f, 0.25f));
                m.SetColor("_BaseColor", color);
                m.SetFloat("_Smoothness", 0.3f);
                Cache[llave] = m;
            }

            return m;
        }

        /// <summary>Grietas: unas cuantas líneas quebradas oscuras sobre transparente.</summary>
        public static Material Grietas()
        {
            const int N = 256;
            if (!Texturas.TryGetValue("grietas", out var tex))
            {
                var alfa = new float[N * N];
                var azar = new Azar(4127);
                for (var g = 0; g < 7; g++)
                {
                    var p = new Vector2(azar.Entre(0.2f, 0.8f) * N, azar.Entre(0.2f, 0.8f) * N);
                    var ang = azar.Entre(0f, Mathf.PI * 2f);
                    var pasos = (int)azar.Entre(60f, 170f);
                    for (var k = 0; k < pasos; k++)
                    {
                        ang += azar.Entre(-0.45f, 0.45f);
                        p += new Vector2(Mathf.Cos(ang), Mathf.Sin(ang));
                        // Se desvanece hacia la orilla de la calca: no se ve el cuadro.
                        var borde = Mathf.Clamp01(Mathf.Min(Mathf.Min(p.x, N - p.x), Mathf.Min(p.y, N - p.y)) / 40f);
                        for (var dy = -1; dy <= 1; dy++)
                        {
                            for (var dx = -1; dx <= 1; dx++)
                            {
                                var x = Mathf.RoundToInt(p.x) + dx;
                                var y = Mathf.RoundToInt(p.y) + dy;
                                if (x >= 0 && y >= 0 && x < N && y < N)
                                {
                                    var a = (dx == 0 && dy == 0 ? 0.9f : 0.3f) * borde;
                                    alfa[y * N + x] = Mathf.Max(alfa[y * N + x], a);
                                }
                            }
                        }
                    }
                }

                tex = Pintar("grietas", N, false, (u, v) =>
                    new Color(1f, 1f, 1f, alfa[Mathf.Min(N - 1, (int)(v * N)) * N + Mathf.Min(N - 1, (int)(u * N))]));
            }

            return ConMancha("grietas", "calca", tex, new Color(0.03f, 0.03f, 0.03f, 0.8f));
        }

        /// <summary>Un parche de bacheo: un rectángulo de asfalto más nuevo, de orilla irregular.</summary>
        public static Material Parche()
        {
            var tex = Pintar("parche", 64, false, (u, v) =>
            {
                var d = Mathf.Max(Mathf.Abs(u - 0.5f), Mathf.Abs(v - 0.5f)) * 2f;
                var orilla = 0.86f + 0.08f * Ruido(u, v, 6, 9);
                return new Color(1f, 1f, 1f, 1f - Paso(orilla - 0.06f, orilla, d));
            });
            return ConMancha("parche", "calca", tex, new Color(0.035f, 0.035f, 0.038f, 0.62f));
        }

        /// <summary>Una mancha de aceite o un bache: oscura al centro y suelta hacia la orilla.</summary>
        public static Material ManchaOscura(float fuerza)
        {
            var tex = Pintar("mancha_irregular", 64, false, (u, v) =>
            {
                var r = new Vector2(u * 2f - 1f, v * 2f - 1f).magnitude;
                var orilla = 0.6f + 0.35f * Ruido(u, v, 5, 21);
                return new Color(1f, 1f, 1f, 1f - Paso(orilla * 0.35f, orilla, r));
            });
            return ConMancha("mancha_oscura", "calca", tex, new Color(0.02f, 0.02f, 0.022f, fuerza));
        }

        /// <summary>La rodada: una franja que oscurece el centro y se pierde a los lados.</summary>
        public static Material Rodada(Color color)
        {
            var tex = Pintar("rodada", 64, true, (u, v) =>
            {
                var c = 1f - Mathf.Abs(v * 2f - 1f);
                return new Color(1f, 1f, 1f, Paso(0f, 0.8f, c) * (0.75f + 0.25f * Ruido(u, v, 8, 33)));
            });
            return ConMancha("rodada", "calca", tex, color);
        }

        /// <summary>Escurrimiento: chorreaduras que bajan de un pretil, un tinaco o una ventana y se pierden.</summary>
        public static Material Escurrido()
        {
            var tex = Pintar("escurrido", 128, true, (u, v) =>
            {
                // Vetas verticales (el ruido casi no cambia a lo alto) que se apagan hacia abajo (v = 0).
                var veta = Paso(0.38f, 0.78f, 0.7f * Ruido(u, v * 0.12f, 14, 51) + 0.3f * Ruido(u, v * 0.3f, 40, 53));
                return new Color(1f, 1f, 1f, veta * Mathf.Pow(v, 1.4f));
            });
            tex.wrapModeV = TextureWrapMode.Clamp;
            return ConMancha("escurrido", "calca", tex, new Color(0.055f, 0.05f, 0.045f, 0.6f));
        }

        /// <summary>Pintura descarapelada: parches donde asoma el aplanado gris.</summary>
        public static Material Descarapelado()
        {
            var tex = Pintar("descarapelado", 64, false, (u, v) =>
            {
                var r = 0.6f * Ruido(u, v, 5, 61) + 0.4f * Ruido(u, v, 14, 63);
                var orilla = 1f - Paso(0.65f, 1f, Mathf.Max(Mathf.Abs(u - 0.5f), Mathf.Abs(v - 0.5f)) * 2f);
                return new Color(1f, 1f, 1f, Paso(0.5f, 0.6f, r) * orilla);
            });
            return ConMancha("descarapelado", "calca", tex, new Color(0.6f, 0.58f, 0.54f, 0.92f));
        }

        /// <summary>Tonos del suelo: manchas grandes que rompen el color parejo del pasto o de la tierra.</summary>
        public static Material Tonos(Color color)
        {
            var tex = Pintar("tonos", 128, true, (u, v) =>
            {
                var r = 0.65f * Ruido(u, v, 5, 41) + 0.35f * Ruido(u, v, 17, 43);
                return new Color(1f, 1f, 1f, Paso(0.5f, 0.85f, r));
            });
            return ConMancha("tonos", "calca", tex, color);
        }

        /// <summary>Una mata de pasto: hojas en abanico sobre transparente, para tarjetas cruzadas.</summary>
        public static Material Mata(bool seca, bool noche = false)
        {
            const int N = 64;
            var nombre = seca ? "mata_seca" : "mata";
            if (!Texturas.TryGetValue(nombre, out var tex))
            {
                var px = new Color[N * N];
                var azar = new Azar(seca ? 911 : 907);
                for (var h = 0; h < 26; h++)
                {
                    var x0 = azar.Entre(0.3f, 0.7f) * N;
                    var inclina = azar.Entre(-0.55f, 0.55f);
                    var alto = azar.Entre(0.45f, 0.98f) * N;
                    var tono = azar.Entre(0.7f, 1.15f);
                    var c = seca ? new Color(0.78f, 0.7f, 0.4f) * tono : new Color(0.42f, 0.6f, 0.24f) * tono;
                    for (var y = 0; y < alto; y++)
                    {
                        var u = y / alto;
                        var x = x0 + inclina * y * (0.5f + u);
                        var ancho = Mathf.Lerp(1.6f, 0.4f, u);
                        for (var dx = -2; dx <= 2; dx++)
                        {
                            var xi = Mathf.RoundToInt(x) + dx;
                            if (xi >= 0 && xi < N && Mathf.Abs(dx) <= ancho)
                            {
                                px[y * N + xi] = new Color(c.r * (0.7f + 0.3f * u), c.g * (0.7f + 0.3f * u), c.b, 1f);
                            }
                        }
                    }
                }

                tex = new Texture2D(N, N, TextureFormat.RGBA32, true) { wrapMode = TextureWrapMode.Clamp, name = nombre };
                tex.SetPixels(px);
                tex.Apply(true, true);
                Texturas[nombre] = tex;
            }

            var llave = nombre + (noche ? "|noche" : "");
            if (!Cache.TryGetValue(llave, out var m))
            {
                // Sobre su material base (`mata`): aquí solo se le pone la textura, sin tocar sus
                // palabras clave, para que el build traiga la variante del sombreador.
                m = new Material(Base("mata")) { name = llave };
                m.SetTexture("_BaseMap", tex);
                m.SetColor("_BaseColor", noche ? new Color(0.42f, 0.46f, 0.44f) : Color.white);
                Cache[llave] = m;
            }

            return m;
        }

        /// <summary>Tierra suelta junto a la orilla de grava: llena junto a la vía y se pierde en el pasto.</summary>
        public static Material OrillaDeTierra()
        {
            var tex = Pintar("orilla_tierra", 128, true, (u, v) =>
            {
                // v = 0 junto a la grava, v = 1 hacia el pasto.
                var r = 0.6f * Ruido(u, v, 10, 71) + 0.4f * Ruido(u, v, 37, 73);
                var corte = Mathf.Lerp(0.15f, 0.95f, v);
                return new Color(1f, 1f, 1f, Paso(corte - 0.12f, corte + 0.12f, r) * 0.9f);
            });
            tex.wrapModeV = TextureWrapMode.Clamp;
            return ConMancha("orilla_tierra", "calca", tex, new Color(0.36f, 0.3f, 0.22f, 0.85f));
        }

        /// <summary>
        /// Un matorral: racimos de hojas en domo sobre unas ramas, para tarjetas cruzadas. Tres follajes:
        /// 0 verde, 1 olivo, 2 seco (el de la temporada de secas en el altiplano).
        /// </summary>
        public static Material Matorral(int follaje, bool noche = false)
        {
            const int N = 128;
            var nombre = "matorral_" + follaje;
            if (!Texturas.TryGetValue(nombre, out var tex))
            {
                var px = new Color[N * N];
                var azar = new Azar(1301 + follaje * 17);
                var baseColor = follaje == 0
                    ? new Color(0.2f, 0.31f, 0.12f)
                    : follaje == 1 ? new Color(0.3f, 0.33f, 0.15f) : new Color(0.43f, 0.38f, 0.22f);
                // Ramas: del pie hacia afuera, oscuras.
                for (var r = 0; r < 7; r++)
                {
                    var x = N * 0.5f + azar.Entre(-4f, 4f);
                    var ang = Mathf.PI / 2f + azar.Entre(-0.9f, 0.9f);
                    for (var y = 0f; y < N * 0.7f; y += 1f)
                    {
                        var xi = Mathf.RoundToInt(x + Mathf.Cos(ang) / Mathf.Max(0.2f, Mathf.Sin(ang)) * y);
                        var yi = Mathf.RoundToInt(y);
                        if (xi >= 0 && xi < N && yi < N)
                        {
                            px[yi * N + xi] = new Color(0.16f, 0.12f, 0.08f, 1f);
                        }
                    }
                }

                // Racimos de hojas dentro de un domo; más oscuros abajo y adentro.
                for (var k = 0; k < 190; k++)
                {
                    var cx = azar.Entre(0.1f, 0.9f);
                    var techo = 0.12f + 0.8f * Mathf.Sqrt(Mathf.Max(0f, 1f - Mathf.Pow((cx - 0.5f) / 0.42f, 2f)));
                    var cy = azar.Entre(0.1f, 1f) * techo;
                    var radio = azar.Entre(3f, 7.5f);
                    var luz = Mathf.Lerp(0.62f, 1.18f, cy / Mathf.Max(techo, 0.01f)) * azar.Entre(0.85f, 1.12f);
                    var c = baseColor * luz;
                    for (var dy = -8; dy <= 8; dy++)
                    {
                        for (var dx = -8; dx <= 8; dx++)
                        {
                            var xi = Mathf.RoundToInt(cx * N) + dx;
                            var yi = Mathf.RoundToInt(cy * N) + dy;
                            if (xi < 0 || yi < 0 || xi >= N || yi >= N)
                            {
                                continue;
                            }

                            // Orilla mordida: el racimo es de hojas, no un disco.
                            var orilla = radio * (0.75f + 0.5f * Ruido(xi / (float)N, yi / (float)N, 32, 1303 + follaje));
                            if (dx * dx + dy * dy <= orilla * orilla)
                            {
                                px[yi * N + xi] = new Color(c.r, c.g, c.b, 1f);
                            }
                        }
                    }
                }

                tex = new Texture2D(N, N, TextureFormat.RGBA32, true) { wrapMode = TextureWrapMode.Clamp, name = nombre };
                tex.SetPixels(px);
                tex.Apply(true, true);
                Texturas[nombre] = tex;
            }

            var llave = nombre + (noche ? "|noche" : "");
            if (!Cache.TryGetValue(llave, out var m))
            {
                // Sobre la base de las matas, por la misma razón: la variante del sombreador.
                m = new Material(Base("mata")) { name = llave };
                m.SetTexture("_BaseMap", tex);
                m.SetColor("_BaseColor", noche ? new Color(0.5f, 0.54f, 0.52f) : Color.white);
                Cache[llave] = m;
            }

            return m;
        }

        /// <summary>Los dos tamaños de la textura de ladera: (ancho que cubre, alto nominal) en metros.</summary>
        public static Vector2 MedidasLadera(bool lejos) => lejos ? new Vector2(200f, 110f) : new Vector2(90f, 45f);

        /// <summary>
        /// La textura de ladera de las capas cercanas o lejanas, horneada por `PrepararEscenario`: generarla
        /// al cargar el caso costaba casi medio segundo por capa en WebGL (medido el 2026-11-10).
        /// </summary>
        public static Texture2D Ladera(bool lejos)
        {
            var nombre = "cerros/ladera_" + (lejos ? "lejos" : "cerca");
            if (Texturas.TryGetValue(nombre, out var t))
            {
                return t;
            }

            t = Resources.Load<Texture2D>(nombre);
            if (t == null)
            {
                throw new System.InvalidOperationException("Falta la textura «" + nombre + "». Corre «Croquis/Preparar proyecto».");
            }

            t.wrapModeU = TextureWrapMode.Repeat;
            t.wrapModeV = TextureWrapMode.Clamp;
            Texturas[nombre] = t;
            return t;
        }

        /// <summary>
        /// Pinta una ladera de `n` × `n`: pasto y tierra en manchas, manchas de monte de forma irregular
        /// (más abajo y en las cañadas) y roca clara cerca de la cresta. A lo ancho cubre `metrosPorRepeticion`
        /// y se repite sin costura; a lo alto va de la base (v = 0) a la cresta (v = 1) de una capa de
        /// `altoM`. El velo del aire lo pone la niebla de la escena.
        /// </summary>
        public static Color[] PintarLadera(int n, float metrosPorRepeticion, float altoM, int semilla)
        {
            // Manchas de unos 9 m; el ruido se repite a lo ancho y a lo alto se estira a escala.
            var celdasMonte = Mathf.Max(3, Mathf.RoundToInt(metrosPorRepeticion / 9f));
            var aspecto = altoM / metrosPorRepeticion;
            var pasto = new Color(0.27f, 0.31f, 0.16f);
            var seco = new Color(0.47f, 0.4f, 0.26f);
            var monte = new Color(0.13f, 0.17f, 0.08f);
            var roca = new Color(0.5f, 0.47f, 0.42f);
            var px = new Color[n * n];
            for (var j = 0; j < n; j++)
            {
                var v = (j + 0.5f) / n;
                for (var i = 0; i < n; i++)
                {
                    var u = (i + 0.5f) / n;
                    var manchas = 0.55f * Ruido(u, v, 6, semilla) + 0.3f * Ruido(u, v, 17, semilla + 1) + 0.15f * Ruido(u, v, 45, semilla + 2);
                    var c = Color.Lerp(pasto, seco, Paso(0.35f, 0.7f, manchas));
                    // Cañadas: franjas que bajan (el ruido casi no cambia a lo alto).
                    var canada = Paso(0.55f, 0.8f, Ruido(u, v * 0.15f, 9, semilla + 3));
                    // Vegetación: manchas de monte de forma irregular (de unos 5 a 15 m), más tupidas
                    // abajo y en las cañadas. El ruido va en metros iguales a lo ancho y a lo alto.
                    var vm = v * aspecto;
                    var ruido = 0.5f * Ruido(u, vm, celdasMonte, semilla + 5)
                        + 0.3f * Ruido(u, vm, celdasMonte * 2 + 1, semilla + 6)
                        + 0.2f * Ruido(u, vm, celdasMonte * 5 + 2, semilla + 8);
                    var densidad = Mathf.Lerp(0.4f, 0.14f, v) + canada * 0.22f;
                    // Orilla suave: con un corte seco las manchas parecían de camuflaje.
                    var arbol = Paso(1f - densidad - 0.12f, 1f - densidad + 0.1f, ruido);
                    var sombra = 0.8f + 0.4f * Ruido(u, vm, celdasMonte * 6, semilla + 7);
                    c = Color.Lerp(c, monte * sombra, arbol * 0.62f);
                    var risco = Paso(0.72f, 0.95f, v) * Paso(0.55f, 0.75f, Ruido(u, v, 21, semilla + 4));
                    c = Color.Lerp(c, roca, risco * (1f - arbol));
                    px[j * n + i] = c;
                }
            }

            return px;
        }

        private static Material ConMancha(string llave, string baseMat, Texture2D tex, Color color)
        {
            llave += "|" + ColorUtility.ToHtmlStringRGBA(color);
            if (!Cache.TryGetValue(llave, out var m))
            {
                m = new Material(Base(baseMat)) { name = llave };
                m.SetTexture("_BaseMap", tex);
                m.SetColor("_BaseColor", color);
                Cache[llave] = m;
            }

            return m;
        }

        public static Material SombraContacto(float fuerza)
        {
            return ConMancha("sombra", "sombra", Mancha("mancha_sombra", 0.25f, 1.6f), new Color(0f, 0f, 0f, fuerza));
        }

        public static Material Halo(Color color)
        {
            return ConMancha("halo", "halo", Mancha("mancha_halo", 0f, 2.2f), color);
        }

        public static Material Salpicadura => ConMancha("salpicadura", "salpicadura", Mancha("mancha_anillo", 0f, 1f, true), new Color(0.85f, 0.9f, 0.96f, 0.45f));

        public static Material Arbol(string especie, string vista)
        {
            return Base("arbol_" + especie + "_" + vista);
        }

        /// <summary>El cielo HDRI y cuánto hay que girarlo para que su sol quede donde va.</summary>
        public static Material Cielo(string nombre, out float azimutSol)
        {
            Mosaico("asfalto");
            azimutSol = (float?)manifiesto["hdri"]?[nombre]?["azimut_sol_deg"] ?? 0f;
            var llave = "cielo|" + nombre;
            if (!Cache.TryGetValue(llave, out var m))
            {
                m = new Material(Base("cielo_" + nombre)) { name = llave };
                Cache[llave] = m;
            }

            return m;
        }

        /// <summary>Las medidas de la tarjeta de una especie (m), de `recursos_escenario.json`.</summary>
        public static Vector3 MedidasArbol(string especie)
        {
            Mosaico("asfalto");
            var a = manifiesto["arboles"]?[especie];
            return a == null
                ? new Vector3(5f, 6f, 5f)
                : new Vector3((float)a["ancho_m"], (float)a["alto_m"], (float)a["profundidad_m"]);
        }

        /// <summary>El impostor de una especie: lado del cuadro y alto del modelo (m), vistas y columnas del atlas.</summary>
        public static Vector4 MedidasImpostor(string especie)
        {
            Mosaico("asfalto");
            var i = manifiesto["arboles"]?[especie]?["impostor"];
            if (i == null)
            {
                throw new System.InvalidOperationException(
                    "Falta el impostor de «" + especie + "». Corre `node tools/unity/recursos.mjs`.");
            }

            return new Vector4((float)i["lado_m"], (float)i["alto_m"], (float)i["vistas"], (float)i["columnas"]);
        }

        public static Color Hex(string hex, Color siFalla)
        {
            return ColorUtility.TryParseHtmlString(hex, out var c) ? c : siFalla;
        }
    }
}
