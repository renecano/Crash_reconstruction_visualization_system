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

        [Fact]
        public void LosRestosSalenDelContactoYQuedanEnElPisoSiempreIguales()
        {
            var a = EnfasisImpacto.Nube(3, 4, 90, 8, 30, 7);
            var b = EnfasisImpacto.Nube(3, 4, 90, 8, 30, 7);
            Assert.Equal(30, a.Count);
            for (var i = 0; i < a.Count; i++)
            {
                Assert.Equal(a[i].X1, b[i].X1);
                Assert.Equal(a[i].Y1, b[i].Y1);
                var d = System.Math.Sqrt((a[i].X1 - 3) * (a[i].X1 - 3) + (a[i].Y1 - 4) * (a[i].Y1 - 4));
                Assert.InRange(d, 0.0, 8.0 + 0.5);
                // Antes del impacto no se ven; al final, en el piso.
                Assert.False(EnfasisImpacto.PosicionResto(a[i], 0.9, 1.0).Visible);
                var fin = EnfasisImpacto.PosicionResto(a[i], 1.0 + EnfasisImpacto.VueloRestosS, 1.0);
                Assert.Equal(0.0, fin.Z, 6);
                Assert.Equal(a[i].X1, fin.X, 6);
            }
        }
    }
}
