using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.CompilerServices;
using Croquis.Core;
using Croquis.Generated;
using Newtonsoft.Json.Linq;
using Xunit;

namespace Croquis.Core.Tests
{
    /// <summary>
    /// D2 (plan v4 §1): en todos los casos versionados, la pose que le llega a Unity no se separa del
    /// Resultado más de 1 cm y 0.1°, y el daño sobre la malla cumple 2 cm o 6 %.
    /// </summary>
    public class FidelidadTests
    {
        private const double UnCentimetro = 0.01;
        private static readonly double UnDecimoDeGrado = 0.1 * Math.PI / 180.0;

        private static string Raiz([CallerFilePath] string aqui = "")
        {
            return Path.GetFullPath(Path.Combine(Path.GetDirectoryName(aqui), "..", "..", "..", ".."));
        }

        private static string[] Paquetes()
        {
            return Directory.GetFiles(Path.Combine(Raiz(), "packages", "scene-schema", "fixtures", "caso3d"), "*.json");
        }

        private static IEnumerable<(string Nombre, Caso3D Caso, string Json)> Casos()
        {
            foreach (var f in Paquetes())
            {
                var texto = File.ReadAllText(f);
                yield return (Path.GetFileNameWithoutExtension(f), Paquete.Leer(texto), texto);
            }
        }

        [Fact]
        public void HayPaquetesDeTodosLosCasos()
        {
            Assert.Equal(22, Paquetes().Length);
        }

        [Fact]
        public void LeerYReescribirNoCambiaNada()
        {
            foreach (var (nombre, caso, json) in Casos())
            {
                var dif = Diferencia(JToken.Parse(json), JToken.Parse(caso.ToJson()), "");
                Assert.True(dif == null, nombre + ": " + dif);
            }
        }

        [Fact]
        public void EnCadaMuestraLaPoseEsLaDelResultado()
        {
            foreach (var (nombre, caso, _) in Casos())
            {
                foreach (var v in caso.Resultado.Vehiculos)
                {
                    var tr = v.Trayectoria;
                    for (var i = 0; i < tr.T.Length; i++)
                    {
                        var u = Ejes.DeUnity(Ejes.AUnity(Muestreo.Pose(tr, tr.T[i])));
                        Revisar(nombre, v.Id, tr.T[i], u, tr.X[i], tr.Y[i], tr.Rumbo[i]);
                    }
                }
            }
        }

        [Fact]
        public void EntreMuestrasLaPoseEsLineal()
        {
            foreach (var (nombre, caso, _) in Casos())
            {
                foreach (var v in caso.Resultado.Vehiculos)
                {
                    var tr = v.Trayectoria;
                    for (var i = 0; i + 1 < tr.T.Length; i++)
                    {
                        var medio = (tr.T[i] + tr.T[i + 1]) / 2.0;
                        var u = Ejes.DeUnity(Ejes.AUnity(Muestreo.Pose(tr, medio)));
                        var arco = Ejes.NormalizarAngulo(tr.Rumbo[i + 1] - tr.Rumbo[i]);
                        Revisar(
                            nombre,
                            v.Id,
                            medio,
                            u,
                            (tr.X[i] + tr.X[i + 1]) / 2.0,
                            (tr.Y[i] + tr.Y[i + 1]) / 2.0,
                            tr.Rumbo[i] + arco / 2.0);
                    }
                }
            }
        }

        /// <summary>El rumbo que da la vuelta por −π no pasa por cero: toma el camino corto.</summary>
        [Fact]
        public void ElRumboTomaElCaminoCorto()
        {
            var tr = new VehiculoTrayectoria
            {
                T = new[] { 0.0, 1.0 },
                X = new[] { 0.0, 0.0 },
                Y = new[] { 0.0, 0.0 },
                Rumbo = new[] { 3.0, -3.0 },
            };
            var medio = Muestreo.Pose(tr, 0.5).Rumbo;
            Assert.True(Math.Abs(Ejes.NormalizarAngulo(medio - Math.PI)) < 1e-9, "dio " + medio);
        }

        [Fact]
        public void FueraDelIntervaloSeMantieneElExtremo()
        {
            var tr = new VehiculoTrayectoria
            {
                T = new[] { 0.0, 1.0 },
                X = new[] { 2.0, 4.0 },
                Y = new[] { 0.0, 0.0 },
                Rumbo = new[] { 0.0, 0.0 },
            };
            Assert.Equal(2.0, Muestreo.Pose(tr, -5.0).X);
            Assert.Equal(4.0, Muestreo.Pose(tr, 9.0).X);
        }

