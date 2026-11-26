using System;
using System.Collections.Generic;
using Croquis.Generated;

namespace Croquis.Core
{
    /// <summary>
    /// Los pedazos que suelta un impacto (docs/contrato-unity.md §1): vidrio templado, plástico de
    /// fascias y micas, y lámina. Son decoración, no entran a ninguna cifra, pero se mueven con física
    /// creíble: salen con parte de la velocidad que traían los vehículos más un rocío desde la cara
    /// golpeada, vuelan con gravedad, rebotan según su material, se arrastran con fricción y se detienen.
    /// Todo es de fórmula cerrada: la posición en cualquier instante sale sin simular paso a paso, así
    /// que la línea de tiempo se puede mover hacia adelante y hacia atrás. La cantidad escala con la
    /// energía de la deformación (`dano.energia_j`), nunca la profundidad. Con la misma semilla, los
    /// mismos pedazos.
    /// </summary>
    public static class Pedazos
    {
        public enum Material
        {
            Vidrio,
            Plastico,
            Metal,
        }

        public const double Gravedad = 9.81;

        /// <summary>Un pedazo por cada tanto de energía de deformación (J), entre `Minimo` y `Maximo`.</summary>
        public const double JoulesPorPieza = 1200.0;

        public const int Minimo = 4;
        public const int Maximo = 240;

        /// <summary>Cuántos pedazos suelta un impacto con esta energía de deformación (J); 0 sin energía.</summary>
        public static int Cuantos(double energiaJ)
        {
            if (!(energiaJ > 0.0))
            {
                return 0;
            }

            return (int)Math.Max(Minimo, Math.Min(Maximo, Math.Round(Minimo + energiaJ / JoulesPorPieza)));
        }

        /// <summary>Un tramo del movimiento: vuelo (con gravedad) o arrastre (frena con fricción), desde `T0`.</summary>
        internal struct Tramo
        {
            public double T0;
            public double X;
            public double Y;
            public double Z;
            public double Vx;
            public double Vy;
            public double Vz;
            public bool Arrastre;

            /// <summary>Lo que dura el tramo (s); en el arrastre, hasta detenerse.</summary>
            public double Dura;

            /// <summary>El giro acumulado al empezar el tramo (rad) y su velocidad (rad/s).</summary>
            public double Angulo;
            public double Giro;
        }

        public sealed class Pieza
        {
            public Material Tipo;

            /// <summary>El lado mayor (m).</summary>
            public double Tamano;

            /// <summary>La variante de forma y de color (0 a 3; en plástico: 0 negro, 1 mica roja, 2 ámbar, 3 clara).</summary>
            public int Variante;

            /// <summary>El eje de giro en vuelo (unitario; x este, y norte, z arriba).</summary>
            public double EjeX;
            public double EjeY;
            public double EjeZ;

            /// <summary>El rumbo en el piso (grados), para que quede tendido y no todos iguales.</summary>
            public double Rumbo;

            internal Tramo[] Tramos;

            /// <summary>Dónde queda (x, y) cuando se detiene.</summary>
            public double FinalX;
            public double FinalY;
        }

        /// <summary>Dónde va un pedazo en un instante.</summary>
        public struct Pose
        {
            public double X;
            public double Y;

            /// <summary>La altura sobre el piso (m).</summary>
            public double Z;

            /// <summary>El giro acumulado (grados) sobre el eje de la pieza.</summary>
            public double Angulo;

            /// <summary>Si ya va tendido en el piso (arrastre o reposo).</summary>
            public bool EnPiso;
            public bool Visible;
        }

        /// <summary>Un vehículo en el impacto: dónde está su centro y a qué velocidad iba (m, m/s).</summary>
        public struct Fuente
        {
            public double X;
            public double Y;
            public double Vx;
            public double Vy;
        }

        // Por material: restitución vertical, lo que pierde de velocidad horizontal al rebotar y fricción al arrastrarse.
        private static double Restitucion(Material m) => m == Material.Vidrio ? 0.3 : m == Material.Plastico ? 0.38 : 0.22;

