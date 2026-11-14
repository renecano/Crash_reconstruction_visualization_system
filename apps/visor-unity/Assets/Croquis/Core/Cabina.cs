using System;
using System.Collections.Generic;

namespace Croquis.Core
{
    /// <summary>
    /// La caja interior de la cabina de un vehículo, en su marco: x adelante desde el centro, y a la
    /// izquierda, z hacia arriba desde el suelo (metros). Es una colocación ilustrativa para dibujar a
    /// los ocupantes, no un dato del solver: ningún punto del cuerpo de un ocupante debe salir de ella
    /// (René, 2026-11-13; ADR 0116).
    /// </summary>
    public readonly struct Cabina
    {
        private readonly double[] perfilZ;
        private readonly double[] perfilAncho;

        /// <param name="perfilZ">Alturas (m, crecientes) donde se midió la carrocería; null, sin perfil.</param>
        /// <param name="perfilAncho">El medio ancho por fuera de la carrocería (m) a cada altura.</param>
        public Cabina(double xMin, double xMax, double yMax, double zMin, double zMax, double[] perfilZ = null, double[] perfilAncho = null)
        {
            XMin = xMin;
            XMax = xMax;
            YMax = yMax;
            ZMin = zMin;
            ZMax = zMax;
            this.perfilZ = perfilZ;
            this.perfilAncho = perfilAncho;
        }

        /// <summary>La pared de atrás (o el respaldo de la última fila).</summary>
        public double XMin { get; }

        /// <summary>El tablero y el piso de los pies, adelante.</summary>
        public double XMax { get; }

        /// <summary>
        /// Medio ancho interior a la altura de la puerta: de la línea del centro a la cara de adentro de
        /// la puerta. Más arriba la carrocería se mete hacia adentro: ver `MedioAncho`.
        /// </summary>
        public double YMax { get; }

        /// <summary>El piso donde van los pies.</summary>
        public double ZMin { get; }

        /// <summary>El techo por dentro.</summary>
        public double ZMax { get; }

        /// <summary>El grueso de una puerta con su forro (m).</summary>
        public const double Puerta = 0.10;

        /// <summary>El grueso del techo con su forro (m).</summary>
        public const double Techo = 0.08;

        /// <summary>El grueso del vidrio lateral y su marco, con margen (m).</summary>
        public const double Vidrio = 0.03;

        /// <summary>
        /// El modelo 3D que dibuja cada clase (el mismo que baja el visor; bicicleta y scooter no tienen).
        /// </summary>
        public static readonly IReadOnlyDictionary<string, string> ModeloDeClase = new Dictionary<string, string>
        {
            { "sedan_compacto", "sedan" },
            { "sedan_mediano", "sedan" },
            { "hatchback", "hatchback" },
            { "suv_compacta", "suv" },
            { "suv_grande", "suv" },
            { "pickup", "pickup" },
            { "camion_unitario", "camion" },
            { "motocicleta", "moto" },
            { "van", "van" },
            { "microbus_combi", "combi" },
            { "autobus", "autobus" },
            { "tractocamion", "tracto" },
        };

        /// <summary>
        /// El medio ancho interior a la altura `z` (m): el de la puerta, o menos donde la carrocería
        /// medida en el modelo de la clase se mete hacia adentro (los vidrios y el techo), menos el
        /// vidrio. Entre dos alturas medidas, la línea recta; abajo de la primera, la puerta.
        /// </summary>
        public double MedioAncho(double z)
        {
            if (perfilZ == null || z < perfilZ[0])
            {
                return YMax;
            }

            var n = perfilZ.Length;
            double fuera;
            if (z >= perfilZ[n - 1])
            {
                fuera = perfilAncho[n - 1];
            }
            else
            {
                var i = 0;
                while (perfilZ[i + 1] < z)
                {
                    i++;
                }

                var f = (z - perfilZ[i]) / (perfilZ[i + 1] - perfilZ[i]);
                fuera = perfilAncho[i] + f * (perfilAncho[i + 1] - perfilAncho[i]);
            }

            return Math.Min(YMax, fuera - Vidrio);
        }

        /// <summary>El medio ancho interior más chico entre dos alturas (m).</summary>
        public double MedioAnchoMinimo(double z0, double z1)
        {
            var m = Math.Min(MedioAncho(z0), MedioAncho(z1));
            if (perfilZ != null)
            {
                foreach (var z in perfilZ)
                {
                    if (z > z0 && z < z1)
                    {
                        m = Math.Min(m, MedioAncho(z));
                    }
                }
            }

            return m;
        }

        /// <summary>
        /// La cabina de una clase con sus medidas. El medio ancho interior es el exterior menos la
        /// puerta, con tope: en una camioneta de doble rodada o un camión, el ancho de salpicaderas no
        /// es el de la cabina. Más arriba, el perfil medido en el modelo de la clase
        /// (`PerfilCabina`, escalado a sus medidas). Adelante llega al tablero; en un camión o un
        /// tractocamión, la cabina es solo el frente. El piso queda a la distancia de la cadera al
        /// talón de la clase.
        /// </summary>
        public static Cabina De(string clase, double largo, double ancho, double alto)
        {
            var pesado = clase == "camion_unitario" || clase == "tractocamion" || clase == "autobus";
            var yMax = Math.Min(ancho / 2.0 - Puerta, pesado ? 1.1 : 0.8);
            double xMin;
            double xMax;
            switch (clase)
            {
                case "camion_unitario":
                case "tractocamion":
                    // La cabina, al frente: unos 2.4 m de fondo.
                    xMax = largo / 2.0 - 0.45;
                    xMin = largo / 2.0 - 2.6;
                    break;
                case "autobus":
                    xMax = largo / 2.0 - 0.45;
                    xMin = -largo / 2.0 + 0.3;
                    break;
                case "pickup":
                    // La cabina, sin la caja.
                    xMax = 0.26 * largo;
                    xMin = -0.16 * largo;
                    break;
                default:
                    xMax = 0.26 * largo;
                    xMin = -largo / 2.0 + 0.25;
                    break;
            }

            var cadera = Personas.AlturaCadera(clase, alto);
            double[] pz = null;
            double[] pa = null;
            if (clase != null && ModeloDeClase.TryGetValue(clase, out var modelo)
                && PerfilCabina.MedioAncho.TryGetValue(modelo, out var fracciones))
            {
                pz = Array.ConvertAll(PerfilCabina.Z, f => f * alto);
                pa = Array.ConvertAll(fracciones, f => f * ancho / 2.0);
            }

            return new Cabina(xMin, xMax, yMax, cadera - Personas.CaderaAlTalon(clase), alto - Techo, pz, pa);
        }

        /// <summary>¿El punto (marco del vehículo) está dentro, con una tolerancia numérica?</summary>
        public bool Contiene(double x, double y, double z, double tolerancia = 1e-9)
        {
            return x >= XMin - tolerancia && x <= XMax + tolerancia
                && Math.Abs(y) <= MedioAncho(z) + tolerancia
                && z >= ZMin - tolerancia && z <= ZMax + tolerancia;
        }
    }

