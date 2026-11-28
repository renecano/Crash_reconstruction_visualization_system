using System;
using Croquis.Generated;

namespace Croquis.Core
{
    /// <summary>
    /// El motociclista o el ciclista después del impacto (René, 2026-11-28): sale en un arco, cae, rueda
    /// y se desliza hasta su posición final narrada («el motociclista quedó a 12 m del punto de
    /// impacto»). Si la narración no la dice, queda cerca de la moto, como supuesto visible. La moto cae
    /// de lado con `Caida` (ADR 0114), como antes.
    ///
    /// Es ilustrativo y determinista: no hay física aleatoria ni de Unity. El arco sale de la rapidez de
    /// la moto en el impacto, con un ángulo de salida fijo; en el suelo frena parejo para detenerse
    /// exactamente en la posición final. Siempre el mismo recorrido, en cada reproducción y en el
    /// video. No cambia ninguna cifra: la proyección del solver (Searle) sigue en el dictamen.
    /// </summary>
    public sealed class VueloOcupante
    {
        public const double Gravedad = 9.81;

        /// <summary>El ángulo de salida del arco (rad): un jinete sale casi horizontal.</summary>
        public const double AnguloSalida = 15.0 * Math.PI / 180.0;

        /// <summary>Lo más del recorrido que va en el aire: el resto, rodando y deslizándose.</summary>
        public const double FraccionAireMax = 0.6;

        /// <summary>Lo que conserva de su rapidez al caer (el golpe contra el piso).</summary>
        public const double ConservaAlCaer = 0.6;

        /// <summary>La inclinación con que sale (rad): venía sobre la moto, inclinado hacia el manubrio.</summary>
        public const double InclinacionSalida = 40.0 * Math.PI / 180.0;

        /// <summary>La altura del centro del cuerpo tendido sobre el piso (m).</summary>
        public const double AlturaTendido = 0.15;

        /// <summary>Sin posición narrada: a cuántos metros de la moto, hacia donde iba.</summary>
        public const double SupuestoJuntoAMotoM = 1.5;

        public double T0 { get; }
        public double X0 { get; }
        public double Y0 { get; }
        public double Z0 { get; }
        public double XFinal { get; }
        public double YFinal { get; }

        /// <summary>true si la posición final no la dice la narración (va junto a la moto).</summary>
        public bool Supuesta { get; }

        /// <summary>Cuánto dura el arco (s).</summary>
        public double TAire { get; }

        /// <summary>Cuánto dura en el suelo, rodando y deslizándose (s).</summary>
        public double TSuelo { get; }

        /// <summary>El instante en que queda quieto.</summary>
        public double TFin => T0 + TAire + TSuelo;

        /// <summary>Las vueltas que da rodando (enteras: queda boca abajo como cayó).</summary>
        public int Vueltas { get; }

        private readonly double ux, uy, distancia, dAire, vAire, vSuelo, rumbo;
        private double vz0;

        /// <param name="x0">Dónde va el ocupante en el impacto (su centro, metros).</param>
        /// <param name="z0">La altura de su centro sobre la moto.</param>
        /// <param name="vx">La velocidad de la moto en el impacto (m/s).</param>
        /// <param name="vMinima">
        /// Lo más rápido que va, hacia donde vuela, el otro vehículo del choque (m/s): el ocupante sale
        /// más rápido que él para no quedar dentro de su carrocería (de frente contra un camión, el
        /// camión sigue avanzando unos metros).
        /// </param>
        public VueloOcupante(double t0, double x0, double y0, double z0, double vx, double vy, double xFinal, double yFinal, bool supuesta, double vMinima = 0.0)
        {
            T0 = t0;
            X0 = x0;
            Y0 = y0;
            Z0 = Math.Max(0.3, z0);
            XFinal = xFinal;
            YFinal = yFinal;
            Supuesta = supuesta;
            var dx = xFinal - x0;
            var dy = yFinal - y0;
            distancia = Math.Sqrt(dx * dx + dy * dy);
            if (distancia > 1e-6)
            {
                ux = dx / distancia;
                uy = dy / distancia;
            }
            else
            {
                var vn = Math.Sqrt(vx * vx + vy * vy);
                ux = vn > 1e-6 ? vx / vn : 1.0;
                uy = vn > 1e-6 ? vy / vn : 0.0;
            }

            rumbo = Math.Atan2(uy, ux);
            var v = Math.Max(2.0, Math.Sqrt(vx * vx + vy * vy));
            vz0 = v * Math.Sin(AnguloSalida);
            TAire = (vz0 + Math.Sqrt(vz0 * vz0 + 2.0 * Gravedad * Z0)) / Gravedad;
            // Lo que recorre en el aire a la rapidez de la moto; si la posición narrada está más cerca,
            // el arco se acorta (más lento) para que el resto alcance a rodar y deslizarse.
            vAire = Math.Min(v * Math.Cos(AnguloSalida), FraccionAireMax * distancia / TAire);
            if (vMinima > 0.0 && vAire < vMinima + 1.0)
            {
                // Más rápido que quien lo empuja; si así el arco se pasa, más bajo (hasta caer de la
                // altura del asiento) para que aún caiga antes de su posición final.
                vAire = vMinima + 1.0;
                var tope = 0.9 * distancia / vAire;
                if (tope < TAire)
                {
                    TAire = Math.Max(Math.Sqrt(2.0 * Z0 / Gravedad), tope);
                    vz0 = Math.Max(0.0, (0.5 * Gravedad * TAire * TAire - Z0) / TAire);
                }
            }

            dAire = Math.Min(vAire * TAire, distancia);
            vAire = TAire > 0.0 ? dAire / TAire : vAire;
            var dSuelo = distancia - dAire;
            vSuelo = vAire * ConservaAlCaer;
            // Frena parejo: recorre dSuelo y se detiene justo en la posición final.
            TSuelo = dSuelo > 1e-3 && vSuelo > 1e-3 ? 2.0 * dSuelo / vSuelo : 0.0;
            // Rueda la primera mitad del suelo: una vuelta por cada ~1.5 m, de 1 a 3.
            Vueltas = dSuelo > 0.5 ? Math.Max(1, Math.Min(3, (int)Math.Round(dSuelo / 2.0 / 1.5))) : 0;
        }

