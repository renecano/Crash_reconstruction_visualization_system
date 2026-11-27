using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.CompilerServices;
using Croquis.Core;
using Croquis.Generated;
using Xunit;

namespace Croquis.Core.Tests
{
    /// <summary>La cámara «automática» del video (René, 2026-11-27): el contacto siempre a la vista.</summary>
    public class CamaraAutomaticaTests
    {
        // Un alcance sobre el eje x: A (atrás) le pega a B (adelante); el contacto, entre los dos.
        private static readonly V3 A = new V3(-2.4, 0.0, 0.0);
        private static readonly V3 B = new V3(2.4, 0.0, 0.0);
        private static readonly V3 P = new V3(0.0, CamaraAutomatica.AlturaContacto, 0.0);

        private static string Raiz([CallerFilePath] string aqui = "")
        {
            return Path.GetFullPath(Path.Combine(Path.GetDirectoryName(aqui), "..", "..", "..", ".."));
        }

        private static List<Estorbo> Alcance()
        {
            return new List<Estorbo>
            {
                Estorbo.Vehiculo(A.X, A.Z, 0.0, 4.6, 1.9, 1.8),
                Estorbo.Vehiculo(B.X, B.Z, 0.0, 4.6, 1.9, 1.8),
            };
        }

        private static Estorbo Edificio(double cx, double cz, double largo, double fondo)
        {
            return new Estorbo { Cx = cx, Cz = cz, Ux = 1.0, Uz = 0.0, MedioLargo = largo / 2.0, MedioAncho = fondo / 2.0, Y0 = -1.0, Y1 = 9.0 };
        }

        [Fact]
        public void DesdeAtrasDeLosVehiculosElContactoQuedaTapado()
        {
            // Lo que pasaba en AXA: la cámara detrás del que alcanza, a la altura de un coche.
            var ojo = new V3(-12.0, 1.5, 0.0);
            Assert.False(CamaraAutomatica.Despejado(ojo, P, Alcance()));
        }

        [Fact]
        public void ElImpactoSeVeDeLadoYDespejado()
        {
            var e = Alcance();
            var t = CamaraAutomatica.Impacto(P, A, B, e);
            Assert.True(CamaraAutomatica.Despejado(t.Ojo, P, e));
            // De lado: más separado en z (perpendicular a la línea entre los vehículos) que en x.
            Assert.True(Math.Abs(t.Ojo.Z - P.Z) > Math.Abs(t.Ojo.X - P.X));
            Assert.Equal(P.X, t.Mira.X, 6);
        }

        [Fact]
        public void ConUnEdificioDeUnLadoSeVaAlOtro()
        {
            var e = Alcance();
            e.Add(Edificio(0.0, 5.0, 30.0, 3.0)); // una fachada a 3.5 m al norte
            var t = CamaraAutomatica.Impacto(P, A, B, e);
            Assert.True(t.Ojo.Z < 0.0);
            Assert.True(CamaraAutomatica.Despejado(t.Ojo, P, e));
        }

        [Fact]
        public void EnUnaCalleAngostaBuscaOtroAnguloOSube()
        {
            var e = Alcance();
            e.Add(Edificio(0.0, 4.5, 60.0, 3.0));
            e.Add(Edificio(0.0, -4.5, 60.0, 3.0));
            var t = CamaraAutomatica.Impacto(P, A, B, e);
            Assert.True(CamaraAutomatica.Despejado(t.Ojo, P, e));
            Assert.DoesNotContain(e, x => x.Contiene(t.Ojo));
        }

