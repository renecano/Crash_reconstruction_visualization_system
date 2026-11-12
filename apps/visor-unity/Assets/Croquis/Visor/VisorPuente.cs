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
        public const string Version = "1.2.0";

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
            Calidad.Aplicar();
        }

        private void Start()
        {
            Enviar("listo", new JObject { { "version", Version } });
        }

        private void Update()
        {
            cuadros.Add(Time.unscaledDeltaTime);
            desdeFps += Time.unscaledDeltaTime;
            if (visor.Cargado)
            {
                Calidad.Cuadro(Time.unscaledDeltaTime);
            }

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
                    // Otra cámara es otra carga de dibujo: la escala automática se busca de nuevo.
                    Calidad.Reiniciar();
                    Enviar("camara", new JObject { { "modo", modo } });
                }
                else
                {
                    Error("interno", "No hay una cámara «" + modo + "».");
                }
            });
        }

        public void encuadrar(string texto)
        {
            Campos(texto, j =>
            {
                var antes = visor.Camara.Modo;
                var ahora = visor.Camara.Encuadrar((string)j["zona"]);
                if (ahora != antes)
                {
                    // «Ver todo» desde la cinematográfica, la acera o un conductor pasa a la órbita.
                    Calidad.Reiniciar();
                    Enviar("camara", new JObject { { "modo", ahora } });
                }
            });
        }

        public void marcadores(string texto)
        {
            Campos(texto, j => visor.Marcadores((bool)j["visibles"]));
        }

        /// <summary>
        /// Diagnóstico del dibujo en un build (no es parte del contrato): apaga una parte del posproceso
        /// o del ambiente para ver cuál falla en una plataforma.
        /// </summary>
        public void depurar(string texto)
        {
            Campos(texto, j =>
            {
                var perfil = Perfilado.Aplicar(j, visor.Raiz);
                if (perfil != null)
                {
                    perfil["pedido"] = j["pedido"];
                    Enviar("perfil", perfil);
                }

                var camara = Camera.main;
                var datos = camara.GetComponent<UnityEngine.Rendering.Universal.UniversalAdditionalCameraData>();
                if (j["pos"] != null)
                {
                    datos.renderPostProcessing = (bool)j["pos"];
                }

                if (j["nan"] != null)
                {
                    datos.stopNaN = (bool)j["nan"];
                }

                if (j["sonda"] != null)
                {
                    foreach (var sonda in FindObjectsByType<ReflectionProbe>(FindObjectsSortMode.None))
                    {
                        sonda.enabled = (bool)j["sonda"];
                    }
                }

                if (j["sombras"] != null)
                {
                    foreach (var luz in FindObjectsByType<Light>(FindObjectsSortMode.None))
                    {
                        luz.shadows = (bool)j["sombras"] ? LightShadows.Soft : LightShadows.None;
                    }
                }

                foreach (var sonda in FindObjectsByType<ReflectionProbe>(FindObjectsSortMode.None))
                {
                    if (j["sonda_hdr"] != null)
                    {
                        sonda.hdr = (bool)j["sonda_hdr"];
                    }

                    if (j["sonda_caja"] != null)
                    {
                        sonda.boxProjection = (bool)j["sonda_caja"];
                    }

                    if (j["sonda_tomar"] != null)
                    {
                        sonda.RenderProbe();
                    }
                }

                if (j["hdr"] != null)
                {
                    camara.allowHDR = (bool)j["hdr"];
                }

                if (j["niebla"] != null)
                {
                    RenderSettings.fog = (bool)j["niebla"];
                }

                if (j["msaa"] != null)
                {
                    camara.allowMSAA = (bool)j["msaa"];
                }

                var volumen = FindFirstObjectByType<UnityEngine.Rendering.Volume>();
                if (volumen != null && j["resplandor"] != null
                    && volumen.profile.TryGet<UnityEngine.Rendering.Universal.Bloom>(out var bloom))
                {
                    bloom.active = (bool)j["resplandor"];
                }

                if (volumen != null && j["tono"] != null
                    && volumen.profile.TryGet<UnityEngine.Rendering.Universal.Tonemapping>(out var tono))
                {
                    tono.active = (bool)j["tono"];
                }

                if (j["bucle"] != null)
                {
                    visor.Bucle = (bool)j["bucle"];
                }

                if (j["minimapa"] != null)
                {
                    visor.Camara.MinimapaVisible = (bool)j["minimapa"];
                }

                if (j["diagnostico"] != null && PanelDiagnostico.Instancia != null)
                {
                    PanelDiagnostico.Instancia.Visible = (bool)j["diagnostico"];
                }

                if (j["ambiente_plano"] != null && (bool)j["ambiente_plano"])
                {
                    RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Flat;
                    RenderSettings.ambientLight = new Color(0.4f, 0.42f, 0.45f);
                }

                if (j["cielo"] != null && !(bool)j["cielo"])
                {
                    camara.clearFlags = CameraClearFlags.SolidColor;
                    camara.backgroundColor = new Color(0.5f, 0.6f, 0.75f);
                }

                if (j["volumen_por_cuadro"] == null)
                {
                    Calidad.RefrescarPosproceso();
                }
            });
        }

        /// <summary>
        /// Fija el nivel, o lo deja automático (U5). Lo del escenario (matas, luminarias con luz, focos
        /// de los faros) toma el nivel nuevo al cargar el siguiente caso; la canalización, de inmediato.
        /// </summary>
        public void calidad(string texto)
        {
            Campos(texto, j =>
            {
                var nivel = (string)j["nivel"];
                if (nivel == "auto")
                {
                    Calidad.Automatico();
                }
                else if (Calidades.TryLeer(nivel, out var n))
                {
                    Calidad.Fijar(n);
                }
                else
                {
                    Error("interno", "No hay un nivel de calidad «" + nivel + "».");
                }
            });
        }

        /// <summary>Una foto del dictamen (`Captura`). Contesta `captura` o `error` con `captura_fallo`.</summary>
        public void capturar(string texto)
        {
            _ = CapturarAsync(texto);
        }

        private async Awaitable CapturarAsync(string texto)
        {
            try
            {
                var j = JObject.Parse(texto);
                var foto = await Captura.TomarAsync(visor, (string)j["vista"], (int?)j["ancho"] ?? 1600, (int?)j["alto"] ?? 900);
                Enviar("captura", foto);
            }
            catch (Exception e)
            {
                Debug.LogException(e);
                Error("captura_fallo", e.Message);
            }
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
