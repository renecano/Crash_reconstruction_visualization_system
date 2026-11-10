using System;
using System.IO;
using System.Linq;
using System.Runtime.CompilerServices;
using Croquis.Core;
using Xunit;

namespace Croquis.Core.Tests
{
    /// <summary>U3: los cuerpos de MakeHuman con los mismos colores que el visor web y sus regiones.</summary>
    public class CuerposTests
    {
        private static string Raiz([CallerFilePath] string aqui = "")
        {
            return Path.GetFullPath(Path.Combine(Path.GetDirectoryName(aqui), "..", "..", "..", ".."));
        }

        [Fact]
        public void ElHashEsElDelVisorWeb()
        {
            // Valores de `hash01` en packages/viewer/src/body-assets.ts (Node, 2026-11-10).
            Assert.Equal(0.6930592404678464, Cuerpos.Hash01("per-peaton:piel"), 12);
            Assert.Equal(0.851127537433058, Cuerpos.Hash01("per-b1:camisa"), 12);
            Assert.Equal(0.9884691552724689, Cuerpos.Hash01("x"), 12);
        }

        [Fact]
        public void LaPaletaEsDeterministaYSinTonosDePielEnLaCamisa()
        {
            var a = Cuerpos.Paleta("per-peaton");
            Assert.Equal(a, Cuerpos.Paleta("per-peaton"));
            Assert.Equal(Cuerpos.Regiones.Length, a.Length);
            Assert.All(a, c => Assert.Matches("^#[0-9a-f]{6}$", c));
        }

        [Fact]
        public void LasRegionesDelCuerpoSalenDelGlb()
        {
            var glb = File.ReadAllBytes(Path.Combine(Raiz(), "apps", "web", "public", "modelos", "personas", "adulto.glb"));
            var region = Cuerpos.Atributo(glb, "_REGION");
            Assert.NotNull(region);
            // POSITION es VEC3: el lector solo da escalares y lo dice.
            Assert.Throws<FormatException>(() => Cuerpos.Atributo(glb, "POSITION"));
            Assert.True(region.Length > 1000);
            var distintas = region.Select(r => (int)Math.Round(r)).Distinct().OrderBy(x => x).ToArray();
            Assert.Subset(new[] { 0, 1, 2, 3, 4, 5 }.ToHashSet(), distintas.ToHashSet());
            Assert.Contains(0, distintas);
            Assert.Contains(1, distintas);
            Assert.Contains(2, distintas);
            Assert.Null(Cuerpos.Atributo(glb, "_NO_EXISTE"));
        }

        [Fact]
        public void LosTriangulosSeRepartenPorRegion()
        {
            var tri = new[] { 0, 1, 2, 3, 4, 5, 6, 7, 8 };
            var region = new float[] { 0, 0, 0, 2, 2, 2, 1, 1, 1 };
            var por = Cuerpos.TriangulosPorRegion(tri, region);
            Assert.Equal(new[] { 0, 1, 2 }, por[0]);
            Assert.Equal(new[] { 6, 7, 8 }, por[1]);
            Assert.Equal(new[] { 3, 4, 5 }, por[2]);
            Assert.Empty(por[3]);
            Assert.Equal("adulto", Cuerpos.Variante(1.7));
            Assert.Equal("nino", Cuerpos.Variante(1.3));
        }
    }
}
