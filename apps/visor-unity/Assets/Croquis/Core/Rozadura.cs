using System;
using System.Collections.Generic;
using Croquis.Generated;

namespace Croquis.Core
{
    /// <summary>
    /// Lo que deja un roce (René, 2026-11-27, la reversa publicada: el CR-V roza al Versa con unos 3 kJ).
    /// Por debajo del umbral de CRASH3 la lámina no se hunde (el solver deja `perfil_m` en ceros, y es
    /// correcto), pero la pintura sí se raya y se le pega la del otro. El visor no inventa deformación:
    /// dibuja rayones y pintura ajena sobre la superficie de la zona de contacto, sin mover un vértice.
    ///
    /// La intensidad es la energía del daño contra la que la cara absorbe sin deformación permanente:
    /// I = E / (G · L), con G = A² / (2B) (CRASH3; `solver/croquis_solver/crash3.py`) y la rigidez A, B
    /// que trae el Resultado. Con E ≥ G · L ya habría aplastamiento y lo dibuja `DanoDelCaso`.
    /// </summary>
    public sealed class Rozadura
    {
        public CampoDano Campo;
        public double EnergiaJ;
        public double UmbralJ;
        public double Intensidad;

        /// <summary>Con quién fue el roce: el id del otro vehículo, o nulo si fue contra un objeto.</summary>
        public string Contra;

        /// <summary>Desde qué instante del Resultado se ve.</summary>
        public double Desde;
    }

    /// <summary>Una malla en el marco del vehículo en Unity: x a la derecha, y arriba, z adelante.</summary>
    public sealed class MallaRoce
    {
        public V3[] Vertices;
        public int[] Triangulos;
    }

    public static class RozaduraDelCaso
    {
        /// <summary>Cuánto sobresalen de la lámina los trazos, para no pelear con ella en la profundidad (m).</summary>
        public const double Despegue = 0.003;

        private const double Paso = 0.03;

        /// <summary>
        /// El roce de un vehículo, o nulo si no lo hay: sin `dano`, sin energía, con aplastamiento (eso lo
        /// dibuja el daño), sin rigidez, sin una de las cuatro caras, de dos ruedas o contra una persona.
        /// </summary>
        public static Rozadura De(ResultadoVehiculo v, Caso3DResultado r)
        {
            var d = v?.Dano;
            if (d == null || d.OrigenRigidez == OrigenRigidez.SinImpacto || !(d.EnergiaJ > 0.0) || !(d.AnchoM > 0.0))
            {
                return null;
            }

            if (d.PerfilM != null && Array.Exists(d.PerfilM, c => c > 0.0) || DanoDelCaso.UsaMedido(d))
            {
                return null;
            }

            var a = d.Rigidez?.ANM ?? 0.0;
            var b = d.Rigidez?.BNM2 ?? 0.0;
            var lado = DanoDelCaso.Lado(d.Cdc?.Lado);
            if (!(a > 0.0) || !(b > 0.0) || lado == null || PerfilClase.De(v.Clase).DosRuedas)
            {
                return null;
            }

            var contra = Otro(r, v.Id, out var conPersona);
            if (conPersona)
            {
                return null;
            }

            var umbral = a * a / (2.0 * b) * d.AnchoM;
            var dim = v.Dimensiones;
            var entrada = new EntradaDano
            {
                Lado = lado.Value,
                Perfil = new double[6],
                Ancho = d.AnchoM,
                Centro = d.CentroM,
                ZonaVertical = d.Cdc.ZonaVertical.HasValue ? d.Cdc.ZonaVertical.Value.ToString()[0] : (char?)null,
                PdofHoras = v.PdofHoras,
            };
            return new Rozadura
            {
                Campo = new CampoDano(entrada, v.Clase, new MedidasVehiculo(dim.LargoM, dim.AnchoM, dim.AltoM, dim.DistanciaEntreEjesM)),
                EnergiaJ = d.EnergiaJ,
                UmbralJ = umbral,
                Intensidad = Math.Min(1.0, d.EnergiaJ / umbral),
                Contra = contra,
                Desde = DanoDelCaso.Instante(r, v.Id),
            };
        }

        /// <summary>El otro actor del primer impacto del vehículo (nulo si fue un objeto).</summary>
        private static string Otro(Caso3DResultado r, string id, out bool conPersona)
        {
            conPersona = false;
            ResultadoEvento primero = null;
            foreach (var e in r?.Eventos ?? new ResultadoEvento[0])
            {
                var esImpacto = e.Tipo == StickyTipo.ImpactoVehiculoVehiculo || e.Tipo == StickyTipo.ImpactoVehiculoObjeto
                    || e.Tipo == StickyTipo.ImpactoVehiculoPersona;
                if (esImpacto && e.Actores != null && Array.IndexOf(e.Actores, id) >= 0 && (primero == null || e.T < primero.T))
                {
                    primero = e;
                }
            }

            if (primero == null)
            {
                return null;
            }

            conPersona = primero.Tipo == StickyTipo.ImpactoVehiculoPersona;
            return primero.Tipo == StickyTipo.ImpactoVehiculoVehiculo ? Array.Find(primero.Actores, x => x != id) : null;
        }

