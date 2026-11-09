using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using Croquis.Core;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace Croquis.Visor
{
    /// <summary>
    /// El puente con la web (packages/scene-schema/visor-puente.md). El GameObject se llama
    /// «VisorPuente» y cada método público se llama como su mensaje, porque así los busca SendMessage.
    /// </summary>
    public sealed class VisorPuente : MonoBehaviour
    {
        /// <summary>La versión del contrato: debe coincidir con VISOR_PUENTE_VERSION.</summary>
        public const string Version = "1.1.0";

        private const float SegundosPorReporteFps = 5f;
        private const float SegundosPorReporteTiempo = 0.1f;

        private readonly List<float> cuadros = new List<float>(512);
        private VisorCaso visor;
        private float desdeFps;
        private float desdeTiempo;

#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")]
        private static extern void CroquisEnviarAWeb(string texto);
#else
        private static void CroquisEnviarAWeb(string texto)
        {
            Debug.Log("[puente] " + texto);
        }
#endif

        private void Awake()
        {
            visor = GetComponent<VisorCaso>();
            Application.targetFrameRate = -1;
        }

        private void Start()
        {
            Enviar("listo", new JObject { { "version", Version } });
        }

        private void Update()
        {
            cuadros.Add(Time.unscaledDeltaTime);
            desdeFps += Time.unscaledDeltaTime;
            if (desdeFps >= SegundosPorReporteFps)
            {
                cuadros.Sort();
                var mediano = cuadros[cuadros.Count / 2];
                Enviar("fps", new JObject { { "p50", Math.Round(1f / Mathf.Max(mediano, 1e-4f), 1) } });
                cuadros.Clear();
                desdeFps = 0f;
            }

            if (visor.Reproduciendo)
            {
                desdeTiempo += Time.unscaledDeltaTime;
                if (desdeTiempo >= SegundosPorReporteTiempo)
                {
                    desdeTiempo = 0f;
                    Enviar("tiempo", new JObject { { "t", Math.Round(visor.Tiempo, 3) } });
                }
            }
        }

        public void cargarCaso(string texto)
        {
            _ = CargarAsync(texto);
        }

        private async Awaitable CargarAsync(string texto)
        {
            try
            {
                var json = (string)JObject.Parse(texto)["json"];
                var caso = Paquete.Leer(json);
                await visor.CargarAsync(caso);
                Enviar("cargado", new JObject { { "escena_id", caso.Resultado.EscenaId } });
            }
            catch (FormatException e)
            {
                Error("caso_invalido", e.Message);
            }
            catch (ModeloNoCargo e)
            {
                Error("modelo_no_cargo", e.Message);
            }
            catch (Exception e)
            {
                Debug.LogException(e);
                Error("interno", e.Message);
            }
        }

        public void fijarTiempo(string texto)
        {
            Campos(texto, j => visor.Fijar((double)j["t"]));
        }

        public void reproducir(string texto)
        {
            visor.Reproduciendo = true;
        }

        public void pausar(string texto)
        {
            visor.Reproduciendo = false;
        }

        public void velocidad(string texto)
        {
            Campos(texto, j => visor.Velocidad = Mathf.Clamp((float)j["x"], 0.05f, 4f));
        }

        public void camara(string texto)
        {
            Campos(texto, j =>
            {
                var modo = (string)j["modo"];
                if (visor.Camara.Cambiar(modo))
                {
                    Enviar("camara", new JObject { { "modo", modo } });
                }
                else
                {
                    Error("interno", "La cámara «" + modo + "» llega en U4.");
                }
            });
        }

        public void encuadrar(string texto)
        {
            Campos(texto, j => visor.Camara.Encuadrar((string)j["zona"]));
        }

        public void marcadores(string texto)
        {
            Campos(texto, j => visor.Marcadores((bool)j["visibles"]));
        }

        public void calidad(string texto)
        {
            Error("interno", "Los niveles de calidad llegan en U5.");
        }

        public void capturar(string texto)
        {
            Error("captura_fallo", "Las fotos del dictamen llegan en U6.");
        }

        public void modoEdicion(string texto)
        {
            Error("interno", "La edición en 3D llega en U6.");
        }

        private void Campos(string texto, Action<JObject> hacer)
        {
            try
            {
                hacer(JObject.Parse(texto));
            }
            catch (Exception e)
            {
                Debug.LogException(e);
                Error("interno", e.Message);
            }
        }

        private void Error(string codigo, string mensaje)
        {
            Enviar("error", new JObject { { "codigo", codigo }, { "mensaje", mensaje } });
        }

        private static void Enviar(string tipo, JObject campos)
        {
            campos["tipo"] = tipo;
            CroquisEnviarAWeb(campos.ToString(Newtonsoft.Json.Formatting.None));
        }
    }
}
