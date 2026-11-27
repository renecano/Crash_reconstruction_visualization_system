using System;
using System.IO;
using System.Linq;
using System.Runtime.CompilerServices;
using Croquis.Core;
using Croquis.Generated;
using Xunit;

namespace Croquis.Core.Tests
{
    /// <summary>El trayecto previo ilustrativo (René, 2026-11-27): Unity lo recorre antes del Resultado.</summary>
    public class PrevioTests
    {
        private static string Raiz([CallerFilePath] string aqui = "")
        {
            return Path.GetFullPath(Path.Combine(Path.GetDirectoryName(aqui), "..", "..", "..", ".."));
        }

        // 100 m al este y vuelta al norte 50 m; termina en (100, 50) a los −4 s.
        private static TrayectoPrevio Ruta()
        {
            return new TrayectoPrevio
            {
                X = new[] { 0.0, 100.0, 100.0 },
                Y = new[] { 0.0, 0.0, 50.0 },
                T = new[] { -14.0, -8.0, -4.0 },
                DistanciaM = 150.0,
            };
        }

        [Fact]
        public void LaPoseVaPorLaRutaYTerminaEnElEmpalme()
        {
            var tr = Ruta();
            Assert.True(Previo.Hay(tr));
            var a = Previo.Pose(tr, -14.0);
            Assert.Equal(0.0, a.X, 9);
            Assert.Equal(0.0, a.Rumbo, 9);
            var m = Previo.Pose(tr, -11.0);
            Assert.Equal(50.0, m.X, 9);
            var fin = Previo.Pose(tr, -4.0);
            Assert.Equal(100.0, fin.X, 9);
            Assert.Equal(50.0, fin.Y, 9);
            Assert.Equal(Math.PI / 2.0, fin.Rumbo, 9);
            // Antes de su inicio, se queda en el primer punto.
            Assert.Equal(0.0, Previo.Pose(tr, -30.0).X, 9);
        }

        [Fact]
        public void LaLineaPunteadaTieneTresDeCadaCincoMetros()
        {
            var g = Previo.Guiones(Ruta());
            var total = g.Sum(x => Math.Sqrt((x.Bx - x.Ax) * (x.Bx - x.Ax) + (x.By - x.Ay) * (x.By - x.Ay)));
            Assert.InRange(total, 150.0 * 0.6 - 3.0, 150.0 * 0.6 + 3.0);
            Assert.All(g, x => Assert.True(Math.Abs(x.Bx - x.Ax) + Math.Abs(x.By - x.Ay) <= 3.0 + 1e-9));
        }

        [Fact]
        public void LaReproduccionEmpiezaDondeEmpiezaElTrayectoMasLargo()
        {
            Assert.Equal(-14.0, Previo.InicioDelCaso(-3.0, new[] { Ruta(), null }));
            Assert.Equal(-3.0, Previo.InicioDelCaso(-3.0, new TrayectoPrevio[] { null }));
            Assert.False(Previo.Hay(new TrayectoPrevio { X = new[] { 0.0 }, Y = new[] { 0.0 }, T = new[] { 0.0 } }));
        }

        [Fact]
        public void LaAutomaticaSigueAlVehiculoYLlegaALasTomasDeSiempre()
        {
            // Durante el trayecto sigue; desde el inicio de la reconstrucción, ya no.
            Assert.Equal(1.0, CamaraAutomatica.PesoSeguimiento(-20.0, -4.0), 9);
            Assert.Equal(0.0, CamaraAutomatica.PesoSeguimiento(-4.0, -4.0), 9);
            Assert.InRange(CamaraAutomatica.PesoSeguimiento(-4.75, -4.0), 0.1, 0.9);
            // Atrás del vehículo y arriba, mirando hacia adelante.
            var t = CamaraAutomatica.Seguir(new V3(0, 0, 0), 0.0);
            Assert.True(t.Ojo.X < 0 && t.Ojo.Y > 2 && t.Mira.X > 0);
        }

        [Fact]
        public void EnElPaqueteDePruebaElTrayectoEmpalmaSinSaltos()
        {
            // La MEX 57 con 5.8 km por las calles antes del alcance (OSRM, `trayecto-previo.ts`).
            var raiz = Raiz();
            var caso = Paquete.Leer(File.ReadAllText(Path.Combine(raiz, "packages", "scene-schema", "fixtures", "caso3d-previo", "mex57-previo.json")));
            var e = caso.Escenario.Vehiculos.Single(v => v.TrayectoPrevio != null);
            var tr = e.TrayectoPrevio;
            var v = caso.Resultado.Vehiculos.Single(x => x.Id == e.Id);
            Assert.True(Previo.Hay(tr));
            var n = tr.X.Length;
            // Mismo punto y mismo instante que el inicio de la reconstrucción…
            Assert.Equal(v.Trayectoria.X[0], tr.X[n - 1], 2);
            Assert.Equal(v.Trayectoria.Y[0], tr.Y[n - 1], 2);
            Assert.Equal(caso.Resultado.TInicio, tr.T[n - 1], 6);
            // …a la misma velocidad, nunca más rápido antes, y el tiempo siempre avanza.
            var v0 = Math.Sqrt(v.Trayectoria.Vx[0] * v.Trayectoria.Vx[0] + v.Trayectoria.Vy[0] * v.Trayectoria.Vy[0]);
            Assert.Equal(v0, tr.VMs[n - 1], 1);
            Assert.All(tr.VMs, x => Assert.True(x <= v0 + 0.01));
            Assert.All(Enumerable.Range(1, n - 1), i => Assert.True(tr.T[i] > tr.T[i - 1]));
        }

        [Fact]
        public void LaRutaSeDibujaSobreElSueloDeLaEscena()
        {
            // Un tramo de suelo de 100 m con 1 segmento: alturas 0, 1, 2 y 3 m en sus esquinas.
            var s = new SueloEscenario { Centro = new PuntoPlano { X = 0, Y = 0 }, LadoM = 100, Segmentos = 1, AlturasM = new[] { 0.0, 1.0, 2.0, 3.0 } };
            Assert.Equal(1.5, Previo.AlturaSuelo(new[] { s }, 0, 0).Value, 9);
            Assert.Equal(0.0, Previo.AlturaSuelo(new[] { s }, -50, -50).Value, 9);
            Assert.Null(Previo.AlturaSuelo(new[] { s }, 80, 0));
        }
    }
}
