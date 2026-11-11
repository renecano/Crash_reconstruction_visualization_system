using System;
using System.Collections.Generic;

namespace Croquis.Core
{
    /// <summary>Los cuatro niveles de `PLAN.md` §7.8, de menos a más.</summary>
    public enum NivelCalidad
    {
        Baja = 0,
        Media = 1,
        Alta = 2,
        Ultra = 3,
    }

    /// <summary>
    /// Lo que cambia entre niveles (U5, ADR 0115). Baja y media se ajustan a la laptop de 8 GB con
    /// GPU integrada; alta y ultra buscan la máxima calidad y nunca se recortan por la laptop. Ningún
    /// nivel quita una función: faros, alumbrado, lluvia, evidencias y marcadores están en los cuatro.
    /// </summary>
    public sealed class PerfilCalidad
    {
        public NivelCalidad Nivel { get; set; }

        /// <summary>Tope de píxeles por pixel CSS (el dpr): la escala de dibujo nunca lo pasa.</summary>
        public double DprMaximo { get; set; }

        /// <summary>Muestras de MSAA (1: sin antialiasing).</summary>
        public int Msaa { get; set; }

        /// <summary>Hasta dónde llegan las sombras del sol o de la luna (m) y en cuántas cascadas.</summary>
        public double DistanciaSombras { get; set; }

        public int Cascadas { get; set; }

        /// <summary>Lado del mapa de sombras del sol (texeles).</summary>
        public int MapaSombras { get; set; }

        /// <summary>Luces adicionales por objeto (faros, alumbrado).</summary>
        public int LucesAdicionales { get; set; }

        /// <summary>Sombras de faros y luminarias.</summary>
        public bool SombrasDeFocos { get; set; }

        /// <summary>Calidad del suavizado de sombras de URP: 1 baja, 2 media, 3 alta.</summary>
        public int SombraSuave { get; set; }

        /// <summary>
        /// Oclusión ambiental: 0, sin ella; 1, ligera (a media resolución, con las normales sacadas de la
        /// profundidad y aplicada después de los opacos, sin pasada extra de geometría); 2, completa.
        /// </summary>
        public int Oclusion { get; set; }

        /// <summary>Suavizado de bordes por posproceso (FXAA), en vez de MSAA.</summary>
        public bool Fxaa { get; set; }

        /// <summary>
        /// El suelo con sus capas (tonos y parcelas) en una sola pasada, en vez de tres mallas con su
        /// sombreado completo cada una. Da el mismo color.
        /// </summary>
        public bool SueloEnUnaPasada { get; set; }

        /// <summary>
        /// La sombra de la luna (la direccional de noche). Junto a faros y luminarias no se distingue
        /// (0.28 niveles de 255 de diferencia media, `eval/results/u5_diferencia_*`), y su pasada cuesta.
        /// </summary>
        public bool SombraDeLuna { get; set; }

        /// <summary>La sombra de las piezas opacas de cada vehículo y del escenario, en una sola malla.</summary>
        public bool SombrasUnidas { get; set; }

        /// <summary>El minimapa con la escena fija horneada una vez; por cuadro, solo lo que se mueve.</summary>
        public bool MinimapaHorneado { get; set; }

        /// <summary>Si la lluvia también se dibuja en el minimapa (su geometría se calcula por cámara).</summary>
        public bool LluviaEnMinimapa { get; set; }

        /// <summary>Resplandor de faros y superficies muy brillantes.</summary>
        public bool Resplandor { get; set; }

        /// <summary>Lado de la sonda de reflejos del escenario.</summary>
        public int Sonda { get; set; }

        /// <summary>Matas sembradas en el pasto (intentos; las que caen en la vía se descartan).</summary>
        public int Matas { get; set; }

        /// <summary>Grupos de matorrales por cada 100 m de orilla de carretera.</summary>
        public double MatorralesPor100M { get; set; }

