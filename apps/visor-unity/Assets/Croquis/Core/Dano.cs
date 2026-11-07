using System;
using System.Collections.Generic;

namespace Croquis.Core
{
    /// <summary>Un punto o un vector en el marco del vehículo: x adelante, y arriba, z a la derecha.</summary>
    public readonly struct V3
    {
        public V3(double x, double y, double z)
        {
            X = x;
            Y = y;
            Z = z;
        }

        public double X { get; }
        public double Y { get; }
        public double Z { get; }

        public double Punto(V3 o)
        {
            return X * o.X + Y * o.Y + Z * o.Z;
        }

        public static V3 operator *(V3 a, double k)
        {
            return new V3(a.X * k, a.Y * k, a.Z * k);
        }

        public static V3 operator +(V3 a, V3 b)
        {
            return new V3(a.X + b.X, a.Y + b.Y, a.Z + b.Z);
        }

        public double Largo => Math.Sqrt(Punto(this));
    }

    /// <summary>Las medidas de un vehículo que importan para su malla.</summary>
    public readonly struct MedidasVehiculo
    {
        public MedidasVehiculo(double largo, double ancho, double alto, double distanciaEjes)
        {
            Largo = largo;
            Ancho = ancho;
            Alto = alto;
            DistanciaEjes = distanciaEjes;
        }

        public double Largo { get; }
        public double Ancho { get; }
        public double Alto { get; }
        public double DistanciaEjes { get; }
    }

    /// <summary>El perfil de una clase: los mismos valores del visor three.js.</summary>
    public readonly struct PerfilClase
    {
        public PerfilClase(bool dosRuedas, double radioRueda, double alturaLibre, double cintura, double parteDelantera)
        {
            DosRuedas = dosRuedas;
            RadioRueda = radioRueda;
            AlturaLibre = alturaLibre;
            Cintura = cintura;
            ParteDelantera = parteDelantera;
        }

        public bool DosRuedas { get; }
        public double RadioRueda { get; }
        public double AlturaLibre { get; }

        /// <summary>La altura de la cintura, como fracción del alto.</summary>
        public double Cintura { get; }

        /// <summary>Del voladizo total, la fracción que va adelante.</summary>
        public double ParteDelantera { get; }

        private static readonly Dictionary<string, PerfilClase> Perfiles = new Dictionary<string, PerfilClase>
        {
            { "sedan_compacto", new PerfilClase(false, 0.31, 0.16, 0.58, 0.56) },
            { "sedan_mediano", new PerfilClase(false, 0.32, 0.15, 0.58, 0.56) },
            { "hatchback", new PerfilClase(false, 0.30, 0.16, 0.56, 0.58) },
            { "suv_compacta", new PerfilClase(false, 0.35, 0.20, 0.56, 0.55) },
            { "suv_grande", new PerfilClase(false, 0.39, 0.22, 0.56, 0.50) },
            { "pickup", new PerfilClase(false, 0.38, 0.23, 0.55, 0.45) },
            { "van", new PerfilClase(false, 0.34, 0.17, 0.47, 0.45) },
            { "microbus_combi", new PerfilClase(false, 0.35, 0.18, 0.47, 0.45) },
            { "autobus", new PerfilClase(false, 0.50, 0.28, 0.42, 0.48) },
            { "camion_unitario", new PerfilClase(false, 0.47, 0.30, 0.50, 0.35) },
            { "tractocamion", new PerfilClase(false, 0.52, 0.32, 0.50, 0.55) },
            { "motocicleta", new PerfilClase(true, 0.31, 0.0, 0.0, 0.5) },
            { "bicicleta", new PerfilClase(true, 0.34, 0.0, 0.0, 0.5) },
            { "scooter", new PerfilClase(true, 0.11, 0.0, 0.0, 0.5) },
        };

        public static PerfilClase De(string clase)
        {
            return clase != null && Perfiles.TryGetValue(clase, out var p) ? p : Perfiles["sedan_compacto"];
        }
    }

    /// <summary>Los ejes de un vehículo y cómo llevar los arcos de un modelo a ellos.</summary>
    public static class EjesVehiculo
    {
        /// <summary>Si los ejes del modelo y los del caso difieren menos que esto, no se reparte nada.</summary>
        public const double Tolerancia = 0.02;

