using System;
using System.Runtime.InteropServices;
using Croquis.Core;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace Croquis.Visor
{
    /// <summary>
    /// El nivel de calidad del visor (U5, ADR 0115): baja, media, alta y ultra, con las reglas de la
    /// web. Cada nivel es un nivel de `QualitySettings` con su canalización URP (sombras, MSAA, luces,
    /// oclusión), que `ConstruirVisor` arma al preparar el proyecto; aquí se elige, se aplica el tope
    /// de dpr y, en automático, se baja un nivel si los fps no llegan a 24 durante 5 s. Lo que es del
    /// escenario (matas, luminarias con luz, focos de los faros, la sonda) se lee al armar el caso.
    ///
    /// En media, además, la escala de dibujo se ajusta sola (`EscalaAutomatica`): cada escena, a la
    /// más alta con que el equipo sostiene 60 fps, entre el piso y el techo del perfil. Eso corre
    /// también con el nivel fijado a mano: fijar «media» fija el nivel, no la escala.
    /// </summary>
    public static class Calidad
    {
        private static CalidadAutomatica automatica;
        private static EscalaAutomatica escala;
        private static NivelCalidad nivelDeLaEscala;
        private static int anchoMedido;
        private static int altoMedido;

#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")]
        private static extern double CroquisDpr();
#else
        private static double CroquisDpr()
        {
            return 1.0;
        }
#endif

        /// <summary>Las capturas del Editor lo fijan para ver lo mismo que el build de su destino.</summary>
        public static NivelCalidad? Forzado { get; set; }

        public static NivelCalidad Nivel { get; private set; } = Inicial();

        public static PerfilCalidad Perfil => Calidades.Perfil(Forzado ?? Nivel);

        /// <summary>Si el nivel lo decide el visor (empieza así) o lo fijó el perito.</summary>
        public static bool Automatica { get; private set; } = true;

        /// <summary>De qué nivel bajó el automático, cuándo y con cuántos fps (para el panel).</summary>
        public static string UltimaBajada { get; private set; }

        public static double EscalaDibujo { get; private set; } = 1.0;

        /// <summary>Una escala puesta a mano (la medición, `depurar`): apaga la automática.</summary>
        public static double? EscalaFija { get; private set; }

        /// <summary>La escala automática del nivel actual, o null si el nivel no la lleva o está fijada.</summary>
        public static EscalaAutomatica EscalaAuto => EscalaFija.HasValue ? null : escala;

        public static double Dpr => CroquisDpr();

        /// <summary>Avisa cuando cambia el nivel (el panel de diagnóstico lo muestra).</summary>
        public static event Action Cambio;

        public static NivelCalidad Inicial()
        {
            return Calidades.Inicial(
                Application.platform == RuntimePlatform.WebGLPlayer,
                Application.isMobilePlatform || SystemInfo.deviceType == DeviceType.Handheld,
                SystemInfo.graphicsDeviceName,
                SystemInfo.graphicsMemorySize);
        }

        /// <summary>El perito (o la medición) fija un nivel: el automático se apaga.</summary>
        public static void Fijar(NivelCalidad n)
        {
            Automatica = false;
            Nivel = n;
            Aplicar();
        }

        /// <summary>Vuelve al automático desde el nivel actual: nunca sube durante la sesión.</summary>
        public static void Automatico()
        {
            Automatica = true;
            automatica = new CalidadAutomatica(Nivel);
            Cambio?.Invoke();
        }

        /// <summary>Fija la escala de dibujo (null: la devuelve al nivel, automática si es media).</summary>
        public static void FijarEscala(double? valor)
        {
            EscalaFija = valor;
            escala?.Reiniciar();
            PonerEscala();
            Cambio?.Invoke();
        }

        /// <summary>
        /// Cada cuadro: en media, la escala automática; y, con el nivel en automático, baja un nivel si
        /// los últimos 5 s no llegaron a 24 fps.
        /// </summary>
        public static void Cuadro(float dt)
        {
            if (Forzado.HasValue)
            {
                return;
            }

            var auto = EscalaAuto;
            if (auto != null)
            {
                if (Screen.width != anchoMedido || Screen.height != altoMedido)
                {
                    // Otro tamaño de lienzo son otros pixeles: busca de nuevo.
                    anchoMedido = Screen.width;
                    altoMedido = Screen.height;
                    auto.Reiniciar();
                    PonerEscala();
                }
                else if (auto.Cuadro(dt))
                {
                    PonerEscala();
                    // Mientras la escala se acomoda, esos cuadros no cuentan para bajar de nivel.
                    automatica?.Reiniciar();
                    Cambio?.Invoke();
                }
            }

            if (!Automatica)
            {
                return;
            }

            automatica ??= new CalidadAutomatica(Nivel);
            var antes = Nivel;
            if (automatica.Cuadro(dt))
            {
                Nivel = automatica.Nivel;
                UltimaBajada = $"bajó de {Calidades.Nombre(antes)} a {Calidades.Nombre(Nivel)} con {automatica.UltimosFps:F0} fps";
                Debug.Log("[calidad] " + UltimaBajada);
                Aplicar();
            }
        }

        public static double UltimosFps => automatica?.UltimosFps ?? double.NaN;

        /// <summary>La carga de un caso no cuenta como dibujo lento, y la escala se busca de nuevo.</summary>
        public static void Reiniciar()
        {
            automatica?.Reiniciar();
            if (EscalaAuto != null)
            {
                escala.Reiniciar();
                PonerEscala();
            }
        }

        /// <summary>
        /// La escala de URP: el tope de dpr del nivel por la escala automática (o la fijada a mano).
        /// </summary>
        private static void PonerEscala()
        {
            var perfil = Perfil;
            var tope = Calidades.EscalaDibujo(perfil, Dpr);
            EscalaDibujo = EscalaFija ?? (escala != null ? tope * escala.Escala : tope);
            if (QualitySettings.renderPipeline is UniversalRenderPipelineAsset urp && Application.isPlaying)
            {
                urp.renderScale = (float)EscalaDibujo;
            }
        }

        /// <summary>
        /// El posproceso (tono, resplandor, exposición) solo cambia al cargar un caso o al cambiar de
        /// nivel: URP lo interpolaba en cada cuadro y por cada cámara. Aquí se calcula una vez; quien
        /// cambie el volumen llama a esto.
        /// </summary>
        public static void RefrescarPosproceso()
        {
            var camara = Camera.main;
            if (camara == null || !Application.isPlaying || !camara.TryGetComponent<UniversalAdditionalCameraData>(out var datos))
            {
                return;
            }

            camara.SetVolumeFrameworkUpdateMode(VolumeFrameworkUpdateMode.ViaScripting);
            camara.UpdateVolumeStack(datos);
        }

        /// <summary>Pone el nivel de `QualitySettings` (y con él su canalización) y la escala por el dpr.</summary>
        public static void Aplicar()
        {
            var perfil = Perfil;
            var nombre = Calidades.Nombre(perfil.Nivel);
            var indice = Array.IndexOf(QualitySettings.names, nombre);
            if (indice >= 0 && QualitySettings.GetQualityLevel() != indice)
            {
                QualitySettings.SetQualityLevel(indice, true);
            }

            if (!Calidades.EscalaEsAutomatica(perfil) || !Application.isPlaying)
            {
                // Las capturas del Editor no ajustan la escala: salen a la del tope de dpr.
                escala = null;
            }
            else if (escala == null || nivelDeLaEscala != perfil.Nivel)
            {
                escala = new EscalaAutomatica(perfil.EscalaMinima, perfil.EscalaMaxima);
                escala.Reiniciar();
                nivelDeLaEscala = perfil.Nivel;
                anchoMedido = Screen.width;
                altoMedido = Screen.height;
            }

            PonerEscala();
            QualitySettings.vSyncCount = 0;
            var volumen = UnityEngine.Object.FindFirstObjectByType<Volume>();
            if (volumen != null && volumen.profile != null && volumen.profile.TryGet<Bloom>(out var bloom))
            {
                bloom.active = perfil.Resplandor;
            }

            var camara = Camera.main;
            if (camara != null && camara.TryGetComponent<UniversalAdditionalCameraData>(out var datos))
            {
                datos.antialiasing = perfil.Fxaa ? AntialiasingMode.FastApproximateAntialiasing : AntialiasingMode.None;
            }

            RefrescarPosproceso();

            Cambio?.Invoke();
        }
    }
}