        /// <summary>Luminarias encendidas con luz real de noche (las demás brillan sin iluminar).</summary>
        public int Luminarias { get; set; }

        /// <summary>Focos por vehículo: uno al centro o uno por faro.</summary>
        public int FocosPorVehiculo { get; set; }
    }

    public static class Calidades
    {
        /// <summary>fps sostenidos por debajo de los cuales el modo automático baja un nivel (René, 2026-11-04).</summary>
        public const double BajarDebajoDeFps = 24.0;

        /// <summary>Durante cuánto se miden esos fps antes de decidir.</summary>
        public const double VentanaS = 5.0;

        public static readonly IReadOnlyList<NivelCalidad> Todos =
            new[] { NivelCalidad.Baja, NivelCalidad.Media, NivelCalidad.Alta, NivelCalidad.Ultra };

        /// <summary>
        /// Los perfiles. Media y alta son los ajustes que ya tenían el build web y el de escritorio
        /// (medidos en U2): pasarlos a niveles no cambia su aspecto.
        /// </summary>
        public static PerfilCalidad Perfil(NivelCalidad n)
        {
            switch (n)
            {
                case NivelCalidad.Baja:
                    return new PerfilCalidad
                    {
                        Nivel = n, DprMaximo = 0.75, Msaa = 1, DistanciaSombras = 50, Cascadas = 1, MapaSombras = 1024,
                        SueloEnUnaPasada = true, SombrasUnidas = true, MinimapaHorneado = true,
                        LucesAdicionales = 4, SombrasDeFocos = false, SombraSuave = 1, Oclusion = 0, Resplandor = false,
                        Sonda = 64, Matas = 3500, MatorralesPor100M = 1.5, Luminarias = 2, FocosPorVehiculo = 1,
                    };
                case NivelCalidad.Media:
                    return new PerfilCalidad
                    {
                        // U5: una cascada de 2048 a 70 m da la misma sombra que dos de 1024 a 80 m, y FXAA con
                        // la oclusión ligera evita dos pasadas completas de geometría (medido en ADR 0115).
                        Nivel = n, DprMaximo = 1.0, Msaa = 1, Fxaa = true, DistanciaSombras = 70, Cascadas = 1, MapaSombras = 2048,
                        SueloEnUnaPasada = true, SombrasUnidas = true, MinimapaHorneado = true,
                        LucesAdicionales = 4, SombrasDeFocos = false, SombraSuave = 1, Oclusion = 1, Resplandor = true,
                        Sonda = 128, Matas = 7000, MatorralesPor100M = 2.5, Luminarias = 3, FocosPorVehiculo = 1,
                    };
                case NivelCalidad.Alta:
                    return new PerfilCalidad
                    {
                        Nivel = n, DprMaximo = 1.5, Msaa = 4, DistanciaSombras = 110, Cascadas = 4, MapaSombras = 4096,
                        LluviaEnMinimapa = true, SombraDeLuna = true, LucesAdicionales = 8, SombrasDeFocos = true, SombraSuave = 2, Oclusion = 2, Resplandor = true,
                        Sonda = 256, Matas = 14000, MatorralesPor100M = 3.5, Luminarias = 6, FocosPorVehiculo = 2,
                    };
                case NivelCalidad.Ultra:
                    return new PerfilCalidad
                    {
                        Nivel = n, DprMaximo = 2.0, Msaa = 4, DistanciaSombras = 150, Cascadas = 4, MapaSombras = 4096,
                        LluviaEnMinimapa = true, SombraDeLuna = true, LucesAdicionales = 8, SombrasDeFocos = true, SombraSuave = 3, Oclusion = 2, Resplandor = true,
                        Sonda = 512, Matas = 18000, MatorralesPor100M = 4.5, Luminarias = 8, FocosPorVehiculo = 2,
                    };
                default:
                    throw new ArgumentOutOfRangeException(nameof(n));
            }
        }

        public static string Nombre(NivelCalidad n)
        {
            return n.ToString().ToLowerInvariant();
        }

