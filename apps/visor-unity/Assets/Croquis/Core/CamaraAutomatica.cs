using System;
using System.Collections.Generic;
using Croquis.Generated;

namespace Croquis.Core
{
    /// <summary>
    /// Algo que puede tapar la vista, como caja orientada en planta con su altura (marco de Unity: x al
    /// este, y arriba, z al norte): un edificio, una barda o un vehículo. Un árbol va como cilindro (su copa).
    /// </summary>
    public struct Estorbo
    {
        public double Cx;
        public double Cz;

        /// <summary>El eje a lo largo, unitario (x, z).</summary>
        public double Ux;
        public double Uz;
        public double MedioLargo;
        public double MedioAncho;
        public double Y0;
        public double Y1;

        /// <summary>Si es un cilindro de radio `MedioLargo` (una copa) en vez de una caja.</summary>
        public bool Cilindro;

        /// <summary>Si es un vehículo: cerca del contacto no tapa (ahí se juntan las láminas).</summary>
        public bool EsVehiculo;

        public bool Contiene(V3 p, double holgura = 0.0)
        {
            if (p.Y < Y0 || p.Y > Y1)
            {
                return false;
            }

            var dx = p.X - Cx;
            var dz = p.Z - Cz;
            if (Cilindro)
            {
                return dx * dx + dz * dz < (MedioLargo + holgura) * (MedioLargo + holgura);
            }

            var a = dx * Ux + dz * Uz;
            var b = -dx * Uz + dz * Ux;
            return Math.Abs(a) < MedioLargo + holgura && Math.Abs(b) < MedioAncho + holgura;
        }

        /// <summary>Un vehículo en su pose: centro en planta, rumbo (rad, desde el este hacia el norte) y medidas.</summary>
        public static Estorbo Vehiculo(double x, double z, double rumbo, double largo, double ancho, double alto)
        {
            return new Estorbo { Cx = x, Cz = z, Ux = Math.Cos(rumbo), Uz = Math.Sin(rumbo), MedioLargo = largo / 2.0, MedioAncho = ancho / 2.0, Y0 = 0.0, Y1 = alto, EsVehiculo = true };
        }
    }

    /// <summary>Dónde va la cámara y a dónde mira (marco de Unity).</summary>
    public struct Toma
    {
        public V3 Ojo;
        public V3 Mira;
    }

    /// <summary>
    /// La cámara «automática» del video (René, 2026-11-27: «en AXA se ve desde atrás de las camionetas y
    /// no se ve el contacto»). Tres tomas según el instante, y en las tres el punto de contacto se ve sin que
    /// nada lo tape: la llegada desde arriba y de lado; el impacto de cerca, de lado al contacto; el final
    /// desde arriba. Solo encuadra: no toca ninguna trayectoria.
    /// </summary>
    public static class CamaraAutomatica
    {
        /// <summary>La toma del impacto va de este tiempo antes del impacto…</summary>
        public const double AntesS = 1.0;

        /// <summary>…a este después.</summary>
        public const double DespuesS = 1.4;

        /// <summary>El paso suave de una toma a la otra (s del caso).</summary>
        public const double TransicionS = 0.6;

        /// <summary>A qué altura se mira el contacto: la de las defensas.</summary>
        public const double AlturaContacto = 0.5;

        /// <summary>Lo último del rayo que no cuenta contra lo construido y las copas.</summary>
        public const double MargenFinal = 0.6;

        /// <summary>
        /// Lo último del rayo que no cuenta contra los vehículos: en el impacto se traslapan por el
        /// aplastamiento y el contacto queda dentro de los dos; lo que se ve es la unión de las láminas, a
        /// los lados. Desde atrás de uno, el rayo cruza todo su largo y sí queda tapado.
        /// </summary>
        public const double MargenVehiculos = 1.5;

        /// <summary>
        /// Si del ojo se ve el punto sin nada en medio: el rayo, cada 10 cm, sin entrar a ningún estorbo,
        /// salvo los últimos `MargenFinal` m (`MargenVehiculos` para los vehículos). El ojo tampoco puede
        /// estar dentro de uno.
        /// </summary>
        public static bool Despejado(V3 ojo, V3 punto, IList<Estorbo> estorbos)
        {
            var d = punto + ojo * -1.0;
            var largo = d.Largo;
            var n = Math.Max(1, (int)Math.Ceiling(largo / 0.1));
            for (var k = 0; k <= n; k++)
            {
                var f = (double)k / n;
                var falta = largo * (1.0 - f);
                if (falta < MargenFinal)
                {
                    break;
                }

                var p = ojo + d * f;
                foreach (var e in estorbos)
                {
                    if ((!e.EsVehiculo || falta >= MargenVehiculos) && e.Contiene(p, k == 0 ? 0.5 : 0.0))
                    {
                        return false;
                    }
                }
            }

            return true;
        }

