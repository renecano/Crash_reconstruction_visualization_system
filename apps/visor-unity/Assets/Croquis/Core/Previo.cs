using System;
using System.Collections.Generic;
using Croquis.Generated;

namespace Croquis.Core
{
    /// <summary>
    /// El trayecto previo de un vehículo (René, 2026-11-27; `escenario.vehiculos[].trayecto_previo`,
    /// docs/contrato-unity.md §4): de dónde venía, por las calles, hasta el primer punto de su trayectoria
    /// en el Resultado. Es ilustrativo, no evidencia: Unity solo lo reproduce, y antes de
    /// `resultado.t_inicio` el vehículo va por él; desde ahí, por el Resultado, como siempre.
    /// </summary>
    public static class Previo
    {
        /// <summary>Si el trayecto se puede usar: al menos dos puntos y los tres arreglos del mismo largo.</summary>
        public static bool Hay(TrayectoPrevio tr)
        {
            return tr?.X != null && tr.Y != null && tr.T != null && tr.X.Length >= 2 && tr.Y.Length == tr.X.Length && tr.T.Length == tr.X.Length;
        }

        /// <summary>El primer instante del trayecto (s), o +∞ sin trayecto.</summary>
        public static double Inicio(TrayectoPrevio tr)
        {
            return Hay(tr) ? tr.T[0] : double.PositiveInfinity;
        }

        /// <summary>
        /// La pose en `t` sobre el trayecto: lineal entre puntos, con el rumbo del tramo (suavizado con el
        /// siguiente para que no gire a saltos en las esquinas). Fuera del trayecto, su extremo.
        /// </summary>
        public static PoseVehiculo Pose(TrayectoPrevio tr, double t)
        {
            var n = tr.X.Length;
            var i = 0;
            if (t >= tr.T[n - 1])
            {
                i = n - 2;
            }
            else
            {
                while (i < n - 2 && tr.T[i + 1] <= t)
                {
                    i++;
                }
            }

            var dt = tr.T[i + 1] - tr.T[i];
            var f = dt > 1e-9 ? Math.Max(0.0, Math.Min(1.0, (t - tr.T[i]) / dt)) : 0.0;
            var x = tr.X[i] + (tr.X[i + 1] - tr.X[i]) * f;
            var y = tr.Y[i] + (tr.Y[i + 1] - tr.Y[i]) * f;
            var r0 = Rumbo(tr, i);
            var r1 = i + 2 < n ? Rumbo(tr, i + 1) : r0;
            var dr = Ejes.NormalizarAngulo(r1 - r0);
            return new PoseVehiculo(x, y, 0.0, r0 + dr * f, 0.0, 0.0);
        }

        private static double Rumbo(TrayectoPrevio tr, int i)
        {
            return Math.Atan2(tr.Y[i + 1] - tr.Y[i], tr.X[i + 1] - tr.X[i]);
        }

        /// <summary>
        /// Los guiones de la línea punteada (en planta, x este, y norte): `largo` m de raya y `hueco` m de
        /// espacio, a lo largo de toda la ruta. Así se distingue del tramo reconstruido.
        /// </summary>
        public static List<(double Ax, double Ay, double Bx, double By)> Guiones(TrayectoPrevio tr, double largo = 3.0, double hueco = 2.0)
        {
            var lista = new List<(double, double, double, double)>();
            var paso = largo + hueco;
            var recorrido = 0.0;
            for (var i = 0; i + 1 < tr.X.Length; i++)
            {
                var ax = tr.X[i];
                var ay = tr.Y[i];
                var dx = tr.X[i + 1] - ax;
                var dy = tr.Y[i + 1] - ay;
                var l = Math.Sqrt(dx * dx + dy * dy);
                if (l < 1e-6)
                {
                    continue;
                }

                // Los guiones que caen en este tramo, en coordenada de recorrido.
                var s = Math.Ceiling(recorrido / paso) * paso - paso;
                for (; s < recorrido + l; s += paso)
                {
                    var s0 = Math.Max(s, recorrido);
                    var s1 = Math.Min(s + largo, recorrido + l);
                    if (s1 - s0 > 0.05)
                    {
                        var f0 = (s0 - recorrido) / l;
                        var f1 = (s1 - recorrido) / l;
                        lista.Add((ax + dx * f0, ay + dy * f0, ax + dx * f1, ay + dy * f1));
                    }
                }

                recorrido += l;
            }

            return lista;
        }

        /// <summary>El primer instante de la reproducción: el del trayecto previo más largo, o el del Resultado.</summary>
        public static double InicioDelCaso(double tInicioResultado, IEnumerable<TrayectoPrevio> previos)
        {
            var t = tInicioResultado;
            foreach (var p in previos)
            {
                t = Math.Min(t, Inicio(p));
            }

            return t;
        }

        /// <summary>
        /// La altura del suelo dibujado de la escena en (x, y) (m), la más alta de las mallas de
        /// `escenario.suelo` que lo cubren (bilineal), o nulo si ninguna lo cubre. El trayecto se dibuja encima:
        /// el suelo sigue su propia malla de alturas, no siempre la del relieve.
        /// </summary>
        public static double? AlturaSuelo(SueloEscenario[] suelos, double x, double y)
        {
            double? mejor = null;
            foreach (var s in suelos ?? new SueloEscenario[0])
            {
                var n = (int)s.Segmentos + 1;
                if (s.AlturasM == null || s.AlturasM.Length < n * n || n < 2)
                {
                    continue;
                }

                var x0 = s.Centro.X - s.LadoM / 2.0;
                var y0 = s.Centro.Y - s.LadoM / 2.0;
                var fx = (x - x0) / s.LadoM * (n - 1);
                var fy = (y - y0) / s.LadoM * (n - 1);
                if (fx < 0 || fy < 0 || fx > n - 1 || fy > n - 1)
                {
                    continue;
                }

                var i = Math.Min(n - 2, (int)Math.Floor(fx));
                var j = Math.Min(n - 2, (int)Math.Floor(fy));
                var u = fx - i;
                var v = fy - j;
                var h = s.AlturasM[j * n + i] * (1 - u) * (1 - v) + s.AlturasM[j * n + i + 1] * u * (1 - v)
                    + s.AlturasM[(j + 1) * n + i] * (1 - u) * v + s.AlturasM[(j + 1) * n + i + 1] * u * v;
                mejor = mejor.HasValue ? Math.Max(mejor.Value, h) : h;
            }

            return mejor;
        }
    }
}
