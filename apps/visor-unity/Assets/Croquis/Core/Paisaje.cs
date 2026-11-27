using System.Collections.Generic;
using Croquis.Generated;

namespace Croquis.Core
{
    /// <summary>
    /// El paisaje del lugar (`escenario.entorno.paisaje`, de la cobertura de OpenStreetMap que calcula la
    /// web). En zona árida el monte es ralo: de los árboles procedurales queda uno de cada tres, como
    /// pirul y más bajo. El suelo y las matas los cambia `EscenarioVista`. No toca ninguna cifra.
    /// </summary>
    public static class Paisaje
    {
        public static bool EsArido(Escenario e)
        {
            return e?.Entorno?.Paisaje == PaisajeEntorno.Arido;
        }

        public static void Arido(Escenario e)
        {
            if (!EsArido(e) || e.Entorno.Arboles == null)
            {
                return;
            }

            var quedan = new List<ArbolEscenario>();
            for (var i = 0; i < e.Entorno.Arboles.Length; i += 3)
            {
                var a = e.Entorno.Arboles[i];
                a.Especie = EspecieArbol.Pirul;
                a.AlturaM = (a.AlturaM ?? 7.0) * 0.65;
                a.TroncoM *= 0.6;
                quedan.Add(a);
            }

            e.Entorno.Arboles = quedan.ToArray();
        }
    }
}
