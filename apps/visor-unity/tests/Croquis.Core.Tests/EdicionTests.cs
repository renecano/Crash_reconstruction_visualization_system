using Croquis.Core;
using Xunit;

namespace Croquis.Core.Tests
{
    /// <summary>U6: la geometría del modo edición (C2 y C1).</summary>
    public class EdicionTests
    {
        private static readonly PiezaEditable[] Piezas =
        {
            // Un muro de 6 × 0.3 m, de 2 m de alto, a lo largo del eje x.
            new PiezaEditable("muro", 0, 0, 0, 0, 6, 0.3, 2),
            // Un poste de 30 cm de diámetro y 8 m, 10 m al norte.
            new PiezaEditable("poste", 0, 10, 0, 0, 0.3, 0.3, 8, 0.15),
            // Un muro girado 90°: corre de sur a norte, 20 m al este.
            new PiezaEditable("girado", 20, 0, 0, 90, 6, 0.3, 2),
        };

        [Fact]
        public void EligeElObjetoQueTocaElRayoDesdeArriba()
        {
            Assert.Equal(0, Edicion.Elegir(Piezas, 2.5, 0, 50, 0, 0, -1));
            Assert.Equal(1, Edicion.Elegir(Piezas, 0.2, 10, 50, 0, 0, -1));
            // El girado: a 2.5 m al norte de su centro está dentro; a 2.5 m al este, no.
            Assert.Equal(2, Edicion.Elegir(Piezas, 20, 2.5, 50, 0, 0, -1));
            Assert.Equal(-1, Edicion.Elegir(Piezas, 22.5, 0, 50, 0, 0, -1));
            Assert.Equal(-1, Edicion.Elegir(Piezas, 0, 5, 50, 0, 0, -1));
        }

        [Fact]
        public void EligeElMasCercanoYNoLoQueQuedaDetras()
        {
            // Desde el sur, a ras de piso, mirando al norte: el muro tapa al poste.
            Assert.Equal(0, Edicion.Elegir(Piezas, 0, -20, 1, 0, 1, 0));
            // Mirando al sur desde el mismo punto, nada.
            Assert.Equal(-1, Edicion.Elegir(Piezas, 0, -20, 1, 0, -1, 0));
            // Por encima del muro (a 5 m) y por debajo de la punta del poste: el poste.
            Assert.Equal(1, Edicion.Elegir(Piezas, 0, -20, 5, 0, 1, 0));
        }

        [Fact]
        public void ElPisoDondePegaElRayo()
        {
            var p = Edicion.AlPlano(0, 0, 10, 1, 0, -1, 0);
            Assert.NotNull(p);
            Assert.Equal(10.0, p.Value.X, 9);
            Assert.Equal(0.0, p.Value.Y, 9);
            Assert.Null(Edicion.AlPlano(0, 0, 10, 1, 0, 1, 0));
            Assert.Null(Edicion.AlPlano(0, 0, 10, 1, 0, 0, 0));
        }

        [Fact]
        public void GiraYAlargaConLaRuedaSinSalirseDeLosLimites()
        {
            Assert.Equal(15.0, Edicion.Girar(0, 3), 9);
            Assert.Equal(355.0, Edicion.Girar(0, -1), 9);
            Assert.Equal(10.0, Edicion.Girar(350, 4), 9);
            Assert.Equal(20.0, Edicion.GirarConDedos(0, 170, -170), 9);
            Assert.Equal(6.0 * 1.05 * 1.05, Edicion.Alargar(6, 2), 9);
            Assert.Equal(Edicion.LadoMinimo, Edicion.Alargar(0.11, -10), 9);
            Assert.Equal(Edicion.LadoMaximo, Edicion.Alargar(70, 10), 9);
            Assert.Equal(1.23, Edicion.AlCentimetro(1.2349), 9);
        }
    }
}