        public static void Posiciones(string clase, MedidasVehiculo m, out double delantero, out double trasero)
        {
            var p = PerfilClase.De(clase);
            if (p.DosRuedas)
            {
                var d = Math.Min(m.DistanciaEjes, m.Largo - 2.0 * p.RadioRueda + 0.1);
                delantero = d / 2.0;
                trasero = -d / 2.0;
                return;
            }

            var entreEjes = Math.Min(m.DistanciaEjes, 0.92 * m.Largo);
            var voladizo = Math.Max(0.0, m.Largo - entreEjes);
            delantero = m.Largo / 2.0 - voladizo * p.ParteDelantera;
            trasero = delantero - entreEjes;
        }

        /// <summary>
        /// Estira por separado el voladizo delantero, el paso entre ejes y el voladizo trasero para que
        /// los arcos del modelo caigan en los ejes del caso. Los extremos no se mueven. Devuelve null si
        /// ya coinciden.
        /// </summary>
        public static Func<double, double> Reparto(
            double modeloDelantero,
            double modeloTrasero,
            double casoDelantero,
            double casoTrasero,
            double largo)
        {
            var media = largo / 2.0;
            var margen = Math.Min(0.25, largo * 0.08);
            var destinoDelantero = Math.Min(casoDelantero, media - margen);
            var destinoTrasero = Math.Max(casoTrasero, -media + margen);
            if (!(modeloTrasero < modeloDelantero) || !(destinoTrasero < destinoDelantero))
            {
                return null;
            }

            if (Math.Abs(destinoDelantero - modeloDelantero) < Tolerancia
                && Math.Abs(destinoTrasero - modeloTrasero) < Tolerancia)
            {
                return null;
            }

            var entrada = new[] { -media, modeloTrasero, modeloDelantero, media };
            var salida = new[] { -media, destinoTrasero, destinoDelantero, media };
            return x =>
            {
                if (x <= entrada[0])
                {
                    return x;
                }

                for (var k = 0; k < 3; k++)
                {
                    if (x <= entrada[k + 1])
                    {
                        var ancho = entrada[k + 1] - entrada[k];
                        var f = ancho > 0.0 ? (x - entrada[k]) / ancho : 0.0;
                        return salida[k] + f * (salida[k + 1] - salida[k]);
                    }
                }

                return x;
            };
        }
    }

    /// <summary>El daño de un impacto, tal como lo entrega el solver.</summary>
    public sealed class EntradaDano
    {
        /// <summary>La cara golpeada: F, B, L o R.</summary>
        public char Lado;

        /// <summary>El perfil C1 a C6, en metros.</summary>
        public double[] Perfil;

        public double Ancho;

        /// <summary>Centro del ancho a lo largo de la cara: + a la izquierda en F y B, + adelante en L y R.</summary>
        public double Centro;

        /// <summary>La zona vertical del CDC, o nulo.</summary>
        public char? ZonaVertical;
    }

    /// <summary>
    /// Del perfil del solver a una deformación por vértice (docs/physics.md, «Del perfil del solver al
    /// daño visual»): d(p) = n · c(u) · m(y) · w(δ). Unity no calcula daño: traduce este perfil.
    /// </summary>
    public sealed class CampoDano
    {
        /// <summary>Caída del perfil fuera del ancho dañado.</summary>
        public const double Caida = 0.15;

        private const double Arruga = 0.03;

        private readonly EntradaDano entrada;
        private readonly double cara;
        private readonly V3 afuera;
        private readonly V3 aLoLargo;
        private readonly double y0;
        private readonly double y1;

        public CampoDano(EntradaDano entrada, string clase, MedidasVehiculo m)
        {
            this.entrada = entrada;
            switch (entrada.Lado)
            {
                case 'F':
                    afuera = new V3(1, 0, 0);
                    aLoLargo = new V3(0, 0, -1);
                    cara = m.Largo / 2.0;
                    break;
                case 'B':
                    afuera = new V3(-1, 0, 0);
                    aLoLargo = new V3(0, 0, -1);
                    cara = m.Largo / 2.0;
                    break;
                case 'L':
                    afuera = new V3(0, 0, -1);
                    aLoLargo = new V3(1, 0, 0);
                    cara = m.Ancho / 2.0;
                    break;
                case 'R':
                    afuera = new V3(0, 0, 1);
                    aLoLargo = new V3(1, 0, 0);
                    cara = m.Ancho / 2.0;
                    break;
                default:
                    throw new ArgumentException("El daño visual solo existe en las caras F, B, L y R.");
            }

            RangoVertical(entrada.ZonaVertical, clase, m, out y0, out y1);
            BandaMedicion(entrada.ZonaVertical, clase, m, out var b0, out var b1);
            Banda0 = b0;
            Banda1 = b1;
        }

