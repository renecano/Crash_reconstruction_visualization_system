using System;

namespace Croquis.Core
{
    /// <summary>
    /// El piso del modo «mapa real» (ronda 4, punto 9; ADR 0124): una imagen cuadrada del lugar, norte
    /// arriba, que cubre `lado_m` metros con su centro en (`centro_x`, `centro_y`) de la escena. Aquí va
    /// lo que no necesita a Unity: leer la data URL, revisar la imagen antes de abrirla y dónde cae
    /// cada esquina. Unity solo la pone como piso (`PisoMapaVista`).
    /// </summary>
    public static class PisoMapa
    {
        /// <summary>El lado máximo que admite el contrato (`caso3d.schema.json`, `PisoMapa.lado_m`).</summary>
        public const double LadoMaximoM = 2000.0;

        /// <summary>
        /// Lado máximo de la imagen (píxeles). Abierta ocupa 4 bytes por píxel más sus mipmaps: a 4096
        /// son unos 90 MB, el tope para la memoria de WebGL. La web manda 2048 o menos.
        /// </summary>
        public const int PixelesMaximos = 4096;

        /// <summary>
        /// Cuánto se aparta la imagen de un cuadrado (proporción) sin rechazarla: el redondeo de un
        /// recorte deja uno o dos píxeles de diferencia.
        /// </summary>
        public const double ToleranciaCuadrada = 0.02;

        /// <summary>
        /// La altura de la imagen sobre el piso (m): arriba del piso de la vía (0) y abajo de las calcas
        /// del caso (huellas y marcas a 0.024 m o más), para que nada parpadee.
        /// </summary>
        public const double AlturaSobrePiso = 0.012;

        /// <summary>
        /// La orilla neutra que sigue a la imagen hasta el horizonte (m bajo el piso): sin ella, más
        /// allá del borde de la imagen se vería el cielo. Va tan abajo que nunca se cruza con la imagen.
        /// </summary>
        public const double AlturaOrilla = -0.3;

        /// <summary>Cuánto pasa la orilla del borde de la imagen, por lado (m).</summary>
        public const double MargenOrillaM = 2000.0;

        /// <summary>Lado de cada celda de la imagen cuando el piso tiene relieve (m), como `Malla.LadoConRelieve`.</summary>
        public const double LadoCeldaConRelieve = 1.2;

        /// <summary>Divisiones máximas por lado con relieve: 257² vértices como mucho.</summary>
        public const int DivisionesMaximas = 256;

        private const string PrefijoJpeg = "data:image/jpeg;base64,";
        private const string PrefijoPng = "data:image/png;base64,";

        /// <summary>
        /// Los bytes de la imagen de una data URL `data:image/jpeg;base64,…` o `data:image/png;base64,…`
        /// (el patrón del contrato) y su tipo: «jpeg» o «png».
        /// </summary>
        /// <exception cref="FormatException">No es una data URL de JPEG o PNG en base64, o el contenido no es de ese tipo.</exception>
        public static byte[] Decodificar(string dataUrl, out string tipo)
        {
            if (string.IsNullOrEmpty(dataUrl))
            {
                throw new FormatException("El piso no trae imagen.");
            }

            string datos;
            if (dataUrl.StartsWith(PrefijoJpeg, StringComparison.Ordinal))
            {
                tipo = "jpeg";
                datos = dataUrl.Substring(PrefijoJpeg.Length);
            }
            else if (dataUrl.StartsWith(PrefijoPng, StringComparison.Ordinal))
            {
                tipo = "png";
                datos = dataUrl.Substring(PrefijoPng.Length);
            }
            else
            {
                throw new FormatException("La imagen del piso no es una data URL de JPEG o PNG en base64.");
            }

            byte[] bytes;
            try
            {
                bytes = Convert.FromBase64String(datos);
            }
            catch (FormatException e)
            {
                throw new FormatException("La imagen del piso no es base64 válido.", e);
            }

            var real = TipoDe(bytes);
            if (real == null)
            {
                throw new FormatException("La imagen del piso no es un JPEG ni un PNG.");
            }

            if (real != tipo)
            {
                throw new FormatException("La imagen del piso dice ser " + tipo + " y es " + real + ".");
            }

            return bytes;
        }

        /// <summary>«jpeg» o «png» por la firma de los primeros bytes; null si no es ninguno.</summary>
        public static string TipoDe(byte[] b)
        {
            if (b == null)
            {
                return null;
            }

            if (b.Length >= 8 && b[0] == 0x89 && b[1] == 0x50 && b[2] == 0x4E && b[3] == 0x47
                && b[4] == 0x0D && b[5] == 0x0A && b[6] == 0x1A && b[7] == 0x0A)
            {
                return "png";
            }

            if (b.Length >= 3 && b[0] == 0xFF && b[1] == 0xD8 && b[2] == 0xFF)
            {
                return "jpeg";
            }

            return null;
        }

