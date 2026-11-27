using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.CompilerServices;
using Croquis.Core;
using Croquis.Generated;
using Xunit;

namespace Croquis.Core.Tests
{
    /// <summary>
    /// El roce bajo el umbral de CRASH3 (René, 2026-11-27): rayones y pintura ajena en proporción a la
    /// energía, sin hundir la lámina.
    /// </summary>
    public class RozaduraTests
    {
        private static Caso3D Reversa([CallerFilePath] string aqui = "")
        {
            var raiz = Path.GetFullPath(Path.Combine(Path.GetDirectoryName(aqui), "..", "..", "..", ".."));
            return Paquete.Leer(File.ReadAllText(Path.Combine(raiz, "packages", "scene-schema", "fixtures", "caso3d", "reversa.json")));
        }

        /// <summary>Una rejilla en el frente y otra atrás, en el marco de Unity (x derecha, y arriba, z adelante).</summary>
        private static void Caja(ResultadoVehiculo v, out V3[] vertices, out int[] triangulos)
        {
            var d = v.Dimensiones;
            var vs = new List<V3>();
            var ts = new List<int>();
            const int N = 12;
            foreach (var z in new[] { d.LargoM / 2.0, -d.LargoM / 2.0 })
            {
                var b = vs.Count;
                for (var i = 0; i <= N; i++)
                {
                    for (var j = 0; j <= N; j++)
                    {
                        vs.Add(new V3(-d.AnchoM / 2.0 + d.AnchoM * i / N, d.AltoM * j / N, z));
                    }
                }

                for (var i = 0; i < N; i++)
                {
                    for (var j = 0; j < N; j++)
                    {
                        var a = b + i * (N + 1) + j;
                        ts.AddRange(new[] { a, a + 1, a + N + 1, a + 1, a + N + 2, a + N + 1 });
                    }
                }
            }

            vertices = vs.ToArray();
            triangulos = ts.ToArray();
        }

        [Fact]
        public void LaReversaRozaSinHundirYConSuIntensidadDeCrash3()
        {
            var caso = Reversa();
            var b = caso.Resultado.Vehiculos.Single(x => x.Id == "veh-b");
            Assert.Null(DanoDelCaso.Campo(b)); // la lámina no se mueve
            var z = RozaduraDelCaso.De(b, caso.Resultado);
            Assert.NotNull(z);
            var g = 87716.3 * 87716.3 / (2.0 * 1185167.6);
            Assert.Equal(3215.131 / (g * 1.86), z.Intensidad, 6);
            Assert.Equal("veh-a", z.Contra);

            // El sedán sí se aplasta: lo dibuja el daño, no el roce.
            var a = caso.Resultado.Vehiculos.Single(x => x.Id == "veh-a");
            Assert.NotNull(DanoDelCaso.Campo(a));
            Assert.Null(RozaduraDelCaso.De(a, caso.Resultado));
        }

        [Fact]
        public void ConMasEnergiaHayMasRayonesYSinEnergiaNinguno()
        {
            var caso = Reversa();
            var b = caso.Resultado.Vehiculos.Single(x => x.Id == "veh-b");
            Caja(b, out var vs, out var ts);
            int Triangulos(double energia)
            {
                b.Dano.EnergiaJ = energia;
                var z = RozaduraDelCaso.De(b, caso.Resultado);
                if (z == null)
                {
                    return 0;
                }

                DanoDelCaso.FijarFrente(z.Campo, vs, ts);
                return RozaduraDelCaso.Rayones(z, 7).Triangulos.Length;
            }

            Assert.Equal(0, Triangulos(0.0));
            Assert.True(Triangulos(800.0) < Triangulos(3215.131));
            Assert.True(Triangulos(3215.131) < Triangulos(6000.0));
        }

        [Fact]
        public void LosTrazosVanSobreLaCaraDelContactoYMiranAfuera()
        {
            var caso = Reversa();
            var b = caso.Resultado.Vehiculos.Single(x => x.Id == "veh-b");
            Caja(b, out var vs, out var ts);
            var z = RozaduraDelCaso.De(b, caso.Resultado);
            DanoDelCaso.FijarFrente(z.Campo, vs, ts);
            foreach (var m in new[] { RozaduraDelCaso.Rayones(z, 3), RozaduraDelCaso.Pintura(z, 3), RozaduraDelCaso.Abrasion(z, 3) })
            {
                Assert.NotEmpty(m.Triangulos);
                foreach (var p in m.Vertices)
                {
                    // Cara F: sobre el frente, a unos milímetros de la lámina, dentro del ancho y a la altura de la estructura.
                    Assert.InRange(p.Z, b.Dimensiones.LargoM / 2.0, b.Dimensiones.LargoM / 2.0 + 0.01);
                    Assert.InRange(Math.Abs(p.X), 0.0, 1.86 / 2.0 + 0.01);
                    Assert.InRange(p.Y, z.Campo.Banda0 - 0.03, z.Campo.Banda1 + 0.03);
                }

                for (var t = 0; t < m.Triangulos.Length; t += 3)
                {
                    var a = m.Vertices[m.Triangulos[t]];
                    var n = RozaduraDelCaso.Cruz(m.Vertices[m.Triangulos[t + 1]] + a * -1.0, m.Vertices[m.Triangulos[t + 2]] + a * -1.0);
                    Assert.True(n.Z >= -1e-12, "un triángulo mira hacia adentro");
                }
            }

            // El mismo caso se ve igual cada vez.
            Assert.Equal(RozaduraDelCaso.Rayones(z, 3).Vertices, RozaduraDelCaso.Rayones(z, 3).Vertices);
        }

        [Fact]
        public void SinRigidezOContraUnaPersonaNoSeInventaRoce()
        {
            var caso = Reversa();
            var b = caso.Resultado.Vehiculos.Single(x => x.Id == "veh-b");
            var rigidez = b.Dano.Rigidez;
            b.Dano.Rigidez = null;
            Assert.Null(RozaduraDelCaso.De(b, caso.Resultado));
            b.Dano.Rigidez = rigidez;
            foreach (var e in caso.Resultado.Eventos)
            {
                if (e.Tipo == StickyTipo.ImpactoVehiculoVehiculo)
                {
                    e.Tipo = StickyTipo.ImpactoVehiculoPersona;
                }
            }

            Assert.Null(RozaduraDelCaso.De(b, caso.Resultado));
        }
    }
}