        public double Banda0 { get; }
        public double Banda1 { get; }
        public V3 Afuera => afuera;
        public V3 ALoLargo => aLoLargo;

        private static double Paso(double a, double b, double x)
        {
            var t = Math.Min(1.0, Math.Max(0.0, (x - a) / (b - a)));
            return t * t * (3.0 - 2.0 * t);
        }

        /// <summary>c(u): el perfil a lo largo de la cara, con caída suave fuera del ancho.</summary>
        public double Aplastamiento(double u)
        {
            var p = entrada.Perfil;
            if (p == null || p.Length != 6 || entrada.Ancho <= 0.0)
            {
                return 0.0;
            }

            // C1 está en el extremo izquierdo (frente y atrás) o delantero (costados): u máximo.
            var s = 0.5 - (u - entrada.Centro) / entrada.Ancho;
            if (s >= 0.0 && s <= 1.0)
            {
                var x = s * 5.0;
                var i = Math.Min(4, (int)Math.Floor(x));
                return p[i] + (p[i + 1] - p[i]) * (x - i);
            }

            var borde = s < 0.0 ? p[0] : p[5];
            var fuera = (s < 0.0 ? -s : s - 1.0) * entrada.Ancho;
            return borde * (1.0 - Paso(0.0, Caida, fuera));
        }

        /// <summary>El desplazamiento de un punto, sin arrugas; también su peso y su c(u).</summary>
        public V3 Desplazamiento(V3 p, out double peso, out double c)
        {
            c = Aplastamiento(p.Punto(aLoLargo));
            if (c <= 0.0)
            {
                peso = 0.0;
                return new V3(0, 0, 0);
            }

            var profundidad = Math.Max(0.0, cara - p.Punto(afuera));
            var w = 1.0 - Paso(0.0, 1.6 * c + 0.3, profundidad);
            var m = Paso(y0 - 0.1, y0 + 0.1, p.Y) * (1.0 - Paso(y1 - 0.1, y1 + 0.1, p.Y));
            peso = m * w;
            return afuera * (-c * peso);
        }

        /// <summary>
        /// Los desplazamientos de una malla, por vértice, con arrugas de ±3 % de c(u) suavizadas sobre la
        /// malla soldada. Es determinista con la semilla.
        /// </summary>
        public V3[] Hornear(V3[] vertices, int[] triangulos, int semilla)
        {
            var ids = new int[vertices.Length];
            var mapa = new Dictionary<(long, long, long), int>();
            for (var i = 0; i < vertices.Length; i++)
            {
                var llave = (
                    (long)Math.Round(vertices[i].X * 1e4),
                    (long)Math.Round(vertices[i].Y * 1e4),
                    (long)Math.Round(vertices[i].Z * 1e4));
                if (!mapa.TryGetValue(llave, out var id))
                {
                    id = mapa.Count;
                    mapa[llave] = id;
                }

                ids[i] = id;
            }

            var n = mapa.Count;
            var principal = new V3[n];
            var peso = new double[n];
            var ruido = new double[n * 3];
            var visto = new bool[n];
            for (var i = 0; i < vertices.Length; i++)
            {
                var id = ids[i];
                if (visto[id])
                {
                    continue;
                }

                visto[id] = true;
                var p = vertices[i];
                principal[id] = Desplazamiento(p, out var w, out var c);
                peso[id] = w;
                if (w > 0.0)
                {
                    var a = Arruga * c * w;
                    ruido[3 * id] = a * Ruido(p.X * 7, p.Y * 7, p.Z * 7, semilla);
                    ruido[3 * id + 1] = a * Ruido(p.X * 7 + 31, p.Y * 7, p.Z * 7, semilla);
                    ruido[3 * id + 2] = a * Ruido(p.X * 7, p.Y * 7 + 17, p.Z * 7, semilla);
                }
            }

            var vecinos = new List<int>[n];
            for (var v = 0; v < n; v++)
            {
                vecinos[v] = new List<int>();
            }

            for (var t = 0; t + 2 < triangulos.Length; t += 3)
            {
                var a = ids[triangulos[t]];
                var b = ids[triangulos[t + 1]];
                var c = ids[triangulos[t + 2]];
                vecinos[a].Add(b);
                vecinos[a].Add(c);
                vecinos[b].Add(a);
                vecinos[b].Add(c);
                vecinos[c].Add(a);
                vecinos[c].Add(b);
            }

            // Dos pasadas de suavizado laplaciano, con λ = 0.5.
            for (var pasada = 0; pasada < 2; pasada++)
            {
                var siguiente = (double[])ruido.Clone();
                for (var v = 0; v < n; v++)
                {
                    if (vecinos[v].Count == 0 || peso[v] == 0.0)
                    {
                        continue;
                    }

                    for (var k = 0; k < 3; k++)
                    {
                        var suma = 0.0;
                        foreach (var j in vecinos[v])
                        {
                            suma += ruido[3 * j + k];
                        }

                        siguiente[3 * v + k] = 0.5 * ruido[3 * v + k] + 0.5 * (suma / vecinos[v].Count);
                    }
                }

                ruido = siguiente;
            }

            var salida = new V3[vertices.Length];
            for (var i = 0; i < vertices.Length; i++)
            {
                var id = ids[i];
                salida[i] = principal[id] + new V3(ruido[3 * id], ruido[3 * id + 1], ruido[3 * id + 2]);
            }

            return salida;
        }

