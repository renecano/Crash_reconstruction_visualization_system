using System;
using Croquis.Generated;

namespace Croquis.Core
{
    /// <summary>
    /// La caída de una moto, bicicleta o scooter después del impacto. El solver la arrastra caída desde
    /// el impacto (usa `parametros.friccion_moto_caida`, el arrastre de la moto que se desliza de lado),
    /// pero no calcula cómo cae: el `Resultado` no trae su alabeo en el tiempo. El visor la tiende en
    /// `Transicion` segundos hacia el lado al que se desliza; es ilustrativo y se dice así (ADR 0114).
    /// </summary>
    public static class Caida
    {
        /// <summary>Cuánto tarda en quedar tendida, en segundos desde el impacto (ilustrativo).</summary>
        public const double Transicion = 0.35;

        /// <summary>Si el `Resultado` arrastra caído a este vehículo: dos ruedas y el arrastre de la moto caída.</summary>
        public static bool SeArrastraCaido(Caso3DResultado r, ResultadoVehiculo v)
        {
            return PerfilClase.De(v.Clase).DosRuedas
                && r.Parametros?.FriccionMotoCaida != null
                && r.Eventos != null
                && Array.Exists(r.Eventos, e => e.Actores != null && Array.IndexOf(e.Actores, v.Id) >= 0 && e.T >= -1e-9);
        }

        /// <summary>
        /// Hacia qué lado cae: hacia donde se desliza respecto a su propio frente, justo después del
        /// impacto. +1, el costado derecho abajo (el signo de `alabeo`); −1, el izquierdo.
        /// </summary>
        public static int Lado(VehiculoTrayectoria tr)
        {
            for (var i = 0; i < tr.T.Length; i++)
            {
                if (tr.T[i] <= 0.0)
                {
                    continue;
                }

                var c = Math.Cos(tr.Rumbo[i]);
                var s = Math.Sin(tr.Rumbo[i]);
                // Velocidad lateral en el marco del vehículo: positiva hacia su izquierda.
                var lateral = -tr.Vx[i] * s + tr.Vy[i] * c;
                return lateral > 0.0 ? -1 : 1;
            }

            return 1;
        }

        /// <summary>El alabeo (rad) en `t`: cero antes del impacto, ±π/2 desde `Transicion` s después.</summary>
        public static double Alabeo(int lado, double t)
        {
            if (t <= 0.0)
            {
                return 0.0;
            }

            var f = Math.Min(1.0, t / Transicion);
            // Suave al empezar y al terminar.
            f = f * f * (3.0 - 2.0 * f);
            return lado * f * Math.PI / 2.0;
        }

        /// <summary>El instante en que queda en reposo: el último de su trayectoria con movimiento.</summary>
        public static double Reposo(VehiculoTrayectoria tr)
        {
            for (var i = tr.T.Length - 1; i > 0; i--)
            {
                var v = Math.Sqrt(tr.Vx[i] * tr.Vx[i] + tr.Vy[i] * tr.Vy[i]);
                if (v > 0.05)
                {
                    return tr.T[Math.Min(i + 1, tr.T.Length - 1)];
                }
            }

            return tr.T[0];
        }
    }
}