        /// <summary>Sin z, cabeceo ni alabeo, el vehículo va plano; con ellos, se interpolan.</summary>
        [Fact]
        public void LaAlturaYLaInclinacionSonOpcionales()
        {
            var plano = new VehiculoTrayectoria
            {
                T = new[] { 0.0, 1.0 },
                X = new[] { 0.0, 1.0 },
                Y = new[] { 0.0, 1.0 },
                Rumbo = new[] { 0.0, 0.0 },
            };
            var p = Muestreo.Pose(plano, 0.5);
            Assert.Equal((0.0, 0.0, 0.0), (p.Z, p.Cabeceo, p.Alabeo));

            var enLoma = new VehiculoTrayectoria
            {
                T = plano.T,
                X = plano.X,
                Y = plano.Y,
                Rumbo = plano.Rumbo,
                Z = new[] { 1.0, 2.0 },
                Cabeceo = new[] { 0.1, 0.3 },
                Alabeo = new[] { -0.2, 0.0 },
            };
            var q = Ejes.DeUnity(Ejes.AUnity(Muestreo.Pose(enLoma, 0.5)));
            Assert.Equal(1.5, q.Z, 9);
            Assert.Equal(0.2, q.Cabeceo, 9);
            Assert.Equal(-0.1, q.Alabeo, 9);
        }

        /// <summary>
        /// Los signos, con las matrices de Unity (rotación Y · X · Z): rumbo 0 mira al este, 90° al norte;
        /// el cabeceo positivo sube la nariz y el alabeo positivo baja el costado derecho.
        /// </summary>
        [Fact]
        public void LosEjesCaenDondeUnityLosEspera()
        {
            var a = Ejes.AUnity(new PoseVehiculo(3, 5, 7, 0, 0, 0));
            Assert.Equal((3.0, 7.0, 5.0), (a.Px, a.Py, a.Pz));

            var este = Girar(Ejes.AUnity(new PoseVehiculo(0, 0, 0, 0, 0, 0)), 0, 0, 1);
            Assert.True(Cerca(este, (1, 0, 0)), "rumbo 0: " + este);

            var norte = Girar(Ejes.AUnity(new PoseVehiculo(0, 0, 0, Math.PI / 2.0, 0, 0)), 0, 0, 1);
            Assert.True(Cerca(norte, (0, 0, 1)), "rumbo 90: " + norte);

            var nariz = Girar(Ejes.AUnity(new PoseVehiculo(0, 0, 0, 0, 0.3, 0)), 0, 0, 1);
            Assert.True(nariz.Y > 0.29, "cabeceo positivo: " + nariz);

            var derecha = Girar(Ejes.AUnity(new PoseVehiculo(0, 0, 0, Math.PI / 2.0, 0, 0.3)), 1, 0, 0);
            Assert.True(derecha.Y < -0.29, "alabeo positivo: " + derecha);
        }

        [Fact]
        public void UnPaqueteDeOtraVersionNoSeAbre()
        {
            var texto = File.ReadAllText(Paquetes()[0]);
            var e = Assert.Throws<FormatException>(() => Paquete.Leer(texto.Replace("\"version_caso3d\":\"1.0.0\"", "\"version_caso3d\":\"9.0.0\"")));
            Assert.Contains("9.0.0", e.Message);
            Assert.Throws<FormatException>(() => Paquete.Leer("esto no es un paquete"));
        }

        [Fact]
        public void LaZonaDeInteresSeCentraEnElImpacto()
        {
            foreach (var (nombre, caso, _) in Casos())
            {
                var z = Encuadre.ZonaDeInteres(caso.Resultado);
                Assert.True(z.Lado >= 10.0, nombre);
                if (caso.Resultado.PuntoImpacto != null)
                {
                    Assert.Equal(caso.Resultado.PuntoImpacto.X, z.CentroX);
                    Assert.Equal(caso.Resultado.PuntoImpacto.Y, z.CentroY);
                }
            }
        }