        /// <summary>
        /// Mide el perfil sobre la malla deformada, en las 6 estaciones del solver: es lo que comprueba
        /// la tolerancia de docs/physics.md (2 cm o 6 %).
        /// </summary>
        public double[] MedirPerfil(V3[] vertices, V3[] desplazamientos)
        {
            var mitad = (Banda0 + Banda1) / 2.0;
            var banda = Math.Max(0.05, Math.Min(0.15, (Banda1 - Banda0) / 2.0));
            const double Cubeta = 0.02;
            var puntos = new List<(double U, double Antes, double Hundido)>();
            var cubetas = new Dictionary<long, double>();
            for (var i = 0; i < vertices.Length; i++)
            {
                var p = vertices[i];
                if (Math.Abs(p.Y - mitad) > banda)
                {
                    continue;
                }

                var u = p.Punto(aLoLargo);
                var antes = p.Punto(afuera);
                puntos.Add((u, antes, -desplazamientos[i].Punto(afuera)));
                var b = (long)Math.Floor(u / Cubeta);
                cubetas[b] = cubetas.TryGetValue(b, out var maximo) ? Math.Max(maximo, antes) : antes;
            }

            // La superficie exterior: a menos de 1 cm del vértice más externo en ±10 cm a lo largo.
            var exterior = new List<(double U, double Hundido)>();
            foreach (var q in puntos)
            {
                var b = (long)Math.Floor(q.U / Cubeta);
                var local = double.NegativeInfinity;
                for (var k = b - 5; k <= b + 5; k++)
                {
                    if (cubetas.TryGetValue(k, out var v))
                    {
                        local = Math.Max(local, v);
                    }
                }

                if (q.Antes >= local - 0.01)
                {
                    exterior.Add((q.U, q.Hundido));
                }
            }

            var medido = new double[6];
            for (var k = 0; k < 6; k++)
            {
                medido[k] = Interpolar(exterior, entrada.Centro + (0.5 - k / 5.0) * entrada.Ancho);
            }

            return medido;
        }

        private static double Interpolar(List<(double U, double Hundido)> exterior, double u)
        {
            (double U, double Hundido)? lo = null;
            (double U, double Hundido)? hi = null;
            foreach (var q in exterior)
            {
                if (q.U <= u && (lo == null || q.U > lo.Value.U || (q.U == lo.Value.U && q.Hundido > lo.Value.Hundido)))
                {
                    lo = q;
                }

                if (q.U >= u && (hi == null || q.U < hi.Value.U || (q.U == hi.Value.U && q.Hundido > hi.Value.Hundido)))
                {
                    hi = q;
                }
            }

            if (lo != null && hi != null)
            {
                return hi.Value.U != lo.Value.U
                    ? lo.Value.Hundido + (hi.Value.Hundido - lo.Value.Hundido) * (u - lo.Value.U) / (hi.Value.U - lo.Value.U)
                    : Math.Max(lo.Value.Hundido, hi.Value.Hundido);
            }

            // En el borde de la cara solo hay vértices de un lado: se extrapola con los dos más cercanos.
            var lado = new List<(double U, double Hundido)>();
            foreach (var q in exterior)
            {
                if (lo != null ? q.U <= u : q.U >= u)
                {
                    lado.Add(q);
                }
            }

            lado.Sort((a, b) => Math.Abs(a.U - u).CompareTo(Math.Abs(b.U - u)));
            if (lado.Count == 0)
            {
                return double.NaN;
            }

            var primero = lado[0];
            foreach (var q in lado)
            {
                if (Math.Abs(q.U - primero.U) > 0.01)
                {
                    return Math.Max(0.0, primero.Hundido + (q.Hundido - primero.Hundido) * (u - primero.U) / (q.U - primero.U));
                }
            }

            return primero.Hundido;
        }

