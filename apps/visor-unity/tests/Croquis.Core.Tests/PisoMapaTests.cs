using System;
using Croquis.Core;
using Xunit;

namespace Croquis.Core.Tests
{
    /// <summary>Ronda 4, punto 9 (ADR 0124): el piso del modo «mapa real» y lo que dice la leyenda.</summary>
    public class PisoMapaTests
    {
        /// <summary>Lo mínimo de un PNG para leer sus medidas: firma e IHDR.</summary>
        private static byte[] Png(int ancho, int alto)
        {
            var b = new byte[33];
            new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 13, (byte)'I', (byte)'H', (byte)'D', (byte)'R' }.CopyTo(b, 0);
            b[16] = (byte)(ancho >> 24);
            b[17] = (byte)(ancho >> 16);
            b[18] = (byte)(ancho >> 8);
            b[19] = (byte)ancho;
            b[20] = (byte)(alto >> 24);
            b[21] = (byte)(alto >> 16);
            b[22] = (byte)(alto >> 8);
            b[23] = (byte)alto;
            return b;
        }

        /// <summary>Lo mínimo de un JPEG: SOI, un APP0 que hay que saltar y el marco (SOF0 o SOF2).</summary>
        private static byte[] Jpeg(int ancho, int alto, byte sof = 0xC0)
        {
            return new byte[]
            {
                0xFF, 0xD8,
                0xFF, 0xE0, 0x00, 0x10, (byte)'J', (byte)'F', (byte)'I', (byte)'F', 0, 1, 1, 0, 0, 1, 0, 1, 0, 0,
                0xFF, 0xDB, 0x00, 0x04, 0x00, 0x00,
                0xFF, sof, 0x00, 0x11, 0x08, (byte)(alto >> 8), (byte)alto, (byte)(ancho >> 8), (byte)ancho, 0x03,
                0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
                0xFF, 0xD9,
            };
        }

        private static string DataUrl(string tipo, byte[] bytes)
        {
            return "data:image/" + tipo + ";base64," + Convert.ToBase64String(bytes);
        }

        [Fact]
        public void LeeLaDataUrlDeUnPngYDeUnJpeg()
        {
            var png = Png(1024, 1024);
            Assert.Equal(png, PisoMapa.Decodificar(DataUrl("png", png), out var tipo));
            Assert.Equal("png", tipo);
            var jpeg = Jpeg(2048, 2048);
            Assert.Equal(jpeg, PisoMapa.Decodificar(DataUrl("jpeg", jpeg), out tipo));
            Assert.Equal("jpeg", tipo);
        }

        [Theory]
        [InlineData(null)]
        [InlineData("")]
        [InlineData("data:image/gif;base64,R0lGODlhAQABAAAAACw=")]
        [InlineData("data:image/png,sin-base64")]
        [InlineData("https://tile.openstreetmap.org/0/0/0.png")]
        [InlineData("data:image/png;base64,esto no es base64!")]
        public void RechazaLoQueNoEsUnaDataUrlDeJpegOPng(string dataUrl)
        {
            Assert.Throws<FormatException>(() => PisoMapa.Decodificar(dataUrl, out _));
        }

        [Fact]
        public void RechazaUnaImagenQueDiceSerOtroTipo()
        {
            Assert.Throws<FormatException>(() => PisoMapa.Decodificar(DataUrl("png", Jpeg(512, 512)), out _));
            Assert.Throws<FormatException>(() => PisoMapa.Decodificar(DataUrl("jpeg", Png(512, 512)), out _));
            Assert.Throws<FormatException>(() => PisoMapa.Decodificar(DataUrl("png", new byte[] { 1, 2, 3, 4, 5, 6, 7, 8, 9 }), out _));
        }

        [Fact]
        public void LeeLasMedidasDelEncabezadoSinAbrirLaImagen()
        {
            Assert.True(PisoMapa.Medidas(Png(1536, 1530), out var ancho, out var alto));
            Assert.Equal((1536, 1530), (ancho, alto));
            Assert.True(PisoMapa.Medidas(Jpeg(2048, 2047), out ancho, out alto));
            Assert.Equal((2048, 2047), (ancho, alto));
            // Progresivo (SOF2), como lo exportan algunos navegadores.
            Assert.True(PisoMapa.Medidas(Jpeg(800, 800, 0xC2), out ancho, out alto));
            Assert.Equal((800, 800), (ancho, alto));
        }

