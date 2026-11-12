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
    /// <summary>
    /// U3 (plan v4 §3.3): las personas del Resultado en el visor. La pose sale de la trayectoria y la
    /// postura de la fase; los ocupantes van en su asiento y se desplazan lo que dio el solver.
    /// </summary>
    public class PersonasTests
    {
        private const double UnCentimetro = 0.01;

        private static string Raiz([CallerFilePath] string aqui = "")
        {
            return Path.GetFullPath(Path.Combine(Path.GetDirectoryName(aqui), "..", "..", "..", ".."));
        }

        private static IEnumerable<(string Nombre, Caso3D Caso)> Casos()
        {
            var dir = Path.Combine(Raiz(), "packages", "scene-schema", "fixtures", "caso3d");
            foreach (var f in Directory.GetFiles(dir, "*.json"))
            {
                yield return (Path.GetFileNameWithoutExtension(f), Paquete.Leer(File.ReadAllText(f)));
            }
        }

        private static Caso3D Caso(string nombre)
        {
            return Casos().First(c => c.Nombre == nombre).Caso;
        }

        [Fact]
        public void EnCadaMuestraLaPoseDeLaPersonaEsLaDelResultado()
        {
            var revisadas = 0;
            foreach (var (nombre, caso) in Casos())
            {
                foreach (var p in caso.Resultado.Personas ?? new ResultadoPersona[0])
                {
                    if (!Personas.TieneTrayectoria(p))
                    {
                        continue;
                    }

                    var tr = p.Trayectoria;
                    for (var i = 0; i < tr.T.Length; i++)
                    {
                        var pose = Personas.Pose(p, tr.T[i]);
                        Assert.True(Math.Abs(pose.X - tr.X[i]) < UnCentimetro, $"{nombre} {p.Id} x en {i}");
                        Assert.True(Math.Abs(pose.Y - tr.Y[i]) < UnCentimetro, $"{nombre} {p.Id} y en {i}");
                        Assert.True(Math.Abs(pose.Z - tr.Z[i]) < UnCentimetro, $"{nombre} {p.Id} z en {i}");
                    }

                    revisadas++;
                }
            }

            // El peatón del cruce, el motociclista y los demás que traen trayectoria.
            Assert.True(revisadas >= 2, $"solo {revisadas} personas con trayectoria");
        }

        [Fact]
        public void LaPosturaSigueLaFase()
        {
            var peaton = Caso("peaton_cruce").Resultado.Personas.First(p => p.Id == "per-peaton");
            Assert.Equal(Postura.Caminando, Personas.Pose(peaton, -1.0).Postura);
            Assert.Equal(0.0, Personas.Pose(peaton, -1.0).Inclinacion);
            var vuelo = peaton.Fases.First(f => f.Fase == FaseFase.Vuelo);
            var medio = Personas.Pose(peaton, (vuelo.TInicio + vuelo.TFin) / 2.0);
            Assert.Equal(Postura.Vuelo, medio.Postura);
            Assert.InRange(medio.Inclinacion, Math.PI / 8.0, 3.0 * Math.PI / 8.0);
            var fin = Personas.Pose(peaton, peaton.Trayectoria.T.Last());
            Assert.Equal(Postura.Tendido, fin.Postura);
            Assert.Equal(Math.PI / 2.0, fin.Inclinacion, 9);
            // Antes de la primera fase, la primera; después de la última, la última.
            Assert.Equal(FaseFase.Caminando, Personas.FaseEn(peaton, -100.0).Fase);
            Assert.Equal(FaseFase.Reposo, Personas.FaseEn(peaton, 100.0).Fase);

            var moto = Caso("motociclista").Resultado.Personas.First(p => p.Id == "per-b1");
            Assert.Equal(Postura.Sentado, Personas.Pose(moto, -1.0).Postura);
        }

        [Fact]
        public void ElMotociclistaVaSobreSuMotoHastaElImpacto()
        {
            var r = Caso("motociclista").Resultado;
            var p = r.Personas.First(x => x.Id == "per-b1");
            var moto = r.Vehiculos.First(v => v.Id == p.VehiculoId);
            foreach (var t in new[] { -2.0, -1.0, -0.2 })
            {
                var pose = Personas.Pose(p, t);
                var v = Muestreo.Pose(moto.Trayectoria, t);
                var d = Math.Sqrt(Math.Pow(pose.X - v.X, 2) + Math.Pow(pose.Y - v.Y, 2));
                Assert.True(d < moto.Dimensiones.LargoM / 2.0, $"a {d:F2} m de la moto en t = {t}");
            }
        }

        [Fact]
        public void ElOcupanteVaEnSuAsientoYSeDesplazaLoQueDioElSolver()
        {
            var r = Caso("motociclista").Resultado;
            var p = r.Personas.First(x => x.Ocupante != null);
            var v = r.Vehiculos.First(x => x.Id == p.VehiculoId);
            var o = p.Ocupante;
            // Sin cinturón declarado se dibujan las dos variantes, primero la que lo usa.
            var variantes = Personas.VariantesADibujar(o);
            Assert.Null(o.CinturonDeclarado);
            Assert.Equal(new[] { true, false }, variantes.Select(x => x.Cinturon).ToArray());

            var asiento = Personas.Asiento(o.Asiento, v.Dimensiones.LargoM, v.Dimensiones.AnchoM);
            Assert.True(Math.Abs(asiento.X) < v.Dimensiones.LargoM / 2.0);
            Assert.True(Math.Abs(asiento.Y) < v.Dimensiones.AnchoM / 2.0);
            if (o.Asiento == AsientoEnum.Conductor)
            {
                Assert.True(asiento.Y > 0.0, "el conductor va a la izquierda");
            }

            foreach (var va in variantes)
            {
                // Antes del impacto no se mueve; en cada muestra, lo que dio el solver.
                Assert.Equal((0.0, 0.0), Personas.Desplazamiento(va, -0.5));
                for (var i = 0; i < va.T.Length; i += 10)
                {
                    var d = Personas.Desplazamiento(va, va.T[i]);
                    Assert.True(Math.Abs(d.Dx - va.Dx[i]) < 1e-9 && Math.Abs(d.Dy - va.Dy[i]) < 1e-9);
                }

                var max = va.T.Select((_, i) => Math.Sqrt(va.Dx[i] * va.Dx[i] + va.Dy[i] * va.Dy[i])).Max();
                Assert.True(Math.Abs(max - va.DesplazamientoMaxM) < UnCentimetro, $"{max} contra {va.DesplazamientoMaxM}");
            }

            // En el mundo: el asiento girado con el rumbo del vehículo.
            var pose = new PoseVehiculo(10.0, 5.0, 0.0, Math.PI / 2.0, 0.0, 0.0);
            var mundo = Personas.EnElMundo(pose, (1.0, 0.5), (0.2, 0.0));
            Assert.Equal(10.0 - 0.5, mundo.X, 9);
            Assert.Equal(5.0 + 1.2, mundo.Y, 9);
        }

        [Fact]
        public void VerTodoDejaEnCuadroLasPosesFinalesYElImpactoEnTodosLosCasos()
        {
            foreach (var (nombre, caso) in Casos())
            {
                var r = caso.Resultado;
                var caja = Encuadre.VerTodo(caso);
                Assert.False(caja.Vacia, nombre);
                foreach (var v in r.Vehiculos)
                {
                    if (v.PoseFinal != null)
                    {
                        Assert.True(caja.Contiene(v.PoseFinal.X, v.PoseFinal.Y), $"{nombre}: reposo de {v.Id}");
                    }

                    var ultimo = v.Trayectoria.T.Length - 1;
                    Assert.True(caja.Contiene(v.Trayectoria.X[ultimo], v.Trayectoria.Y[ultimo]), $"{nombre}: fin de {v.Id}");
                }

                if (r.PuntoImpacto != null)
                {
                    Assert.True(caja.Contiene(r.PuntoImpacto.X, r.PuntoImpacto.Y), $"{nombre}: impacto");
                }

                foreach (var m in caso.Escenario?.Marcadores ?? new MarcadorEscenario[0])
                {
                    Assert.True(caja.Contiene(m.X, m.Y), $"{nombre}: marcador");
                }

                // Contiene también la zona de «Ir al impacto».
                var zona = Encuadre.ZonaDeInteres(r);
                Assert.True(caja.Contiene(zona.CentroX, zona.CentroY), $"{nombre}: centro de la zona");
                Assert.True(caja.Ancho >= 10.0 && caja.Alto >= 10.0, nombre);
            }
        }

        [Fact]
        public void ALaDistanciaDeLaLenteLaCajaCabeJusta()
        {
            foreach (var (ancho, alto, fov, aspecto) in new[] { (40.0, 20.0, 40.0, 16.0 / 9.0), (10.0, 30.0, 60.0, 1.0), (5.0, 5.0, 35.0, 0.5) })
            {
                var d = Lente.DistanciaParaVer(ancho, alto, fov, aspecto);
                var tv = Math.Tan(fov * Math.PI / 360.0);
                var th = tv * aspecto;
                // Las esquinas caben, y en un sentido llenan el cuadro.
                Assert.True(alto / 2.0 <= d * tv + 1e-9 && ancho / 2.0 <= d * th + 1e-9);
                Assert.True(Math.Abs(alto / 2.0 - d * tv) < 1e-9 || Math.Abs(ancho / 2.0 - d * th) < 1e-9);
            }
        }

        [Fact]
        public void LaCajaDeLosVehiculosEnUnInstanteLosContiene()
        {
            foreach (var (nombre, caso) in Casos())
            {
                var r = caso.Resultado;
                foreach (var t in new[] { -1.0, 0.0, 1.5 })
                {
                    var caja = Lente.VehiculosEn(r, t);
                    var involucrados = r.Vehiculos.Any(v => v.Involucrado);
                    foreach (var v in r.Vehiculos.Where(v => !involucrados || v.Involucrado))
                    {
                        var p = Muestreo.Pose(v.Trayectoria, t);
                        Assert.True(caja.Contiene(p.X, p.Y), $"{nombre} {v.Id} en t = {t}");
                    }

                    // Mucho más chica que «Ver todo» en cuanto la aproximación es larga: los coches llenan más.
                    Assert.True(caja.Ancho <= Encuadre.VerTodo(caso).Ancho + 1e-9, nombre);
                }
            }
        }

        [Fact]
        public void ElOcupanteNoSaleDeLaCabinaAunqueElDesplazamientoPaseDeLaPared()
        {
            foreach (var (nombre, caso) in Casos())
            {
                var r = caso.Resultado;
                foreach (var p in (r.Personas ?? new ResultadoPersona[0]).Where(x => x.Ocupante != null))
                {
                    var v = r.Vehiculos.First(x => x.Id == p.VehiculoId);
                    var asiento = Personas.Asiento(p.Ocupante.Asiento, v.Dimensiones.LargoM, v.Dimensiones.AnchoM);
                    foreach (var va in p.Ocupante.Variantes)
                    {
                        for (var i = 0; i < va.T.Length; i++)
                        {
                            var q = Personas.EnCabina((asiento.X + va.Dx[i], asiento.Y + va.Dy[i]), v.Dimensiones.LargoM, v.Dimensiones.AnchoM);
                            Assert.True(Math.Abs(q.Y) <= v.Dimensiones.AnchoM / 2.0 - 0.2, $"{nombre} {p.Id}");
                            Assert.True(q.X < v.Dimensiones.LargoM / 2.0 && q.X > -v.Dimensiones.LargoM / 2.0, $"{nombre} {p.Id}");
                        }
                    }
                }
            }

            // Dentro de la cabina no cambia nada.
            Assert.Equal((0.1, 0.3), Personas.EnCabina((0.1, 0.3), 4.4, 1.8));
            // Un desplazamiento de un metro hacia la puerta se queda en la pared.
            Assert.Equal(0.6, Personas.EnCabina((0.0, 1.5), 4.4, 1.8).Y, 9);
            // En una camioneta de doble rodada (2.4 m de salpicadera a salpicadera) tampoco sale de la cabina.
            Assert.Equal(-0.6, Personas.EnCabina((0.0, -1.5), 6.5, 2.4).Y, 9);
            Assert.Equal(0.5, Personas.EnCabina((0.0, 0.5), 6.5, 2.4).Y, 9);
        }

        [Fact]
        public void ElAsientoDeUnaCamionetaVaMasArribaQueElDeUnSedan()
        {
            Assert.Equal(0.52, Personas.AlturaCadera("sedan_mediano", 1.45), 9);
            Assert.Equal(0.86, Personas.AlturaCadera("pickup", 1.9), 9);
            Assert.True(Personas.AlturaCadera("tractocamion", 3.8) > Personas.AlturaCadera("pickup", 1.9));
            // Nunca más arriba que 55 % del alto del vehículo.
            Assert.Equal(0.55 * 1.4, Personas.AlturaCadera("pickup", 1.4), 9);
        }

        [Fact]
        public void ConCinturonDeclaradoSeDibujaSoloEsaVariante()
        {
            var o = Caso("peaton_cruce").Resultado.Personas.First(x => x.Ocupante != null).Ocupante;
            Assert.True(o.CinturonDeclarado);
            var variantes = Personas.VariantesADibujar(o);
            Assert.Single(variantes);
            Assert.True(variantes[0].Cinturon);
        }
    }
}