        public static bool TryLeer(string texto, out NivelCalidad n)
        {
            foreach (var x in Todos)
            {
                if (string.Equals(Nombre(x), texto, StringComparison.Ordinal))
                {
                    n = x;
                    return true;
                }
            }

            n = NivelCalidad.Media;
            return false;
        }

        /// <summary>
        /// El nivel con que arranca el modo automático, como en la web (ADR 0026): el visor web, en
        /// media; el de escritorio, en alta con tarjeta de video dedicada y en media con una integrada;
        /// un teléfono o tableta, en baja. Ultra solo se elige a mano.
        /// </summary>
        public static NivelCalidad Inicial(bool web, bool movil, string gpu, int memoriaGpuMb)
        {
            if (movil)
            {
                return NivelCalidad.Baja;
            }

            if (web)
            {
                return NivelCalidad.Media;
            }

            return EsIntegrada(gpu, memoriaGpuMb) ? NivelCalidad.Media : NivelCalidad.Alta;
        }

        /// <summary>Una GPU integrada: Intel (salvo Arc), los Radeon «Graphics» de los Ryzen, o menos de 2 GB propios.</summary>
        public static bool EsIntegrada(string gpu, int memoriaGpuMb)
        {
            var g = (gpu ?? string.Empty).ToLowerInvariant();
            if (g.Contains("intel") && !g.Contains("arc"))
            {
                return true;
            }

            if (g.Contains("radeon") && g.Contains("graphics") && !g.Contains("rx"))
            {
                return true;
            }

            return memoriaGpuMb > 0 && memoriaGpuMb < 2048;
        }

        /// <summary>
        /// La escala de dibujo de URP para no pasar el tope de dpr del nivel: con una pantalla de dpr 2
        /// y media (tope 1), se dibuja a la mitad y se escala. Nunca más de 1: el tope no sobremuestrea.
        /// </summary>
        public static double EscalaDibujo(PerfilCalidad p, double dprPantalla)
        {
            var dpr = dprPantalla > 0.0 ? dprPantalla : 1.0;
            return Math.Max(0.25, Math.Min(1.0, p.DprMaximo / dpr));
        }
    }

    /// <summary>
    /// El modo automático (René, 2026-11-04): nunca sube durante la sesión, y baja un nivel, de uno en
    /// uno, cuando los fps de los últimos 5 s quedan debajo de 24. Tras bajar vuelve a medir desde cero.
    /// </summary>
    public sealed class CalidadAutomatica
    {
        private double acumulado;
        private int cuadros;

        public CalidadAutomatica(NivelCalidad inicial)
        {
            Nivel = inicial;
        }

        public NivelCalidad Nivel { get; private set; }

        /// <summary>Los fps de la última ventana completa (para el panel de diagnóstico).</summary>
        public double UltimosFps { get; private set; } = double.NaN;

        /// <summary>
        /// Anota un cuadro de `dt` segundos. Devuelve true si con él bajó de nivel. Los cuadros de más de
        /// 1 s (una pestaña en segundo plano, la carga de un modelo) no cuentan: no son el dibujo.
        /// </summary>
        public bool Cuadro(double dt)
        {
            if (dt <= 0.0 || dt > 1.0)
            {
                return false;
            }

            acumulado += dt;
            cuadros++;
            if (acumulado < Calidades.VentanaS)
            {
                return false;
            }

            UltimosFps = cuadros / acumulado;
            acumulado = 0.0;
            cuadros = 0;
            if (UltimosFps < Calidades.BajarDebajoDeFps && Nivel > NivelCalidad.Baja)
            {
                Nivel = Nivel - 1;
                return true;
            }

            return false;
        }

        /// <summary>Al cargar otro caso se mide desde cero: la carga no cuenta como dibujo lento.</summary>
        public void Reiniciar()
        {
            acumulado = 0.0;
            cuadros = 0;
        }
    }
}