        private static double PerdidaAlRebotar(Material m) => m == Material.Vidrio ? 0.3 : m == Material.Plastico ? 0.25 : 0.35;

        private static double Friccion(Material m) => m == Material.Vidrio ? 0.55 : m == Material.Plastico ? 0.4 : 0.6;

        /// <summary>
        /// Los pedazos de un impacto en (x, y) entre las fuentes dadas, con la energía de deformación
        /// del impacto (J). Más de la mitad son vidrio, y la lámina es lo menos.
        /// </summary>
        public static List<Pieza> Nube(double x, double y, IList<Fuente> fuentes, double energiaJ, int semilla)
        {
            var azar = new Random(semilla);
            var n = Cuantos(energiaJ);
            var salida = new List<Pieza>(n);
            if (n == 0 || fuentes == null || fuentes.Count == 0)
            {
                return salida;
            }

            for (var i = 0; i < n; i++)
            {
                var r = azar.NextDouble();
                var tipo = r < 0.55 ? Material.Vidrio : r < 0.88 ? Material.Plastico : Material.Metal;
                var f = fuentes[azar.Next(fuentes.Count)];

                // El rocío sale de la cara golpeada: del centro del vehículo hacia el contacto, abierto ±80°.
                var hacia = Math.Atan2(y - f.Y, x - f.X);
                var a = hacia + (azar.NextDouble() * 2.0 - 1.0) * 80.0 * Math.PI / 180.0;
                var rocio = (1.0 + 3.0 * azar.NextDouble()) * (tipo == Material.Vidrio ? 1.3 : 1.0);
                // Y conserva parte de la velocidad del vehículo del que se desprendió.
                var lleva = 0.45 + 0.45 * azar.NextDouble();
                var vx = f.Vx * lleva + Math.Cos(a) * rocio;
                var vy = f.Vy * lleva + Math.Sin(a) * rocio;
                var vz = tipo == Material.Vidrio ? 1.0 + 3.0 * azar.NextDouble() : 0.5 + 2.5 * azar.NextDouble();
                var z0 = tipo == Material.Vidrio ? 0.8 + 0.5 * azar.NextDouble() : 0.35 + 0.45 * azar.NextDouble();
                // El vidrio templado se rompe en granitos de 1 a 2 cm: cada pieza de vidrio es un puñado
                // de ellos, de 5 a 11 cm de lado a lado.
                var tamano = tipo == Material.Vidrio
                    ? 0.05 + 0.06 * azar.NextDouble()
                    : tipo == Material.Plastico ? 0.03 + 0.1 * azar.NextDouble() : 0.05 + 0.15 * azar.NextDouble();

                var ex = azar.NextDouble() * 2.0 - 1.0;
                var ey = azar.NextDouble() * 2.0 - 1.0;
                var ez = azar.NextDouble() * 2.0 - 1.0;
                var largo = Math.Sqrt(ex * ex + ey * ey + ez * ez);
                if (largo < 1e-6)
                {
                    ex = 1.0;
                    largo = 1.0;
                }

                var pieza = new Pieza
                {
                    Tipo = tipo,
                    Tamano = tamano,
                    Variante = tipo == Material.Plastico ? (azar.NextDouble() < 0.6 ? 0 : 1 + azar.Next(3)) : azar.Next(4),
                    EjeX = ex / largo,
                    EjeY = ey / largo,
                    EjeZ = ez / largo,
                    Rumbo = azar.NextDouble() * 360.0,
                };
                // Las piezas chicas giran más rápido.
                var giro = (8.0 + 20.0 * azar.NextDouble()) * Math.Min(3.0, 0.06 / tamano + 0.5);
                pieza.Tramos = Tramos(tipo, x + (azar.NextDouble() - 0.5) * 0.5, y + (azar.NextDouble() - 0.5) * 0.5, z0, vx, vy, vz, giro);
                var ultimo = pieza.Tramos[pieza.Tramos.Length - 1];
                var fin = EnTramo(ultimo, ultimo.Dura);
                pieza.FinalX = fin.X;
                pieza.FinalY = fin.Y;
                salida.Add(pieza);
            }

            return salida;
        }

