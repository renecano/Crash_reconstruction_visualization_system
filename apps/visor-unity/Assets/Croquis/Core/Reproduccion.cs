using System;
using Croquis.Generated;
using Newtonsoft.Json;

namespace Croquis.Core
{
    /// <summary>Lectura del paquete caso-3d: la única entrada del visor.</summary>
    public static class Paquete
    {
        public const string VersionAdmitida = "1.0.0";

        /// <summary>
        /// El `version_caso3d` del primer nivel, leyendo solo hasta encontrarlo (`armarCaso3d` lo pone
        /// primero). Null si no lo trae.
        /// </summary>
        public static string VersionDe(string json)
        {
            using var lector = new JsonTextReader(new System.IO.StringReader(json));
            while (lector.Read())
            {
                if (lector.Depth == 1 && lector.TokenType == JsonToken.PropertyName)
                {
                    if ((string)lector.Value == "version_caso3d")
                    {
                        return lector.ReadAsString();
                    }

                    lector.Skip();
                }
            }

            return null;
        }

        /// <summary>
        /// El texto de una propiedad de primer nivel de un objeto JSON (por ejemplo, el `json` del
        /// mensaje `cargarCaso`), sin armar el objeto entero. Null si no la trae.
        /// </summary>
        public static string PropiedadDeTexto(string json, string nombre)
        {
            using var lector = new JsonTextReader(new System.IO.StringReader(json));
            while (lector.Read())
            {
                if (lector.Depth == 1 && lector.TokenType == JsonToken.PropertyName)
                {
                    if ((string)lector.Value == nombre)
                    {
                        return lector.ReadAsString();
                    }

                    lector.Skip();
                }
            }

            return null;
        }

        /// <summary>Lee el paquete y rechaza lo que el visor dibujaría mal.</summary>
        /// <exception cref="FormatException">El texto no es un paquete que este visor pueda abrir.</exception>
        public static Caso3D Leer(string json)
        {
            Caso3D caso;
            try
            {
                // La versión va primero: el tipo generado solo conoce la suya y, con otra, no diría cuál es.
                // Se lee en flujo y se detiene al encontrarla: leer el paquete entero dos veces costaba
                // segundos en WebGL (U6).
                var version = VersionDe(json);
                if (version != VersionAdmitida)
                {
                    throw new FormatException(
                        "Este visor abre paquetes " + VersionAdmitida + " y el archivo es " + (version ?? "sin versión") + ".");
                }

                caso = Caso3D.FromJson(json);
            }
            catch (JsonException e)
            {
                throw new FormatException("El archivo no es un paquete caso-3d: " + e.Message, e);
            }
            catch (Exception e) when (!(e is FormatException))
            {
                throw new FormatException("El archivo no es un paquete caso-3d: " + e.Message, e);
            }

            if (caso.Escena == null || caso.Resultado == null)
            {
                throw new FormatException("El paquete caso-3d no trae escena o resultado.");
            }

            return caso;
        }

    }

    /// <summary>La pose de un vehículo en el marco de Croquis: metros y radianes.</summary>
    public readonly struct PoseVehiculo
    {
        public PoseVehiculo(double x, double y, double z, double rumbo, double cabeceo, double alabeo)
        {
            X = x;
            Y = y;
            Z = z;
            Rumbo = rumbo;
            Cabeceo = cabeceo;
            Alabeo = alabeo;
        }

        public double X { get; }
        public double Y { get; }
        public double Z { get; }

        /// <summary>Antihorario desde +X.</summary>
        public double Rumbo { get; }

        /// <summary>Positivo, la nariz hacia arriba.</summary>
        public double Cabeceo { get; }

        /// <summary>Positivo, el costado derecho hacia abajo.</summary>
        public double Alabeo { get; }
    }

    /// <summary>La misma pose para un Transform de Unity: posición y ángulos de Euler en grados.</summary>
    public readonly struct PoseUnity
    {
        public PoseUnity(double px, double py, double pz, double eulerX, double eulerY, double eulerZ)
        {
            Px = px;
            Py = py;
            Pz = pz;
            EulerX = eulerX;
            EulerY = eulerY;
            EulerZ = eulerZ;
        }

        public double Px { get; }
        public double Py { get; }
        public double Pz { get; }
        public double EulerX { get; }
        public double EulerY { get; }
        public double EulerZ { get; }
    }

