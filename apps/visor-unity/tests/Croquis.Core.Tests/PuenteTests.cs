using System.IO;
using System.Linq;
using System.Runtime.CompilerServices;
using System.Text.RegularExpressions;
using Xunit;

namespace Croquis.Core.Tests
{
    /// <summary>
    /// El puente de Unity y el contrato (`packages/scene-schema/src/visor-puente.ts`) no se separan: la
    /// misma versión, y un método público por cada mensaje que la web le manda a Unity.
    /// </summary>
    public class PuenteTests
    {
        private static string Raiz([CallerFilePath] string aqui = "")
        {
            return Path.GetFullPath(Path.Combine(Path.GetDirectoryName(aqui), "..", "..", "..", ".."));
        }

        [Fact]
        public void LaVersionYLosMensajesSonLosDelContrato()
        {
            var ts = File.ReadAllText(Path.Combine(Raiz(), "packages", "scene-schema", "src", "visor-puente.ts"));
            var cs = File.ReadAllText(Path.Combine(Raiz(), "apps", "visor-unity", "Assets", "Croquis", "Visor", "VisorPuente.cs"));
            var version = Regex.Match(ts, "VISOR_PUENTE_VERSION = \"([0-9.]+)\"").Groups[1].Value;
            Assert.Contains("public const string Version = \"" + version + "\";", cs);
            var lista = Regex.Match(ts, @"NOMBRES_A_UNITY = \[([^\]]*)\]").Groups[1].Value;
            var nombres = Regex.Matches(lista, "\"([a-zA-Z]+)\"").Select(m => m.Groups[1].Value).ToArray();
            Assert.Contains("leyenda", nombres);
            foreach (var n in nombres)
            {
                Assert.Contains("public void " + n + "(string texto)", cs);
            }
        }
    }
}
