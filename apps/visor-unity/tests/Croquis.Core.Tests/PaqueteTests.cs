using System;
using System.IO;
using System.Linq;
using System.Runtime.CompilerServices;
using Croquis.Core;
using Croquis.Generated;
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

        private static string[] Paquetes([CallerFilePath] string aqui = "")
        {
            var raiz = Path.GetFullPath(Path.Combine(Path.GetDirectoryName(aqui), "..", "..", "..", ".."));
            var dir = Path.Combine(raiz, "packages", "scene-schema", "fixtures", "caso3d");
            // Con escenario (lo que más pesa: suelo y vía), uno de las escenas de referencia.
            var conEscenario = Path.Combine(Path.GetDirectoryName(aqui), "datos", "lateral_interseccion-dia.json");
            return Directory.GetFiles(dir, "*.json").OrderBy(f => f).Append(conEscenario).ToArray();
        }

        /// <summary>
        /// Leer por partes da exactamente el mismo caso que leer de una vez (René, 2026-11-16: el armado por
        /// partes no puede cambiar nada de lo que se ve).
        /// </summary>
        [Fact]
        public void LeerPorPartesDaElMismoCaso()
        {
            foreach (var f in Paquetes())
            {
                var json = File.ReadAllText(f);
                var lectura = new Paquete.LecturaPorPartes();
                var pasos = Paquete.LeerPorPartes(json, lectura).ToList();
                Assert.NotNull(lectura.Caso);
                Assert.Equal(Paquete.Leer(json).ToJson(), lectura.Caso.ToJson());
                if (f.EndsWith("lateral_interseccion-dia.json", StringComparison.Ordinal))
                {
                    // Lo pesado va en muchas partes chicas: el suelo, la vía y los vehículos del resultado.
                    Assert.True(pasos.Count(x => x.StartsWith("escenario.suelo", StringComparison.Ordinal)) > 2);
                    Assert.True(pasos.Count(x => x.StartsWith("escenario.via", StringComparison.Ordinal)) > 2);
                    Assert.True(pasos.Count(x => x.StartsWith("resultado.vehiculos", StringComparison.Ordinal)) > 2);
                }
            }
        }

        [Fact]
        public void LeerPorPartesRechazaLoMismoQueLeer()
        {
            Assert.Throws<FormatException>(() => Paquete.LeerPorPartes("{\"version_caso3d\":\"9.9.9\"}", new Paquete.LecturaPorPartes()).ToList());
            Assert.Throws<FormatException>(() => Paquete.LeerPorPartes("{\"version_caso3d\":\"1.0.0\"}", new Paquete.LecturaPorPartes()).ToList());
            // Lo que la lectura de una vez rechaza por un valor fuera del esquema, aquí también.
            var json = File.ReadAllText(Paquetes().Last());
            var malo = Newtonsoft.Json.Linq.JObject.Parse(json);
            malo["resultado"]["vehiculos"][0]["clase"] = "";
            var texto = malo.ToString();
            Assert.Throws<FormatException>(() => Paquete.Leer(texto));
            Assert.Throws<FormatException>(() => Paquete.LeerPorPartes(texto, new Paquete.LecturaPorPartes()).ToList());
            Assert.NotEmpty(Paquete.Precalentar().Take(3).ToList());
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