    /// <summary>
    /// Croquis usa X al este, Y al norte y rumbo antihorario desde +X. En Unity, posición = (x, z, y) y
    /// yaw = 90° − rumbo. El frente del vehículo en Unity es +Z local.
    /// </summary>
    public static class Ejes
    {
        private const double GradosPorRadian = 180.0 / Math.PI;

        public static PoseUnity AUnity(PoseVehiculo p)
        {
            // El eje X de Unity baja la nariz con ángulos positivos y el Z sube el costado derecho:
            // los dos van al revés que cabeceo y alabeo.
            return new PoseUnity(
                p.X,
                p.Z,
                p.Y,
                -p.Cabeceo * GradosPorRadian,
                90.0 - p.Rumbo * GradosPorRadian,
                -p.Alabeo * GradosPorRadian);
        }

        public static PoseVehiculo DeUnity(PoseUnity u)
        {
            return new PoseVehiculo(
                u.Px,
                u.Pz,
                u.Py,
                (90.0 - u.EulerY) / GradosPorRadian,
                -u.EulerX / GradosPorRadian,
                -u.EulerZ / GradosPorRadian);
        }

        /// <summary>El ángulo equivalente en (−π, π].</summary>
        public static double NormalizarAngulo(double a)
        {
            var dosPi = 2.0 * Math.PI;
            var r = a - dosPi * Math.Floor((a + Math.PI) / dosPi);
            return r <= -Math.PI ? r + dosPi : r;
        }
    }

    /// <summary>
    /// Lee las trayectorias en cualquier instante: lineal entre muestras y el rumbo por el camino
    /// angular más corto. Fuera del intervalo se mantiene el extremo. Aquí no hay física.
    /// </summary>
    public static class Muestreo
    {
        /// <summary>Índice i y fracción f tales que t[i] ≤ tiempo ≤ t[i + 1]; fuera, el extremo.</summary>
        public static void Tramo(double[] t, double tiempo, out int i, out double f)
        {
            var n = t == null ? 0 : t.Length;
            if (n == 0)
            {
                throw new ArgumentException("La trayectoria está vacía.", nameof(t));
            }

            if (n == 1 || tiempo <= t[0])
            {
                i = 0;
                f = 0.0;
                return;
            }

            if (tiempo >= t[n - 1])
            {
                i = n - 2;
                f = 1.0;
                return;
            }

            var lo = 0;
            var hi = n - 1;
            while (hi - lo > 1)
            {
                var mitad = (lo + hi) >> 1;
                if (t[mitad] <= tiempo)
                {
                    lo = mitad;
                }
                else
                {
                    hi = mitad;
                }
            }

            i = lo;
            var dt = t[lo + 1] - t[lo];
            f = dt > 0.0 ? (tiempo - t[lo]) / dt : 0.0;
        }

        public static PoseVehiculo Pose(VehiculoTrayectoria tr, double tiempo)
        {
            Tramo(tr.T, tiempo, out var i, out var f);
            return new PoseVehiculo(
                Lineal(tr.X, i, f),
                Lineal(tr.Y, i, f),
                Opcional(tr.Z, i, f),
                Angulo(tr.Rumbo, i, f),
                Opcional(tr.Cabeceo, i, f),
                Opcional(tr.Alabeo, i, f));
        }

        internal static double Lineal(double[] v, int i, double f)
        {
            if (i + 1 >= v.Length)
            {
                return v[i];
            }

            if (f <= 0.0)
            {
                return v[i];
            }

            return f >= 1.0 ? v[i + 1] : v[i] + (v[i + 1] - v[i]) * f;
        }

        /// <summary>Un arreglo opcional (desde 1.14.0): sin él, el vehículo va plano.</summary>
        private static double Opcional(double[] v, int i, double f)
        {
            return v == null || v.Length == 0 ? 0.0 : Lineal(v, i, f);
        }

        internal static double Angulo(double[] v, int i, double f)
        {
            if (i + 1 >= v.Length)
            {
                return Ejes.NormalizarAngulo(v[i]);
            }

            return Ejes.NormalizarAngulo(v[i] + Ejes.NormalizarAngulo(v[i + 1] - v[i]) * f);
        }
    }

