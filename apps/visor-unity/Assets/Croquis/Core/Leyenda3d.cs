using System;

namespace Croquis.Core
{
    /// <summary>
    /// Los colores de la leyenda ilustrativa del 3D (René, 2026-11-15): texto blanco sobre un recuadro
    /// oscuro semitransparente. El recuadro hace que el contraste cumpla WCAG AA (4.5:1 para texto
    /// normal) sobre cualquier fondo, de día y de noche: el peor caso es un fondo blanco puro detrás del
    /// recuadro. Antes era texto blanco al 88 % con una sombra tenue, sin recuadro, y sobre fachadas
    /// claras casi no se leía.
    /// </summary>
    public static class Leyenda3d
    {
        /// <summary>El texto: blanco opaco (RGBA, de 0 a 1).</summary>
        public static readonly (double R, double G, double B, double A) Texto = (1.0, 1.0, 1.0, 1.0);

        /// <summary>El recuadro: el fondo de la app (#0B0C0F) al 78 % (RGBA, de 0 a 1).</summary>
        public static readonly (double R, double G, double B, double A) Fondo = (11 / 255.0, 12 / 255.0, 15 / 255.0, 0.78);

        /// <summary>El margen del recuadro alrededor del texto, en píxeles de la resolución de referencia.</summary>
        public const int MargenX = 8;
        public const int MargenY = 4;

        /// <summary>
        /// Lo que dice la leyenda (IA responsable, §10). Con entorno dibujado, que es procedural; con el
        /// piso del mapa real (ADR 0124), que el piso es una imagen del lugar, con el crédito que pide su
        /// licencia; con una versión superpuesta (ADR 0123), en otro renglón, cuál es la translúcida.
        /// </summary>
        public static string Mensaje(bool entornoProcedural, string atribucionPiso = null, string etiquetaFantasma = null)
        {
            var texto = "Reconstrucción ilustrativa";
            if (atribucionPiso != null)
            {
                texto += string.IsNullOrWhiteSpace(atribucionPiso)
                    ? " · piso: imagen del lugar"
                    : " · piso: imagen del lugar (" + atribucionPiso.Trim() + ")";
            }
            else if (entornoProcedural)
            {
                texto += " · entorno procedural: no es el lugar real";
            }

            if (!string.IsNullOrWhiteSpace(etiquetaFantasma))
            {
                // La tipografía del visor no trae «…»: con tres puntos, «¿Y si…?» no se lee «¿Y si?».
                texto += "\nTranslúcido: " + etiquetaFantasma.Trim().Replace("…", "...");
            }

            return texto;
        }

        /// <summary>Contraste mínimo de WCAG AA para texto normal.</summary>
        public const double MinimoAa = 4.5;

        /// <summary>
        /// El contraste WCAG del texto sobre el recuadro, con un color dado detrás del recuadro (RGB, de 0
        /// a 1): el recuadro se compone sobre ese color con su alfa.
        /// </summary>
        public static double Contraste((double R, double G, double B) detras)
        {
            var a = Fondo.A;
            var r = Fondo.R * a + detras.R * (1 - a);
            var g = Fondo.G * a + detras.G * (1 - a);
            var b = Fondo.B * a + detras.B * (1 - a);
            var claro = Luminancia(Texto.R, Texto.G, Texto.B);
            var oscuro = Luminancia(r, g, b);
            return (Math.Max(claro, oscuro) + 0.05) / (Math.Min(claro, oscuro) + 0.05);
        }

        /// <summary>Luminancia relativa de WCAG 2 de un color sRGB (de 0 a 1).</summary>
        public static double Luminancia(double r, double g, double b)
        {
            double Lin(double c) => c <= 0.04045 ? c / 12.92 : Math.Pow((c + 0.055) / 1.055, 2.4);
            return 0.2126 * Lin(r) + 0.7152 * Lin(g) + 0.0722 * Lin(b);
        }
    }
}