        [Fact]
        public void LasTomasCambianConElInstante()
        {
            var llegada = new Toma { Ojo = new V3(0, 20, 0), Mira = new V3(-10, 0, 0) };
            var impacto = new Toma { Ojo = new V3(0, 2, 7), Mira = P };
            var final = new Toma { Ojo = new V3(0, 30, 5), Mira = new V3(5, 0, 0) };
            Assert.Equal(llegada.Ojo, CamaraAutomatica.En(-5.0, 0.0, llegada, impacto, final).Ojo);
            Assert.Equal(impacto.Ojo, CamaraAutomatica.En(0.0, 0.0, llegada, impacto, final).Ojo);
            Assert.Equal(impacto.Ojo, CamaraAutomatica.En(-CamaraAutomatica.AntesS, 0.0, llegada, impacto, final).Ojo);
            Assert.Equal(impacto.Ojo, CamaraAutomatica.En(CamaraAutomatica.DespuesS, 0.0, llegada, impacto, final).Ojo);
            Assert.Equal(final.Ojo, CamaraAutomatica.En(10.0, 0.0, llegada, impacto, final).Ojo);
            Assert.Equal("impacto", CamaraAutomatica.Fase(0.0, 0.0));
            Assert.Equal("llegada", CamaraAutomatica.Fase(-3.0, 0.0));
            Assert.Equal("final", CamaraAutomatica.Fase(4.0, 0.0));
        }

        [Fact]
        public void LaLlegadaYElFinalEncuadranElContacto()
        {
            var impacto = CamaraAutomatica.Impacto(P, A, B, Alcance());
            var caja = new CajaPlano();
            caja.Agregar(-40.0, -2.0);
            caja.Agregar(-30.0, 2.0);
            var t = CamaraAutomatica.Panorama(caja, P, impacto, 45.0, 16.0 / 9.0, new[] { 32.0, 60.0 }, new List<Estorbo>());
            // Mira al centro de la caja con el contacto, y lo bastante lejos para verlos a los dos.
            Assert.InRange(t.Mira.X, -21.0, -19.0);
            Assert.True((t.Ojo + t.Mira * -1.0).Largo > 30.0);
        }

        [Fact]
        public void EnLosCasosDeLosFixturesElContactoSeVeEnElImpacto()
        {
            var raiz = Raiz();
            var n = 0;
            foreach (var f in Directory.GetFiles(Path.Combine(raiz, "packages", "scene-schema", "fixtures", "caso3d"), "*.json"))
            {
                var r = Paquete.Leer(File.ReadAllText(f)).Resultado;
                if (r?.PuntoImpacto == null)
                {
                    continue;
                }

                var p = new V3(r.PuntoImpacto.X, CamaraAutomatica.AlturaContacto, r.PuntoImpacto.Y);
                var vs = CamaraAutomatica.Vehiculos(r, 0.0);
                var a = vs.Count > 0 ? new V3(vs[0].Cx, 0, vs[0].Cz) : p;
                var b = vs.Count > 1 ? new V3(vs[1].Cx, 0, vs[1].Cz) : p;
                var t = CamaraAutomatica.Impacto(p, a, b, vs);
                Assert.True(CamaraAutomatica.Despejado(t.Ojo, p, vs), Path.GetFileName(f));
                n++;
            }

            Assert.True(n > 10);
        }

        [Fact]
        public void DesdeArribaEncuadraVehiculosChoqueYFinalesConMargen()
        {
            var vehiculos = new CajaPlano();
            vehiculos.Agregar(-60.0, -2.0); // uno llega desde 60 m al oeste
            vehiculos.Agregar(-55.0, 2.0);
            var finales = new CajaPlano();
            finales.Agregar(8.0, -6.0);
            finales.Agregar(14.0, 3.0);
            var e = CamaraAutomatica.Cenital(vehiculos, finales, new V3(0, 0.5, 0), 40.0, 16.0 / 9.0);
            // El centro entre lo más lejano de los dos lados.
            Assert.InRange(e.X, -24.0, -22.0);
            // Lo bastante alto para ver de −60 a 14 m (74 m) con margen, pero no «altísimo».
            var anchoVisto = 2.0 * e.Alto * Math.Tan(20.0 * Math.PI / 180.0) * 16.0 / 9.0;
            Assert.InRange(anchoVisto, 74.0, 74.0 * 1.25 + 7.0);
            // Sin nada que encuadrar, la altura de siempre.
            Assert.Equal(40.0, CamaraAutomatica.Cenital(null, null, null, 40.0, 1.0).Alto);
        }
    }
}
