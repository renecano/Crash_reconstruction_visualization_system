using System;

namespace Croquis.Core
{
    /// <summary>
    /// Un objeto colocado, como lo ve el modo edición: su caja en planta (o su círculo) y su alto, en
    /// coordenadas de la escena (x al este, y al norte, z hacia arriba; rumbo antihorario desde +x).
    /// </summary>
    public readonly struct PiezaEditable
    {
        public PiezaEditable(string id, double x, double y, double piso, double rumboDeg, double largo, double ancho, double alto, double? radio = null)
        {
            Id = id;
            X = x;
            Y = y;
            Piso = piso;
            RumboDeg = rumboDeg;
            Largo = largo;
            Ancho = ancho;
            Alto = alto;
            Radio = radio;
        }

        public string Id { get; }

        public double X { get; }

        public double Y { get; }

        /// <summary>La altura del piso al pie del objeto.</summary>
        public double Piso { get; }

        public double RumboDeg { get; }

        public double Largo { get; }

        public double Ancho { get; }

        public double Alto { get; }

        /// <summary>Si es un cilindro (poste, tronco): su radio. Se elige con su caja envolvente.</summary>
        public double? Radio { get; }
    }

    /// <summary>
    /// La geometría del modo edición del visor (U6, C2 y C1), sin Unity: qué objeto toca el rayo del
    /// cursor, dónde pega en el piso, y cómo cambian el rumbo y el tamaño con la rueda. Unity nunca
    /// recalcula: con esto arma el mensaje `objetoEditado` o `puntoMarcado` y la web corre el solver.
    /// </summary>
    public static class Edicion
    {
        /// <summary>Grados por paso de la rueda.</summary>
        public const double GradosPorPaso = 5.0;

        /// <summary>Factor de tamaño por paso de la rueda (con mayúsculas).</summary>
        public const double FactorPorPaso = 1.05;

        public const double LadoMinimo = 0.1;

        public const double LadoMaximo = 80.0;

        /// <summary>Holgura para elegir objetos delgados (un poste de 30 cm se elige igual que uno de 60 cm).</summary>
        public const double Holgura = 0.25;

        /// <summary>
        /// El objeto que toca primero el rayo (origen `o`, dirección `d`, en la escena), o −1. Cada
        /// objeto es una caja orientada por su rumbo, con un poco de holgura.
        /// </summary>
        public static int Elegir(PiezaEditable[] piezas, double ox, double oy, double oz, double dx, double dy, double dz)
        {
            var mejor = -1;
            var mejorT = double.PositiveInfinity;
            for (var i = 0; i < piezas.Length; i++)
            {
                var p = piezas[i];
                var largo = p.Radio.HasValue ? 2.0 * p.Radio.Value : p.Largo;
                var ancho = p.Radio.HasValue ? 2.0 * p.Radio.Value : p.Ancho;
                var r = p.RumboDeg * Math.PI / 180.0;
                var c = Math.Cos(r);
                var s = Math.Sin(r);
                // Al marco del objeto: u a lo largo de su rumbo, v a su izquierda, w hacia arriba.
                var px = ox - p.X;
                var py = oy - p.Y;
                var u0 = px * c + py * s;
                var v0 = -px * s + py * c;
                var w0 = oz - p.Piso;
                var du = dx * c + dy * s;
                var dv = -dx * s + dy * c;
                var dw = dz;
                var hu = largo / 2.0 + Holgura;
                var hv = ancho / 2.0 + Holgura;
                if (Losa(u0, du, -hu, hu, out var a1, out var b1)
                    && Losa(v0, dv, -hv, hv, out var a2, out var b2)
                    && Losa(w0, dw, -Holgura, p.Alto + Holgura, out var a3, out var b3))
                {
                    var entra = Math.Max(a1, Math.Max(a2, a3));
                    var sale = Math.Min(b1, Math.Min(b2, b3));
                    if (entra <= sale && sale >= 0.0)
                    {
                        var t = Math.Max(entra, 0.0);
                        if (t < mejorT)
                        {
                            mejorT = t;
                            mejor = i;
                        }
                    }
                }
            }

            return mejor;
        }

        /// <summary>Dónde pega el rayo en el plano horizontal de altura `z`; null si no lo alcanza.</summary>
        public static (double X, double Y)? AlPlano(double ox, double oy, double oz, double dx, double dy, double dz, double z)
        {
            if (Math.Abs(dz) < 1e-9)
            {
                return null;
            }

            var t = (z - oz) / dz;
            if (t < 0.0)
            {
                return null;
            }

            return (ox + dx * t, oy + dy * t);
        }

        /// <summary>El rumbo tras girar `pasos` de la rueda, entre 0 y 360.</summary>
        public static double Girar(double rumboDeg, double pasos)
        {
            var g = (rumboDeg + pasos * GradosPorPaso) % 360.0;
            return g < 0.0 ? g + 360.0 : g;
        }

        /// <summary>El rumbo tras girar con dos dedos: el cambio del ángulo entre ellos.</summary>
        public static double GirarConDedos(double rumboDeg, double anguloAntesDeg, double anguloAhoraDeg)
        {
            var d = anguloAhoraDeg - anguloAntesDeg;
            d = ((d + 180.0) % 360.0 + 360.0) % 360.0 - 180.0;
            return Girar(rumboDeg, d / GradosPorPaso);
        }

        /// <summary>El largo tras `pasos` de la rueda con mayúsculas; el ancho no cambia.</summary>
        public static double Alargar(double largo, double pasos)
        {
            return Math.Max(LadoMinimo, Math.Min(LadoMaximo, largo * Math.Pow(FactorPorPaso, pasos)));
        }

        /// <summary>Una coordenada como la manda el puente: al centímetro.</summary>
        public static double AlCentimetro(double metros)
        {
            return Math.Round(metros, 2);
        }

        private static bool Losa(double o, double d, double min, double max, out double entra, out double sale)
        {
            if (Math.Abs(d) < 1e-12)
            {
                entra = double.NegativeInfinity;
                sale = double.PositiveInfinity;
                return o >= min && o <= max;
            }

            var t1 = (min - o) / d;
            var t2 = (max - o) / d;
            entra = Math.Min(t1, t2);
            sale = Math.Max(t1, t2);
            return true;
        }
    }
}
