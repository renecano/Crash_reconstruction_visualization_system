using System.IO;
using System.Linq;
using System.Runtime.CompilerServices;
using Croquis.Core;
using Croquis.Generated;
using Xunit;
using Xunit.Abstractions;

namespace Croquis.Core.Tests
{
    /// <summary>El camellón sale de las calles de OSM del caso: dos cuerpos de un sentido, en sentidos contrarios.</summary>
    public class CamellonTests
    {
        private readonly ITestOutputHelper salida;

        public CamellonTests(ITestOutputHelper salida)
        {
            this.salida = salida;
        }

        private static Caso3D Ciudad(string nombre, [CallerFilePath] string aqui = "")
        {
            var raiz = Path.GetFullPath(Path.Combine(Path.GetDirectoryName(aqui), "..", "..", "..", ".."));
            return Paquete.Leer(File.ReadAllText(Path.Combine(raiz, "packages", "scene-schema", "fixtures", "caso3d-ciudad", nombre + ".json")));
        }

        [Fact]
        public void PaseoTollocanTieneCamellonYUnaCalleDeColoniaNo()
        {
            var c = Ciudad("metepec-arbol");
            var e = c.Escenario;
            var camellones = Camellon.Buscar(c.Escena.Lugar.RedVial.Vias, 3.5, e.Centro.X, e.Centro.Y, 150);
            Assert.NotEmpty(camellones);
            var puntos = camellones.SelectMany(x => x).ToList();
            salida.WriteLine("camellones " + camellones.Count + ", puntos " + puntos.Count + ", ancho " + puntos.Min(p => p.Ancho) + " a " + puntos.Max(p => p.Ancho));
            Assert.All(puntos, p => Assert.InRange(p.Ancho, Camellon.AnchoMinimoM, Camellon.SeparacionMaximaM));
            salida.WriteLine("dentro: edificios " + e.Entorno.Edificios.Count(b => Camellon.Dentro(camellones, b.X, b.Y)) + ", arboles " + e.Entorno.Arboles.Count(b => Camellon.Dentro(camellones, b.X, b.Y)) + ", postes " + e.Entorno.Postes.Count(b => Camellon.Dentro(camellones, b.X, b.Y)) + ", luminarias " + e.Luminarias.Count(b => Camellon.Dentro(camellones, b.X, b.Y)));

            // Ningún punto del camellón queda sobre la calzada de un cuerpo de Tollocan.
            foreach (var v in c.Escena.Lugar.RedVial.Vias.Where(v => v.Nombre == "Paseo Tollocan"))
            {
                var medio = Camellon.AnchoDe(v, 3.5) / 2.0;
                foreach (var p in puntos)
                {
                    for (var i = 0; i + 1 < v.Puntos.Length; i++)
                    {
                        Assert.True(Distancia(p.X, p.Y, v.Puntos[i], v.Puntos[i + 1]) > medio - 1e-6, "camellón sobre la calzada en " + p.X + ", " + p.Y);
                    }
                }
            }

            // Lo que el plan puso adentro se quita, y el camellón lleva sus árboles.
            Camellon.Despejar(e, camellones);
            Assert.DoesNotContain(e.Entorno.Edificios, b => Camellon.Dentro(camellones, b.X, b.Y));
            Assert.DoesNotContain(e.Entorno.Postes, b => Camellon.Dentro(camellones, b.X, b.Y));
            var arboles = Camellon.Arbolado(camellones, e.Entorno.Arboles, e.Semilla);
            Assert.True(arboles.Count >= 10, "árboles " + arboles.Count);
            Assert.All(arboles, a => Assert.True(Camellon.Dentro(camellones, a.X, a.Y)));
            Assert.Equal(arboles.Select(a => a.X), Camellon.Arbolado(camellones, e.Entorno.Arboles, e.Semilla).Select(a => a.X));

            // Una colonia con calles de doble sentido no tiene camellón.
            var t = Ciudad("tollocan");
            Assert.Empty(Camellon.Buscar(t.Escena.Lugar.RedVial.Vias, 3.5, t.Escenario.Centro.X, t.Escenario.Centro.Y, 150));
        }

        [Fact]
        public void DosCuerposSintéticosDanElAnchoEntreOrillas()
        {
            // Dos cuerpos de 2 carriles (7 m) con ejes a 20 m: camellón de 13 m, centrado en y = 10.
            ViaElement Cuerpo(long id, double y0, double x0, double x1) => new ViaElement
            {
                IdOsm = id,
                Nombre = "Avenida",
                Tipo = "primary",
                Carriles = 2,
                UnSentido = true,
                Puntos = new[] { new Posicion { X = x0, Y = y0 }, new Posicion { X = x1, Y = y0 } },
            };
            var vias = new[] { Cuerpo(1, 0, -60, 60), Cuerpo(2, 20, 60, -60) };
            var cam = Camellon.Buscar(vias, 3.5, 0, 10, 100);
            Assert.Single(cam);
            Assert.All(cam[0], p =>
            {
                Assert.Equal(13.0, p.Ancho, 6);
                Assert.Equal(10.0, p.Y, 6);
            });
            Assert.True(Camellon.Dentro(cam, 0, 10));
            Assert.False(Camellon.Dentro(cam, 0, 2));

            // Una calle que cruza corta el camellón en dos.
            var cruce = new ViaElement { IdOsm = 3, Tipo = "residential", Puntos = new[] { new Posicion { X = 0, Y = -30 }, new Posicion { X = 0, Y = 50 } } };
            Assert.Equal(2, Camellon.Buscar(vias.Append(cruce).ToArray(), 3.5, 0, 10, 100).Count);
        }

        [Fact]
        public void EnZonaAridaQuedaUnoDeCadaTresArbolesComoPirul()
        {
            var e = Ciudad("metepec-arbol").Escenario;
            var antes = e.Entorno.Arboles.Length;
            Paisaje.Arido(e);
            Assert.Equal(antes, e.Entorno.Arboles.Length);
            e.Entorno.Paisaje = PaisajeEntorno.Arido;
            Paisaje.Arido(e);
            Assert.Equal((antes + 2) / 3, e.Entorno.Arboles.Length);
            Assert.All(e.Entorno.Arboles, a => Assert.Equal(EspecieArbol.Pirul, a.Especie));
        }

        private static double Distancia(double x, double y, Posicion a, Posicion b)
        {
            var lx = b.X - a.X;
            var ly = b.Y - a.Y;
            var l2 = lx * lx + ly * ly;
            var t = l2 > 0 ? System.Math.Max(0, System.Math.Min(1, ((x - a.X) * lx + (y - a.Y) * ly) / l2)) : 0;
            var ex = a.X + t * lx - x;
            var ey = a.Y + t * ly - y;
            return System.Math.Sqrt(ex * ex + ey * ey);
        }
    }
}