        /// <summary>
        /// Arma el vuelo del ocupante de una moto o una bicicleta, o null si no lo es o no hay con qué
        /// (sin trayectoria propia, sin el vehículo o sin instante de impacto).
        /// </summary>
        public static VueloOcupante Armar(ResultadoPersona p, ResultadoVehiculo vehiculo, EscenaPersona enEscena, double tImpacto, ResultadoVehiculo[] otros = null)
        {
            if (p == null || vehiculo?.Trayectoria?.T == null || vehiculo.Trayectoria.T.Length < 2)
            {
                return null;
            }

            if (p.Rol != RolEnum.Motociclista && p.Rol != RolEnum.Ciclista)
            {
                return null;
            }

            if (!Personas.TieneTrayectoria(p) || double.IsNaN(tImpacto))
            {
                return null;
            }

            var antes = Personas.Pose(p, tImpacto);
            var tr = vehiculo.Trayectoria;
            Muestreo.Tramo(tr.T, tImpacto, out var i, out var f);
            // La velocidad justo antes del impacto: la muestra anterior a él.
            var k = Math.Max(0, f > 0 ? i : i - 1);
            var vx = tr.Vx != null && tr.Vx.Length > k ? tr.Vx[k] : 0.0;
            var vy = tr.Vy != null && tr.Vy.Length > k ? tr.Vy[k] : 0.0;
            var narrada = enEscena?.PosicionFinal;
            if (narrada != null)
            {
                var vMin = MasRapidoHacia(otros, tImpacto, narrada.X - antes.X, narrada.Y - antes.Y);
                return new VueloOcupante(tImpacto, antes.X, antes.Y, antes.Z, vx, vy, narrada.X, narrada.Y, false, vMin);
            }

            // Sin posición narrada: junto a la moto, hacia donde iba, como supuesto visible.
            var n = tr.T.Length - 1;
            var vn = Math.Sqrt(vx * vx + vy * vy);
            var (ex, ey) = vn > 1e-6 ? (vx / vn, vy / vn) : (Math.Cos(tr.Rumbo[n]), Math.Sin(tr.Rumbo[n]));
            var xs = tr.X[n] + ex * SupuestoJuntoAMotoM;
            var ys = tr.Y[n] + ey * SupuestoJuntoAMotoM;
            return new VueloOcupante(tImpacto, antes.X, antes.Y, antes.Z, vx, vy, xs, ys, true, MasRapidoHacia(otros, tImpacto, xs - antes.X, ys - antes.Y));
        }

        /// <summary>Lo más rápido que van los otros vehículos en el impacto hacia (dx, dy) (m/s; 0 si ninguno).</summary>
        private static double MasRapidoHacia(ResultadoVehiculo[] otros, double t, double dx, double dy)
        {
            var d = Math.Sqrt(dx * dx + dy * dy);
            if (otros == null || d < 1e-6)
            {
                return 0.0;
            }

            var max = 0.0;
            foreach (var o in otros)
            {
                var tr = o?.Trayectoria;
                if (tr?.T == null || tr.T.Length < 2 || tr.Vx == null || tr.Vy == null)
                {
                    continue;
                }

                Muestreo.Tramo(tr.T, t, out var i, out _);
                max = Math.Max(max, (tr.Vx[i] * dx + tr.Vy[i] * dy) / d);
            }

            return max;
        }

