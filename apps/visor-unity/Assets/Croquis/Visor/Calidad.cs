using UnityEngine;

namespace Croquis.Visor
{
    /// <summary>
    /// El nivel de calidad del visor. Por ahora hay dos (los cuatro de `PLAN.md` §7.8 llegan en U5):
    /// «media», el del visor en la web, y «alta», el del programa de escritorio con tarjeta de video.
    /// Media conserva el mismo aspecto con menos costo: menos luces reales, sin sombras de luces
    /// adicionales y menos densidad. Nunca quita una función. Lo que es del pipeline (suavizado,
    /// cascadas de sombra, oclusión) lo fija `PrepararEscenario` según el destino del build.
    /// </summary>
    public static class Calidad
    {
        /// <summary>Las capturas del Editor la fijan para ver lo mismo que el build de su destino.</summary>
        public static bool? Forzada { get; set; }

        public static bool Media => Forzada ?? Application.platform == RuntimePlatform.WebGLPlayer;
    }
}
