using System;
using Croquis.Generated;

namespace Croquis.Core
{
    /// <summary>Cómo va el cuerpo: lo decide la fase del Resultado, no el visor.</summary>
    public enum Postura
    {
        DePie,
        Caminando,
        /// <summary>Sobre la moto o la bicicleta, o sentado en su asiento.</summary>
        Sentado,
        /// <summary>En el aire: se inclina de vertical a tendido a lo largo de la fase.</summary>
        Vuelo,
        Tendido,
    }

    /// <summary>La pose de una persona: dónde está (metros), hacia dónde mira y qué tan inclinada va.</summary>
    public readonly struct PosePersona
    {
        public PosePersona(double x, double y, double z, double rumbo, double inclinacion, Postura postura)
        {
            X = x;
            Y = y;
            Z = z;
            Rumbo = rumbo;
            Inclinacion = inclinacion;
            Postura = postura;
        }

        public double X { get; }
        public double Y { get; }

        /// <summary>La altura del centro de masa sobre el piso, como la da el Resultado.</summary>
        public double Z { get; }

        /// <summary>Antihorario desde +X.</summary>
        public double Rumbo { get; }

        /// <summary>0, vertical; π/2, tendida a lo largo de su rumbo.</summary>
        public double Inclinacion { get; }

        public Postura Postura { get; }
    }

    /// <summary>
    /// Las personas del Resultado (U3): peatones, ciclistas y motociclistas con su trayectoria, y los
    /// ocupantes dentro de su vehículo. Aquí no hay física: todo sale de las trayectorias, las fases y
    /// los desplazamientos que calculó el solver.
    /// </summary>
    public static class Personas
    {
        /// <summary>La fase de la persona en `t`; antes de la primera, la primera; después, la última.</summary>
        public static PersonaFase FaseEn(ResultadoPersona p, double t)
        {
            var fases = p.Fases;
            if (fases == null || fases.Length == 0)
            {
                return null;
            }

            foreach (var f in fases)
            {
                if (t >= f.TInicio && t < f.TFin)
                {
                    return f;
                }
            }

            return t < fases[0].TInicio ? fases[0] : fases[fases.Length - 1];
        }

        public static Postura PosturaDe(FaseFase fase)
        {
            switch (fase)
            {
                case FaseFase.Caminando:
                    return Postura.Caminando;
                case FaseFase.Montado:
                    return Postura.Sentado;
                case FaseFase.Vuelo:
                    return Postura.Vuelo;
                case FaseFase.Deslizamiento:
                case FaseFase.Reposo:
                    return Postura.Tendido;
                default:
                    return Postura.DePie;
            }
        }

        /// <summary>¿Tiene trayectoria propia? Los ocupantes no: van con su vehículo.</summary>
        public static bool TieneTrayectoria(ResultadoPersona p)
        {
            return p.Trayectoria?.T != null && p.Trayectoria.T.Length > 0;
        }

        /// <summary>La pose de una persona con trayectoria propia en el instante `t`.</summary>
        public static PosePersona Pose(ResultadoPersona p, double t)
        {
            var tr = p.Trayectoria;
            Muestreo.Tramo(tr.T, t, out var i, out var f);
            var fase = FaseEn(p, t);
            var postura = fase == null ? Postura.DePie : PosturaDe(fase.Fase);
            double inclinacion;
            switch (postura)
            {
                case Postura.Tendido:
                    inclinacion = Math.PI / 2.0;
                    break;
                case Postura.Vuelo:
                    // De vertical a tendido a lo largo del vuelo: el cuerpo gira sobre el cofre.
                    var dur = fase.TFin - fase.TInicio;
                    var avance = dur > 0.0 ? Math.Min(1.0, Math.Max(0.0, (t - fase.TInicio) / dur)) : 1.0;
                    inclinacion = avance * Math.PI / 2.0;
                    break;
                default:
                    inclinacion = 0.0;
                    break;
            }

            return new PosePersona(
                Muestreo.Lineal(tr.X, i, f),
                Muestreo.Lineal(tr.Y, i, f),
                tr.Z == null || tr.Z.Length == 0 ? 0.0 : Muestreo.Lineal(tr.Z, i, f),
                Muestreo.Angulo(tr.Rumbo, i, f),
                inclinacion,
                postura);
        }

        /// <summary>
        /// Dónde va el asiento en el marco del vehículo (x adelante, y a la izquierda), en metros desde
        /// su centro. Es una colocación para que se vea dentro del habitáculo, no un dato del solver:
        /// adelante, un poco detrás del centro; atrás, a un cuarto del largo; el conductor a la
        /// izquierda (México).
        /// </summary>
        public static (double X, double Y) Asiento(AsientoEnum asiento, double largo, double ancho)
        {
            var adelante = -0.04 * largo;
            var atras = -0.27 * largo;
            var lado = 0.22 * ancho;
            switch (asiento)
            {
                case AsientoEnum.Conductor:
                    return (adelante, lado);
                case AsientoEnum.Copiloto:
                    return (adelante, -lado);
                case AsientoEnum.TraseroIzquierdo:
                    return (atras, lado);
                case AsientoEnum.TraseroDerecho:
                    return (atras, -lado);
                case AsientoEnum.TraseroCentro:
                    return (atras, 0.0);
                case AsientoEnum.TerceraFila:
                    return (-0.4 * largo, 0.0);
                default:
                    return (atras, 0.0);
            }
        }

        /// <summary>
        /// La variante que se dibuja: la del cinturón declarado. Si no se declaró, las dos (primero la
        /// que lo usa); el visor dibuja la segunda tenue.
        /// </summary>
        public static VarianteElement[] VariantesADibujar(Ocupante o)
        {
            if (o?.Variantes == null || o.Variantes.Length == 0)
            {
                return new VarianteElement[0];
            }

            if (o.CinturonDeclarado.HasValue)
            {
                foreach (var v in o.Variantes)
                {
                    if (v.Cinturon == o.CinturonDeclarado.Value)
                    {
                        return new[] { v };
                    }
                }
            }

            var con = Array.Find(o.Variantes, v => v.Cinturon);
            var sin = Array.Find(o.Variantes, v => !v.Cinturon);
            if (con != null && sin != null)
            {
                return new[] { con, sin };
            }

            return new[] { o.Variantes[0] };
        }

        /// <summary>
        /// El desplazamiento del ocupante respecto al habitáculo en `t` (marco del vehículo: x adelante,
        /// y a la izquierda). Antes del impacto, cero; después del último instante, el último.
        /// </summary>
        public static (double Dx, double Dy) Desplazamiento(VarianteElement v, double t)
        {
            if (v?.T == null || v.T.Length == 0 || t <= v.T[0])
            {
                return (0.0, 0.0);
            }

            Muestreo.Tramo(v.T, t, out var i, out var f);
            return (Muestreo.Lineal(v.Dx, i, f), Muestreo.Lineal(v.Dy, i, f));
        }

        /// <summary>
        /// Dónde está el ocupante en el mundo (x, y en metros) a partir de la pose de su vehículo: el
        /// asiento más el desplazamiento, girados con el rumbo.
        /// </summary>
        public static (double X, double Y) EnElMundo(
            PoseVehiculo vehiculo, (double X, double Y) asiento, (double Dx, double Dy) desplazamiento)
        {
            var lx = asiento.X + desplazamiento.Dx;
            var ly = asiento.Y + desplazamiento.Dy;
            var c = Math.Cos(vehiculo.Rumbo);
            var s = Math.Sin(vehiculo.Rumbo);
            return (vehiculo.X + lx * c - ly * s, vehiculo.Y + lx * s + ly * c);
        }
    }
}
