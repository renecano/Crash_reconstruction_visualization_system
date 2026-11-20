using System;
using Croquis.Generated;

namespace Croquis.Core
{
    /// <summary>
    /// El relieve real del lugar en el piso del 3D (ronda 4, punto 2; René, 2026-11-18: «que el
    /// terreno 3D represente las subidas y bajadas»). Es la misma interpolación bilineal del solver
    /// (`ReliefMesh.height` en packages/solver-ts/src/terrain.ts): las llantas tocan lo que se dibuja,
    /// y la altura de cada vehículo (la del Resultado) cae sobre este piso.
    /// </summary>
    public sealed class RelieveMalla
    {
        private readonly double x0;
        private readonly double y0;
        private readonly double paso;
        private readonly int nx;
        private readonly int ny;
        private readonly double[] h;

        private RelieveMalla(double x0, double y0, double paso, int nx, int ny, double[] h)
        {
            this.x0 = x0;
            this.y0 = y0;
            this.paso = paso;
            this.nx = nx;
            this.ny = ny;
            this.h = h;
        }

        /// <summary>La malla del caso; nula si no viene, está incompleta o es plana (no cambia nada).</summary>
        public static RelieveMalla De(Caso3DRelieve r)
        {
            if (r?.AlturasM == null || r.Origen == null || r.Ancho < 2 || r.Alto < 2 || r.ResolucionM <= 0)
            {
                return null;
            }

            if (r.AlturasM.Length < r.Ancho * r.Alto)
            {
                return null;
            }

            double lo = double.PositiveInfinity, hi = double.NegativeInfinity;
            foreach (var a in r.AlturasM)
            {
                lo = Math.Min(lo, a);
                hi = Math.Max(hi, a);
            }

            if (hi == lo)
            {
                return null;
            }

            return new RelieveMalla(r.Origen.X, r.Origen.Y, r.ResolucionM, (int)r.Ancho, (int)r.Alto, r.AlturasM);
        }

        /// <summary>La altura (m) en (x este, y norte) de la escena, relativa al punto de impacto.</summary>
        public double Altura(double x, double y)
        {
            var fx = Math.Min(Math.Max((x - x0) / paso, 0.0), nx - 1.0);
            var fy = Math.Min(Math.Max((y - y0) / paso, 0.0), ny - 1.0);
            var i = Math.Min((int)Math.Truncate(fx), nx - 2);
            var j = Math.Min((int)Math.Truncate(fy), ny - 2);
            var tx = fx - i;
            var ty = fy - j;
            var k = j * nx + i;
            var bajo = h[k] + (h[k + 1] - h[k]) * tx;
            var alto = h[k + nx] + (h[k + nx + 1] - h[k + nx]) * tx;
            return bajo + (alto - bajo) * ty;
        }

        /// <summary>La pendiente (%) de la malla en (x, y) a lo largo del rumbo dado (grados).</summary>
        public double Pendiente(double x, double y, double rumboDeg, double tramoM = 10.0)
        {
            var r = rumboDeg * Math.PI / 180.0;
            var dx = Math.Cos(r) * tramoM / 2.0;
            var dy = Math.Sin(r) * tramoM / 2.0;
            return 100.0 * (Altura(x + dx, y + dy) - Altura(x - dx, y - dy)) / tramoM;
        }
    }
}
