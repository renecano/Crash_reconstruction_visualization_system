using System.Linq;
using Croquis.Core;
using Xunit;

namespace Croquis.Core.Tests
{
    /// <summary>U5: niveles, calidad automática y tope de dpr (ADR 0115).</summary>
    public class NivelesCalidadTests
    {
        private static void Cuadros(CalidadAutomatica a, double fps, double segundos)
        {
            for (var i = 0; i < (int)(fps * segundos); i++)
            {
                a.Cuadro(1.0 / fps);
            }
        }

        [Fact]
        public void BajaUnNivelConMenosDe24FpsDurante5Segundos()
        {
            var a = new CalidadAutomatica(NivelCalidad.Alta);
            Cuadros(a, 20, 4.9);
            Assert.Equal(NivelCalidad.Alta, a.Nivel);
            Cuadros(a, 20, 0.2);
            Assert.Equal(NivelCalidad.Media, a.Nivel);
            // Tras bajar mide desde cero: no baja dos niveles con la misma ventana.
            Cuadros(a, 20, 4.8);
            Assert.Equal(NivelCalidad.Media, a.Nivel);
            Cuadros(a, 20, 0.4);
            Assert.Equal(NivelCalidad.Baja, a.Nivel);
            // De baja ya no baja.
            Cuadros(a, 5, 6);
            Assert.Equal(NivelCalidad.Baja, a.Nivel);
        }

        [Fact]
        public void NuncaSubeNiBajaConFpsSuficientes()
        {
            var a = new CalidadAutomatica(NivelCalidad.Media);
            Cuadros(a, 30, 20);
            Assert.Equal(NivelCalidad.Media, a.Nivel);
            Cuadros(a, 144, 20);
            Assert.Equal(NivelCalidad.Media, a.Nivel);
            Assert.InRange(a.UltimosFps, 143.0, 145.0);
        }

        [Fact]
        public void LosCuadrosDeMasDeUnSegundoNoCuentan()
        {
            var a = new CalidadAutomatica(NivelCalidad.Media);
            // Una carga de 3 s en medio de cuadros fluidos no es dibujo lento.
            Cuadros(a, 60, 3);
            a.Cuadro(3.0);
            Cuadros(a, 60, 3);
            Assert.Equal(NivelCalidad.Media, a.Nivel);
        }

        [Fact]
        public void ElNivelInicialSigueLaReglaDeLaWeb()
        {
            Assert.Equal(NivelCalidad.Media, Calidades.Inicial(true, false, "ANGLE (NVIDIA RTX 4070)", 12000));
            Assert.Equal(NivelCalidad.Baja, Calidades.Inicial(true, true, "Adreno 740", 0));
            Assert.Equal(NivelCalidad.Alta, Calidades.Inicial(false, false, "NVIDIA GeForce RTX 4070", 12282));
            Assert.Equal(NivelCalidad.Alta, Calidades.Inicial(false, false, "AMD Radeon RX 7800 XT", 16368));
            Assert.Equal(NivelCalidad.Alta, Calidades.Inicial(false, false, "Intel(R) Arc(TM) A770", 16000));
            Assert.Equal(NivelCalidad.Media, Calidades.Inicial(false, false, "Intel(R) UHD Graphics 620", 1024));
            Assert.Equal(NivelCalidad.Media, Calidades.Inicial(false, false, "AMD Radeon(TM) Graphics", 512));
        }

        [Fact]
        public void LaEscalaDeDibujoRespetaElTopeDeDprSinSobremuestrear()
        {
            var media = Calidades.Perfil(NivelCalidad.Media);
            Assert.Equal(1.0, Calidades.EscalaDibujo(media, 1.0));
            Assert.Equal(0.5, Calidades.EscalaDibujo(media, 2.0));
            Assert.Equal(0.75, Calidades.EscalaDibujo(Calidades.Perfil(NivelCalidad.Baja), 1.0));
            Assert.Equal(1.0, Calidades.EscalaDibujo(Calidades.Perfil(NivelCalidad.Ultra), 1.0));
            Assert.Equal(1.0, Calidades.EscalaDibujo(Calidades.Perfil(NivelCalidad.Ultra), 2.0));
            Assert.Equal(0.75, Calidades.EscalaDibujo(Calidades.Perfil(NivelCalidad.Alta), 2.0));
        }

        [Fact]
        public void CadaNivelTieneAlMenosLoDelDeAbajo()
        {
            var p = Calidades.Todos.Select(Calidades.Perfil).ToArray();
            for (var i = 1; i < p.Length; i++)
            {
                Assert.True(p[i].DprMaximo >= p[i - 1].DprMaximo);
                Assert.True(p[i].Msaa >= p[i - 1].Msaa);
                Assert.True(p[i].DistanciaSombras >= p[i - 1].DistanciaSombras);
                Assert.True(p[i].MapaSombras >= p[i - 1].MapaSombras);
                Assert.True(p[i].LucesAdicionales >= p[i - 1].LucesAdicionales);
                Assert.True(p[i].Oclusion >= p[i - 1].Oclusion);
                Assert.True(p[i].Sonda >= p[i - 1].Sonda);
                Assert.True(p[i].Matas >= p[i - 1].Matas);
                Assert.True(p[i].Luminarias >= p[i - 1].Luminarias);
                Assert.True(p[i].FocosPorVehiculo >= p[i - 1].FocosPorVehiculo);
            }

            // Ninguno quita la luz de noche: siempre hay faros y luminarias con luz real.
            Assert.All(p, x => Assert.True(x.FocosPorVehiculo >= 1 && x.Luminarias >= 1 && x.LucesAdicionales >= 4));
        }

        [Fact]
        public void LeeLosNombresDelPuente()
        {
            Assert.True(Calidades.TryLeer("ultra", out var n));
            Assert.Equal(NivelCalidad.Ultra, n);
            Assert.False(Calidades.TryLeer("auto", out _));
            Assert.Equal("baja", Calidades.Nombre(NivelCalidad.Baja));
        }
    }
}
