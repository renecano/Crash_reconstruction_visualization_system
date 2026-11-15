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
                    var tiene = v.Dano?.PerfilM != null && v.Dano.PerfilM.Any(c => c > 0.0) && v.Dano.AnchoM > 0.0
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
            Assert.Contains("DanoDelCaso.Campo(", dano);
            Assert.Contains("DanoDelCaso.Deformar(", dano);
        }
    }
}