        /// <summary>Cuánto ha recorrido hacia la posición final en `t` (m), desde el impacto.</summary>
        public double Recorrido(double t)
        {
            var s = t - T0;
            if (s <= 0.0)
            {
                return 0.0;
            }

            if (s <= TAire)
            {
                return vAire * s;
            }

            var g = Math.Min(s - TAire, TSuelo);
            var a = TSuelo > 0.0 ? vSuelo / TSuelo : 0.0;
            return Math.Min(distancia, dAire + vSuelo * g - 0.5 * a * g * g);
        }

        /// <summary>La pose en `t` (desde el impacto; antes, la del Resultado). Sin aleatoriedad.</summary>
        public PosePersona Pose(double t)
        {
            var s = Math.Max(0.0, t - T0);
            var d = Recorrido(t);
            var x = X0 + ux * d;
            var y = Y0 + uy * d;
            if (s <= TAire)
            {
                var z = Math.Max(AlturaTendido, Z0 + vz0 * s - 0.5 * Gravedad * s * s);
                // Sale ya inclinado hacia adelante (venía sobre la moto) y llega tendido.
                var avance = TAire > 0.0 ? s / TAire : 1.0;
                return new PosePersona(x, y, z, rumbo, (InclinacionSalida + avance * (1.0 - InclinacionSalida / (Math.PI / 2.0)) * Math.PI / 2.0), Postura.Vuelo);
            }

            return new PosePersona(x, y, AlturaTendido, rumbo, Math.PI / 2.0, Postura.Tendido);
        }

        /// <summary>
        /// El giro del cuerpo sobre su eje de avance (rad) en `t`: rueda la primera mitad del suelo y
        /// después solo se desliza. Siempre vueltas enteras, para que quede como cayó.
        /// </summary>
        public double Giro(double t)
        {
            var s = t - T0 - TAire;
            if (s <= 0.0 || Vueltas == 0)
            {
                return 0.0;
            }

            var rueda = TSuelo / 2.0;
            var f = Math.Min(1.0, s / rueda);
            // Rápido al caer y cada vez más lento: frena rodando.
            var suave = 1.0 - (1.0 - f) * (1.0 - f);
            return suave * Vueltas * 2.0 * Math.PI;
        }

        /// <summary>
        /// La toma de la cámara con el ocupante a la vista durante su vuelo (`peso` de 0 a 1): mira al
        /// medio entre el contacto y el ocupante y se aleja lo que haga falta para que entren los dos.
        /// </summary>
        public static Toma ConOcupante(Toma toma, V3 contacto, V3 ocupante, double peso)
        {
            if (peso <= 0.0)
            {
                return toma;
            }

            var medio = new V3((contacto.X + ocupante.X) / 2.0, (contacto.Y + ocupante.Y) / 2.0, (contacto.Z + ocupante.Z) / 2.0);
            var mira = Mezcla(toma.Mira, medio, peso);
            var sx = ocupante.X - contacto.X;
            var sz = ocupante.Z - contacto.Z;
            var separacion = Math.Sqrt(sx * sx + sz * sz);
            var ox = toma.Ojo.X - toma.Mira.X;
            var oy = toma.Ojo.Y - toma.Mira.Y;
            var oz = toma.Ojo.Z - toma.Mira.Z;
            var lejos = Math.Sqrt(ox * ox + oy * oy + oz * oz);
            var extra = lejos > 1e-6 ? peso * separacion * 0.8 / lejos : 0.0;
            var ojo = new V3(mira.X + ox * (1.0 + extra), mira.Y + oy * (1.0 + extra), mira.Z + oz * (1.0 + extra));
            return new Toma { Ojo = ojo, Mira = mira };
        }

        /// <summary>Cuánto pesa el ocupante en la toma en `t`: entra al salir y se queda hasta que se detiene.</summary>
        public double PesoCamara(double t)
        {
            var s = t - T0;
            if (s <= 0.0)
            {
                return 0.0;
            }

            var entra = Math.Min(1.0, s / 0.3);
            return entra * entra * (3.0 - 2.0 * entra);
        }

        private static V3 Mezcla(V3 a, V3 b, double f)
        {
            return new V3(a.X + (b.X - a.X) * f, a.Y + (b.Y - a.Y) * f, a.Z + (b.Z - a.Z) * f);
        }
    }
}
