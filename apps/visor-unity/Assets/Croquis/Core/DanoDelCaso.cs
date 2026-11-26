using System;
using System.Collections.Generic;
using Croquis.Generated;

namespace Croquis.Core
{
    /// <summary>
    /// Del `dano` del Resultado al daño que dibuja el visor (auditoría del 2026-11-15, C2). El visor
    /// no calcula daño: toma el perfil de aplastamiento del solver (`dano.perfil_m`), su ancho, su
    /// centro y la cara del CDC, y deforma con ellos la carrocería (`CampoDano`). Aquí está todo lo
    /// que se puede probar sin Unity: qué vehículo lleva daño, desde qué instante se ve y cómo queda
    /// cada vértice.
    /// </summary>
    public static class DanoDelCaso
    {
        /// <summary>
        /// El campo de daño de un vehículo, o nulo si no hay nada que dibujar: sin `dano`, con el perfil
        /// en ceros, sin ancho, sin una cara del CDC (F, B, L o R) o de dos ruedas (sin cara continua,
        /// como en el visor web).
        /// </summary>
        public static CampoDano Campo(ResultadoVehiculo v)
        {
            var dano = v?.Dano;
            return dano == null || dano.OrigenRigidez == OrigenRigidez.SinImpacto ? null : Campo(v, dano.PerfilM, dano.AnchoM, dano.CentroM, dano.Cdc, v.PdofHoras);
        }

        /// <summary>
        /// Los daños de un vehículo en orden, cada uno con el instante desde el que se ve: el del primer
        /// impacto (`dano`, en `Instante`) y los de cada impacto posterior (`danos_posteriores`, en su `t`),
        /// que se dibujan encima del anterior. Vacío si no hay nada que dibujar.
        /// </summary>
        public static List<(double Desde, CampoDano Campo)> Etapas(ResultadoVehiculo v, Caso3DResultado r)
        {
            var etapas = new List<(double, CampoDano)>();
            var primero = Campo(v);
            if (primero != null)
            {
                etapas.Add((Instante(r, v.Id), primero));
            }

            foreach (var p in v?.DanosPosteriores ?? new DanosPosterioreElement[0])
            {
                var campo = p == null || p.OrigenRigidez == OrigenRigidez.SinImpacto ? null : Campo(v, p.PerfilM, p.AnchoM, p.CentroM, p.Cdc, p.PdofHoras);
                if (campo != null)
                {
                    etapas.Add((p.T, campo));
                }
            }

            etapas.Sort((a, b) => a.Item1.CompareTo(b.Item1));
            return etapas;
        }

        private static CampoDano Campo(ResultadoVehiculo v, double[] perfil, double ancho, double centro, Cdc cdc, double? pdof)
        {
            if (perfil == null || perfil.Length != 6 || ancho <= 0.0 || cdc == null)
            {
                return null;
            }

            if (Array.TrueForAll(perfil, c => c <= 0.0) || PerfilClase.De(v.Clase).DosRuedas)
            {
                return null;
            }

            var lado = Lado(cdc.Lado);
            if (lado == null)
            {
                return null;
            }

            var d = v.Dimensiones;
            var entrada = new EntradaDano
            {
                Lado = lado.Value,
                Perfil = perfil,
                Ancho = ancho,
                Centro = centro,
                ZonaVertical = cdc.ZonaVertical.HasValue ? cdc.ZonaVertical.Value.ToString()[0] : (char?)null,
                PdofHoras = pdof,
            };
            return new CampoDano(entrada, v.Clase, new MedidasVehiculo(d.LargoM, d.AnchoM, d.AltoM, d.DistanciaEntreEjesM));
        }

        /// <summary>La cara del CDC como letra, o nulo si el solver no dio una de las cuatro caras.</summary>
        public static char? Lado(Lado? l)
        {
            switch (l)
            {
                case Generated.Lado.F:
                    return 'F';
                case Generated.Lado.B:
                    return 'B';
                case Generated.Lado.L:
                    return 'L';
                case Generated.Lado.R:
                    return 'R';
                default:
                    return null;
            }
        }

        /// <summary>
        /// Desde qué instante se ve el daño de un vehículo: su primer impacto en el Resultado (en una
        /// carambola, el de atrás se daña después que el primero). Sin eventos de impacto suyos, el
        /// impacto de la escena (t = 0).
        /// </summary>
        public static double Instante(Caso3DResultado r, string id)
        {
            var primero = double.PositiveInfinity;
            foreach (var e in r?.Eventos ?? new ResultadoEvento[0])
            {
                var esImpacto = e.Tipo == StickyTipo.ImpactoVehiculoVehiculo
                    || e.Tipo == StickyTipo.ImpactoVehiculoObjeto
                    || e.Tipo == StickyTipo.ImpactoVehiculoPersona;
                if (esImpacto && e.Actores != null && Array.IndexOf(e.Actores, id) >= 0 && e.T < primero)
                {
                    primero = e.T;
                }
            }

            return double.IsPositiveInfinity(primero) ? 0.0 : primero;
        }

        /// <summary>
        /// La semilla de las arrugas de un vehículo: la del caso y su id, para que el mismo caso se vea
        /// igual cada vez (no depende del `GetHashCode` de la plataforma).
        /// </summary>
        public static int Semilla(long semillaDelCaso, string id)
        {
            unchecked
            {
                var h = (int)(semillaDelCaso ^ (semillaDelCaso >> 32));
                foreach (var c in id ?? string.Empty)
                {
                    h = (h * 31) + c;
                }

                return h & 0x7fffffff;
            }
        }

        /// <summary>
        /// Los vértices de una pieza de la carrocería, ya deformados. Entran y salen en el marco local
        /// del vehículo en Unity (x a la derecha, y arriba, z adelante, en metros, con el piso en y = 0);
        /// el campo trabaja en el marco del daño (x adelante, y arriba, z a la derecha).
        /// </summary>
        public static V3[] Deformar(CampoDano campo, V3[] verticesEnUnity, int[] triangulos, int semilla)
        {
            var enDano = new V3[verticesEnUnity.Length];
            for (var i = 0; i < enDano.Length; i++)
            {
                enDano[i] = Cambiar(verticesEnUnity[i]);
            }

            var d = campo.Hornear(enDano, triangulos, semilla);
            var salida = new V3[enDano.Length];
            for (var i = 0; i < salida.Length; i++)
            {
                var q = Cambiar(d[i]);
                var p = verticesEnUnity[i];
                salida[i] = new V3(p.X + q.X, p.Y + q.Y, p.Z + q.Z);
            }

            return salida;
        }

        /// <summary>Si el daño mueve un punto del marco de Unity (para refinar solo ahí la malla).</summary>
        public static bool Toca(CampoDano campo, V3 enUnity)
        {
            campo.Desplazamiento(Cambiar(enUnity), out var peso, out _);
            return peso > 0.0;
        }

        /// <summary>Del marco de Unity al del daño y de regreso: se intercambian x y z.</summary>
        private static V3 Cambiar(V3 p)
        {
            return new V3(p.Z, p.Y, p.X);
        }
    }
}
