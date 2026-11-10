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
    /// </summary>
    public static class Calidad
    {
        private static CalidadAutomatica automatica;

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

        /// <summary>Cada cuadro, en automático: baja un nivel si los últimos 5 s no llegaron a 24 fps.</summary>
        public static void Cuadro(float dt)
        {
            if (!Automatica || Forzado.HasValue)
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

        /// <summary>La carga de un caso no cuenta como dibujo lento.</summary>
        public static void Reiniciar()
        {
            automatica?.Reiniciar();
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

            EscalaDibujo = Calidades.EscalaDibujo(perfil, Dpr);
            if (QualitySettings.renderPipeline is UniversalRenderPipelineAsset urp && Application.isPlaying)
            {
                urp.renderScale = (float)EscalaDibujo;
            }

            QualitySettings.vSyncCount = 0;
            var volumen = UnityEngine.Object.FindFirstObjectByType<Volume>();
            if (volumen != null && volumen.profile != null && volumen.profile.TryGet<Bloom>(out var bloom))
            {
                bloom.active = perfil.Resplandor;
            }

            Cambio?.Invoke();
        }
    }
}
