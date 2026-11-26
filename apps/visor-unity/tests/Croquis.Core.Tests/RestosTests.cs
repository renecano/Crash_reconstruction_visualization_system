using System.IO;
using System.Linq;
using System.Runtime.CompilerServices;
using Croquis.Core;
using Xunit;

namespace Croquis.Core.Tests
{
    /// <summary>Los pedazos del impacto: cuántos, con qué física y siempre iguales con la misma semilla.</summary>
    public class RestosTests
    {
        private static readonly Restos.Fuente[] Dos =
        {
            new Restos.Fuente { X = -2.3, Y = 0, Vx = 16, Vy = 0 },
            new Restos.Fuente { X = 0, Y = 2.0, Vx = 0, Vy = -9 },
        };

        private static Croquis.Generated.Caso3D Fixture(string nombre, [CallerFilePath] string aqui = "")
        {
            var raiz = Path.GetFullPath(Path.Combine(Path.GetDirectoryName(aqui), "..", "..", "..", ".."));
            return Paquete.Leer(File.ReadAllText(Path.Combine(raiz, "packages", "scene-schema", "fixtures", "caso3d", nombre + ".json")));
        }

        [Fact]
        public void ElPrimerImpactoSaleDelPuntoDeImpactoConLaEnergiaDeLosDos()
        {
            var r = Fixture("frontal_curva").Resultado;
            var impactos = Restos.Impactos(r);
            Assert.Single(impactos);
            Assert.Equal(r.PuntoImpacto.X, impactos[0].X);
            Assert.Equal(r.PuntoImpacto.Y, impactos[0].Y);
            Assert.Equal(2, impactos[0].Fuentes.Length);
            Assert.Equal(r.Vehiculos.Sum(v => v.Dano.EnergiaJ), impactos[0].EnergiaJ, 6);
        }

        [Fact]
        public void LaCantidadCreceConLaEnergiaYTieneTope()
        {
            Assert.Equal(0, Restos.Cuantos(0));
            Assert.Equal(Restos.Minimo, Restos.Cuantos(100));
            Assert.True(Restos.Cuantos(300000) > Restos.Cuantos(60000));
            Assert.Equal(Restos.Maximo, Restos.Cuantos(5e7));
        }

        [Fact]
        public void HayVidrioPlasticoYLaminaYSalenIgualesConLaSemilla()
        {
            var a = Restos.Nube(0, 0, Dos, 250000, 7);
            var b = Restos.Nube(0, 0, Dos, 250000, 7);
            Assert.Equal(Restos.Cuantos(250000), a.Count);
            Assert.Contains(a, p => p.Tipo == Restos.Material.Vidrio);
            Assert.Contains(a, p => p.Tipo == Restos.Material.Plastico);
            Assert.Contains(a, p => p.Tipo == Restos.Material.Metal);
            Assert.True(a.Count(p => p.Tipo == Restos.Material.Vidrio) > a.Count / 3);
            for (var i = 0; i < a.Count; i++)
            {
                Assert.Equal(a[i].FinalX, b[i].FinalX);
                Assert.Equal(a[i].FinalY, b[i].FinalY);
            }
        }

        [Fact]
        public void VuelanCaenYSeDetienenEnElPiso()
        {
            foreach (var p in Restos.Nube(1, 2, Dos, 200000, 11))
            {
                Assert.False(Restos.Posicion(p, -0.01).Visible);
                var inicio = Restos.Posicion(p, 0);
                Assert.True(inicio.Visible && inicio.Z > 0.3 && !inicio.EnPiso);
                var reposo = Restos.Reposo(p);
                Assert.True(reposo > 0.2 && reposo < 10, "reposo " + reposo);
                var fin = Restos.Posicion(p, reposo + 1);
                Assert.True(fin.EnPiso);
                Assert.Equal(0.0, fin.Z, 9);
                Assert.Equal(p.FinalX, fin.X, 6);
                Assert.Equal(fin.X, Restos.Posicion(p, reposo + 5).X, 9);
                // Nunca bajo el piso, y sin saltos: el camino es continuo.
                var antes = Restos.Posicion(p, 0);
                for (var t = 0.01; t < reposo + 0.1; t += 0.01)
                {
                    var q = Restos.Posicion(p, t);
                    Assert.True(q.Z >= 0.0);
                    var paso = System.Math.Sqrt((q.X - antes.X) * (q.X - antes.X) + (q.Y - antes.Y) * (q.Y - antes.Y));
                    Assert.True(paso < 0.5, "salto de " + paso + " m en t = " + t);
                    antes = q;
                }
            }
        }

        [Fact]
        public void SiguenElMovimientoDeLosVehiculos()
        {
            // Un solo vehículo que iba al este a 20 m/s: los pedazos quedan, en promedio, más al este.
            var una = new[] { new Restos.Fuente { X = -2, Y = 0, Vx = 20, Vy = 0 } };
            var nube = Restos.Nube(0, 0, una, 200000, 3);
            Assert.True(nube.Average(p => p.FinalX) > 3.0);
            Assert.True(nube.Max(p => System.Math.Abs(p.FinalX)) < 60.0);
        }
    }
}
