using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.CompilerServices;
using Croquis.Core;
using Croquis.Generated;
using Newtonsoft.Json;
using Xunit;

namespace Croquis.Core.Tests
{
    /// <summary>
    /// Nada procedural sobre la vía (revisión del 2026-11-26; René, 2026-11-27: la cerca de alambre
    /// atravesaba los carriles en AXA). Se mide en los datos: ningún objeto del plan del entorno toca el
    /// polígono de la calzada ni el del acotamiento.
    /// </summary>
    public class CalzadaTests
    {
        private static string Aqui([CallerFilePath] string aqui = "")
        {
            return Path.GetDirectoryName(aqui);
        }

        private static Escenario Reforma()
        {
            // La calzada y el entorno de Paseo de la Reforma como los armó la web (main, 2026-11-26).
            var texto = File.ReadAllText(Path.Combine(Aqui(), "Datos", "reforma-calzada.json"));
            return JsonConvert.DeserializeObject<Escenario>(texto, Converter.Settings);
        }

        /// <summary>Los paquetes de la batería de ciudad (AXA en la MEX 15D, Tollocan, Reforma, el centro de Toluca…) y los de carretera.</summary>
        private static IEnumerable<(string Nombre, Escenario E)> Escenas()
        {
            var raiz = Path.GetFullPath(Path.Combine(Aqui(), "..", "..", "..", ".."));
            foreach (var carpeta in new[] { "caso3d-ciudad", "caso3d-carretera" })
            {
                var dir = Path.Combine(raiz, "packages", "scene-schema", "fixtures", carpeta);
                if (!Directory.Exists(dir))
                {
                    continue;
                }

                foreach (var f in Directory.GetFiles(dir, "*.json").Where(f => Path.GetFileName(f) != "indice.json"))
                {
                    yield return (carpeta + "/" + Path.GetFileNameWithoutExtension(f), Paquete.Leer(File.ReadAllText(f)).Escenario);
                }
            }

            yield return ("reforma-calzada", Reforma());
        }

        [Fact]
        public void EnNingunaEscenaQuedaAlgoProceduralSobreLaVia()
        {
            var n = 0;
            foreach (var (nombre, e) in Escenas())
            {
                Calzada.Despejar(e);
                var quedan = Calzada.Invasores(e);
                Assert.True(quedan.Count == 0, nombre + ": " + string.Join("; ", quedan.Take(5)));
                // Ya no queda nada: otra pasada no cambia nada.
                Assert.Equal(0, Calzada.Despejar(e));
                n++;
            }

            Assert.True(n >= 14, "escenas revisadas: " + n);
        }

        [Fact]
        public void EnAxaLasCercasCruzabanLaCarreteraYAhoraSeCortan()
        {
            var raiz = Path.GetFullPath(Path.Combine(Aqui(), "..", "..", "..", ".."));
            var e = Paquete.Leer(File.ReadAllText(Path.Combine(raiz, "packages", "scene-schema", "fixtures", "caso3d-ciudad", "axa.json"))).Escenario;
            var antes = Calzada.Invasores(e);
            Assert.Contains(antes, x => x.StartsWith("cerca"));
            var cercas = e.Entorno.Cercas.Length;
            Calzada.Despejar(e);
            Assert.Empty(Calzada.Invasores(e));
            // Se cortan, no se pierden: quedan los tramos de fuera de la vía.
            Assert.True(e.Entorno.Cercas.Length >= cercas - 11);
        }

        [Fact]
        public void UnaCercaQueCruzaUnaCalleQuedaEnDosTramosFueraDeElla()
        {
            // Una calle de 7 m de ancho a lo largo de x (calzada) y una cerca que la cruza de sur a norte.
            var e = new Escenario
            {
                Via = new ViaEscenario
                {
                    Capas = new[]
                    {
                        new CapaEscenario
                        {
                            Nombre = NombreCapa.Calzada,
                            Posiciones = new[] { -50.0, -3.5, 50.0, -3.5, 50.0, 3.5, -50.0, 3.5 },
                            Indices = new long[] { 0, 1, 2, 0, 2, 3 },
                        },
                    },
                },
                Entorno = new EntornoEscenario
                {
                    Cercas = new[] { new SegmentoPlano { Ax = 0, Ay = -30, Bx = 0, By = 30 } },
                    Arboles = new[] { new ArbolEscenario { X = 10, Y = 0 } },
                    Edificios = new EdificioEscenario[0],
                },
            };
            Assert.Equal(2, Calzada.Despejar(e));
            Assert.Equal(2, e.Entorno.Cercas.Length);
            Assert.All(e.Entorno.Cercas, c => Assert.True(System.Math.Min(System.Math.Abs(c.Ay), System.Math.Abs(c.By)) >= 3.5 + Calzada.Holgura - 0.3));
            // El árbol que estaba en medio pasa a la orilla, fuera de la calzada.
            Assert.True(System.Math.Abs(e.Entorno.Arboles[0].Y) >= 3.5 + Calzada.RadioArbol);
            Assert.Empty(Calzada.Invasores(e));
        }
    }
}
