using System;
using System.Collections.Generic;

namespace Croquis.Core
{
    /// <summary>
    /// El énfasis del impacto en el 3D (ronda 4, punto 5; René, 2026-11-18: «el choque en Unity debe
    /// verse más»). Son reglas puras, sin Unity, y se prueban con `dotnet test`. Ninguna cambia lo que
    /// pasa: los vehículos siguen en las poses del Resultado y la carrocería termina exactamente en la
    /// deformación del solver (`dano.perfil_m`). Solo cambian el ritmo, la cámara y lo que se ve
    /// alrededor del golpe.
    ///
    /// - **Cámara lenta automática:** la reproducción baja a `FactorMinimo` en el impacto y vuelve sola a
    ///   la velocidad elegida, con rampas suaves.
    /// - **La cinematográfica** se acerca al punto de impacto durante el golpe (`PesoCamara`).
    /// - **La deformación** crece en `DuracionDanoS` del caso, de la forma original a la del solver.
    /// - **Restos y vidrios** salen del punto de contacto y caen al piso (ilustrativos; con semilla).
    /// - **La marca del contacto** se queda en el piso desde el impacto.
    /// </summary>
    public static class EnfasisImpacto
    {
        /// <summary>La velocidad de reproducción en el instante del impacto (fracción de la elegida).</summary>
        public const double FactorMinimo = 0.2;

        /// <summary>Cuánto antes del impacto empieza a frenar la reproducción (s del caso).</summary>
        public const double AntesS = 0.35;

        /// <summary>Cuánto después del impacto vuelve a la velocidad elegida (s del caso).</summary>
        public const double DespuesS = 0.8;

        /// <summary>En cuánto tiempo del caso crece la deformación hasta la del solver (s).</summary>
        public const double DuracionDanoS = 0.12;

        /// <summary>Cuánto dura el vuelo de los restos hasta quedar en el piso (s del caso).</summary>
        public const double VueloRestosS = 0.9;

        private static double Suave(double x)
        {
            x = Math.Max(0.0, Math.Min(1.0, x));
            return x * x * (3.0 - 2.0 * x);
        }

        /// <summary>
        /// El factor de la velocidad de reproducción en `t`: 1 lejos del impacto y `FactorMinimo` en él,
        /// con rampas suaves de `AntesS` y `DespuesS`.
        /// </summary>
        public static double FactorCamaraLenta(double t, double tImpacto)
        {
            if (double.IsNaN(tImpacto) || double.IsInfinity(tImpacto))
            {
                return 1.0;
            }

            var d = t - tImpacto;
            var cerca = d < 0 ? Suave(1.0 + d / AntesS) : Suave(1.0 - d / DespuesS);
            return 1.0 - (1.0 - FactorMinimo) * cerca;
        }

        /// <summary>
        /// Cuánto se acerca la cinematográfica al punto de impacto (0 a 1): todo en el golpe, nada lejos
        /// de él. La ventana es la misma de la cámara lenta.
        /// </summary>
        public static double PesoCamara(double t, double tImpacto)
        {
            return (1.0 - FactorCamaraLenta(t, tImpacto)) / (1.0 - FactorMinimo);
        }

        /// <summary>Qué tanto de la deformación del solver se ve en `t` (0 antes del impacto, 1 al final).</summary>
        public static double AvanceDano(double t, double desde)
        {
            if (t < desde - 1e-9)
            {
                return 0.0;
            }

            return Suave((t - desde) / DuracionDanoS);
        }

        /// <summary>Un resto o un vidrio: de dónde sale, a dónde llega y su tamaño.</summary>
        public struct Resto
        {
            public double X0;
            public double Y0;
            public double X1;
            public double Y1;
            public double AlturaMax;
            public double Tamano;
            public bool Vidrio;
            public double Giro;
        }

        /// <summary>
        /// La nube de restos del impacto (ilustrativa): sale del punto de contacto hacia los lados del
        /// avance de los vehículos y cae dentro de `alcanceM`. Con la misma semilla, la misma nube.
        /// </summary>
        public static List<Resto> Nube(double x, double y, double rumboDeg, double alcanceM, int cuantos, int semilla)
        {
            var azar = new Random(semilla);
            var salida = new List<Resto>(cuantos);
            var rumbo = rumboDeg * Math.PI / 180.0;
            for (var i = 0; i < cuantos; i++)
            {
                // Hacia adelante en el avance, abierta ±70°; las piezas chicas (vidrio) llegan más lejos.
                var vidrio = i % 3 != 0;
                var a = rumbo + (azar.NextDouble() * 2.0 - 1.0) * 70.0 * Math.PI / 180.0;
                var d = alcanceM * (0.25 + 0.75 * Math.Sqrt(azar.NextDouble())) * (vidrio ? 1.0 : 0.7);
                salida.Add(new Resto
                {
                    X0 = x + (azar.NextDouble() - 0.5) * 0.6,
                    Y0 = y + (azar.NextDouble() - 0.5) * 0.6,
                    X1 = x + Math.Cos(a) * d,
                    Y1 = y + Math.Sin(a) * d,
                    AlturaMax = 0.3 + azar.NextDouble() * 0.6,
                    Tamano = vidrio ? 0.012 + azar.NextDouble() * 0.03 : 0.04 + azar.NextDouble() * 0.12,
                    Vidrio = vidrio,
                    Giro = azar.NextDouble() * 360.0,
                });
            }

            return salida;
        }

        /// <summary>
        /// Dónde va un resto en `t` (x, altura, y): en el punto de contacto antes del impacto (oculto),
        /// en vuelo parabólico durante `VueloRestosS` y en el piso después.
        /// </summary>
        public static (double X, double Z, double Y, bool Visible) PosicionResto(Resto r, double t, double tImpacto)
        {
            if (t < tImpacto)
            {
                return (r.X0, 0.0, r.Y0, false);
            }

            var u = Math.Min(1.0, (t - tImpacto) / VueloRestosS);
            // Sale rápido y se frena (fricción del aire y rebotes): 1 − (1 − u)².
            var a = 1.0 - (1.0 - u) * (1.0 - u);
            var x = r.X0 + (r.X1 - r.X0) * a;
            var y = r.Y0 + (r.Y1 - r.Y0) * a;
            var z = 4.0 * r.AlturaMax * u * (1.0 - u);
            return (x, z, y, true);
        }
    }
}