    /// <summary>La zona de interés: lo que encuadra «Ir al impacto».</summary>
    public readonly struct ZonaInteres
    {
        public ZonaInteres(double centroX, double centroY, double lado)
        {
            CentroX = centroX;
            CentroY = centroY;
            Lado = lado;
        }

        public double CentroX { get; }
        public double CentroY { get; }
        public double Lado { get; }
    }

    public static class Encuadre
    {
        /// <summary>La ventana de tiempo alrededor del impacto que se encuadra.</summary>
        public const double VentanaInicio = -1.2;
        public const double VentanaFin = 2.0;
        private const double MediaCajaMinima = 5.0;

        /// <summary>
        /// Las posiciones de los vehículos involucrados (o de todos) en la ventana, centradas en el
        /// punto de impacto cuando existe: es lo que más importa ver.
        /// </summary>
        public static ZonaInteres ZonaDeInteres(Caso3DResultado r)
        {
            var hayInvolucrados = false;
            foreach (var v in r.Vehiculos)
            {
                hayInvolucrados |= v.Involucrado;
            }

            var minX = double.PositiveInfinity;
            var minY = double.PositiveInfinity;
            var maxX = double.NegativeInfinity;
            var maxY = double.NegativeInfinity;
            foreach (var v in r.Vehiculos)
            {
                if (hayInvolucrados && !v.Involucrado)
                {
                    continue;
                }

                var tr = v.Trayectoria;
                for (var i = 0; i < tr.T.Length; i++)
                {
                    if (tr.T[i] < VentanaInicio || tr.T[i] > VentanaFin)
                    {
                        continue;
                    }

                    minX = Math.Min(minX, tr.X[i]);
                    maxX = Math.Max(maxX, tr.X[i]);
                    minY = Math.Min(minY, tr.Y[i]);
                    maxY = Math.Max(maxY, tr.Y[i]);
                }
            }

            if (double.IsInfinity(minX))
            {
                return new ZonaInteres(0.0, 0.0, 20.0);
            }

            var cx = r.PuntoImpacto != null ? r.PuntoImpacto.X : (minX + maxX) / 2.0;
            var cy = r.PuntoImpacto != null ? r.PuntoImpacto.Y : (minY + maxY) / 2.0;
            var media = Math.Max(
                Math.Max(maxX - cx, cx - minX),
                Math.Max(Math.Max(maxY - cy, cy - minY), MediaCajaMinima));
            return new ZonaInteres(cx, cy, 2.0 * media);
        }

        /// <summary>Margen de «Ver todo» alrededor de lo que importa (m).</summary>
        public const double MargenVerTodo = 6.0;

        /// <summary>
        /// «Ver todo» (U4, O3): la caja de las trayectorias completas, los reposos, el punto de impacto,
        /// las evidencias, los marcadores de C1, los objetos y las personas, con margen. Es lo mismo
        /// que encuadra la maqueta en 2D (W6, ADR 0132).
        /// </summary>
        public static CajaPlano VerTodo(Caso3D caso)
        {
            var c = new CajaPlano();
            var r = caso.Resultado;
            foreach (var v in r.Vehiculos)
            {
                var tr = v.Trayectoria;
                for (var i = 0; i < tr.T.Length; i++)
                {
                    c.Agregar(tr.X[i], tr.Y[i]);
                }

                if (v.PoseFinal != null)
                {
                    c.Agregar(v.PoseFinal.X, v.PoseFinal.Y);
                }
            }

            if (r.PuntoImpacto != null)
            {
                c.Agregar(r.PuntoImpacto.X, r.PuntoImpacto.Y);
            }

            foreach (var o in r.Objetos ?? new ResultadoObjeto[0])
            {
                c.Agregar(o.X, o.Y);
            }

            foreach (var p in r.Personas ?? new ResultadoPersona[0])
            {
                var tr = p.Trayectoria;
                for (var i = 0; tr?.T != null && i < tr.T.Length; i++)
                {
                    c.Agregar(tr.X[i], tr.Y[i]);
                }
            }

            var e = caso.Escenario;
            foreach (var ev in e?.Evidencias ?? new EvidenciaEscenario[0])
            {
                foreach (var q in ev.Puntos ?? new PuntoPlano[0])
                {
                    c.Agregar(q.X, q.Y);
                }
            }

            foreach (var m in e?.Marcadores ?? new MarcadorEscenario[0])
            {
                c.Agregar(m.X, m.Y);
            }

            c.Expandir(MargenVerTodo, 2.0 * MediaCajaMinima);
            return c;
        }
    }