        /// <summary>
        /// La tolerancia de docs/physics.md, sobre cada vehículo con daño: en una malla de caja con la
        /// densidad del visor, el perfil medido no se separa del solver más de 2 cm o 6 %.
        /// </summary>
        [Fact]
        public void ElDanoEnLaMallaCumpleLaTolerancia()
        {
            var medidos = 0;
            foreach (var (nombre, caso, _) in Casos())
            {
                foreach (var v in caso.Resultado.Vehiculos)
                {
                    if (v.Dano == null || v.Dano.PerfilM.All(c => c <= 0.0) || v.Dano.AnchoM <= 0.0)
                    {
                        continue;
                    }

                    var lado = Lado(v.Dano.Cdc?.Lado);
                    if (lado == null)
                    {
                        continue;
                    }

                    var clase = v.Clase;
                    var perfil = PerfilClase.De(clase);
                    if (perfil.DosRuedas)
                    {
                        continue; // Sin cara continua donde medir, como en el visor web.
                    }

                    var d = v.Dimensiones;
                    var m = new MedidasVehiculo(d.LargoM, d.AnchoM, d.AltoM, d.DistanciaEntreEjesM);
                    var entrada = new EntradaDano
                    {
                        Lado = lado.Value,
                        Perfil = v.Dano.PerfilM,
                        Ancho = v.Dano.AnchoM,
                        Centro = v.Dano.CentroM,
                        ZonaVertical = ZonaVertical(v.Dano.Cdc?.ZonaVertical),
                    };
                    var campo = new CampoDano(entrada, clase, m);
                    Caja(m, 0.08, out var vertices, out var triangulos);
                    var desp = campo.Hornear(vertices, triangulos, 7);
                    var medido = campo.MedirPerfil(vertices, desp);
                    for (var k = 0; k < 6; k++)
                    {
                        var pedido = v.Dano.PerfilM[k];
                        var limite = Math.Max(0.02, 0.06 * pedido);
                        Assert.True(
                            Math.Abs(medido[k] - pedido) <= limite,
                            nombre + " " + v.Id + " C" + (k + 1) + ": medido " + medido[k] + ", solver " + pedido);
                    }

                    medidos++;
                }
            }

            Assert.True(medidos > 0, "Ningún vehículo con daño: la prueba no midió nada.");
        }

        [Fact]
        public void HornearEsDeterminista()
        {
            var m = new MedidasVehiculo(4.3, 1.8, 1.5, 2.6);
            var entrada = new EntradaDano
            {
                Lado = 'F',
                Perfil = new[] { 0.1, 0.2, 0.3, 0.3, 0.2, 0.1 },
                Ancho = 1.2,
                Centro = 0.1,
            };
            var campo = new CampoDano(entrada, "sedan_compacto", m);
            Caja(m, 0.12, out var v, out var t);
            var a = campo.Hornear(v, t, 11);
            var b = campo.Hornear(v, t, 11);
            for (var i = 0; i < a.Length; i++)
            {
                Assert.Equal(a[i], b[i]);
            }
        }

        [Fact]
        public void LosEjesDelModeloCaenEnLosDelCaso()
        {
            var m = new MedidasVehiculo(4.5, 1.8, 1.5, 2.7);
            EjesVehiculo.Posiciones("sedan_mediano", m, out var delantero, out var trasero);
            Assert.Equal(2.7, delantero - trasero, 9);

            var reparto = EjesVehiculo.Reparto(1.2, -1.3, delantero, trasero, m.Largo);
            Assert.NotNull(reparto);
            Assert.Equal(delantero, reparto(1.2), 9);
            Assert.Equal(trasero, reparto(-1.3), 9);
            Assert.Equal(2.25, reparto(2.25), 9);
            Assert.Equal(-2.25, reparto(-2.25), 9);
            Assert.Null(EjesVehiculo.Reparto(delantero, trasero, delantero + 0.01, trasero - 0.01, m.Largo));
        }

        private static void Revisar(string caso, string v, double t, PoseVehiculo u, double x, double y, double rumbo)
        {
            var donde = caso + " " + v + " t=" + t;
            Assert.True(Math.Abs(u.X - x) < UnCentimetro, donde + " x");
            Assert.True(Math.Abs(u.Y - y) < UnCentimetro, donde + " y");
            Assert.True(Math.Abs(Ejes.NormalizarAngulo(u.Rumbo - rumbo)) < UnDecimoDeGrado, donde + " rumbo");
        }

        private static char? Lado(Lado? l)
        {
            switch (l)
            {
                case Generated.Lado.F:
                    return 'F';
                case Generated.Lado.B:
                    return 'B';
                case Generated.Lado.L:
                    return 'L';
                case Generated.Lado.R:
                    return 'R';
                default:
                    return null;
            }
        }

        private static char? ZonaVertical(ZonaVertical? z)
        {
            return z == null ? (char?)null : z.Value.ToString()[0];
        }

