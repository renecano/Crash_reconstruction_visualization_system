using System;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Runtime.CompilerServices;
using Croquis.Core;
using Croquis.Generated;
using Xunit;

namespace Croquis.Core.Tests
{
    /// <summary>Los ajustes de René a U3 (2026-11-10): la moto caída y la ropa que nunca es piel.</summary>
    public class CaidaTests
    {
        private static string Raiz([CallerFilePath] string aqui = "")
        {
            return Path.GetFullPath(Path.Combine(Path.GetDirectoryName(aqui), "..", "..", "..", ".."));
        }

        private static Caso3D Caso(string nombre)
        {
            var f = Path.Combine(Raiz(), "packages", "scene-schema", "fixtures", "caso3d", nombre + ".json");
            return Paquete.Leer(File.ReadAllText(f));
        }

        [Fact]
        public void LaMotoSeArrastraCaidaDesdeElImpactoYQuedaTendida()
        {
            var r = Caso("motociclista").Resultado;
            var moto = r.Vehiculos.First(v => v.Clase == "motocicleta");
            var auto = r.Vehiculos.First(v => v.Clase != "motocicleta");
            Assert.True(Caida.SeArrastraCaido(r, moto));
            Assert.False(Caida.SeArrastraCaido(r, auto));
            var lado = Caida.Lado(moto.Trayectoria);
            Assert.Contains(lado, new[] { -1, 1 });
            Assert.Equal(0.0, Caida.Alabeo(lado, -0.5));
            Assert.Equal(0.0, Caida.Alabeo(lado, 0.0));
            Assert.InRange(Math.Abs(Caida.Alabeo(lado, Caida.Transicion / 2.0)), 0.1, Math.PI / 2.0 - 0.1);
            Assert.Equal(lado * Math.PI / 2.0, Caida.Alabeo(lado, Caida.Transicion), 9);
            Assert.Equal(lado * Math.PI / 2.0, Caida.Alabeo(lado, 3.0), 9);
            // En reposo antes de que acabe la trayectoria, y después del impacto.
            var reposo = Caida.Reposo(moto.Trayectoria);
            Assert.InRange(reposo, 0.0, moto.Trayectoria.T.Last());
        }

        [Fact]
        public void SinElArrastreDeLaMotoCaidaNoSeTiende()
        {
            var c = Caso("motociclista");
            c.Resultado.Parametros.FriccionMotoCaida = null;
            var moto = c.Resultado.Vehiculos.First(v => v.Clase == "motocicleta");
            Assert.False(Caida.SeArrastraCaido(c.Resultado, moto));
        }

        private static (int R, int G, int B) Rgb(string hex)
        {
            int Canal(int k) => int.Parse(hex.Substring(1 + 2 * k, 2), NumberStyles.HexNumber, CultureInfo.InvariantCulture);
            return (Canal(0), Canal(1), Canal(2));
        }

        [Fact]
        public void LaCamisaNuncaSeConfundeConLaPiel()
        {
            foreach (var camisa in Cuerpos.Camisa)
            {
                var a = Rgb(camisa);
                foreach (var piel in Cuerpos.Piel)
                {
                    var b = Rgb(piel);
                    var d = Math.Sqrt(Math.Pow(a.R - b.R, 2) + Math.Pow(a.G - b.G, 2) + Math.Pow(a.B - b.B, 2));
                    Assert.True(d > 60.0, $"{camisa} a {d:F0} de {piel}");
                }
            }

            // Y cualquier persona sale con una de esas camisas.
            foreach (var id in new[] { "per-a1", "per-b1", "per-peaton", "x", "per-z9" })
            {
                Assert.Contains(Cuerpos.Paleta(id)[1], Cuerpos.Camisa);
            }
        }
    }
}
