using System.IO;
using System.Linq;
using System.Runtime.CompilerServices;
using Croquis.Core;
using Croquis.Generated;
using Newtonsoft.Json;
using Xunit;

namespace Croquis.Core.Tests
{
    /// <summary>Nada procedural en medio de la carretera (revisión del 2026-11-26).</summary>
    public class CalzadaTests
    {
        private static Escenario Reforma([CallerFilePath] string aqui = "")
        {
            // La calzada y el entorno de Paseo de la Reforma como los armó la web (main, 2026-11-26).
            var texto = File.ReadAllText(Path.Combine(Path.GetDirectoryName(aqui), "Datos", "reforma-calzada.json"));
            return JsonConvert.DeserializeObject<Escenario>(texto, Converter.Settings);
        }

        [Fact]
        public void LasSenalesQueQuedabanEnLaCalzadaPasanALaOrilla()
        {
            var e = Reforma();
            var antes = e.Entorno.Senales.Length;
            // En Reforma el plan dejaba cuatro señales en el arroyo de la glorieta.
            Assert.Equal(4, Calzada.Despejar(e));
            // Ya no queda nada en medio: otra pasada no encuentra nada.
            Assert.Equal(0, Calzada.Despejar(e));
            // Las que quedan siguen siendo las de antes o menos (las que no tenían orilla cerca se quitan).
            Assert.InRange(e.Entorno.Senales.Length, antes - 4, antes);
        }
    }
}
