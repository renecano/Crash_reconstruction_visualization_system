using System;
using System.IO;
using UnityEngine;

namespace Croquis.Visor
{
    /// <summary>
    /// El visor de escritorio sin la web (U6): abre un paquete caso-3d y lo reproduce. El perito
    /// descarga el paquete en `/cesvi` («Descargar paquete 3D») y lo abre aquí, a la calidad que da su
    /// tarjeta de video:
    ///
    ///   VisorCroquis.exe -abrir AXA-A2010930.caso3d.json
    ///   VisorCroquis.exe AXA-A2010930.caso3d.json          (arrastrar el archivo sobre el programa)
    ///
    /// Sin archivo abre el caso de ejemplo que viaja con el programa (`casos/ejemplo.json`). Con
    /// `-caso` mide (`Medicion`) en vez de esto. Las cámaras se cambian con las teclas 1 a 5 y la
    /// reproducción se pausa con Espacio; F3 abre el panel de diagnóstico.
    /// </summary>
    public sealed class Escritorio : MonoBehaviour
    {
        private static readonly string[] Camaras = { "cinematica", "orbita", "cenital", "acera", "libre" };
        private VisorCaso visor;

        public static string ArchivoPedido()
        {
            var a = Environment.GetCommandLineArgs();
            for (var i = 1; i < a.Length; i++)
            {
                if (a[i] == "-abrir" && i + 1 < a.Length)
                {
                    return a[i + 1];
                }

                // Un archivo suelto (arrastrado sobre el programa): el primero que sea JSON.
                if (!a[i].StartsWith("-", StringComparison.Ordinal) && a[i].EndsWith(".json", StringComparison.OrdinalIgnoreCase)
                    && (i == 1 || !a[i - 1].StartsWith("-", StringComparison.Ordinal)))
                {
                    return a[i];
                }
            }

            return null;
        }

        private async void Start()
        {
            if (Application.isEditor || Application.platform == RuntimePlatform.WebGLPlayer || Medicion.Pedida)
            {
                enabled = false;
                return;
            }

            visor = GetComponent<VisorCaso>();
            var archivo = ArchivoPedido()
                ?? Path.Combine(Path.GetDirectoryName(Application.dataPath) ?? ".", "casos", "ejemplo.json");
            if (!File.Exists(archivo))
            {
                Debug.LogWarning("[escritorio] No hay caso que abrir: " + archivo);
                return;
            }

            try
            {
                await visor.CargarAsync(Paquete.Leer(File.ReadAllText(archivo)));
                visor.Camara.Cambiar("cinematica");
                visor.Bucle = true;
                visor.Reproduciendo = true;
            }
            catch (Exception e)
            {
                Debug.LogException(e);
            }
        }

        private void Update()
        {
            if (visor == null || !visor.Cargado)
            {
                return;
            }

            if (Input.GetKeyDown(KeyCode.Space))
            {
                visor.Reproduciendo = !visor.Reproduciendo;
            }

            for (var i = 0; i < Camaras.Length; i++)
            {
                if (Input.GetKeyDown(KeyCode.Alpha1 + i))
                {
                    visor.Camara.Cambiar(Camaras[i]);
                    Calidad.Reiniciar();
                }
            }
        }
    }
}