        /// <summary>Una caja del tamaño del vehículo, con aristas de `paso`, con su piso en y = 0.</summary>
        private static void Caja(MedidasVehiculo m, double paso, out V3[] vertices, out int[] triangulos)
        {
            var v = new List<V3>();
            var t = new List<int>();
            var nx = (int)Math.Ceiling(m.Largo / paso);
            var ny = (int)Math.Ceiling(m.Alto / paso);
            var nz = (int)Math.Ceiling(m.Ancho / paso);
            void Cara(int nu, int nw, Func<double, double, V3> punto)
            {
                var inicio = v.Count;
                for (var i = 0; i <= nu; i++)
                {
                    for (var j = 0; j <= nw; j++)
                    {
                        v.Add(punto(i / (double)nu, j / (double)nw));
                    }
                }

                for (var i = 0; i < nu; i++)
                {
                    for (var j = 0; j < nw; j++)
                    {
                        var a = inicio + i * (nw + 1) + j;
                        var b = a + nw + 1;
                        t.AddRange(new[] { a, b, a + 1, a + 1, b, b + 1 });
                    }
                }
            }

            var L = m.Largo / 2.0;
            var W = m.Ancho / 2.0;
            Cara(nz, ny, (s, r) => new V3(L, r * m.Alto, -W + 2 * W * s));
            Cara(nz, ny, (s, r) => new V3(-L, r * m.Alto, -W + 2 * W * s));
            Cara(nx, ny, (s, r) => new V3(-L + 2 * L * s, r * m.Alto, W));
            Cara(nx, ny, (s, r) => new V3(-L + 2 * L * s, r * m.Alto, -W));
            Cara(nx, nz, (s, r) => new V3(-L + 2 * L * s, m.Alto, -W + 2 * W * r));
            vertices = v.ToArray();
            triangulos = t.ToArray();
        }

        /// <summary>Aplica lo que hace `Quaternion.Euler` de Unity: primero Z, luego X y al final Y.</summary>
        private static (double X, double Y, double Z) Girar(PoseUnity p, double x, double y, double z)
        {
            double R(double g) => g * Math.PI / 180.0;
            var (cz, sz) = (Math.Cos(R(p.EulerZ)), Math.Sin(R(p.EulerZ)));
            var (x1, y1) = (x * cz - y * sz, x * sz + y * cz);
            var (cx, sx) = (Math.Cos(R(p.EulerX)), Math.Sin(R(p.EulerX)));
            var (y2, z2) = (y1 * cx - z * sx, y1 * sx + z * cx);
            var (cy, sy) = (Math.Cos(R(p.EulerY)), Math.Sin(R(p.EulerY)));
            return (x1 * cy + z2 * sy, y2, -x1 * sy + z2 * cy);
        }

        private static bool Cerca((double X, double Y, double Z) a, (double X, double Y, double Z) b)
        {
            return Math.Abs(a.X - b.X) < 1e-9 && Math.Abs(a.Y - b.Y) < 1e-9 && Math.Abs(a.Z - b.Z) < 1e-9;
        }

        private static string Diferencia(JToken a, JToken b, string ruta)
        {
            if (a is JObject oa && b is JObject ob)
            {
                foreach (var p in oa.Properties())
                {
                    if (!ob.TryGetValue(p.Name, out var v))
                    {
                        if (p.Value.Type != JTokenType.Null)
                        {
                            return ruta + "/" + p.Name + " se perdió";
                        }

                        continue;
                    }

                    var d = Diferencia(p.Value, v, ruta + "/" + p.Name);
                    if (d != null)
                    {
                        return d;
                    }
                }

                return null;
            }

            if (a is JArray aa && b is JArray ab)
            {
                if (aa.Count != ab.Count)
                {
                    return ruta + " cambió de largo";
                }

                for (var i = 0; i < aa.Count; i++)
                {
                    var d = Diferencia(aa[i], ab[i], ruta + "[" + i + "]");
                    if (d != null)
                    {
                        return d;
                    }
                }

                return null;
            }

            var numeros = new[] { JTokenType.Integer, JTokenType.Float };
            if (numeros.Contains(a.Type) && numeros.Contains(b.Type))
            {
                return Math.Abs(a.Value<double>() - b.Value<double>()) <= 1e-9 ? null : ruta + ": " + a + " != " + b;
            }

            return JToken.DeepEquals(a, b) ? null : ruta + ": " + a + " != " + b;
        }
    }
}
