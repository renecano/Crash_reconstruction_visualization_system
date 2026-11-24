using System;
using Croquis.Generated;

namespace Croquis.Core
{
    /// <summary>
    /// El puente o paso a desnivel narrado (ronda 4; René, 2026-11-18), ilustrativo. La física va sobre
    /// la losa, a nivel; el piso de alrededor baja para que se vea la estructura. Es la misma fórmula
    /// que `hundimientoBajoEstructura` en apps/web/src/components/visor-unity/escenario.ts (el suelo lo
    /// manda la web con estas alturas; las vías las arma Unity con esta función): no se despegan.
    /// </summary>
    public static class EstructuraVia
    {
        /// <summary>m: en cuánto sube el piso de abajo hasta la losa en cada extremo (el terraplén).</summary>
        public const double RampaExtremoM = 15.0;

        /// <summary>m: en cuánto baja el piso desde la orilla de la losa (el muro del estribo).</summary>
        public const double RampaLadoM = 1.0;

        /// <summary>m: cada cuánto va una pila bajo la losa.</summary>
        public const double SeparacionPilasM = 15.0;

        private static double Suave(double u)
        {
            var t = Math.Min(1.0, Math.Max(0.0, u));
            return t * t * (3.0 - 2.0 * t);
        }

        /// <summary>Lo que va a lo largo de la losa y lo que va de lado, desde su centro (m).</summary>
        public static (double Largo, double Lado) Ejes(EscenarioEstructura e, double x, double y)
        {
            var r = e.RumboDeg * Math.PI / 180.0;
            var dx = x - e.Centro.X;
            var dy = y - e.Centro.Y;
            return (dx * Math.Cos(r) + dy * Math.Sin(r), -dx * Math.Sin(r) + dy * Math.Cos(r));
        }

        /// <summary>Cuánto baja el piso en (x, y): nada sobre la losa ni lejos del puente.</summary>
        public static double Hundimiento(EscenarioEstructura e, double x, double y)
        {
            if (e == null)
            {
                return 0.0;
            }

            var (largo, lado) = Ejes(e, x, y);
            var enLargo = Suave((e.LargoM / 2.0 - Math.Abs(largo)) / RampaExtremoM);
            var enLado = Suave((Math.Abs(lado) - e.AnchoM / 2.0) / RampaLadoM);
            return e.AlturaM * enLargo * enLado;
        }

        /// <summary>Dónde van las pilas, a lo largo de la losa (m desde su centro), sin las de los extremos.</summary>
        public static double[] Pilas(EscenarioEstructura e)
        {
            var mitad = e.LargoM / 2.0 - RampaExtremoM;
            if (mitad <= 0)
            {
                return new[] { 0.0 };
            }

            var n = (int)Math.Floor(2.0 * mitad / SeparacionPilasM);
            var salida = new double[n + 1];
            for (var k = 0; k <= n; k++)
            {
                salida[k] = -mitad + k * (2.0 * mitad / Math.Max(1, n));
            }

            return salida;
        }
    }
}