        /// <summary>
        /// Los rayones: trazos delgados casi a lo largo de la cara, dentro del ancho del daño y a la altura
        /// de la estructura. Cuántos y qué tan largos, en proporción a la intensidad. Requiere
        /// `DanoDelCaso.FijarFrente` antes, para ir sobre la lámina real.
        /// </summary>
        public static MallaRoce Rayones(Rozadura z, int semilla)
        {
            var azar = new Random(semilla);
            // Un roce, por leve que sea, deja al menos unos cuantos rayones que se alcancen a ver.
            var n = 4 + (int)Math.Round(20.0 * z.Intensidad);
            return Trazos(z, azar, n, 0.6, 0.004, 0.009, 0.06);
        }

        /// <summary>
        /// La abrasión: una o tres bandas anchas y casi horizontales donde se tallaron las láminas (el barniz
        /// opaco alrededor de los rayones). Con el mismo color de los rayones y más transparente.
        /// </summary>
        public static MallaRoce Abrasion(Rozadura z, int semilla)
        {
            var azar = new Random(semilla ^ 0x2545f491);
            var n = 1 + (int)Math.Round(2.0 * z.Intensidad);
            return Trazos(z, azar, n, 0.75, 0.05, 0.11, 0.01);
        }

        /// <summary>La pintura del otro vehículo: menos trazos, más anchos, al centro de la zona.</summary>
        public static MallaRoce Pintura(Rozadura z, int semilla)
        {
            var azar = new Random(semilla ^ 0x5bd1e995);
            var n = 2 + (int)Math.Round(6.0 * z.Intensidad);
            return Trazos(z, azar, n, 0.45, 0.012, 0.035, 0.03);
        }

        private static MallaRoce Trazos(Rozadura z, Random azar, int n, double fraccionLargo, double anchoMin, double anchoMax, double pendiente)
        {
            var c = z.Campo;
            var u0 = Math.Min(c.Estacion(0), c.Estacion(5));
            var u1 = Math.Max(c.Estacion(0), c.Estacion(5));
            var vertices = new List<V3>();
            var triangulos = new List<int>();
            for (var k = 0; k < n; k++)
            {
                // Más energía, trazos más largos: con I = 1, hasta `fraccionLargo` del ancho del daño.
                var largo = (u1 - u0) * fraccionLargo * (0.35 + 0.65 * z.Intensidad) * (0.5 + 0.5 * azar.NextDouble());
                var inicio = u0 + (u1 - u0 - largo) * azar.NextDouble();
                var y = c.Banda0 + (c.Banda1 - c.Banda0) * (0.15 + 0.7 * azar.NextDouble());
                var m = pendiente * (2.0 * azar.NextDouble() - 1.0);
                var mitad = (anchoMin + (anchoMax - anchoMin) * azar.NextDouble()) / 2.0;
                var pasos = Math.Max(1, (int)Math.Ceiling(largo / Paso));
                var b = vertices.Count;
                for (var i = 0; i <= pasos; i++)
                {
                    var u = inicio + largo * i / pasos;
                    var yy = y + m * (u - inicio);
                    // Se afila en las puntas, como un rayón de verdad.
                    var ancho = mitad * Math.Sin(Math.PI * (0.15 + 0.7 * i / pasos));
                    vertices.Add(EnLamina(c, u, yy - ancho));
                    vertices.Add(EnLamina(c, u, yy + ancho));
                    if (i > 0)
                    {
                        var q = b + 2 * (i - 1);
                        triangulos.AddRange(Cara(c, vertices, q));
                    }
                }
            }

            return new MallaRoce { Vertices = vertices.ToArray(), Triangulos = triangulos.ToArray() };
        }

        /// <summary>Un punto sobre la lámina (a `Despegue` afuera), del marco del daño al de Unity.</summary>
        private static V3 EnLamina(CampoDano c, double u, double y)
        {
            var p = c.Afuera * (c.SuperficieEn(u, y) + Despegue) + c.ALoLargo * u + new V3(0.0, y, 0.0);
            return DanoDelCaso.AUnity(p);
        }

        /// <summary>Los dos triángulos de un tramo, con la cara hacia afuera (Unity: normal = (b − a) × (c − a)).</summary>
        private static int[] Cara(CampoDano c, List<V3> v, int q)
        {
            var afuera = DanoDelCaso.AUnity(c.Afuera);
            var n = Cruz(v[q + 2] + v[q] * -1.0, v[q + 3] + v[q] * -1.0);
            return n.Punto(afuera) >= 0.0 ? new[] { q, q + 2, q + 3, q, q + 3, q + 1 } : new[] { q, q + 3, q + 2, q, q + 1, q + 3 };
        }

        public static V3 Cruz(V3 a, V3 b)
        {
            return new V3(a.Y * b.Z - a.Z * b.Y, a.Z * b.X - a.X * b.Z, a.X * b.Y - a.Y * b.X);
        }
    }
}
