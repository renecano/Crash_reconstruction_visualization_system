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
    /// El daño del solver en el visor (auditoría del 2026-11-15, C2): qué vehículos lo llevan, desde
    /// qué instante, cómo quedan los vértices en el marco de Unity, y que el visor de verdad lo use.
    /// </summary>
    public class DanoDelCasoTests
    {
        private static string Raiz([CallerFilePath] string aqui = "")
        {
            return Path.GetFullPath(Path.Combine(Path.GetDirectoryName(aqui), "..", "..", "..", ".."));
        }

        private static IEnumerable<(string Nombre, Caso3D Caso)> Casos()
        {
            var carpeta = Path.Combine(Raiz(), "packages", "scene-schema", "fixtures", "caso3d");
            foreach (var f in Directory.GetFiles(carpeta, "*.json"))
            {
                yield return (Path.GetFileNameWithoutExtension(f), Paquete.Leer(File.ReadAllText(f)));
            }
        }

        /// <summary>Una rejilla sobre la cara del frente y otra sobre la de atrás, en el marco de Unity.</summary>
        private static void Caras(MedidasVehiculo m, out V3[] vertices, out int[] triangulos)
        {
            var v = new List<V3>();
            var t = new List<int>();
            const int N = 12;
            foreach (var z in new[] { m.Largo / 2.0, -m.Largo / 2.0 })
            {
                var b = v.Count;
                for (var i = 0; i <= N; i++)
                {
                    for (var j = 0; j <= N; j++)
                    {
                        // Unity: x a la derecha, y arriba, z adelante.
                        v.Add(new V3(-m.Ancho / 2.0 + m.Ancho * i / N, m.Alto * j / N, z));
                    }
                }

                for (var i = 0; i < N; i++)
                {
                    for (var j = 0; j < N; j++)
                    {
                        var a = b + i * (N + 1) + j;
                        t.AddRange(new[] { a, a + 1, a + N + 1, a + 1, a + N + 2, a + N + 1 });
                    }
                }
            }

            vertices = v.ToArray();
            triangulos = t.ToArray();
        }

        [Fact]
        public void LosVehiculosConPerfilDelSolverLlevanDano()
        {
            var con = 0;
            foreach (var (nombre, caso) in Casos())
            {
                foreach (var v in caso.Resultado.Vehiculos)
                {
                    var campo = DanoDelCaso.Campo(v);
                    var tiene = v.Dano?.OrigenRigidez != OrigenRigidez.SinImpacto && v.Dano?.PerfilM != null && v.Dano.PerfilM.Any(c => c > 0.0) && v.Dano.AnchoM > 0.0
                        && DanoDelCaso.Lado(v.Dano.Cdc?.Lado) != null && !PerfilClase.De(v.Clase).DosRuedas;
                    Assert.True((campo != null) == tiene, nombre + " " + v.Id);
                    con += campo != null ? 1 : 0;
                }
            }

            // Los casos de referencia traen vehículos con daño: si esto da cero, el visor no dibuja nada.
            Assert.True(con >= 10, "vehículos con daño en los paquetes: " + con);
        }

        [Fact]
        public void ElDanoSeVeDesdeElPrimerImpactoDeCadaVehiculo()
        {
            foreach (var (nombre, caso) in Casos())
            {
                var r = caso.Resultado;
                foreach (var v in r.Vehiculos)
                {
                    var t = DanoDelCaso.Instante(r, v.Id);
                    var suyos = (r.Eventos ?? new ResultadoEvento[0])
                        .Where(e => e.Tipo.ToString().StartsWith("Impacto") && e.Actores != null && e.Actores.Contains(v.Id))
                        .Select(e => e.T)
                        .ToArray();
                    Assert.Equal(suyos.Length > 0 ? suyos.Min() : 0.0, t);
                    Assert.True(t >= r.TInicio - 1e-9 && t <= r.TFin + 1e-9, nombre + " " + v.Id + ": " + t);
                }
            }
        }

        [Fact]
        public void EnElMarcoDeUnityElFrenteSeHundeHaciaAtrasYLoDemasNoSeMueve()
        {
            // El alcance canónico: el que golpea trae daño al frente.
            var (_, caso) = Casos().First(c => c.Nombre == "alcance");
            var v = caso.Resultado.Vehiculos.First(x => DanoDelCaso.Lado(x.Dano?.Cdc?.Lado) == 'F');
            var campo = DanoDelCaso.Campo(v);
            Assert.NotNull(campo);
            var d = v.Dimensiones;
            var m = new MedidasVehiculo(d.LargoM, d.AnchoM, d.AltoM, d.DistanciaEntreEjesM);
            Caras(m, out var antes, out var triangulos);
            var despues = DanoDelCaso.Deformar(campo, antes, triangulos, DanoDelCaso.Semilla(caso.Resultado.Semilla, v.Id));
            var mitad = antes.Length / 2;
            var hundido = 0.0;
            var maximo = v.Dano.PerfilM.Max();
            // Las arrugas son de ±3 % de c(u): es lo único que puede asomar hacia afuera.
            var arruga = 0.03 * maximo + 1e-6;
            for (var i = 0; i < antes.Length; i++)
            {
                var dz = despues[i].Z - antes[i].Z;
                if (i < mitad)
                {
                    // La cara del frente (z = +largo/2) solo puede irse hacia atrás.
                    Assert.True(dz <= arruga, "el frente salió hacia adelante: " + dz);
                    hundido = Math.Max(hundido, -dz);
                }
                else
                {
                    // La cara de atrás no se toca.
                    Assert.True(Math.Abs(dz) < 1e-9 && Math.Abs(despues[i].X - antes[i].X) < 1e-9, "la parte de atrás se movió");
                }
            }

            // Se hunde lo que dice el perfil del solver, dentro de la tolerancia de la malla (±3 % de arruga).
            Assert.True(hundido > 0.5 * maximo && hundido <= 1.05 * maximo + 0.01, "hundido " + hundido + " contra C máx " + maximo);
        }

        [Fact]
        public void LaPdofOblicuaArrastraLaLaminaDeLadoSinCambiarLaProfundidad()
        {
            var m = new MedidasVehiculo(4.3, 1.8, 1.5, 2.6);
            EntradaDano Entrada(double? pdof) => new EntradaDano
            {
                Lado = 'F',
                Perfil = new[] { 0.4, 0.4, 0.4, 0.4, 0.4, 0.4 },
                Ancho = 1.6,
                Centro = 0.0,
                PdofHoras = pdof,
            };
            var p = new V3(m.Largo / 2.0, 0.7, 0.0);
            var recto = new CampoDano(Entrada(12), "sedan_compacto", m).Desplazamiento(p, out _, out _);
            var oblicuo = new CampoDano(Entrada(1), "sedan_compacto", m).Desplazamiento(p, out _, out _);
            var sinPdof = new CampoDano(Entrada(null), "sedan_compacto", m).Desplazamiento(p, out _, out _);
            // Misma profundidad hacia adentro con o sin PDOF: la profundidad es la del solver.
            Assert.Equal(recto.X, oblicuo.X, 9);
            Assert.Equal(recto.X, sinPdof.X, 9);
            Assert.Equal(0.0, recto.Z, 9);
            // A la 1, la fuerza llega desde adelante a la derecha: empuja la lámina hacia la izquierda (z < 0).
            Assert.True(oblicuo.Z < -0.05, "arrastre " + oblicuo.Z);
            Assert.True(-oblicuo.Z <= CampoDano.CizallaMaxima * 0.4 + 1e-9);
            // A las 3 la fuerza no entra por el frente: no arrastra.
            Assert.Equal(0.0, CampoDano.Cizalla(3, new V3(1, 0, 0), new V3(0, 0, -1)), 9);
        }

        [Fact]
        public void LosPlieguesSoloAparecenEnAplastamientosGrandesYNoHundenMas()
        {
            var m = new MedidasVehiculo(4.3, 1.8, 1.5, 2.6);
            CampoDano Campo(double c) => new CampoDano(new EntradaDano
            {
                Lado = 'F',
                Perfil = new[] { c, c, c, c, c, c },
                Ancho = 1.6,
                Centro = 0.0,
            }, "sedan_compacto", m);
            var p = new V3(m.Largo / 2.0 - 0.05, 0.7, 0.1);
            Assert.Equal(0.0, Campo(0.02).Pliegues(p, 1.0, 3).Largo, 9);
            var grande = Campo(0.6).Pliegues(p, 1.0, 3);
            Assert.True(grande.Largo > 0.0 && grande.Largo <= CampoDano.Pliegue * 0.6 * 1.2);
            // Nunca hacia adentro de la cara.
            Assert.Equal(0.0, grande.X, 9);
        }

        [Fact]
        public void RefinarParteSoloLaZonaYNoDejaGrietas()
        {
            // Dos triángulos grandes (un cuadro de 1 m) con una costura: el vértice 1 y el 4 en el mismo lugar.
            var v = new[] { new V3(0, 0, 0), new V3(1, 0, 0), new V3(0, 1, 0), new V3(1, 0, 0), new V3(1, 1, 0) };
            var t = new[] { new[] { 0, 1, 2 }, new[] { 3, 4, 2 } };
            // La zona es solo la mitad izquierda.
            var r = Refinamiento.Partir(v, t, p => p.X < 0.3, 0.2, 4, 10000);
            Assert.True(r.Padres.Count > 0);
            double Area(IList<V3> pos, int[] tri)
            {
                var a = 0.0;
                for (var k = 0; k + 2 < tri.Length; k += 3)
                {
                    var p0 = pos[tri[k]];
                    var p1 = pos[tri[k + 1]];
                    var p2 = pos[tri[k + 2]];
                    a += ((p1.X - p0.X) * (p2.Y - p0.Y) - (p2.X - p0.X) * (p1.Y - p0.Y)) / 2.0;
                }

                return a;
            }

            // Misma área y mismo giro (todo positivo): nada se volteó ni quedó sin cubrir.
            Assert.Equal(0.5, Area(r.Posiciones, r.Triangulos[0]), 9);
            Assert.Equal(0.5, Area(r.Posiciones, r.Triangulos[1]), 9);
            // Cada arista de un lado aparece también del otro (o es borde): sin grietas en T.
            var aristas = new Dictionary<string, int>();
            string L(V3 a, V3 b) => string.Join("|", new[] { a, b }.Select(q => Math.Round(q.X, 6) + "," + Math.Round(q.Y, 6)).OrderBy(x => x));
            foreach (var tri in r.Triangulos)
            {
                for (var k = 0; k + 2 < tri.Length; k += 3)
                {
                    for (var e = 0; e < 3; e++)
                    {
                        var llave = L(r.Posiciones[tri[k + e]], r.Posiciones[tri[k + (e + 1) % 3]]);
                        aristas[llave] = aristas.TryGetValue(llave, out var n) ? n + 1 : 1;
                    }
                }
            }

            var interiores = aristas.Where(a => a.Value == 1).Select(a => a.Key).Where(k =>
            {
                var pts = k.Split('|').Select(q => q.Split(',').Select(double.Parse).ToArray()).ToArray();
                bool Borde(double[] a, double[] b) => (a[0] == 0 && b[0] == 0) || (a[1] == 0 && b[1] == 0) || (a[0] == 1 && b[0] == 1) || (a[1] == 1 && b[1] == 1);
                return !Borde(pts[0], pts[1]);
            }).ToList();
            Assert.Empty(interiores);
        }

        [Fact]
        public void CadaImpactoPosteriorSeDibujaEnSuInstante()
        {
            var (_, caso) = Casos().First(c => c.Nombre == "alcance");
            var r = caso.Resultado;
            var v = r.Vehiculos.First(x => DanoDelCaso.Campo(x) != null);
            var d = v.Dano;
            v.DanosPosteriores = new[]
            {
                new DanosPosterioreElement { AnchoM = d.AnchoM, CentroM = d.CentroM, Cdc = d.Cdc, PerfilM = d.PerfilM, T = 1.25, EventoId = "e2", OrigenRigidez = OrigenRigidez.Supuesto },
                new DanosPosterioreElement { AnchoM = d.AnchoM, CentroM = d.CentroM, Cdc = d.Cdc, PerfilM = d.PerfilM, T = 2.0, EventoId = "e3", OrigenRigidez = OrigenRigidez.SinImpacto },
            };
            var etapas = DanoDelCaso.Etapas(v, r);
            Assert.Equal(2, etapas.Count);
            Assert.Equal(DanoDelCaso.Instante(r, v.Id), etapas[0].Desde);
            Assert.Equal(1.25, etapas[1].Desde);
        }

        /// <summary>
        /// Un frente redondeado como el de los modelos: las esquinas 35 cm detrás de la cara de la caja.
        /// La lámina tiene que llegar a C1–C6 en cada estación, también en la esquina (René, 2026-11-26).
        /// </summary>
        [Fact]
        public void EnUnFrenteRedondeadoLaLaminaLlegaAlPerfilEnCadaEstacion()
        {
            var m = new MedidasVehiculo(4.5, 1.8, 1.45, 2.65);
            var perfil = new[] { 0.52, 0.42, 0.31, 0.21, 0.10, 0.026 };
            var campo = new CampoDano(new EntradaDano { Lado = 'F', Perfil = perfil, Ancho = 1.7, Centro = 0.0, PdofHoras = 11.4 }, "sedan_mediano", m);
            // Rejilla del frente en el marco de Unity (x a la derecha, y arriba, z adelante), a cada 4 cm.
            var v = new List<V3>();
            var t = new List<int>();
            const int Nu = 46;
            const int Ny = 36;
            for (var j = 0; j <= Ny; j++)
            {
                for (var i = 0; i <= Nu; i++)
                {
                    var x = -m.Ancho / 2.0 + m.Ancho * i / Nu;
                    var y = m.Alto * j / Ny;
                    var r = x / (m.Ancho / 2.0);
                    v.Add(new V3(x, y, m.Largo / 2.0 - 0.35 * r * r));
                }
            }

            for (var j = 0; j < Ny; j++)
            {
                for (var i = 0; i < Nu; i++)
                {
                    var a = j * (Nu + 1) + i;
                    t.AddRange(new[] { a, a + Nu + 1, a + 1, a + 1, a + Nu + 1, a + Nu + 2 });
                }
            }

            DanoDelCaso.FijarFrente(campo, v, t);
            var despues = DanoDelCaso.Deformar(campo, v.ToArray(), t.ToArray(), 5);
            var medido = DanoDelCaso.Medir(campo, v, despues, out var alli);
            for (var k = 0; k < 6; k++)
            {
                Assert.True(Math.Abs(medido[k] - perfil[k]) <= Math.Max(0.02, 0.06 * perfil[k]), "C" + (k + 1) + ": medido " + medido[k] + ", solver " + perfil[k]);
                Assert.True(Math.Abs(medido[k] - alli[k]) <= Math.Max(0.02, 0.06 * alli[k]), "C" + (k + 1) + ": medido " + medido[k] + ", solver ahí " + alli[k]);
            }
        }

        [Fact]
        public void LaSemillaDeLasArrugasEsEstable()
        {
            Assert.Equal(DanoDelCaso.Semilla(719300, "veh-a"), DanoDelCaso.Semilla(719300, "veh-a"));
            Assert.NotEqual(DanoDelCaso.Semilla(719300, "veh-a"), DanoDelCaso.Semilla(719300, "veh-b"));
            Assert.True(DanoDelCaso.Semilla(-5, "x") >= 0);
        }

        /// <summary>
        /// La auditoría encontró que `CampoDano` estaba probado y nadie lo llamaba al dibujar. Esto falla
        /// si el visor deja de preparar el daño al armar cada vehículo o de mostrarlo al colocarlo.
        /// </summary>
        [Fact]
        public void ElVisorAplicaElDanoAlArmarYAlColocarCadaVehiculo()
        {
            var visor = Path.Combine(Raiz(), "apps", "visor-unity", "Assets", "Croquis", "Visor");
            var caso = File.ReadAllText(Path.Combine(visor, "VisorCaso.cs"));
            Assert.Contains("DanoVista.Preparar(", caso);
            Assert.Contains("Dano?.Mostrar(t)", caso);
            var dano = File.ReadAllText(Path.Combine(visor, "DanoVista.cs"));
            Assert.Contains("DanoDelCaso.Etapas(", dano);
            Assert.Contains("DanoDelCaso.Deformar(", dano);
        }

        /// <summary>La leyenda ilustrativa va en toda vista del visor, con escenario o sin él (§2.3).</summary>
        [Fact]
        public void LaLeyendaVaConEscenarioYSinEl()
        {
            var visor = Path.Combine(Raiz(), "apps", "visor-unity", "Assets", "Croquis", "Visor");
            var caso = File.ReadAllText(Path.Combine(visor, "VisorCaso.cs"));
            Assert.Contains("EscenarioVista.Leyenda(raiz, false)", caso);
            var escenario = File.ReadAllText(Path.Combine(visor, "EscenarioVista.cs"));
            Assert.Contains("Leyenda(escenario);", escenario);
            // El texto sale del núcleo (ronda 4): con el piso del mapa o la versión superpuesta, el visor
            // lo cambia con el mismo `Leyenda3d.Mensaje`, y siempre empieza igual.
            Assert.Contains("Croquis.Core.Leyenda3d.Mensaje(entornoProcedural)", escenario);
            Assert.Contains("Leyenda3d.Mensaje(conEscenario", caso);
            Assert.StartsWith("Reconstrucción ilustrativa", Leyenda3d.Mensaje(true));
            Assert.StartsWith("Reconstrucción ilustrativa", Leyenda3d.Mensaje(false, "© OpenStreetMap", "una versión"));
        }

        /// <summary>
        /// La leyenda se lee sobre cualquier fondo (René, 2026-11-15): WCAG AA (4.5:1) con un fondo blanco,
        /// negro, gris o del color de los techos detrás del recuadro, y el visor la dibuja con esos colores.
        /// </summary>
        [Fact]
        public void LaLeyendaCumpleAaSobreCualquierFondo()
        {
            foreach (var detras in new[] { (1.0, 1.0, 1.0), (0.0, 0.0, 0.0), (0.5, 0.5, 0.5), (0.95, 0.55, 0.3), (0.8, 0.9, 0.6) })
            {
                Assert.True(Leyenda3d.Contraste(detras) >= Leyenda3d.MinimoAa, $"contraste {Leyenda3d.Contraste(detras):F2} con {detras}");
            }

            // El peor caso es el blanco puro detrás del recuadro.
            Assert.True(Leyenda3d.Contraste((1.0, 1.0, 1.0)) > 10.0);
            var escenario = File.ReadAllText(Path.Combine(Raiz(), "apps", "visor-unity", "Assets", "Croquis", "Visor", "EscenarioVista.cs"));
            Assert.Contains("Croquis.Core.Leyenda3d.Fondo", escenario);
            Assert.Contains("Croquis.Core.Leyenda3d.Texto", escenario);
        }
    }
}
