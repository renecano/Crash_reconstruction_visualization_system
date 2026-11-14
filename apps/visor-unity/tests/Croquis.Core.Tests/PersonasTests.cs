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

        /// <summary>
        /// El cuerpo (la cadera más su envolvente) dentro de la cabina: sus esquinas a lo largo, a cada
        /// centímetro de altura, con el ancho de los hombros hasta el cuello y el de la cabeza arriba.
        /// </summary>
        private static void TodoDentro(Cabina c, Envolvente e, (double X, double Y, double Z) h, string que)
        {
            void Franja(double z0, double z1, double medio)
            {
                for (var z = z0; ; z = Math.Min(z + 0.01, z1))
                {
                    foreach (var x in new[] { h.X + e.XMin, h.X + e.XMax })
                    {
                        foreach (var y in new[] { h.Y - medio, h.Y + medio })
                        {
                            Assert.True(c.Contiene(x, y, z), $"{que}: ({x:F3}, {y:F3}, {z:F3}) fuera de la cabina");
                        }
                    }

                    if (z >= z1)
                    {
                        break;
                    }
                }
            }

            Franja(h.Z + e.ZMin, h.Z + e.ZCuello, e.YMax);
            Franja(h.Z + e.ZCuello, h.Z + e.ZMax, e.YCabeza);
        }

        [Fact]
        public void ElPerfilDeLaCabinaEsElMedidoEnLosModelos()
        {
            // `PerfilCabina.cs` lo genera tools/blender/medir_cabina.py junto con su resultado.
            var json = Newtonsoft.Json.Linq.JObject.Parse(File.ReadAllText(
                Path.Combine(Raiz(), "eval", "results", "u6_cabina_perfil.json")));
            var modelos = (Newtonsoft.Json.Linq.JArray)json["modelos"];
            Assert.Equal(modelos.Count, PerfilCabina.MedioAncho.Count);
            foreach (var m in modelos)
            {
                var perfil = (Newtonsoft.Json.Linq.JArray)m["perfil"];
                var tabla = PerfilCabina.MedioAncho[(string)m["modelo"]];
                Assert.Equal(perfil.Count, tabla.Length);
                for (var i = 0; i < perfil.Count; i++)
                {
                    Assert.Equal((double)perfil[i]["z"], PerfilCabina.Z[i], 6);
                    Assert.Equal((double)perfil[i]["medio_ancho"], tabla[i], 6);
                }
            }

            // Cada clase con modelo tiene perfil (la moto no tiene cabina).
            foreach (var par in Cabina.ModeloDeClase.Where(x => x.Value != "moto"))
            {
                Assert.True(PerfilCabina.MedioAncho.ContainsKey(par.Value), par.Key);
            }
        }

        [Fact]
        public void ArribaDelCinturonLaCabinaDelHatchbackEsMasAngostaQueLaPuerta()
        {
            // El caso de René (2026-11-13): la mano asomaba por el vidrio porque la caja usaba el ancho
            // de la puerta hasta el techo.
            var c = Cabina.De("hatchback", 4.07, 1.75, 1.46);
            var cadera = Personas.AlturaCadera("hatchback", 1.46);
            Assert.Equal(c.YMax, c.MedioAncho(cadera), 9);
            Assert.True(c.MedioAncho(cadera + 0.49) < c.YMax - 0.08, $"{c.MedioAncho(cadera + 0.49)} contra {c.YMax}");
            Assert.True(c.MedioAncho(c.ZMax) < c.MedioAncho(cadera + 0.49));
        }

        [Fact]
        public void EnTodosLosCasosYEnCadaInstanteElCuerpoDelOcupanteQuedaDentroDeSuCabina()
        {
            // René, 2026-11-13: ningún punto del cuerpo sale de la cabina de su clase en ningún instante.
            var revisados = 0;
            foreach (var (nombre, caso) in Casos())
            {
                var r = caso.Resultado;
                foreach (var p in (r.Personas ?? new ResultadoPersona[0]).Where(x => x.Ocupante != null))
                {
                    var v = r.Vehiculos.First(x => x.Id == p.VehiculoId);
                    var d = v.Dimensiones;
                    var cabina = Cabina.De(v.Clase, d.LargoM, d.AnchoM, d.AltoM);
                    var sentado = Personas.Sentar(cabina, v.Clase, d.AltoM, p.EstaturaM);
                    var asiento = Personas.Asiento(p.Ocupante.Asiento, d.LargoM, d.AnchoM, v.Clase);
                    foreach (var va in p.Ocupante.Variantes)
                    {
                        // Cada muestra y a la mitad entre muestras: lo que dibuja el visor en cualquier instante.
                        var t0 = va.T.Length > 0 ? va.T[0] : 0.0;
                        var t1 = va.T.Length > 0 ? va.T[va.T.Length - 1] : 0.0;
                        for (var t = t0 - 0.5; t <= t1 + 0.5; t += 0.01)
                        {
                            var des = Personas.Desplazamiento(va, t);
                            var h = Personas.EnCabina((asiento.X + des.Dx, asiento.Y + des.Dy), sentado.Cadera, cabina, sentado.Envolvente);
                            TodoDentro(cabina, sentado.Envolvente, (h.X, h.Y, h.Z), $"{nombre} {p.Id} t={t:F2}");
                            revisados++;
                        }
                    }
                }
            }

            Assert.True(revisados > 100, "Los casos versionados traen ocupantes");
        }

        [Fact]
        public void EnCadaClaseElCuerpoQuedaDentroAunqueElDesplazamientoLoLleveLejos()
        {
            // Medidas de cada clase: las de los caso-3d versionados y, para las pesadas, las de respaldo
            // del croquis 2D (`packages/croquis-2d/src/layout.ts`) con su alto típico.
            var clases = new (string Clase, double Largo, double Ancho, double Alto)[]
            {
                ("hatchback", 4.07, 1.75, 1.46),
                ("sedan_compacto", 4.5, 1.74, 1.49),
                ("sedan_mediano", 4.67, 1.8, 1.41),
                ("suv_compacta", 4.3, 1.76, 1.6),
                ("suv_grande", 5.35, 2.06, 1.93),
                ("pickup", 5.34, 1.86, 1.85),
                ("van", 5.23, 1.88, 2.28),
                ("microbus_combi", 5.9, 1.99, 2.6),
                ("camion_unitario", 8.0, 2.4, 3.2),
                ("tractocamion", 16.0, 2.6, 3.8),
                ("autobus", 12.0, 2.55, 3.2),
            };
            var asientos = (AsientoEnum[])Enum.GetValues(typeof(AsientoEnum));
            foreach (var (clase, largo, ancho, alto) in clases)
            {
                var cabina = Cabina.De(clase, largo, ancho, alto);
                foreach (var estatura in new[] { 1.5, 1.7, 1.9 })
                {
                    var sentado = Personas.Sentar(cabina, clase, alto, estatura);
                    foreach (var a in asientos)
                    {
                        var asiento = Personas.Asiento(a, largo, ancho, clase);
                        for (var dx = -2.0; dx <= 2.0; dx += 0.5)
                        {
                            for (var dy = -2.0; dy <= 2.0; dy += 0.25)
                            {
                                var h = Personas.EnCabina((asiento.X + dx, asiento.Y + dy), sentado.Cadera, cabina, sentado.Envolvente);
                                TodoDentro(cabina, sentado.Envolvente, (h.X, h.Y, h.Z), $"{clase} {estatura} {a} ({dx}, {dy})");
                            }
                        }
                    }
                }
            }
        }

        [Fact]
        public void SinDesplazamientoElOcupanteVaEnSuAsientoYSoloSeRecortaLoQueSaldria()
        {
            var cabina = Cabina.De("hatchback", 4.07, 1.75, 1.46);
            var sentado = Personas.Sentar(cabina, "hatchback", 1.46, 1.7);
            var asiento = Personas.Asiento(AsientoEnum.Conductor, 4.07, 1.75, "hatchback");
            var quieto = Personas.EnCabina(asiento, sentado.Cadera, cabina, sentado.Envolvente);
            Assert.Equal(asiento.X, quieto.X, 9);
            // A lo ancho, el asiento o, si los hombros tocarían el vidrio, lo justo hacia adentro.
            var e = sentado.Envolvente;
            var lado = Math.Min(
                cabina.MedioAnchoMinimo(quieto.Z + e.ZMin, quieto.Z + e.ZCuello) - e.YMax,
                cabina.MedioAnchoMinimo(quieto.Z + e.ZCuello, quieto.Z + e.ZMax) - e.YCabeza);
            Assert.Equal(Math.Min(asiento.Y, lado), quieto.Y, 9);
            Assert.True(asiento.Y - quieto.Y < 0.10, $"en reposo se mueve {asiento.Y - quieto.Y:F3} m");
            // Un desplazamiento de un metro hacia la puerta: el cuerpo llega a la cara de adentro de la
            // puerta y del vidrio y se queda ahí (del dibujo; el desplazamiento del solver no cambia).
            var puerta = Personas.EnCabina((asiento.X, asiento.Y + 1.0), sentado.Cadera, cabina, sentado.Envolvente);
            Assert.True(puerta.Limitado);
            Assert.Equal(lado, puerta.Y, 9);
            // Y hacia el otro lado, igual.
            var otro = Personas.EnCabina((asiento.X, asiento.Y - 2.0), sentado.Cadera, cabina, sentado.Envolvente);
            Assert.Equal(-lado, otro.Y, 9);
            // La planta del pie queda sobre el piso y la cabeza bajo el techo.
            Assert.True(sentado.Cadera + sentado.Envolvente.ZMin >= cabina.ZMin - 1e-9);
            Assert.True(sentado.Cadera + sentado.Envolvente.ZMax <= cabina.ZMax + 1e-9);
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
