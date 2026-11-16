using System;

namespace Croquis.Visor
{
    /// <summary>
    /// Marcas de tiempo dentro del armado de la escena (René, 2026-11-16: «perfila qué parte del
    /// armado tarda más»). <see cref="VisorCaso"/> la conecta a sus pasos de carga mientras arma un caso;
    /// fuera de una carga no hace nada.
    /// </summary>
    public static class Cronometro
    {
        public static Action<string> Marca { get; set; }

        public static void Paso(string nombre)
        {
            Marca?.Invoke(nombre);
        }
    }
}
