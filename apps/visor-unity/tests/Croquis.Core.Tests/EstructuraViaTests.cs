using Croquis.Core;
using Croquis.Generated;
using Xunit;

namespace Croquis.Core.Tests
{
    /// <summary>El puente narrado (ronda 4): la losa a nivel y el piso abajo, como lo calcula la web.</summary>
    public class EstructuraViaTests
    {
        private static EscenarioEstructura Puente() => new EscenarioEstructura
        {
            Tipo = EstructuraTipo.Puente,
            Centro = new PuntoPlano { X = 0, Y = 0 },
            RumboDeg = 0,
            LargoM = 60,
            AnchoM = 10,
            AlturaM = 6,
        };

        [Fact]
        public void LaLosaVaANivelYElPisoBajaASusLados()
        {
            var e = Puente();
            Assert.Equal(0.0, EstructuraVia.Hundimiento(e, 0, 0), 9); // sobre la losa
            Assert.Equal(0.0, EstructuraVia.Hundimiento(e, 10, 4.9), 9); // orilla de la losa
            Assert.Equal(6.0, EstructuraVia.Hundimiento(e, 0, 20), 9); // al lado, abajo
            Assert.Equal(0.0, EstructuraVia.Hundimiento(e, 40, 20), 9); // lejos del puente
            Assert.InRange(EstructuraVia.Hundimiento(e, 22, 20), 0.1, 5.9); // el terraplén
            Assert.Equal(0.0, EstructuraVia.Hundimiento(null, 0, 20), 9);
        }

        [Fact]
        public void LasPilasVanBajoLaLosaSinSalirseDeLaParteAlta()
        {
            var p = EstructuraVia.Pilas(Puente());
            Assert.True(p.Length >= 2);
            foreach (var x in p)
            {
                Assert.InRange(x, -15.0, 15.0);
            }
        }
    }
}