    /// <summary>
    /// Hasta dónde llega el cuerpo de un ocupante sentado, desde la cadera (el punto H del asiento), en
    /// el marco del vehículo. Simétrico en y. Por alturas: de `ZMin` a `ZCuello`, el cuerpo con los
    /// brazos, tan ancho como los hombros (`YMax`, lo más ancho); de `ZCuello` a `ZMax`, la cabeza
    /// (`YCabeza`).
    /// </summary>
    public readonly struct Envolvente
    {
        public Envolvente(double xMin, double xMax, double yMax, double zMin, double zMax)
            : this(xMin, xMax, yMax, zMin, zMax, zMax, yMax)
        {
        }

        public Envolvente(double xMin, double xMax, double yMax, double zMin, double zMax, double zCuello, double yCabeza)
        {
            XMin = xMin;
            XMax = xMax;
            YMax = yMax;
            ZMin = zMin;
            ZMax = zMax;
            ZCuello = Math.Max(zMin, Math.Min(zCuello, zMax));
            YCabeza = Math.Min(yCabeza, yMax);
        }

        public double XMin { get; }
        public double XMax { get; }
        public double YMax { get; }
        public double ZMin { get; }
        public double ZMax { get; }

        /// <summary>Donde empieza el cuello (m sobre la cadera): arriba solo va la cabeza.</summary>
        public double ZCuello { get; }

        /// <summary>El medio ancho de la cabeza y el cuello, con la piel (m).</summary>
        public double YCabeza { get; }

        /// <summary>
        /// La que contiene a las dos (para sumar la medida de los huesos del modelo): cada franja, la más
        /// ancha, y el cuello, lo más alto (el cuerpo ancho llega más arriba).
        /// </summary>
        public Envolvente Union(Envolvente o)
        {
            return new Envolvente(
                Math.Min(XMin, o.XMin),
                Math.Max(XMax, o.XMax),
                Math.Max(YMax, o.YMax),
                Math.Min(ZMin, o.ZMin),
                Math.Max(ZMax, o.ZMax),
                Math.Max(ZCuello, o.ZCuello),
                Math.Max(YCabeza, o.YCabeza));
        }
    }
}
