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
        public static (double X, double Y) Asiento(AsientoEnum asiento, double largo, double ancho, string clase = null)
        {
            var adelante = -0.04 * largo;
            var atras = -0.27 * largo;
            var lado = 0.22 * ancho;
            // En una camioneta la fila de atrás va en la cabina, no en la caja; en un camión o un
            // tractocamión, las dos van al frente, en su cabina; en un autobús, el chofer al frente y
            // los demás a media nave (`Cabina.De`).
            switch (clase)
            {
                case "pickup":
                    atras = -0.10 * largo;
                    break;
                case "camion_unitario":
                case "tractocamion":
                    adelante = largo / 2.0 - 1.55;
                    atras = largo / 2.0 - 2.0;
                    lado = Math.Min(lado, 0.45);
                    break;
                case "autobus":
                    adelante = largo / 2.0 - 1.3;
                    atras = 0.0;
                    lado = Math.Min(lado, 0.45);
                    break;
            }
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
        /// La altura de la cadera del ocupante sobre el suelo (m), por clase. Es la colocación ilustrativa
        /// del cuerpo en el asiento, no un dato del solver: un sedán va a la altura de siempre (0.52 m) y
        /// una camioneta, una van o un camión llevan el asiento más arriba. Nunca pasa de 55 % del alto.
        /// </summary>
        public static double AlturaCadera(string clase, double alto)
        {
            double h;
            switch (clase)
            {
                case "suv_compacta":
                    h = 0.68;
                    break;
                case "suv_grande":
                    h = 0.78;
                    break;
                case "pickup":
                    h = 0.86;
                    break;
                case "van":
                case "microbus_combi":
                    h = 0.82;
                    break;
                case "autobus":
                    h = 1.25;
                    break;
                case "camion_unitario":
                    h = 1.35;
                    break;
                case "tractocamion":
                    h = 1.55;
                    break;
                default:
                    h = 0.52;
                    break;
            }

            return Math.Min(h, 0.55 * alto);
        }

        /// <summary>
        /// De la cadera (punto H) al talón, en vertical, por clase (m): un auto lleva las piernas más
        /// estiradas que una camioneta o un camión. Fija dónde queda el piso de la cabina.
        /// </summary>
        public static double CaderaAlTalon(string clase)
        {
            switch (clase)
            {
                case "suv_compacta":
                case "suv_grande":
                case "pickup":
                case "van":
                    return 0.36;
                case "microbus_combi":
                    return 0.38;
                case "autobus":
                case "camion_unitario":
                case "tractocamion":
                    return 0.45;
                default:
                    return 0.27;
            }
        }

        // Longitudes de los segmentos como fracción de la estatura (Drillis y Contini, 1966, en Winter,
        // «Biomechanics and Motor Control of Human Movement», 4.ª ed., 2009, fig. 4.1).
        private const double Muslo = 0.245;
        private const double Pierna = 0.246;
        private const double Pie = 0.152;
        private const double BrazoSuperior = 0.186;
        private const double Antebrazo = 0.146;
        private const double Mano = 0.108;
        private const double MedioHombros = 0.259 / 2.0;
        private const double HombroSobreCadera = 0.818 - 0.530;
        private const double CabezaSobreCadera = 1.0 - 0.530;

        /// <summary>
        /// Donde empieza el cuello, sobre la cadera: arriba de 0.86 de la estatura, los cuerpos que
        /// dibuja el visor (MakeHuman: adulto, mayor y niño) miden a lo más 0.058 de la estatura de
        /// medio ancho; los hombros, 0.13 a 0.14 (U6, medido en los .glb de `modelos/personas`).
        /// </summary>
        private const double CuelloSobreCadera = 0.86 - 0.530;

        /// <summary>El medio ancho de la cabeza y el cuello (de la misma medición, redondeado arriba).</summary>
        private const double MedioAnchoCabeza = 0.06;

        /// <summary>El grueso del brazo hacia afuera del hombro y la espalda detrás de la cadera (fracción).</summary>
        private const double BrazoAfuera = 0.035;

        private const double EspaldaAtras = 0.10;

        /// <summary>Lo que la piel y la ropa sobresalen de los huesos (m).</summary>
        public const double Piel = 0.04;

        /// <summary>El muslo sentado, desde la vertical (°): como lo dobla el visor.</summary>
        public const double MusloSentado = 85.0;

        /// <summary>El brazo hacia el volante desde la vertical, y el antebrazo, 30° más (°).</summary>
        public const double BrazoSentado = 40.0;

        public const double AntebrazoSentado = 30.0;

        private static double Rad(double grados) => grados * Math.PI / 180.0;

        /// <summary>Lo más que se recarga el respaldo para que la cabeza quepa bajo el techo (°).</summary>
        public const double RecargueMaximo = 30.0;

        /// <summary>
        /// Los puntos del cuerpo sentado como lo dibuja el visor (muslo a 85°, la rodilla doblada
        /// `rodilla` grados, brazos al volante), desde la cadera, en (x adelante, z arriba), recargado
        /// `recargue` grados hacia atrás alrededor de la cadera, como un respaldo inclinado.
        /// </summary>
        private static (double X, double Z)[] PuntosSentado(double h, double rodilla, double recargue)
        {
            var muslo = Rad(MusloSentado);
            var rodX = Muslo * h * Math.Sin(muslo);
            var rodZ = -Muslo * h * Math.Cos(muslo);
            var espinilla = Rad(MusloSentado - rodilla);
            var tobX = rodX + Pierna * h * Math.Sin(espinilla);
            var tobZ = rodZ - Pierna * h * Math.Cos(espinilla);
            var puntaX = tobX + Pie * h * Math.Cos(espinilla);
            var puntaZ = tobZ + Pie * h * Math.Sin(espinilla);
            var hombroZ = HombroSobreCadera * h;
            var codoX = BrazoSuperior * h * Math.Sin(Rad(BrazoSentado));
            var codoZ = hombroZ - BrazoSuperior * h * Math.Cos(Rad(BrazoSentado));
            var mano = Rad(BrazoSentado + AntebrazoSentado);
            var manoX = codoX + (Antebrazo + Mano) * h * Math.Sin(mano);
            var manoZ = codoZ - (Antebrazo + Mano) * h * Math.Cos(mano);
            var puntos = new[]
            {
                (rodX, rodZ), (tobX, tobZ - 0.03), (puntaX, puntaZ - 0.03), (codoX, codoZ), (manoX, manoZ),
                (0.0, hombroZ), (0.0, CabezaSobreCadera * h), (-EspaldaAtras * h, 0.0),
                (-EspaldaAtras * h, hombroZ), (-EspaldaAtras * h * 0.6, CabezaSobreCadera * h),
            };
            // Recargado hacia atrás: lo de arriba de la cadera va hacia atrás y lo de adelante sube.
            var c = Math.Cos(Rad(recargue));
            var s = Math.Sin(Rad(recargue));
            return Array.ConvertAll(puntos, q => (q.Item1 * c - q.Item2 * s, q.Item1 * s + q.Item2 * c));
        }

        /// <summary>
        /// Hasta dónde llega un cuerpo sentado como lo dibuja el visor, desde la cadera, con la piel
        /// encima (ver `PuntosSentado`).
        /// </summary>
        public static Envolvente EnvolventeSentado(double estatura, double rodilla, double recargue = 0.0)
        {
            var pts = PuntosSentado(estatura, rodilla, recargue);
            double xMin = double.MaxValue, xMax = double.MinValue, zMin = double.MaxValue, zMax = double.MinValue;
            foreach (var (x, z) in pts)
            {
                xMin = Math.Min(xMin, x);
                xMax = Math.Max(xMax, x);
                zMin = Math.Min(zMin, z);
                zMax = Math.Max(zMax, z);
            }

            // El cuello, recargado como lo demás: solo su altura cuenta.
            var cuello = CuelloSobreCadera * estatura * Math.Cos(Rad(recargue));
            return new Envolvente(
                xMin - Piel,
                xMax + Piel,
                (MedioHombros + BrazoAfuera) * estatura + Piel,
                zMin - Piel,
                zMax + Piel,
                cuello,
                MedioAnchoCabeza * estatura + Piel);
        }

        /// <summary>
        /// Cuánto se dobla la rodilla (°, desde la pierna estirada en la línea del muslo; 85, la
        /// espinilla vertical) para que la planta del pie quede sobre el piso: lo más doblada que
        /// todavía deja el pie a `caida` metros o menos bajo la cadera. Con la pierna estirada y el pie
        /// todavía bajo el piso, 0.
        /// </summary>
        public static double RodillaSentado(double estatura, double caida, double recargue = 0.0)
        {
            bool Cabe(double k) => -EnvolventeSentado(estatura, k, recargue).ZMin <= caida;
            if (Cabe(MusloSentado))
            {
                return MusloSentado;
            }

            double lo = 0.0, hi = MusloSentado;
            for (var i = 0; i < 40; i++)
            {
                var mid = (lo + hi) / 2.0;
                if (Cabe(mid))
                {
                    lo = mid;
                }
                else
                {
                    hi = mid;
                }
            }

            return lo;
        }

        /// <summary>
        /// Cómo va sentado un ocupante en su cabina: si con su estatura la cabeza tocaría el techo, el
        /// respaldo se recarga hacia atrás (hasta `RecargueMaximo`) y, si aun así no cabe, la cadera
        /// baja; la rodilla se dobla lo que deja el pie sobre el piso. Es la colocación ilustrativa del
        /// cuerpo, no un dato del solver.
        /// </summary>
        public static (double Cadera, double Rodilla, double Recargue, Envolvente Envolvente) Sentar(
            Cabina c, string clase, double alto, double estatura)
        {
            var cadera = AlturaCadera(clase, alto);
            var recargue = 0.0;
            double Cabeza(double r) => EnvolventeSentado(estatura, MusloSentado, r).ZMax;
            if (cadera + Cabeza(0.0) > c.ZMax)
            {
                double lo = 0.0, hi = RecargueMaximo;
                for (var i = 0; i < 40; i++)
                {
                    var mid = (lo + hi) / 2.0;
                    if (cadera + Cabeza(mid) > c.ZMax)
                    {
                        lo = mid;
                    }
                    else
                    {
                        hi = mid;
                    }
                }

                recargue = hi;
                cadera = Math.Min(cadera, c.ZMax - Cabeza(recargue));
            }

            var rodilla = RodillaSentado(estatura, cadera - c.ZMin, recargue);
            return (cadera, rodilla, recargue, EnvolventeSentado(estatura, rodilla, recargue));
        }

        /// <summary>
        /// Dónde va la cadera del ocupante (marco del vehículo) para que todo su cuerpo quede dentro de
        /// la cabina: el asiento más el desplazamiento del solver, recortado. El desplazamiento es
        /// respecto al habitáculo; si llevaría el cuerpo más allá de la puerta, el techo o el tablero, lo
        /// que ocurre es un contacto con el interior (`variante.contacto`), no una salida. El recorte es
        /// del dibujo (`Limitado`); el número del solver no cambia.
        /// </summary>
        public static (double X, double Y, double Z, bool Limitado) EnCabina(
            (double X, double Y) deseado, double cadera, Cabina c, Envolvente e)
        {
            double Acotar(double v, double lo, double hi) => lo > hi ? (lo + hi) / 2.0 : Math.Min(hi, Math.Max(lo, v));
            var x = Acotar(deseado.X, c.XMin - e.XMin, c.XMax - e.XMax);
            var z = Acotar(cadera, c.ZMin - e.ZMin, c.ZMax - e.ZMax);
            // A lo ancho, lo que deja la cabina en cada franja del cuerpo: hasta el cuello, los hombros
            // contra la puerta y el vidrio; arriba, la cabeza contra el vidrio y el techo.
            var lado = Math.Min(
                c.MedioAnchoMinimo(z + e.ZMin, z + e.ZCuello) - e.YMax,
                c.MedioAnchoMinimo(z + e.ZCuello, z + e.ZMax) - e.YCabeza);
            var y = Acotar(deseado.Y, -lado, lado);
            var limitado = Math.Abs(x - deseado.X) > 1e-6 || Math.Abs(y - deseado.Y) > 1e-6;
            return (x, y, z, limitado);
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