        /// <summary>
        /// La toma del impacto: perpendicular a la línea entre los vehículos (o, contra un objeto, entre el
        /// vehículo y el contacto), del primer lado y a la primera distancia y altura desde donde el contacto
        /// se ve despejado. Prueba de los dos lados, abriendo hasta 60°, y si no, desde arriba.
        /// </summary>
        public static Toma Impacto(V3 contacto, V3 a, V3 b, IList<Estorbo> estorbos)
        {
            // `contacto` ya viene a la altura de las defensas (el suelo más `AlturaContacto`).
            var p = contacto;
            var suelo = p.Y - AlturaContacto;
            var dx = b.X - a.X;
            var dz = b.Z - a.Z;
            if (dx * dx + dz * dz < 1e-6)
            {
                dx = 1.0;
                dz = 0.0;
            }

            var linea = Math.Atan2(dz, dx);
            foreach (var (d, h) in new[] { (7.0, 1.9), (9.0, 2.8), (5.5, 3.6), (11.0, 5.0) })
            {
                foreach (var giro in new[] { 0.0, 15.0, -15.0, 30.0, -30.0, 45.0, -45.0, 60.0, -60.0 })
                {
                    foreach (var lado in new[] { 90.0, -90.0 })
                    {
                        var az = linea + (lado + giro) * Math.PI / 180.0;
                        var ojo = new V3(p.X + Math.Cos(az) * d, suelo + h, p.Z + Math.Sin(az) * d);
                        if (Despejado(ojo, p, estorbos))
                        {
                            return new Toma { Ojo = ojo, Mira = p };
                        }
                    }
                }
            }

            // Desde arriba, casi a plomo, el contacto siempre se ve (salvo bajo una copa: un poco de lado).
            return new Toma { Ojo = new V3(p.X + Math.Cos(linea + Math.PI / 2.0) * 2.0, suelo + 16.0, p.Z + Math.Sin(linea + Math.PI / 2.0) * 2.0), Mira = p };
        }

        /// <summary>
        /// Una toma desde arriba y del lado de la del impacto, que encuadra la caja (en planta) y el contacto,
        /// con la elevación más baja de `elevaciones` desde la que el contacto se ve despejado.
        /// </summary>
        public static Toma Panorama(CajaPlano caja, V3 contacto, Toma impacto, double vfov, double aspecto, double[] elevaciones, IList<Estorbo> estorbos)
        {
            var p = contacto;
            var c = new CajaPlano();
            c.Agregar(p.X, p.Z);
            if (caja != null && !caja.Vacia)
            {
                c.Agregar(caja.MinX, caja.MinY);
                c.Agregar(caja.MaxX, caja.MaxY);
            }

            var centro = new V3(c.CentroX, p.Y - AlturaContacto, c.CentroY);
            var lado = Math.Max(10.0, Math.Max(c.Ancho, c.Alto) * 1.25);
            var dist = Lente.DistanciaParaVer(lado, lado, vfov, aspecto);
            var hx = impacto.Ojo.X - impacto.Mira.X;
            var hz = impacto.Ojo.Z - impacto.Mira.Z;
            var az = Math.Atan2(hz, hx);
            Toma ultima = default;
            foreach (var el in elevaciones)
            {
                var r = el * Math.PI / 180.0;
                var ojo = new V3(centro.X + Math.Cos(az) * Math.Cos(r) * dist, centro.Y + Math.Sin(r) * dist, centro.Z + Math.Sin(az) * Math.Cos(r) * dist);
                ultima = new Toma { Ojo = ojo, Mira = centro };
                if (Despejado(ojo, p, estorbos))
                {
                    return ultima;
                }
            }

            return ultima;
        }

        /// <summary>
        /// La toma en `t`: la llegada, el impacto o el final, con un paso suave entre ellas. `tImpacto` es
        /// el del impacto principal.
        /// </summary>
        public static Toma En(double t, double tImpacto, Toma llegada, Toma impacto, Toma final)
        {
            var a = Suave((t - (tImpacto - AntesS - TransicionS)) / TransicionS);
            var b = Suave((t - (tImpacto + DespuesS)) / TransicionS);
            var primera = Mezcla(llegada, impacto, a);
            return Mezcla(primera, final, b);
        }