        /// <summary>Vuelo y rebotes hasta que ya no salta; luego, arrastre hasta detenerse.</summary>
        private static Tramo[] Tramos(Material tipo, double x, double y, double z, double vx, double vy, double vz, double giro)
        {
            var tramos = new List<Tramo>();
            var t = 0.0;
            var angulo = 0.0;
            for (var rebote = 0; rebote < 6; rebote++)
            {
                // Cuándo toca el piso: z + vz·τ − g·τ²/2 = 0.
                var dura = (vz + Math.Sqrt(vz * vz + 2.0 * Gravedad * z)) / Gravedad;
                tramos.Add(new Tramo { T0 = t, X = x, Y = y, Z = z, Vx = vx, Vy = vy, Vz = vz, Dura = dura, Angulo = angulo, Giro = giro });
                x += vx * dura;
                y += vy * dura;
                var choque = vz - Gravedad * dura;
                t += dura;
                angulo += giro * dura;
                z = 0.0;
                vz = -choque * Restitucion(tipo);
                var queda = 1.0 - PerdidaAlRebotar(tipo);
                vx *= queda;
                vy *= queda;
                giro *= 0.55;
                if (vz < 0.6)
                {
                    break;
                }
            }

            var v = Math.Sqrt(vx * vx + vy * vy);
            var frena = Friccion(tipo) * Gravedad;
            tramos.Add(new Tramo
            {
                T0 = t,
                X = x,
                Y = y,
                Vx = vx,
                Vy = vy,
                Arrastre = true,
                Dura = v / frena,
                Angulo = angulo,
                Giro = giro,
            });
            return tramos.ToArray();
        }

        private static Pose EnTramo(Tramo tr, double tau)
        {
            tau = Math.Max(0.0, Math.Min(tr.Dura, tau));
            if (!tr.Arrastre)
            {
                return new Pose
                {
                    X = tr.X + tr.Vx * tau,
                    Y = tr.Y + tr.Vy * tau,
                    Z = Math.Max(0.0, tr.Z + tr.Vz * tau - 0.5 * Gravedad * tau * tau),
                    Angulo = (tr.Angulo + tr.Giro * tau) * 180.0 / Math.PI,
                    Visible = true,
                };
            }

            // Frena parejo hasta detenerse: avanza v·τ − a·τ²/2 en la dirección en que iba.
            var v = Math.Sqrt(tr.Vx * tr.Vx + tr.Vy * tr.Vy);
            var avance = tr.Dura > 0.0 ? v * tau - 0.5 * (v / tr.Dura) * tau * tau : 0.0;
            var ux = v > 1e-9 ? tr.Vx / v : 0.0;
            var uy = v > 1e-9 ? tr.Vy / v : 0.0;
            var giro = tr.Dura > 0.0 ? tr.Giro * (tau - 0.5 * tau * tau / tr.Dura) : 0.0;
            return new Pose
            {
                X = tr.X + ux * avance,
                Y = tr.Y + uy * avance,
                Z = 0.0,
                Angulo = (tr.Angulo + giro) * 180.0 / Math.PI,
                EnPiso = true,
                Visible = true,
            };
        }

        /// <summary>Dónde va un pedazo `dt` segundos después de su impacto (oculto antes).</summary>
        public static Pose Posicion(Pieza p, double dt)
        {
            if (dt < 0.0 || p.Tramos == null || p.Tramos.Length == 0)
            {
                return new Pose { Visible = false };
            }

            var k = p.Tramos.Length - 1;
            while (k > 0 && dt < p.Tramos[k].T0)
            {
                k--;
            }

            return EnTramo(p.Tramos[k], dt - p.Tramos[k].T0);
        }

        /// <summary>Cuándo se detiene un pedazo (s después de su impacto).</summary>
        public static double Reposo(Pieza p)
        {
            var u = p.Tramos[p.Tramos.Length - 1];
            return u.T0 + u.Dura;
        }