        /// <summary>
        /// El ancho y el alto de la imagen leídos de su encabezado, sin abrirla: el IHDR de un PNG o el
        /// marco (SOF) de un JPEG. Así una imagen enorme se rechaza antes de pedir su memoria.
        /// </summary>
        public static bool Medidas(byte[] b, out int ancho, out int alto)
        {
            ancho = 0;
            alto = 0;
            var tipo = TipoDe(b);
            if (tipo == "png")
            {
                // Firma (8), largo (4) y «IHDR» (4); luego ancho y alto, de 4 bytes cada uno, big-endian.
                if (b.Length < 24 || b[12] != (byte)'I' || b[13] != (byte)'H' || b[14] != (byte)'D' || b[15] != (byte)'R')
                {
                    return false;
                }

                ancho = (b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19];
                alto = (b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23];
                return ancho > 0 && alto > 0;
            }

            if (tipo != "jpeg")
            {
                return false;
            }

            // Los segmentos van tras SOI (FFD8): FF, marcador, largo de 2 bytes (incluye esos 2).
            var i = 2;
            while (i + 3 < b.Length)
            {
                if (b[i] != 0xFF)
                {
                    return false;
                }

                var marcador = b[i + 1];
                if (marcador == 0xFF)
                {
                    // Relleno entre segmentos.
                    i++;
                    continue;
                }

                if (marcador == 0xD8 || marcador == 0x01 || (marcador >= 0xD0 && marcador <= 0xD7))
                {
                    // Sin largo.
                    i += 2;
                    continue;
                }

                if (marcador == 0xD9 || marcador == 0xDA)
                {
                    // Fin de la imagen o inicio de los datos sin haber hallado el marco.
                    return false;
                }

                var largo = (b[i + 2] << 8) | b[i + 3];
                if (largo < 2)
                {
                    return false;
                }

                // SOF0 a SOF15, salvo DHT (C4), JPG (C8) y DAC (CC): precisión (1), alto (2), ancho (2).
                if (marcador >= 0xC0 && marcador <= 0xCF && marcador != 0xC4 && marcador != 0xC8 && marcador != 0xCC)
                {
                    if (i + 8 >= b.Length)
                    {
                        return false;
                    }

                    alto = (b[i + 5] << 8) | b[i + 6];
                    ancho = (b[i + 7] << 8) | b[i + 8];
                    return ancho > 0 && alto > 0;
                }

                i += 2 + largo;
            }

            return false;
        }

        /// <summary>Lo que impide usar una imagen de esas medidas como piso; null si sirve.</summary>
        public static string RevisarPixeles(int ancho, int alto)
        {
            if (ancho <= 0 || alto <= 0)
            {
                return "La imagen del piso no tiene medidas.";
            }

            if (ancho > PixelesMaximos || alto > PixelesMaximos)
            {
                return "La imagen del piso mide " + ancho + " × " + alto + " px; el máximo es " + PixelesMaximos + " por lado.";
            }

            if (Math.Abs(ancho - alto) > ToleranciaCuadrada * Math.Max(ancho, alto))
            {
                return "La imagen del piso debe ser cuadrada y mide " + ancho + " × " + alto + " px.";
            }

            return null;
        }

        /// <summary>Revisa el centro y el lado del contrato.</summary>
        /// <exception cref="FormatException">Un número no finito o un lado fuera de (0, 2000] m.</exception>
        public static void Revisar(double centroX, double centroY, double ladoM)
        {
            if (double.IsNaN(centroX) || double.IsInfinity(centroX) || double.IsNaN(centroY) || double.IsInfinity(centroY))
            {
                throw new FormatException("El centro del piso no es un número.");
            }

            if (double.IsNaN(ladoM) || !(ladoM > 0.0) || ladoM > LadoMaximoM)
            {
                throw new FormatException("El lado del piso debe ser mayor que 0 y de " + LadoMaximoM + " m o menos.");
            }
        }

        /// <summary>
        /// Las cuatro esquinas de la imagen en la escena (X este, Y norte): suroeste, sureste, noreste y
        /// noroeste. En ese orden van antihorarias vista desde arriba, y la textura las cubre de (0, 0)
        /// a (1, 1): u crece al este y v al norte, así que el norte de la imagen queda al norte.
        /// </summary>
        public static (double X, double Y)[] Esquinas(double centroX, double centroY, double ladoM)
        {
            var m = ladoM / 2.0;
            return new[]
            {
                (centroX - m, centroY - m),
                (centroX + m, centroY - m),
                (centroX + m, centroY + m),
                (centroX - m, centroY + m),
            };
        }

        /// <summary>La coordenada de textura de un punto de la escena (fuera de la imagen sale de [0, 1]).</summary>
        public static (double U, double V) Uv(double centroX, double centroY, double ladoM, double x, double y)
        {
            return ((x - (centroX - ladoM / 2.0)) / ladoM, (y - (centroY - ladoM / 2.0)) / ladoM);
        }

        /// <summary>
        /// Cuántas celdas por lado lleva la imagen: una si el piso es plano; con relieve, las que sigan
        /// el piso a cada 1.2 m, hasta 256.
        /// </summary>
        public static int Divisiones(double ladoM, bool plano)
        {
            if (plano)
            {
                return 1;
            }

            return Math.Max(1, Math.Min(DivisionesMaximas, (int)Math.Ceiling(ladoM / LadoCeldaConRelieve - 1e-9)));
        }
    }
}
