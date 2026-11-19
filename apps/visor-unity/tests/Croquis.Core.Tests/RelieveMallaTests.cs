using Croquis.Core;
using Croquis.Generated;
using Xunit;

namespace Croquis.Core.Tests
{
    /// <summary>El relieve real en el piso del 3D (ronda 4): la misma interpolación que el solver.</summary>
    public class RelieveMallaTests
    {
        private static Caso3DRelieve Rampa()
        {
            // 3 × 3 nodos cada 10 m desde (−10, −10): sube 1 m por cada 10 m hacia el norte (10 %).
            return new Caso3DRelieve
            {
                Ancho = 3,
                Alto = 3,
                ResolucionM = 10,
                Origen = new OrigenClass { X = -10, Y = -10 },
                AlturasM = new double[] { -1, -1, -1, 0, 0, 0, 1, 1, 1 },
            };
        }

        [Fact]
        public void LaAlturaEsLaBilinealDelSolverYLaPendienteSale()
        {
            var m = RelieveMalla.De(Rampa());
            Assert.NotNull(m);
            Assert.Equal(0.0, m.Altura(0, 0), 9);
            Assert.Equal(0.5, m.Altura(3, 5), 9);
            Assert.Equal(1.0, m.Altura(0, 50), 9); // fuera de la malla, el borde
            Assert.Equal(10.0, m.Pendiente(0, 0, 90), 6); // hacia el norte, subida del 10 %
            Assert.Equal(-10.0, m.Pendiente(0, 0, 270), 6);
            Assert.Equal(0.0, m.Pendiente(0, 0, 0), 6);
        }

        [Fact]
        public void UnaMallaPlanaOIncompletaNoCambiaNada()
        {
            var plana = Rampa();
            plana.AlturasM = new double[9];
            Assert.Null(RelieveMalla.De(plana));
            var corta = Rampa();
            corta.AlturasM = new double[] { 0, 1 };
            Assert.Null(RelieveMalla.De(corta));
            Assert.Null(RelieveMalla.De(null));
        }
    }
}
