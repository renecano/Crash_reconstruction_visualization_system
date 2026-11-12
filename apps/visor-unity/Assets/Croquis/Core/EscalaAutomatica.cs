using System;

namespace Croquis.Core
{
    /// <summary>
    /// La escala de dibujo automática de media (U5, ADR 0115; René, 2026-11-11): cada escena se dibuja
    /// a la escala más alta, entre un piso y un techo, con que el equipo sostiene los fps objetivo.
    ///
    /// **Solo baja, nunca sube, dentro de un mismo caso:** así no oscila ni parpadea. Empieza arriba
    /// (en el techo, o un poco por encima de donde quedó el caso anterior) y, mientras los fps no
    /// lleguen, baja de un salto a la escala que el cuadro medido indica. Al llegar, deja un margen
    /// y se asienta. Después solo vuelve a bajar si los fps caen de forma sostenida (por ejemplo,
    /// cuando el impacto llena la escena de fragmentos). Si bajar no mejora los fps, la causa no son
    /// los pixeles: deshace ese paso y deja de bajar. Al cargar otro caso busca de nuevo.
    ///
    /// No sube porque con la pantalla sincronizada (60 Hz) no se puede saber cuánta holgura hay sin
    /// probar una escala mayor, y probar se ve como un tirón.
    /// </summary>
    public sealed class EscalaAutomatica
    {
        /// <summary>Los fps que busca (PLAN §7.8: media ≥ 60 fps).</summary>
        public const double FpsObjetivo = 60.0;

        /// <summary>Cuánto se mide antes de decidir mientras busca, y cuánto se espera tras cada cambio.</summary>
        public const double VentanaS = 1.0;

        public const double AsientoS = 0.3;

        /// <summary>Ya asentada, la caída tiene que durar: dos ventanas de este largo.</summary>
        public const double VentanaAsentadaS = 2.0;

        /// <summary>
        /// Llega con esta fracción del objetivo (59.1 fps): con la pantalla sincronizada a 60 Hz no se
        /// puede pedir más de 60, y un cuadro perdido cada tanto no cuenta.
        /// </summary>
        public const double Llega = 0.985;

        /// <summary>Ya asentada, baja si dos ventanas seguidas (4 s) quedan debajo de eso mismo.</summary>
        public const double Cae = 0.985;

        /// <summary>Al saltar apunta arriba del objetivo (64.8 fps), para no quedarse corta.</summary>
        public const double Apunta = 1.08;

        /// <summary>Si tras bajar los fps no suben al menos esto, bajar no ayuda: se deshace.</summary>
        public const double MejoraMinima = 1.01;

        /// <summary>El margen al asentarse: 6 % menos de escala (unos 12 % menos de pixeles).</summary>
        public const double Margen = 0.94;

        /// <summary>Con cuánta ventaja sobre el caso anterior empieza el siguiente.</summary>
        public const double Ventaja = 1.15;

        private const double PasoMinimo = 0.03;
        private const double CuadroLargoS = 0.25;
        private const int CuadrosMinimos = 5;

        private readonly double piso;
        private readonly double techo;
        private readonly double objetivo;
        private double acumulado;
        private int cuadros;
        private double espera;
        private bool bajo;
        private int ventanasMalas;
        private double anterior = double.NaN;
        private double escalaAntesDeBajar = double.NaN;
        private double fpsAntesDeBajar;
        private bool bajarNoAyuda;

        public EscalaAutomatica(double piso, double techo, double fpsObjetivo = FpsObjetivo)
        {
            if (!(piso > 0.0) || techo < piso || !(fpsObjetivo > 0.0))
            {
                throw new ArgumentOutOfRangeException(nameof(piso));
            }

            this.piso = piso;
            this.techo = techo;
            objetivo = fpsObjetivo;
            Escala = techo;
        }

        public double Escala { get; private set; }

        /// <summary>Ya encontró su escala: lo que la medición espera antes de contar cuadros.</summary>
        public bool Estable { get; private set; }

        /// <summary>Está en el piso y aun así no llega al objetivo.</summary>
        public bool EnElPisoSinLlegar { get; private set; }

        /// <summary>Los fps de la última ventana medida (para el panel de diagnóstico).</summary>
        public double UltimosFps { get; private set; } = double.NaN;

