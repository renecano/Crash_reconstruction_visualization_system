using System;
using System.IO;
using System.Linq;
using System.Runtime.CompilerServices;
using Croquis.Core;
using Croquis.Generated;
using Xunit;

namespace Croquis.Core.Tests
{
    /// <summary>
    /// Ronda 4, punto 8 (ADR 0123): la versión superpuesta. Las mismas reglas que la maqueta 2D
    /// (`versionDeclaradaEnMaqueta`): se alinean por el impacto y solo va el vehículo que se aparta.
    /// </summary>
    public class FantasmasTests
    {
        private static string Raiz([CallerFilePath] string aqui = "")
        {
            return Path.GetFullPath(Path.Combine(Path.GetDirectoryName(aqui), "..", "..", "..", ".."));
        }

        /// <summary>Un resultado nuevo cada vez: las pruebas cambian la versión sin tocar la reconstrucción.</summary>
        private static Caso3DResultado Resultado(string nombre = "alcance")
        {
            var f = Path.Combine(Raiz(), "packages", "scene-schema", "fixtures", "caso3d", nombre + ".json");
            return Paquete.Leer(File.ReadAllText(f)).Resultado;
        }

        private static void Mover(ResultadoVehiculo v, double dx, double dy)
        {
            var tr = v.Trayectoria;
            for (var i = 0; i < tr.T.Length; i++)
            {
                tr.X[i] += dx;
                tr.Y[i] += dy;
            }

            v.PoseFinal.X += dx;
            v.PoseFinal.Y += dy;
        }

        [Fact]
        public void LaMismaVersionNoDibujaNingunFantasma()
        {
            Assert.Empty(Fantasmas.VehiculosADibujar(Resultado(), Resultado()));
        }

        [Fact]
        public void SoloVaElVehiculoQueEnLaVersionVaPorOtroLado()
        {
            var version = Resultado();
            Mover(version.Vehiculos.First(v => v.Id == "veh-b"), 0.0, 3.0);
            Assert.Equal(new[] { "veh-b" }, Fantasmas.VehiculosADibujar(Resultado(), version));
        }

        [Fact]
        public void MenosDeMedioMetroEsLoMismo()
        {
            var version = Resultado();
            Mover(version.Vehiculos.First(v => v.Id == "veh-a"), 0.3, 0.0);
            Assert.Empty(Fantasmas.VehiculosADibujar(Resultado(), version));
            Assert.Equal(new[] { "veh-a" }, Fantasmas.VehiculosADibujar(Resultado(), version, 0.2));
        }

        [Fact]
        public void UnReposoDistintoBastaAunqueElCaminoSeaElMismo()
        {
            var version = Resultado();
            var b = version.Vehiculos.First(v => v.Id == "veh-b");
            b.PoseFinal.X += 2.0;
            Assert.Equal(new[] { "veh-b" }, Fantasmas.VehiculosADibujar(Resultado(), version));
        }

        [Fact]
        public void UnVehiculoQueNoEstaEnLaReconstruccionOSinTrayectoriaNoSeDibuja()
        {
            var version = Resultado();
            var b = version.Vehiculos.First(v => v.Id == "veh-b");
            Mover(b, 5.0, 0.0);
            b.Id = "veh-z";
            var a = version.Vehiculos.First(v => v.Id == "veh-a");
            Mover(a, 5.0, 0.0);
            a.Trayectoria.T = new double[0];
            Assert.Empty(Fantasmas.VehiculosADibujar(Resultado(), version));
        }

        [Fact]
        public void LasVersionesSeAlineanPorSuPrimerImpacto()
        {
            var r = Resultado();
            Assert.Equal(0.0, Fantasmas.TImpacto(r));

            // La misma versión con su reloj corrido medio segundo: alineada por el impacto, no se aparta.
            var version = Resultado();
            foreach (var v in version.Vehiculos)
            {
                for (var i = 0; i < v.Trayectoria.T.Length; i++)
                {
                    v.Trayectoria.T[i] += 0.5;
                }
            }

            foreach (var e in version.Eventos)
            {
                e.T += 0.5;
            }

            Assert.Equal(0.5, Fantasmas.TImpacto(version), 12);
            Assert.Equal(0.5, Fantasmas.Desfase(r, version), 12);
            Assert.Empty(Fantasmas.VehiculosADibujar(r, version));

            // En el instante t de la reconstrucción, la versión va donde iba en t + desfase.
            var a = r.Vehiculos.First(v => v.Id == "veh-a").Trayectoria;
            var ad = version.Vehiculos.First(v => v.Id == "veh-a").Trayectoria;
            foreach (var t in new[] { -2.0, -0.4, 0.0, 0.7, 3.1 })
            {
                var p = Muestreo.Pose(a, t);
                var q = Muestreo.Pose(ad, t + Fantasmas.Desfase(r, version));
                Assert.Equal(p.X, q.X, 9);
                Assert.Equal(p.Y, q.Y, 9);
            }
        }

        [Fact]
        public void SinImpactosElRelojEsElMismo()
        {
            var r = Resultado();
            r.Eventos = r.Eventos.Where(e => e.Tipo != StickyTipo.ImpactoVehiculoVehiculo).ToArray();
            Assert.Equal(0.0, Fantasmas.TImpacto(r));
            Assert.Equal(0.0, Fantasmas.TImpacto(null));
        }

        [Fact]
        public void UnaVersionMasCortaSeQuedaEnSuUltimaPose()
        {
            // La versión termina antes: pasado su final, el fantasma se queda donde acabó.
            var version = Resultado();
            var tr = version.Vehiculos.First(v => v.Id == "veh-b").Trayectoria;
            var n = Array.FindLastIndex(tr.T, t => t <= 1.0) + 1;
            tr.T = tr.T.Take(n).ToArray();
            tr.X = tr.X.Take(n).ToArray();
            tr.Y = tr.Y.Take(n).ToArray();
            tr.Rumbo = tr.Rumbo.Take(n).ToArray();
            var ultima = Muestreo.Pose(tr, tr.T[n - 1]);
            var despues = Muestreo.Pose(tr, 4.5);
            Assert.Equal(ultima.X, despues.X, 12);
            Assert.Equal(ultima.Y, despues.Y, 12);
            Assert.Equal(ultima.Rumbo, despues.Rumbo, 12);
        }
    }
}