        [Fact]
        public void SinEncabezadoCompletoNoHayMedidas()
        {
            Assert.False(PisoMapa.Medidas(new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0 }, out _, out _));
            Assert.False(PisoMapa.Medidas(new byte[] { 0xFF, 0xD8, 0xFF, 0xD9 }, out _, out _));
            var cortado = Jpeg(512, 512);
            Assert.False(PisoMapa.Medidas(cortado.AsSpan(0, 24).ToArray(), out _, out _));
            Assert.False(PisoMapa.Medidas(null, out _, out _));
        }

        [Theory]
        [InlineData(2048, 2048, true)]
        [InlineData(4096, 4096, true)]
        [InlineData(1024, 1023, true)]
        [InlineData(4097, 4097, false)]
        [InlineData(2048, 1024, false)]
        [InlineData(0, 0, false)]
        public void SoloAdmiteImagenesCuadradasDeHasta4096(int ancho, int alto, bool sirve)
        {
            Assert.Equal(sirve, PisoMapa.RevisarPixeles(ancho, alto) == null);
        }

        [Theory]
        [InlineData(0.0, 0.0, 300.0, true)]
        [InlineData(-120.5, 48.0, 2000.0, true)]
        [InlineData(0.0, 0.0, 0.0, false)]
        [InlineData(0.0, 0.0, -10.0, false)]
        [InlineData(0.0, 0.0, 2000.5, false)]
        [InlineData(0.0, 0.0, double.NaN, false)]
        [InlineData(double.NaN, 0.0, 100.0, false)]
        [InlineData(0.0, double.PositiveInfinity, 100.0, false)]
        public void RevisaElCentroYElLadoDelContrato(double cx, double cy, double lado, bool sirve)
        {
            var e = Record.Exception(() => PisoMapa.Revisar(cx, cy, lado));
            Assert.Equal(sirve, e == null);
            if (!sirve)
            {
                Assert.IsType<FormatException>(e);
            }
        }

        [Fact]
        public void LasEsquinasVanAntihorariasDesdeElSuroesteYElNorteQuedaArriba()
        {
            var e = PisoMapa.Esquinas(10.0, -4.0, 200.0);
            Assert.Equal((-90.0, -104.0), e[0]);
            Assert.Equal((110.0, -104.0), e[1]);
            Assert.Equal((110.0, 96.0), e[2]);
            Assert.Equal((-90.0, 96.0), e[3]);

            // Antihorarias vistas desde arriba (área con signo positiva, X este y Y norte).
            var area = 0.0;
            for (var i = 0; i < 4; i++)
            {
                var a = e[i];
                var b = e[(i + 1) % 4];
                area += a.X * b.Y - b.X * a.Y;
            }

            Assert.Equal(2.0 * 200.0 * 200.0, area, 6);

            // La textura: (0, 0) al suroeste, (1, 1) al noreste; el norte (v = 1) es +Y de la escena.
            Assert.Equal((0.0, 0.0), PisoMapa.Uv(10.0, -4.0, 200.0, -90.0, -104.0));
            Assert.Equal((1.0, 1.0), PisoMapa.Uv(10.0, -4.0, 200.0, 110.0, 96.0));
            Assert.Equal((0.5, 0.5), PisoMapa.Uv(10.0, -4.0, 200.0, 10.0, -4.0));
            Assert.Equal((0.5, 1.0), PisoMapa.Uv(10.0, -4.0, 200.0, 10.0, 96.0));
            Assert.Equal((1.0, 0.5), PisoMapa.Uv(10.0, -4.0, 200.0, 110.0, -4.0));
        }

        [Theory]
        [InlineData(300.0, true, 1)]
        [InlineData(12.0, false, 10)]
        [InlineData(1.0, false, 1)]
        [InlineData(2000.0, false, 256)]
        public void UnaCeldaSiElPisoEsPlanoYCeldasDe1_2MConRelieve(double lado, bool plano, int esperadas)
        {
            Assert.Equal(esperadas, PisoMapa.Divisiones(lado, plano));
        }

        [Fact]
        public void LaImagenVaEntreElPisoDeLaViaYLasCalcasDelCaso()
        {
            // Las huellas, marcas y manchas del caso van a 0.024 m o más (CasoVista); la vía, a 0.
            Assert.InRange(PisoMapa.AlturaSobrePiso, 0.005, 0.02);
            Assert.True(PisoMapa.AlturaOrilla < 0.0);
        }

        [Fact]
        public void LaLeyendaDiceQueElPisoEsUnaImagenDelLugarConSuCredito()
        {
            Assert.Equal("Reconstrucción ilustrativa · entorno procedural: no es el lugar real", Leyenda3d.Mensaje(true));
            Assert.Equal("Reconstrucción ilustrativa", Leyenda3d.Mensaje(false));
            Assert.Equal(
                "Reconstrucción ilustrativa · piso: imagen del lugar (© colaboradores de OpenStreetMap)",
                Leyenda3d.Mensaje(true, " © colaboradores de OpenStreetMap "));
            Assert.Equal("Reconstrucción ilustrativa · piso: imagen del lugar", Leyenda3d.Mensaje(false, ""));
        }

        [Fact]
        public void LaLeyendaNombraLaVersionTranslucida()
        {
            Assert.Equal(
                "Reconstrucción ilustrativa · entorno procedural: no es el lugar real\nTranslúcido: lo que declaró el conductor de B",
                Leyenda3d.Mensaje(true, null, "lo que declaró el conductor de B"));
            Assert.Equal("Reconstrucción ilustrativa", Leyenda3d.Mensaje(false, null, "  "));
        }
    }
}