        /// <summary>Cuántas veces cambió la escala desde que se cargó el caso.</summary>
        public int Cambios { get; private set; }

        /// <summary>
        /// Anota un cuadro de `dt` segundos. Devuelve true si con él cambió la escala. Los cuadros
        /// largos (una pestaña en segundo plano, un tirón de carga) no cuentan: no son el dibujo.
        /// </summary>
        public bool Cuadro(double dt)
        {
            if (dt <= 0.0 || dt > CuadroLargoS)
            {
                return false;
            }

            if (espera > 0.0)
            {
                espera -= dt;
                return false;
            }

            acumulado += dt;
            cuadros++;
            if (acumulado < (Estable ? VentanaAsentadaS : VentanaS) || cuadros < CuadrosMinimos)
            {
                return false;
            }

            var fps = cuadros / acumulado;
            UltimosFps = fps;
            acumulado = 0.0;
            cuadros = 0;
            return Estable ? Vigilar(fps) : Buscar(fps);
        }

        /// <summary>
        /// Al cargar otro caso (o al cambiar el tamaño del lienzo) busca de nuevo, desde un poco más
        /// arriba de donde quedó: una escena más ligera recupera nitidez; una igual vuelve a su escala
        /// en un salto corto.
        /// </summary>
        public void Reiniciar()
        {
            if (Estable)
            {
                anterior = Escala;
            }

            Escala = double.IsNaN(anterior) ? techo : Math.Min(techo, anterior * Ventaja);
            Estable = false;
            EnElPisoSinLlegar = false;
            bajo = false;
            ventanasMalas = 0;
            escalaAntesDeBajar = double.NaN;
            bajarNoAyuda = false;
            Cambios = 0;
            acumulado = 0.0;
            cuadros = 0;
            espera = AsientoS;
        }

        private bool Buscar(double fps)
        {
            if (fps < objetivo * Llega)
            {
                if (Escala <= piso)
                {
                    EnElPisoSinLlegar = true;
                    Estable = true;
                    return false;
                }

                bajo = true;
                return Poner(Salto(fps));
            }

            // Llegó. Si para llegar tuvo que bajar, queda justa: se le deja un margen.
            Estable = true;
            return bajo && Poner(Escala * Margen);
        }

        private bool Vigilar(double fps)
        {
            if (!double.IsNaN(escalaAntesDeBajar))
            {
                // La primera ventana después de bajar: ¿sirvió?
                var antes = escalaAntesDeBajar;
                escalaAntesDeBajar = double.NaN;
                if (fps < fpsAntesDeBajar * MejoraMinima)
                {
                    // No: los cuadros lentos no son por los pixeles. Se devuelve la nitidez y ya no baja.
                    bajarNoAyuda = true;
                    ventanasMalas = 0;
                    return Poner(antes);
                }
            }

            if (fps >= objetivo * Cae)
            {
                ventanasMalas = 0;
                EnElPisoSinLlegar = false;
                return false;
            }

            ventanasMalas++;
            if (ventanasMalas < 2 || bajarNoAyuda)
            {
                return false;
            }

            ventanasMalas = 0;
            if (Escala <= piso)
            {
                EnElPisoSinLlegar = true;
                return false;
            }

            escalaAntesDeBajar = Escala;
            fpsAntesDeBajar = fps;
            return Poner(Salto(fps));
        }

        /// <summary>
        /// La escala a la que el cuadro medido daría el objetivo si todo su costo fuera por pixel
        /// (`ms ∝ escala²`). Como una parte del cuadro no depende de los pixeles, el salto se queda
        /// corto y hacen falta uno o dos más: se acerca desde arriba, sin pasarse.
        /// </summary>
        private double Salto(double fps)
        {
            var s = Escala * Math.Sqrt(fps / (objetivo * Apunta));
            return Math.Min(s, Escala - PasoMinimo);
        }

        private bool Poner(double s)
        {
            var nueva = Math.Max(piso, Math.Min(techo, s));
            if (Math.Abs(nueva - Escala) < 1e-6)
            {
                return false;
            }

            Escala = nueva;
            Cambios++;
            espera = AsientoS;
            acumulado = 0.0;
            cuadros = 0;
            return true;
        }
    }
}
