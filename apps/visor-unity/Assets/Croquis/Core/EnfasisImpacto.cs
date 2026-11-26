using System;

namespace Croquis.Core
{
    /// <summary>
    /// El énfasis del impacto en el 3D (ronda 4, punto 5; René, 2026-11-18: «el choque en Unity debe
    /// verse más»). Son reglas puras, sin Unity, y se prueban con `dotnet test`. Ninguna cambia lo que
    /// pasa: los vehículos siguen en las poses del Resultado y la carrocería termina exactamente en la
    /// deformación del solver (`dano.perfil_m`). Solo cambian el ritmo, la cámara y lo que se ve
    /// alrededor del golpe.
    ///
    /// - **Cámara lenta automática:** la reproducción baja de golpe a `FactorMinimo` alrededor del impacto
    ///   y vuelve igual a la velocidad elegida, con el letrero «Cámara lenta ×N» a la vista.
    /// - **La cinematográfica** se acerca al punto de impacto durante el golpe (`PesoCamara`).
    /// - **La deformación** crece en `DuracionDanoS` del caso, de la forma original a la del solver.
    /// - **Restos y vidrios** salen del punto de contacto con su física (`Restos`; decoración, con semilla).
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

        private static double Suave(double x)
        {
            x = Math.Max(0.0, Math.Min(1.0, x));
            return x * x * (3.0 - 2.0 * x);
        }

        /// <summary>
        /// El factor de la velocidad de reproducción en `t`: `FactorMinimo` de `AntesS` antes del impacto
        /// a `DespuesS` después, y 1 fuera. Es un escalón, no una rampa (Alberto, 2026-11-26): con rampa los
        /// vehículos se veían desacelerar, como si frenaran. El letrero de `EtiquetaCamaraLenta` lo avisa.
        /// </summary>
        public static double FactorCamaraLenta(double t, double tImpacto)
        {
            if (double.IsNaN(tImpacto) || double.IsInfinity(tImpacto))
            {
                return 1.0;
            }

            var d = t - tImpacto;
            return d >= -AntesS && d <= DespuesS ? FactorMinimo : 1.0;
        }

        /// <summary>
        /// Cuánto se acerca la cinematográfica al punto de impacto (0 a 1): todo en el golpe, nada lejos
        /// de él, con rampas suaves en la misma ventana de la cámara lenta (la cámara sí se mueve suave).
        /// </summary>
        public static double PesoCamara(double t, double tImpacto)
        {
            if (double.IsNaN(tImpacto) || double.IsInfinity(tImpacto))
            {
                return 0.0;
            }

            var d = t - tImpacto;
            return d < 0 ? Suave(1.0 + d / AntesS) : Suave(1.0 - d / DespuesS);
        }

        /// <summary>
        /// El letrero de la cámara lenta para el ritmo total de la reproducción (la velocidad elegida por
        /// la del impacto): «Cámara lenta ×5» a 0.2; nulo a ritmo normal o más rápido.
        /// </summary>
        public static string EtiquetaCamaraLenta(double ritmo)
        {
            if (!(ritmo > 0) || ritmo >= 0.999)
            {
                return null;
            }

            var n = 1.0 / ritmo;
            return "Cámara lenta ×" + (Math.Abs(n - Math.Round(n)) < 0.05 ? Math.Round(n).ToString("0") : n.ToString("0.#", System.Globalization.CultureInfo.InvariantCulture));
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
    }
}