        /// <summary>Un impacto que suelta pedazos: su instante, dónde, entre qué vehículos y con cuánta energía.</summary>
        public struct Impacto
        {
            public double T;
            public double X;
            public double Y;
            public Fuente[] Fuentes;
            public double EnergiaJ;
        }

        /// <summary>
        /// Los impactos entre vehículos o contra un objeto del Resultado (docs/contrato-unity.md §1). El
        /// primero sale de `punto_impacto`; los posteriores, de donde están sus vehículos en su `t`. La
        /// energía es la de la deformación de cada vehículo en ese impacto: `dano.energia_j` en su primero
        /// y la de `danos_posteriores` con ese `evento_id` en los siguientes.
        /// </summary>
        public static List<Impacto> Impactos(Caso3DResultado r)
        {
            var salida = new List<Impacto>();
            if (r?.Eventos == null || r.Vehiculos == null)
            {
                return salida;
            }

            var primero = true;
            var eventos = new List<ResultadoEvento>(r.Eventos);
            eventos.Sort((a, b) => a.T.CompareTo(b.T));
            foreach (var e in eventos)
            {
                if ((e.Tipo != StickyTipo.ImpactoVehiculoVehiculo && e.Tipo != StickyTipo.ImpactoVehiculoObjeto) || e.Actores == null)
                {
                    continue;
                }

                var fuentes = new List<Fuente>();
                var energia = 0.0;
                double frenteX = 0, frenteY = 0;
                foreach (var v in r.Vehiculos)
                {
                    if (Array.IndexOf(e.Actores, v.Id) < 0 || !Muestra(v.Trayectoria, e.T, out var f))
                    {
                        continue;
                    }

                    fuentes.Add(f);
                    // El frente del vehículo, hacia donde iba: ahí pega contra un objeto.
                    var rapidez = Math.Sqrt(f.Vx * f.Vx + f.Vy * f.Vy);
                    var medio = (v.Dimensiones?.LargoM ?? 4.0) / 2.0;
                    frenteX += f.X + (rapidez > 0.1 ? f.Vx / rapidez * medio : 0.0);
                    frenteY += f.Y + (rapidez > 0.1 ? f.Vy / rapidez * medio : 0.0);
                    if (Math.Abs(DanoDelCaso.Instante(r, v.Id) - e.T) < 1e-6)
                    {
                        energia += v.Dano?.EnergiaJ ?? 0.0;
                    }
                    else
                    {
                        foreach (var d in v.DanosPosteriores ?? new DanosPosterioreElement[0])
                        {
                            energia += d != null && d.EventoId == e.Id ? d.EnergiaJ : 0.0;
                        }
                    }
                }

                if (fuentes.Count == 0)
                {
                    continue;
                }

                double x, y;
                if (primero && r.PuntoImpacto != null)
                {
                    x = r.PuntoImpacto.X;
                    y = r.PuntoImpacto.Y;
                }
                else if (fuentes.Count >= 2)
                {
                    x = (fuentes[0].X + fuentes[1].X) / 2.0;
                    y = (fuentes[0].Y + fuentes[1].Y) / 2.0;
                }
                else
                {
                    x = frenteX;
                    y = frenteY;
                }

                primero = false;
                salida.Add(new Impacto { T = e.T, X = x, Y = y, Fuentes = fuentes.ToArray(), EnergiaJ = energia });
            }

            return salida;
        }

        /// <summary>Dónde estaba un vehículo en `t` y a qué velocidad iba justo antes.</summary>
        private static bool Muestra(VehiculoTrayectoria tr, double t, out Fuente f)
        {
            f = default;
            if (tr?.T == null || tr.T.Length == 0 || tr.X == null || tr.Vx == null)
            {
                return false;
            }

            var i = 0;
            while (i + 1 < tr.T.Length && tr.T[i + 1] <= t)
            {
                i++;
            }

            var k = Math.Max(0, i - 1);
            f = new Fuente { X = tr.X[i], Y = tr.Y[i], Vx = tr.Vx[k], Vy = tr.Vy[k] };
            return true;
        }
    }
}
