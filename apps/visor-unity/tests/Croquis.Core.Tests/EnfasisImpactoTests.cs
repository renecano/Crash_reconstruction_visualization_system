using Croquis.Core;
using Xunit;

namespace Croquis.Core.Tests
{
    /// <summary>El énfasis del impacto (ronda 4, punto 5): cambia el ritmo y lo que se ve, nunca la física.</summary>
    public class EnfasisImpactoTests
    {
        [Fact]
        public void LaCamaraLentaBajaEnElImpactoYVuelveSola()
        {
            Assert.Equal(EnfasisImpacto.FactorMinimo, EnfasisImpacto.FactorCamaraLenta(2.0, 2.0), 6);
            Assert.Equal(1.0, EnfasisImpacto.FactorCamaraLenta(2.0 - EnfasisImpacto.AntesS - 0.01, 2.0), 6);
            Assert.Equal(1.0, EnfasisImpacto.FactorCamaraLenta(2.0 + EnfasisImpacto.DespuesS + 0.01, 2.0), 6);
            // Escalón, no rampa: en toda la ventana va al mismo ritmo, así nada se ve frenar.
            Assert.Equal(EnfasisImpacto.FactorMinimo, EnfasisImpacto.FactorCamaraLenta(2.0 - EnfasisImpacto.AntesS + 0.01, 2.0), 6);
            Assert.Equal(EnfasisImpacto.FactorMinimo, EnfasisImpacto.FactorCamaraLenta(2.0 + EnfasisImpacto.DespuesS - 0.01, 2.0), 6);
            // Sin impacto, nada cambia.
            Assert.Equal(1.0, EnfasisImpacto.FactorCamaraLenta(2.0, double.NaN), 6);
        }

        [Fact]
        public void LaCamaraSeAcercaAlGolpeYSoloAhi()
        {
            Assert.Equal(1.0, EnfasisImpacto.PesoCamara(5.0, 5.0), 6);
            Assert.Equal(0.0, EnfasisImpacto.PesoCamara(0.0, 5.0), 6);
            Assert.InRange(EnfasisImpacto.PesoCamara(4.8, 5.0), 0.01, 0.99);
            Assert.Equal(0.0, EnfasisImpacto.PesoCamara(5.0, double.NaN), 6);
        }

        [Fact]
        public void ElLetreroDiceCuantasVecesMasLento()
        {
            Assert.Equal("Cámara lenta ×5", EnfasisImpacto.EtiquetaCamaraLenta(EnfasisImpacto.FactorMinimo));
            Assert.Equal("Cámara lenta ×20", EnfasisImpacto.EtiquetaCamaraLenta(0.25 * EnfasisImpacto.FactorMinimo));
            Assert.Equal("Cámara lenta ×2", EnfasisImpacto.EtiquetaCamaraLenta(0.5));
            Assert.Equal("Cámara lenta ×1.5", EnfasisImpacto.EtiquetaCamaraLenta(1 / 1.5));
            Assert.Null(EnfasisImpacto.EtiquetaCamaraLenta(1.0));
            Assert.Null(EnfasisImpacto.EtiquetaCamaraLenta(2.0));
            Assert.Null(EnfasisImpacto.EtiquetaCamaraLenta(0.0));
        }

        [Fact]
        public void LaDeformacionCreceHastaLaDelSolverYAhiSeQueda()
        {
            Assert.Equal(0.0, EnfasisImpacto.AvanceDano(0.99, 1.0), 6);
            Assert.InRange(EnfasisImpacto.AvanceDano(1.05, 1.0), 0.01, 0.99);
            Assert.Equal(1.0, EnfasisImpacto.AvanceDano(1.0 + EnfasisImpacto.DuracionDanoS, 1.0), 6);
            Assert.Equal(1.0, EnfasisImpacto.AvanceDano(9.0, 1.0), 6);
        }
    }
}