    /// <summary>Lo que necesitan las cámaras para encuadrar (U4): distancias y cajas, sin Unity.</summary>
    public static class Lente
    {
        /// <summary>
        /// La distancia, a lo largo del eje de la cámara, a la que un rectángulo de `ancho` × `alto`
        /// (perpendicular al eje) cabe entero en una cámara de campo vertical `vfovGrados` y proporción
        /// `aspecto` (ancho / alto de la pantalla).
        /// </summary>
        public static double DistanciaParaVer(double ancho, double alto, double vfovGrados, double aspecto)
        {
            var tv = Math.Tan(vfovGrados * Math.PI / 360.0);
            var th = tv * aspecto;
            return Math.Max(alto / 2.0 / tv, ancho / 2.0 / th);
        }

        /// <summary>
        /// La caja de los vehículos involucrados (o de todos) en el instante `t`, más el punto de
        /// impacto: lo que la cinematográfica debe llenar para que los coches no salgan chicos. Cada
        /// vehículo cuenta con su largo alrededor de su centro.
        /// </summary>
        public static CajaPlano VehiculosEn(Caso3DResultado r, double t)
        {
            var c = new CajaPlano();
            var hayInvolucrados = false;
            foreach (var v in r.Vehiculos)
            {
                hayInvolucrados |= v.Involucrado;
            }

            foreach (var v in r.Vehiculos)
            {
                if (hayInvolucrados && !v.Involucrado)
                {
                    continue;
                }

                var p = Muestreo.Pose(v.Trayectoria, t);
                var medio = v.Dimensiones.LargoM / 2.0;
                c.Agregar(p.X - medio, p.Y - medio);
                c.Agregar(p.X + medio, p.Y + medio);
            }

            if (r.PuntoImpacto != null)
            {
                c.Agregar(r.PuntoImpacto.X, r.PuntoImpacto.Y);
            }

            return c;
        }
    }

    /// <summary>Una caja en planta, en metros de Croquis (X al este, Y al norte).</summary>
    public sealed class CajaPlano
    {
        public double MinX { get; private set; } = double.PositiveInfinity;
        public double MinY { get; private set; } = double.PositiveInfinity;
        public double MaxX { get; private set; } = double.NegativeInfinity;
        public double MaxY { get; private set; } = double.NegativeInfinity;

        public bool Vacia => double.IsInfinity(MinX);
        public double CentroX => (MinX + MaxX) / 2.0;
        public double CentroY => (MinY + MaxY) / 2.0;
        public double Ancho => MaxX - MinX;
        public double Alto => MaxY - MinY;

        public void Agregar(double x, double y)
        {
            if (double.IsNaN(x) || double.IsNaN(y) || double.IsInfinity(x) || double.IsInfinity(y))
            {
                return;
            }

            MinX = Math.Min(MinX, x);
            MinY = Math.Min(MinY, y);
            MaxX = Math.Max(MaxX, x);
            MaxY = Math.Max(MaxY, y);
        }

        public bool Contiene(double x, double y)
        {
            return x >= MinX - 1e-9 && x <= MaxX + 1e-9 && y >= MinY - 1e-9 && y <= MaxY + 1e-9;
        }

        /// <summary>Agranda la caja `margen` metros por lado, y al menos a `minimo` por lado.</summary>
        public void Expandir(double margen, double minimo)
        {
            if (Vacia)
            {
                MinX = MinY = -minimo / 2.0;
                MaxX = MaxY = minimo / 2.0;
                return;
            }

            MinX -= margen;
            MinY -= margen;
            MaxX += margen;
            MaxY += margen;
            if (Ancho < minimo)
            {
                var cx = CentroX;
                MinX = cx - minimo / 2.0;
                MaxX = cx + minimo / 2.0;
            }

            if (Alto < minimo)
            {
                var cy = CentroY;
                MinY = cy - minimo / 2.0;
                MaxY = cy + minimo / 2.0;
            }
        }
    }
}