        /// <summary>Qué toma va en `t`: «llegada», «impacto» o «final» (la que más pesa).</summary>
        public static string Fase(double t, double tImpacto)
        {
            return t < tImpacto - AntesS - TransicionS / 2.0 ? "llegada" : t <= tImpacto + DespuesS + TransicionS / 2.0 ? "impacto" : "final";
        }

        /// <summary>
        /// Siguiendo a un vehículo por su trayecto previo (René, 2026-11-27): 11 m atrás y 4.5 m arriba,
        /// mirando un poco adelante de él. `rumbo` en radianes desde el este hacia el norte (planta x, z).
        /// </summary>
        public static Toma Seguir(V3 posicion, double rumbo)
        {
            var dx = Math.Cos(rumbo);
            var dz = Math.Sin(rumbo);
            return new Toma
            {
                Ojo = new V3(posicion.X - dx * 11.0, posicion.Y + 4.5, posicion.Z - dz * 11.0),
                Mira = new V3(posicion.X + dx * 6.0, posicion.Y + 1.0, posicion.Z + dz * 6.0),
            };
        }

        /// <summary>Cuánto pesa el seguimiento en `t`: todo durante el trayecto; nada desde el inicio de la reconstrucción, con 1.5 s de paso.</summary>
        public static double PesoSeguimiento(double t, double tInicioReconstruccion)
        {
            return 1.0 - Suave((t - (tInicioReconstruccion - 1.5)) / 1.5);
        }

        public static Toma Mezclar(Toma x, Toma y, double f)
        {
            return Mezcla(x, y, f);
        }

        private static Toma Mezcla(Toma x, Toma y, double f)
        {
            return new Toma { Ojo = x.Ojo * (1.0 - f) + y.Ojo * f, Mira = x.Mira * (1.0 - f) + y.Mira * f };
        }

        private static double Suave(double x)
        {
            x = Math.Max(0.0, Math.Min(1.0, x));
            return x * x * (3.0 - 2.0 * x);
        }

        /// <summary>
        /// «Desde arriba» (René, 2026-11-27: «arranca altísimo y hay que acercar a mano»): el centro y la
        /// altura que encuadran, con margen, los vehículos en el instante, el punto del choque y las
        /// posiciones finales. Como depende del instante, sigue a los vehículos al reproducir.
        /// </summary>
        public static (double X, double Z, double Alto) Cenital(CajaPlano vehiculos, CajaPlano finales, V3? contacto, double vfov, double aspecto)
        {
            var c = new CajaPlano();
            foreach (var caja in new[] { vehiculos, finales })
            {
                if (caja != null && !caja.Vacia)
                {
                    c.Agregar(caja.MinX, caja.MinY);
                    c.Agregar(caja.MaxX, caja.MaxY);
                }
            }

            if (contacto.HasValue)
            {
                c.Agregar(contacto.Value.X, contacto.Value.Z);
            }

            if (c.Vacia)
            {
                return (0.0, 0.0, 40.0);
            }

            // Margen: un cuarto de cada lado y nunca menos de 6 m, para que nada quede pegado a la orilla.
            var ancho = Math.Max(12.0, c.Ancho * 1.25 + 6.0);
            var alto = Math.Max(12.0, c.Alto * 1.25 + 6.0);
            return (c.CentroX, c.CentroY, Lente.DistanciaParaVer(ancho, alto, vfov, aspecto));
        }

        /// <summary>Los vehículos del Resultado en `t`, como estorbos (marco de Unity).</summary>
        public static List<Estorbo> Vehiculos(Caso3DResultado r, double t, double suelo = 0.0)
        {
            var lista = new List<Estorbo>();
            foreach (var v in r?.Vehiculos ?? new ResultadoVehiculo[0])
            {
                if (v?.Trayectoria == null || v.Dimensiones == null)
                {
                    continue;
                }

                var p = Muestreo.Pose(v.Trayectoria, t);
                var e = Estorbo.Vehiculo(p.X, p.Y, p.Rumbo, v.Dimensiones.LargoM, v.Dimensiones.AnchoM, v.Dimensiones.AltoM);
                e.Y0 = suelo - 0.5;
                e.Y1 = suelo + v.Dimensiones.AltoM;
                lista.Add(e);
            }

            return lista;
        }
    }
}
