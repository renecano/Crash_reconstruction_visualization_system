using System;
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

            Assert.True(n >= 18, "escenas revisadas: " + n);
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
        public void EnMatlatzincasLasDefensasYaNoCruzanLosCarriles()
        {
            // René, 2026-11-27: en su caso de Paseo Matlatzincas los postes de las defensas quedaban en
            // medio de los carriles.
            var raiz = Path.GetFullPath(Path.Combine(Aqui(), "..", "..", "..", ".."));
            var e = Paquete.Leer(File.ReadAllText(Path.Combine(raiz, "packages", "scene-schema", "fixtures", "caso3d-ciudad", "matlatzincas.json"))).Escenario;
            Assert.Contains(Calzada.Invasores(e), x => x.StartsWith("defensa"));
            var antes = e.Via.Barreras.Length;
            Calzada.Despejar(e);
            Assert.Empty(Calzada.Invasores(e));
            // Se cortan, no se pierden las de la orilla.
            Assert.True(e.Via.Barreras.Length >= antes / 2);
        }

        [Fact]
        public void EnMatlatzincasNingunaDefensaQuedaEnElRecorridoDelVehiculo()
        {
            // René, 2026-11-27: el coche cruzaba la defensa para llegar al árbol. Se corta donde pasa.
            var raiz = Path.GetFullPath(Path.Combine(Aqui(), "..", "..", "..", ".."));
            var paquete = Paquete.Leer(File.ReadAllText(Path.Combine(raiz, "packages", "scene-schema", "fixtures", "caso3d-ciudad", "matlatzincas.json")));
            // Las defensas tal como vienen del mapa (antes del corte de los carriles, que en este paquete ya
            // las quita del recorrido; en el caso de René el coche sale por la orilla, donde se quedan).
            var e = paquete.Escenario;
            var recorridos = paquete.Resultado.Vehiculos
                .Select(v => new Calzada.Recorrido { X = v.Trayectoria.X, Y = v.Trayectoria.Y, Medio = v.Dimensiones.AnchoM / 2.0 + Calzada.HolguraRecorrido })
                .ToList();
            bool EnPaso(double x, double y) => recorridos.Any(r => Enumerable.Range(0, r.X.Length - 1).Any(i =>
            {
                var dx = r.X[i + 1] - r.X[i];
                var dy = r.Y[i + 1] - r.Y[i];
                var l2 = dx * dx + dy * dy;
                var t = l2 > 0 ? Math.Max(0, Math.Min(1, ((x - r.X[i]) * dx + (y - r.Y[i]) * dy) / l2)) : 0;
                return Math.Sqrt(Math.Pow(x - r.X[i] - t * dx, 2) + Math.Pow(y - r.Y[i] - t * dy, 2)) <= r.Medio;
            }));
            // Cada 25 cm de cada defensa: un tramo puede cruzar el recorrido entre dos vértices.
            bool Cruza(PuntoPlano[] l) => Enumerable.Range(0, l.Length - 1).Any(i =>
            {
                var n = Math.Max(1, (int)Math.Ceiling(Math.Sqrt(Math.Pow(l[i + 1].X - l[i].X, 2) + Math.Pow(l[i + 1].Y - l[i].Y, 2)) / 0.25));
                return Enumerable.Range(0, n + 1).Any(k => EnPaso(l[i].X + (l[i + 1].X - l[i].X) * k / n, l[i].Y + (l[i + 1].Y - l[i].Y) * k / n));
            });
            Assert.Contains(e.Via.Barreras, Cruza);
            var antes = e.Via.Barreras.Sum(l => l.Length);
            Assert.True(Calzada.AbrirPasoEnBarreras(e, recorridos) > 0);
            Assert.DoesNotContain(e.Via.Barreras, Cruza);
            // Solo se corta el paso: casi toda la defensa se queda.
            Assert.True(e.Via.Barreras.Length >= 30);
        }

        [Fact]
        public void UnaDefensaQueCruzaElRecorridoQuedaEnDosTramos()
        {
            var e = new Escenario { Via = new ViaEscenario { Barreras = new[] { new[] { new PuntoPlano { X = -10, Y = 5 }, new PuntoPlano { X = 10, Y = 5 } } } } };
            var r = new Calzada.Recorrido { X = new[] { 0.0, 0.0 }, Y = new[] { -20.0, 20.0 }, Medio = 1.5 };
            Assert.Equal(1, Calzada.AbrirPasoEnBarreras(e, new[] { r }));
            Assert.Equal(2, e.Via.Barreras.Length);
            Assert.All(e.Via.Barreras, l => Assert.All(l, p => Assert.True(Math.Abs(p.X) > 1.5)));
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
