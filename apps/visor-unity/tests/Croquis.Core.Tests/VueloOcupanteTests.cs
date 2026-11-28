using System;
using System.IO;
using System.Linq;
using System.Runtime.CompilerServices;
using Croquis.Core;
using Croquis.Generated;
using Xunit;

namespace Croquis.Core.Tests
{
    /// <summary>
    /// El motociclista después del impacto (René, 2026-11-28): sale en un arco, cae, rueda y se desliza
    /// hasta su posición final narrada; determinista, terminando exactamente ahí.
    /// </summary>
    public class VueloOcupanteTests
    {
        private static string Raiz([CallerFilePath] string aqui = "")
        {
            return Path.GetFullPath(Path.Combine(Path.GetDirectoryName(aqui), "..", "..", "..", ".."));
        }

        private static Caso3D Moto()
        {
            var f = Path.Combine(Raiz(), "packages", "scene-schema", "fixtures", "caso3d", "motociclista.json");
            return Paquete.Leer(File.ReadAllText(f));
        }

        private static VueloOcupante Vuelo(Caso3D c, bool conNarrada = true)
        {
            var p = c.Resultado.Personas.First(x => x.Rol == RolEnum.Motociclista);
            var moto = c.Resultado.Vehiculos.First(v => v.Id == p.VehiculoId);
            var enEscena = c.Escena.Personas.First(x => x.Id == p.Id);
            if (!conNarrada)
            {
                enEscena.PosicionFinal = null;
            }

            return VueloOcupante.Armar(p, moto, enEscena, 0.0);
        }

        [Fact]
        public void TerminaExactamenteEnLaPosicionNarrada()
        {
            var c = Moto();
            var v = Vuelo(c);
            Assert.NotNull(v);
            Assert.False(v.Supuesta);
            var narrada = c.Escena.Personas.First(x => x.Id == "per-b1").PosicionFinal;
            var fin = v.Pose(v.TFin);
            Assert.Equal(narrada.X, fin.X, 6);
            Assert.Equal(narrada.Y, fin.Y, 6);
            Assert.Equal(Postura.Tendido, fin.Postura);
            // Y ahí se queda.
            var despues = v.Pose(v.TFin + 3.0);
            Assert.Equal(narrada.X, despues.X, 6);
            // No es el reposo de Searle del solver (20.7 m): la narración dice 8 m.
            var searle = c.Resultado.Personas.First(x => x.Id == "per-b1").Proyeccion.PosicionReposo;
            Assert.True(Math.Abs(searle.X - fin.X) > 5.0);
        }

        [Fact]
        public void SaleEnUnArcoCaeYAvanzaSinRegresar()
        {
            var v = Vuelo(Moto());
            // En el aire sube y luego baja hasta el piso.
            var alto = Enumerable.Range(0, 21).Select(k => v.Pose(v.T0 + v.TAire * k / 20.0).Z).ToArray();
            Assert.True(alto.Max() > v.Z0);
            Assert.Equal(VueloOcupante.AlturaTendido, alto.Last(), 3);
            Assert.Equal(Postura.Vuelo, v.Pose(v.T0 + v.TAire / 2).Postura);
            // Siempre hacia la posición final, nunca para atrás, y cada vez más lento en el suelo.
            var antes = -1.0;
            for (var t = v.T0; t <= v.TFin + 0.5; t += 1.0 / 60.0)
            {
                var d = v.Recorrido(t);
                Assert.True(d >= antes - 1e-9);
                antes = d;
            }

            Assert.True(v.TSuelo > 0.0);
            Assert.True(v.Vueltas >= 1);
            // Rueda vueltas enteras: queda como cayó.
            Assert.Equal(v.Vueltas * 2.0 * Math.PI, v.Giro(v.TFin), 6);
        }

        [Fact]
        public void EsDeterministaEnCadaReproduccion()
        {
            var a = Vuelo(Moto());
            var b = Vuelo(Moto());
            for (var t = -0.5; t < a.TFin + 1.0; t += 0.07)
            {
                var pa = a.T0 <= t ? a.Pose(t) : default;
                var pb = b.T0 <= t ? b.Pose(t) : default;
                Assert.Equal(pa.X, pb.X);
                Assert.Equal(pa.Y, pb.Y);
                Assert.Equal(pa.Z, pb.Z);
                Assert.Equal(a.Giro(t), b.Giro(t));
            }
        }

        [Fact]
        public void SinPosicionNarradaQuedaJuntoALaMotoComoSupuesto()
        {
            var c = Moto();
            var v = Vuelo(c, conNarrada: false);
            Assert.True(v.Supuesta);
            var tr = c.Resultado.Vehiculos.First(x => x.Id == "veh-b").Trayectoria;
            var n = tr.T.Length - 1;
            var fin = v.Pose(v.TFin);
            var d = Math.Sqrt(Math.Pow(fin.X - tr.X[n], 2) + Math.Pow(fin.Y - tr.Y[n], 2));
            Assert.InRange(d, 0.5, 2.5);
        }

        [Fact]
        public void UnaNarradaMuyCercaAcortaElArcoYAunAsiLlega()
        {
            // 3 m a 60 km/h: el arco no se pasa de largo.
            var v = new VueloOcupante(0.0, 0.0, 0.0, 1.0, 16.7, 0.0, 3.0, 0.0, false);
            Assert.True(v.Recorrido(v.T0 + v.TAire) <= 3.0 * VueloOcupante.FraccionAireMax + 1e-9);
            Assert.Equal(3.0, v.Pose(v.TFin).X, 6);
        }

        [Fact]
        public void LaLeyendaDiceQueLaTrayectoriaEsIlustrativa()
        {
            Assert.Contains("Trayectoria del ocupante: ilustrativa; su posición final es la narrada", Leyenda3d.Mensaje(true, null, null, false, true));
            Assert.Contains("su posición final es supuesta", Leyenda3d.Mensaje(true, null, null, false, false));
            Assert.DoesNotContain("ocupante", Leyenda3d.Mensaje(true));
        }

        [Fact]
        public void LaCamaraDejaAlOcupanteALaVista()
        {
            var toma = new Toma { Ojo = new V3(0, 2, -10), Mira = new V3(0, 1, 0) };
            var contacto = new V3(0, 1, 0);
            var ocupante = new V3(12, 0.2, 0);
            Assert.Equal(toma.Ojo.X, VueloOcupante.ConOcupante(toma, contacto, ocupante, 0.0).Ojo.X);
            var con = VueloOcupante.ConOcupante(toma, contacto, ocupante, 1.0);
            // Mira al medio y se aleja: el contacto y el ocupante entran.
            Assert.Equal(6.0, con.Mira.X, 6);
            var lejos = Math.Sqrt(Math.Pow(con.Ojo.X - con.Mira.X, 2) + Math.Pow(con.Ojo.Z - con.Mira.Z, 2));
            Assert.True(lejos > 10.0);
        }
    }
}
