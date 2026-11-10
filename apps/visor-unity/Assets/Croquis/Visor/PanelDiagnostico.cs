using System.Collections.Generic;
using System.Text;
using Croquis.Core;
using Unity.Profiling;
using UnityEngine;
using UnityEngine.Profiling;
using UnityEngine.UI;

namespace Croquis.Visor
{
    /// <summary>
    /// El panel de diagnóstico (U5): nivel de calidad y por qué, fps y tiempo de cuadro, resolución y
    /// escala, GPU, llamadas de dibujo y memoria. Se abre con F3, con `?diagnostico=1` en la página,
    /// con `-diagnostico` en el de escritorio o con `depurar` `{"diagnostico": true}`. No es para el
    /// perito: es para medir y para soporte.
    /// </summary>
    public sealed class PanelDiagnostico : MonoBehaviour
    {
        private const float SegundosPorTexto = 0.5f;

        private readonly List<float> cuadros = new List<float>(256);
        private readonly StringBuilder sb = new StringBuilder(512);
        private Text texto;
        private GameObject lienzo;
        private float desde;
        private ProfilerRecorder llamadas;
        private ProfilerRecorder lotes;
        private ProfilerRecorder triangulos;

        public static PanelDiagnostico Instancia { get; private set; }

        public bool Visible
        {
            get => lienzo != null && lienzo.activeSelf;
            set
            {
                Armar();
                lienzo.SetActive(value);
            }
        }

        private void Awake()
        {
            Instancia = this;
        }

        private void Start()
        {
            var url = Application.absoluteURL ?? string.Empty;
            var pedido = url.Contains("diagnostico=1");
            foreach (var a in System.Environment.GetCommandLineArgs())
            {
                pedido |= a == "-diagnostico";
            }

            if (pedido)
            {
                Visible = true;
            }
        }

        private void OnEnable()
        {
            llamadas = ProfilerRecorder.StartNew(ProfilerCategory.Render, "Draw Calls Count");
            lotes = ProfilerRecorder.StartNew(ProfilerCategory.Render, "Batches Count");
            triangulos = ProfilerRecorder.StartNew(ProfilerCategory.Render, "Triangles Count");
        }

        private void OnDisable()
        {
            llamadas.Dispose();
            lotes.Dispose();
            triangulos.Dispose();
        }

        private void Armar()
        {
            if (lienzo != null)
            {
                return;
            }

            lienzo = new GameObject("PanelDiagnostico");
            lienzo.transform.SetParent(transform, false);
            var canvas = lienzo.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = 200;
            var escala = lienzo.AddComponent<CanvasScaler>();
            escala.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            escala.referenceResolution = new Vector2(1280, 720);
            var fondo = new GameObject("fondo").AddComponent<Image>();
            fondo.transform.SetParent(lienzo.transform, false);
            fondo.color = new Color(0.05f, 0.06f, 0.07f, 0.78f);
            var rf = fondo.rectTransform;
            rf.anchorMin = rf.anchorMax = rf.pivot = new Vector2(0f, 1f);
            rf.anchoredPosition = new Vector2(10f, -10f);
            rf.sizeDelta = new Vector2(330f, 150f);
            texto = new GameObject("texto").AddComponent<Text>();
            texto.transform.SetParent(fondo.transform, false);
            texto.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            texto.fontSize = 12;
            texto.color = new Color(0.9f, 0.93f, 0.95f);
            texto.alignment = TextAnchor.UpperLeft;
            var rt = texto.rectTransform;
            rt.anchorMin = Vector2.zero;
            rt.anchorMax = Vector2.one;
            rt.offsetMin = new Vector2(8f, 6f);
            rt.offsetMax = new Vector2(-8f, -6f);
            lienzo.SetActive(false);
        }

        private void Update()
        {
            if (Input.GetKeyDown(KeyCode.F3))
            {
                Visible = !Visible;
            }

            cuadros.Add(Time.unscaledDeltaTime);
            desde += Time.unscaledDeltaTime;
            if (!Visible || desde < SegundosPorTexto)
            {
                if (cuadros.Count > 240)
                {
                    cuadros.RemoveRange(0, cuadros.Count - 240);
                }

                return;
            }

            desde = 0f;
            var orden = new List<float>(cuadros);
            orden.Sort();
            var total = 0f;
            foreach (var c in cuadros)
            {
                total += c;
            }

            var promedio = cuadros.Count / Mathf.Max(total, 1e-4f);
            var mediana = orden[orden.Count / 2] * 1000f;
            var p95 = orden[Mathf.Min(orden.Count - 1, (int)(orden.Count * 0.95f))] * 1000f;
            cuadros.Clear();

            var p = Calidad.Perfil;
            sb.Clear();
            sb.Append("Calidad: ").Append(Calidades.Nombre(p.Nivel)).Append(Calidad.Automatica ? " (automática)" : " (fija)").Append('\n');
            if (!string.IsNullOrEmpty(Calidad.UltimaBajada))
            {
                sb.Append("  ").Append(Calidad.UltimaBajada).Append('\n');
            }

            sb.Append($"fps: {promedio:F1}   cuadro: {mediana:F1} ms (p95 {p95:F1} ms)\n");
            sb.Append($"Pantalla: {Screen.width}×{Screen.height}  dpr {Calidad.Dpr:F2}  escala {Calidad.EscalaDibujo:F2}\n");
            sb.Append($"Sombras {p.DistanciaSombras:F0} m ×{p.Cascadas}  MSAA {p.Msaa}×  luces {p.LucesAdicionales}  oclusión {p.Oclusion}\n");
            sb.Append("GPU: ").Append(SystemInfo.graphicsDeviceName).Append(" · ").Append(SystemInfo.graphicsDeviceType).Append('\n');
            if (llamadas.Valid)
            {
                sb.Append($"Dibujo: {llamadas.LastValue} llamadas, {lotes.LastValue} lotes, {triangulos.LastValue / 1000} mil triángulos\n");
            }

            sb.Append($"Memoria: {Profiler.GetTotalAllocatedMemoryLong() / 1048576} MB usados de {Profiler.GetTotalReservedMemoryLong() / 1048576} MB");
            texto.text = sb.ToString();
        }
    }
}
