using System;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace Croquis.Visor
{
    /// <summary>
    /// Las fotos del dictamen (U6, mensaje `capturar` del puente): la escena en el instante y con la
    /// cámara de la vista pedida, dibujada aparte en una textura del tamaño pedido y devuelta como PNG.
    ///
    /// - `antes`: la cámara cinematográfica un segundo antes del impacto (o al principio, si empieza después).
    /// - `impacto`: la cámara cinematográfica en t = 0 (el impacto principal).
    /// - `reposo`: la cinematográfica al final del Resultado.
    /// - `conductor:<id>`: la cámara de ese conductor en el impacto.
    ///
    /// La foto se toma a escala de dibujo 1, sin importar la escala automática de media: el dictamen
    /// sale nítido aunque el equipo sea modesto. No lleva el minimapa ni el panel de diagnóstico (son
    /// otras cámaras y otra capa); la leyenda ilustrativa la pone la web al pie de cada foto. Al
    /// terminar, la escena vuelve a como estaba: instante, cámara, reproducción y escala.
    /// </summary>
    public static class Captura
    {
        /// <summary>Lado máximo de una foto (pixeles): más pide memoria que un equipo modesto no tiene.</summary>
        public const int LadoMaximo = 2560;

        /// <summary>Cuadros que se esperan tras mover el tiempo y la cámara, para que todo se asiente.</summary>
        private const int CuadrosDeAsiento = 3;

        public static async Awaitable<JObject> TomarAsync(VisorCaso visor, string vista, int ancho, int alto)
        {
            if (!visor.Cargado)
            {
                throw new InvalidOperationException("No hay un caso cargado.");
            }

            ancho = Mathf.Clamp(ancho, 16, LadoMaximo);
            alto = Mathf.Clamp(alto, 16, LadoMaximo);
            string camara;
            double t;
            if (vista == "antes")
            {
                camara = "cinematica";
                t = -1.0;
            }
            else if (vista == "impacto")
            {
                camara = "cinematica";
                t = 0.0;
            }
            else if (vista == "reposo")
            {
                camara = "cinematica";
                t = visor.Fin;
            }
            else if (vista != null && vista.StartsWith("conductor:", StringComparison.Ordinal))
            {
                camara = vista;
                t = 0.0;
            }
            else
            {
                throw new ArgumentException("No hay una vista «" + vista + "».");
            }

            // Lo que hay que devolver como estaba.
            var tiempo = visor.Tiempo;
            var reproduciendo = visor.Reproduciendo;
            var modo = visor.Camara.Modo;
            var urp = QualitySettings.renderPipeline as UniversalRenderPipelineAsset;
            var escala = urp != null ? urp.renderScale : 1f;
            RenderTexture rt = null;
            Texture2D lectura = null;
            try
            {
                visor.Reproduciendo = false;
                visor.Fijar(t);
                if (!visor.Camara.Cambiar(camara))
                {
                    throw new ArgumentException("No hay una cámara «" + camara + "».");
                }

                for (var i = 0; i < CuadrosDeAsiento; i++)
                {
                    await Awaitable.NextFrameAsync();
                }

                await Awaitable.EndOfFrameAsync();
                if (urp != null)
                {
                    urp.renderScale = 1f;
                }

                var cam = Camera.main;
                rt = new RenderTexture(ancho, alto, 24, RenderTextureFormat.ARGB32, RenderTextureReadWrite.sRGB)
                {
                    name = "captura_" + vista,
                    antiAliasing = 1,
                };
                rt.Create();
                var pedido = new UniversalRenderPipeline.SingleCameraRequest { destination = rt };
                if (cam == null || !RenderPipeline.SupportsRenderRequest(cam, pedido))
                {
                    throw new InvalidOperationException("La canalización no puede dibujar la cámara en una textura.");
                }

                // El aspecto de la foto, no el de la ventana: la cámara se ajusta mientras se dibuja.
                var aspecto = cam.aspect;
                cam.aspect = (float)ancho / alto;
                try
                {
                    RenderPipeline.SubmitRenderRequest(cam, pedido);
                }
                finally
                {
                    cam.aspect = aspecto;
                    cam.ResetAspect();
                }

                var antes = RenderTexture.active;
                RenderTexture.active = rt;
                lectura = new Texture2D(ancho, alto, TextureFormat.RGB24, false);
                lectura.ReadPixels(new Rect(0, 0, ancho, alto), 0, 0);
                lectura.Apply(false);
                RenderTexture.active = antes;
                var png = lectura.EncodeToPNG();
                return new JObject { { "vista", vista }, { "png", Convert.ToBase64String(png) } };
            }
            finally
            {
                if (urp != null)
                {
                    urp.renderScale = escala;
                }

                if (rt != null)
                {
                    rt.Release();
                    UnityEngine.Object.Destroy(rt);
                }

                if (lectura != null)
                {
                    UnityEngine.Object.Destroy(lectura);
                }

                visor.Camara.Cambiar(modo);
                visor.Fijar(tiempo);
                visor.Reproduciendo = reproduciendo;
            }
        }
    }
}
