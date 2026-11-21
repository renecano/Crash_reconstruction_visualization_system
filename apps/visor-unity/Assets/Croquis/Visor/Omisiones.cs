using System;
using System.Collections.Generic;
using UnityEngine;

namespace Croquis.Visor
{
    /// <summary>
    /// Lo que el 3D no pudo dibujar de un caso (René, 2026-11-20: «un elemento malo nunca manda al visor
    /// de respaldo»). Cada constructor protege cada elemento: si uno trae un dato faltante o truena, se
    /// omite, se anota aquí con su pila en el registro, y el caso abre igual. La lista viaja en «cargado»
    /// (`omitidos`) y la web se la dice al perito.
    /// </summary>
    public static class Omisiones
    {
        private const int Tope = 40;
        private static readonly List<string> lista = new List<string>();
        private static readonly Dictionary<string, int> cuantos = new Dictionary<string, int>();

        /// <summary>Lo omitido en la carga actual, una línea por tipo de elemento y causa.</summary>
        public static IReadOnlyList<string> Lista
        {
            get
            {
                var r = new List<string>();
                foreach (var l in lista)
                {
                    r.Add(cuantos[l] > 1 ? l + " (" + cuantos[l] + ")" : l);
                }

                return r;
            }
        }

        public static void Limpiar()
        {
            lista.Clear();
            cuantos.Clear();
        }

        /// <summary>Anota que `que` se omitió por `e`; la pila completa va al registro.</summary>
        public static void Anotar(string que, Exception e)
        {
            var linea = que + ": " + e.GetType().Name + " (" + e.Message + ")";
            if (cuantos.ContainsKey(linea))
            {
                cuantos[linea]++;
            }
            else if (lista.Count < Tope)
            {
                lista.Add(linea);
                cuantos[linea] = 1;
            }

            Debug.LogWarning("[omitido] " + linea + "\n" + e);
        }

        /// <summary>Hace `accion`; si truena, la omite y lo anota. Una carga reemplazada sí se propaga.</summary>
        public static bool Intentar(string que, Action accion)
        {
            try
            {
                accion();
                return true;
            }
            catch (CargaReemplazada)
            {
                throw;
            }
            catch (Exception e)
            {
                Anotar(que, e);
                return false;
            }
        }
    }
}
