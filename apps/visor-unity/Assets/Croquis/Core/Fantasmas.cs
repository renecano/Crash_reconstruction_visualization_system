using System;
using System.Collections.Generic;
using Croquis.Generated;

namespace Croquis.Core
{
    /// <summary>
    /// La versión superpuesta (ronda 4, punto 8; ADR 0123): los vehículos de otra versión del caso,
    /// translúcidos y con el mismo reloj que la reconstrucción. Son las mismas reglas que la maqueta 2D
    /// (`versionDeclaradaEnMaqueta` en apps/web/src/lib/maqueta.ts): las dos versiones se alinean por
    /// su primer impacto y solo se dibuja el vehículo que en la versión va por otro lado.
    /// </summary>
    public static class Fantasmas
    {
        /// <summary>Separación mínima (m) para dibujar un vehículo de la versión: menos es lo mismo.</summary>
        public const double UmbralM = 0.5;

        /// <summary>Cada cuánto se comparan las dos versiones (s).</summary>
        public const double PasoComparacionS = 0.2;

        /// <summary>El primer impacto de un resultado (s); 0 si no trae ninguno.</summary>
        public static double TImpacto(Caso3DResultado r)
        {
            var primero = double.PositiveInfinity;
            foreach (var e in r?.Eventos ?? new ResultadoEvento[0])
            {
                if (EsImpacto(e.Tipo) && e.T < primero)
                {
                    primero = e.T;
                }
            }

            return double.IsInfinity(primero) ? 0.0 : primero;
        }

        private static bool EsImpacto(StickyTipo t)
        {
            return t == StickyTipo.ImpactoVehiculoObjeto
                || t == StickyTipo.ImpactoVehiculoPersona
                || t == StickyTipo.ImpactoVehiculoVehiculo;
        }

        /// <summary>
        /// Lo que se suma al instante de la reconstrucción para tener el de la versión: cada resultado
        /// tiene su impacto en su propio reloj, y se alinean por él.
        /// </summary>
        public static double Desfase(Caso3DResultado reconstruida, Caso3DResultado version)
        {
            return TImpacto(version) - TImpacto(reconstruida);
        }

        /// <summary>
        /// Los ids de los vehículos de la versión que se dibujan: los que también están en la
        /// reconstrucción, con trayectoria, y que en algún momento (o en su reposo) quedan a
        /// `umbralM` metros o más de donde los pone la reconstrucción.
        /// </summary>
        public static string[] VehiculosADibujar(Caso3DResultado reconstruida, Caso3DResultado version, double umbralM = UmbralM)
        {
            var ids = new List<string>();
            if (reconstruida?.Vehiculos == null || version?.Vehiculos == null)
            {
                return ids.ToArray();
            }

            var desfase = Desfase(reconstruida, version);
            foreach (var vr in reconstruida.Vehiculos)
            {
                var vd = Array.Find(version.Vehiculos, x => x.Id == vr.Id);
                if (vd == null || !ConTrayectoria(vd.Trayectoria) || !ConTrayectoria(vr.Trayectoria))
                {
                    continue;
                }

                if (Separacion(vr, vd, reconstruida.TInicio, reconstruida.TFin, desfase) >= umbralM)
                {
                    ids.Add(vd.Id);
                }
            }

            return ids.ToArray();
        }

        /// <summary>La mayor distancia en planta entre las dos versiones de un vehículo (m), con su reposo.</summary>
        public static double Separacion(ResultadoVehiculo reconstruido, ResultadoVehiculo version, double tInicio, double tFin, double desfase)
        {
            var mayor = 0.0;
            var pasos = (int)Math.Floor((tFin - tInicio) / PasoComparacionS + 1e-9);
            for (var k = 0; k <= pasos; k++)
            {
                var t = tInicio + k * PasoComparacionS;
                var a = Muestreo.Pose(reconstruido.Trayectoria, t);
                var b = Muestreo.Pose(version.Trayectoria, t + desfase);
                mayor = Math.Max(mayor, Distancia(a.X, a.Y, b.X, b.Y));
            }

            if (reconstruido.PoseFinal != null && version.PoseFinal != null)
            {
                mayor = Math.Max(mayor, Distancia(reconstruido.PoseFinal.X, reconstruido.PoseFinal.Y, version.PoseFinal.X, version.PoseFinal.Y));
            }

            return mayor;
        }

        private static bool ConTrayectoria(VehiculoTrayectoria tr)
        {
            return tr?.T != null && tr.T.Length > 0 && tr.X != null && tr.Y != null && tr.Rumbo != null;
        }

        private static double Distancia(double ax, double ay, double bx, double by)
        {
            var dx = ax - bx;
            var dy = ay - by;
            return Math.Sqrt(dx * dx + dy * dy);
        }
    }
}
