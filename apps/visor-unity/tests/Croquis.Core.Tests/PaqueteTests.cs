using System;
using System.IO;
using System.Linq;
using System.Runtime.CompilerServices;
using Croquis.Core;
using Xunit;

namespace Croquis.Core.Tests
{
    /// <summary>U6: leer el paquete caso-3d una sola vez, con la versión y el sobre en flujo.</summary>
    public class PaqueteTests
    {
        private static string UnPaquete([CallerFilePath] string aqui = "")
        {
            var raiz = Path.GetFullPath(Path.Combine(Path.GetDirectoryName(aqui), "..", "..", "..", ".."));
            var dir = Path.Combine(raiz, "packages", "scene-schema", "fixtures", "caso3d");
            return File.ReadAllText(Directory.GetFiles(dir, "*.json").OrderBy(f => f).First());
        }

        [Fact]
        public void LeeLaVersionSinLeerElPaqueteEntero()
        {
            var json = UnPaquete();
            Assert.Equal(Paquete.VersionAdmitida, Paquete.VersionDe(json));
            Assert.Null(Paquete.VersionDe("{\"escena\":{\"version_caso3d\":\"9.9.9\"}}"));
            Assert.Equal("2.0.0", Paquete.VersionDe("{\"escena\":{\"a\":[1,2]},\"version_caso3d\":\"2.0.0\"}"));
        }

        [Fact]
        public void SacaElPaqueteDelSobreDelMensaje()
        {
            var json = UnPaquete();
            var sobre = Newtonsoft.Json.JsonConvert.SerializeObject(new { json });
            Assert.Equal(json, Paquete.PropiedadDeTexto(sobre, "json"));
            Assert.Null(Paquete.PropiedadDeTexto("{\"otro\":\"x\"}", "json"));
            var caso = Paquete.Leer(Paquete.PropiedadDeTexto(sobre, "json"));
            Assert.NotNull(caso.Resultado);
        }

        [Fact]
        public void OtraVersionSigueDiciendoCual()
        {
            var e = Assert.Throws<FormatException>(() => Paquete.Leer("{\"version_caso3d\":\"0.1.0\",\"escena\":{}}"));
            Assert.Contains("0.1.0", e.Message);
        }
    }
}
