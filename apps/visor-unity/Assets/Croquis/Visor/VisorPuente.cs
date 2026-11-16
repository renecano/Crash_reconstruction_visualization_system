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
        public const string Version = "1.3.0";

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
            visor.PrecargarManifiesto();
            _ = PrecalentarAsync();
        }

        /// <summary>
        /// Mientras la web calcula el caso, se resuelve de antemano cómo se lee cada tipo del paquete, por
        /// partes: la primera lectura en una instancia nueva costaba un segundo más (René, 2026-11-16).
        /// </summary>
        private async Awaitable PrecalentarAsync()
        {
            var cuadro = System.Diagnostics.Stopwatch.StartNew();
            foreach (var _ in Paquete.Precalentar())
            {
                if (cuadro.Elapsed.TotalMilliseconds >= VisorCaso.PresupuestoPorCuadroMs)
                {
                    await Awaitable.NextFrameAsync();
                    cuadro.Restart();
                }
            }
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
            var turno = -1;
            try
            {
                // El sobre y el paquete se leen una vez cada uno (U6: antes eran tres lecturas completas).
                var reloj = System.Diagnostics.Stopwatch.StartNew();
                turno = visor.NuevoTurno();
                var json = Paquete.PropiedadDeTexto(texto, "json");
                var sobre = reloj.Elapsed.TotalMilliseconds;
                // Por partes (René, 2026-11-16): el suelo y la vía del escenario, cada uno en su cuadro.
                var lectura = new Paquete.LecturaPorPartes();
                var avisado = System.Diagnostics.Stopwatch.StartNew();
                var leidos = 0;
                foreach (var _ in Paquete.LeerPorPartes(json, lectura))
                {
                    leidos++;
                    // El avance, a lo más cada 100 ms: cada aviso vuelve a dibujar la barra en la web.
                    if (avisado.ElapsedMilliseconds >= 100)
                    {
                        avisado.Restart();
                        Enviar("progreso", new JObject { { "fraccion", Math.Round(0.1 * Math.Min(1.0, leidos / 600.0), 3) } });
                    }

                    await visor.Ceder(turno);
                }

                var caso = lectura.Caso;
                visor.LecturaDelPaquete = (sobre, reloj.Elapsed.TotalMilliseconds - sobre, json?.Length ?? 0);
                var escenaId = caso.Resultado.EscenaId;
                visor.AlAvanzar = (f, visible) =>
                {
                    Enviar("progreso", new JObject { { "fraccion", Math.Round(f, 3) } });
                    if (visible)
                    {
                        Enviar("visible", new JObject { { "escena_id", escenaId } });
                    }
                };
                await visor.CargarAsync(caso, turno);
                // Cuánto pasó desde que llegó el mensaje hasta avisar «cargado» (incluye el regreso del
                // await, que en Unity es en el cuadro siguiente: ahí se compilan los shaders de la escena).
                visor.PasosDeCarga["hasta_cargado"] = Math.Round(reloj.Elapsed.TotalMilliseconds, 1);
                Enviar("cargado", new JObject { { "escena_id", caso.Resultado.EscenaId } });
            }
            catch (OperationCanceledException)
            {
                // Llegó otro caso mientras este se armaba: el otro manda y este no avisa nada.
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
            finally
            {
                // Si llegó otro caso, el turno ya es otro y esto no lo toca.
                visor.TerminarTurno(turno);
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
                // La foto es de la escena completa: si el entorno todavía se arma, se espera.
                while (!visor.Cargado && visor.Armando)
                {
                    await Awaitable.NextFrameAsync();
                }

                var foto = await Captura.TomarAsync(visor, (string)j["vista"], (int?)j["ancho"] ?? 1600, (int?)j["alto"] ?? 900);
                Enviar("captura", foto);
            }
            catch (Exception e)
            {
                Debug.LogException(e);
                Error("captura_fallo", e.Message);
            }
        }

        /// <summary>El modo edición (`EditorEscena`): mover objetos o marcar puntos, según la herramienta.</summary>
        public void modoEdicion(string texto)
        {
            Campos(texto, j =>
            {
                var herramienta = (string)j["herramienta"] ?? "mover";
                if (herramienta != "mover" && herramienta != "punto_inicial" && herramienta != "choque_intermedio" && herramienta != "punto_paso")
                {
                    Error("interno", "No hay una herramienta «" + herramienta + "».");
                    return;
                }

                visor.Editor.Modo((bool)j["on"], herramienta, (string)j["vehiculo_id"]);
            });
        }

        /// <summary>Para lo que habla con la web sin ser el puente (el modo edición).</summary>
        public static void Avisar(string tipo, JObject campos)
        {
            Enviar(tipo, campos);
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