        private static void AlturaLibreYCintura(string clase, MedidasVehiculo m, out double libre, out double cintura)
        {
            var p = PerfilClase.De(clase);
            if (p.DosRuedas)
            {
                libre = 0.2;
                cintura = 0.7 * m.Alto;
                return;
            }

            libre = Math.Min(p.AlturaLibre, 0.3 * m.Alto);
            cintura = Math.Max(libre + 0.25, p.Cintura * m.Alto);
        }

        private static void RangoVertical(char? zona, string clase, MedidasVehiculo m, out double a, out double b)
        {
            AlturaLibreYCintura(clase, m, out var libre, out var cintura);
            switch (zona)
            {
                case 'A':
                    a = 0.0;
                    b = m.Alto;
                    break;
                case 'G':
                    a = 0.0;
                    b = cintura;
                    break;
                case 'H':
                    a = cintura - 0.15;
                    b = cintura + 0.25;
                    break;
                case 'L':
                    a = libre;
                    b = libre + 0.45;
                    break;
                case 'M':
                    a = libre + 0.35;
                    b = cintura;
                    break;
                case 'W':
                    a = cintura;
                    b = m.Alto;
                    break;
                default:
                    a = libre;
                    b = m.Alto;
                    break;
            }
        }

        /// <summary>
        /// Donde se mide el perfil: la estructura, de la altura libre a la cintura, salvo en las zonas de
        /// cofre o ventanas. Así coincide con lo que mide CRASH3.
        /// </summary>
        private static void BandaMedicion(char? zona, string clase, MedidasVehiculo m, out double a, out double b)
        {
            RangoVertical(zona, clase, m, out var r0, out var r1);
            if (zona == 'W' || zona == 'H')
            {
                a = r0;
                b = r1;
                return;
            }

            AlturaLibreYCintura(clase, m, out var libre, out var cintura);
            var lo = Math.Max(r0, libre + 0.05);
            var hi = Math.Min(r1, cintura - 0.05);
            a = hi > lo ? lo : r0;
            b = hi > lo ? hi : r1;
        }

        private static double Hash(int ix, int iy, int iz, int semilla)
        {
            unchecked
            {
                var h = ix * 374761393 + iy * 668265263 + iz * 2147483647 + semilla * 144269504;
                h = (h ^ (int)((uint)h >> 13)) * 1274126177;
                h ^= (int)((uint)h >> 16);
                return (uint)h / 4294967296.0;
            }
        }

        private static double Ruido(double x, double y, double z, int semilla)
        {
            var ix = (int)Math.Floor(x);
            var iy = (int)Math.Floor(y);
            var iz = (int)Math.Floor(z);
            var fx = x - ix;
            var fy = y - iy;
            var fz = z - iz;
            var sx = fx * fx * (3.0 - 2.0 * fx);
            var sy = fy * fy * (3.0 - 2.0 * fy);
            var sz = fz * fz * (3.0 - 2.0 * fz);
            var v = 0.0;
            for (var dz = 0; dz <= 1; dz++)
            {
                for (var dy = 0; dy <= 1; dy++)
                {
                    for (var dx = 0; dx <= 1; dx++)
                    {
                        var w = (dx == 1 ? sx : 1.0 - sx) * (dy == 1 ? sy : 1.0 - sy) * (dz == 1 ? sz : 1.0 - sz);
                        v += w * Hash(ix + dx, iy + dy, iz + dz, semilla);
                    }
                }
            }

            return 2.0 * v - 1.0;
        }
    }
}
