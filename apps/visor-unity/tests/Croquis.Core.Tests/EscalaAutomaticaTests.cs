using System;
using System.Collections.Generic;
using Croquis.Core;
using Xunit;

namespace Croquis.Core.Tests
{
    /// <summary>U5: la escala de dibujo automática de media (ADR 0115).</summary>
    public class EscalaAutomaticaTests
    {
        /// <summary>
        /// Un equipo de mentira: el cuadro cuesta `fijo` ms más `porPixeles` ms a escala 1 (el modelo
        /// medido en E6, `ms = F + P·escala²`). Con `pantallaHz`, la pantalla sincroniza: ningún cuadro
        /// dura menos que su periodo, y el que no alcanza espera al siguiente.
        /// </summary>
        private static List<double> Correr(EscalaAutomatica a, double fijo, double porPixeles, double segundos, double pantallaHz = 0)
        {
            var escalas = new List<double> { a.Escala };
            var t = 0.0;
            var deuda = 0.0;
            while (t < segundos)
            {
                var dt = (fijo + porPixeles * a.Escala * a.Escala) / 1000.0;
                if (pantallaHz > 0)
                {
                    // El promedio sigue al costo real: los cuadros duran periodos enteros de la pantalla.
                    var periodo = 1.0 / pantallaHz;
                    deuda += Math.Max(dt, periodo);
                    var enteros = Math.Max(1.0, Math.Floor(deuda / periodo + 1e-9));
                    dt = enteros * periodo;
                    deuda -= dt;
                }

                t += dt;
                if (a.Cuadro(dt))
                {
                    escalas.Add(a.Escala);
                }
            }

            return escalas;
        }

        private static double Fps(double fijo, double porPixeles, double escala)
        {
            return 1000.0 / (fijo + porPixeles * escala * escala);
        }

        [Fact]
        public void UnEquipoQueSobraSeQuedaEnElTecho()
        {
            var a = new EscalaAutomatica(0.5, 1.0);
            var escalas = Correr(a, 2, 6, 10);
            Assert.Equal(new[] { 1.0 }, escalas);
            Assert.True(a.Estable);
            Assert.False(a.EnElPisoSinLlegar);
        }

        [Theory]
        // Las cifras de E6 en la laptop (eval/results/u5_opciones.json): AXA de día y de noche.
        [InlineData(7.7, 25.0)]
        [InlineData(5.5, 33.4)]
        // Un equipo intermedio.
        [InlineData(4.0, 18.0)]
        public void BajaHastaLlegarAlObjetivoYDejaMargen(double fijo, double porPixeles)
        {
            var a = new EscalaAutomatica(0.5, 1.0);
            var escalas = Correr(a, fijo, porPixeles, 20);
            Assert.True(a.Estable);
            Assert.False(a.EnElPisoSinLlegar);
            Assert.InRange(a.Escala, 0.5, 1.0);
            // Llega con holgura, y no desperdicia: a una escala 15 % mayor ya no llegaría con ese margen.
            Assert.True(Fps(fijo, porPixeles, a.Escala) >= 61.0, $"fps {Fps(fijo, porPixeles, a.Escala):F1} a escala {a.Escala:F3}");
            Assert.True(Fps(fijo, porPixeles, Math.Min(1.0, a.Escala * 1.15)) < 61.0 || a.Escala * 1.15 > 1.0);
            // Pocos cambios y siempre hacia abajo: no oscila.
            Assert.InRange(escalas.Count, 2, 6);
            for (var i = 1; i < escalas.Count; i++)
            {
                Assert.True(escalas[i] < escalas[i - 1]);
            }
        }

        [Fact]
        public void NoBajaDelPisoAunqueNoLlegue()
        {
            // Lluvia de noche en la laptop: ni a 0.5 llega a 60 fps.
            var a = new EscalaAutomatica(0.5, 1.0);
            Correr(a, 12.2, 28.0, 20);
            Assert.Equal(0.5, a.Escala);
            Assert.True(a.Estable);
            Assert.True(a.EnElPisoSinLlegar);
        }

        [Fact]
        public void ConLaPantallaSincronizadaLlegaIgualYNoSeMueve()
        {
            var a = new EscalaAutomatica(0.5, 1.0);
            var escalas = Correr(a, 7.7, 25.0, 30, 60);
            Assert.True(a.Estable);
            Assert.True(Fps(7.7, 25.0, a.Escala) >= 60.0);
            Assert.InRange(escalas.Count, 2, 6);
            // Ya asentada, a 60 fps clavados, no cambia más.
            Assert.Single(Correr(a, 7.7, 25.0, 30, 60));
        }

        [Fact]
        public void YaAsentadaSoloBajaConUnaCaidaSostenida()
        {
            var a = new EscalaAutomatica(0.5, 1.0);
            Correr(a, 4.0, 18.0, 10);
            var asentada = a.Escala;

            // Un tirón de un segundo (más pesada un momento) no la mueve.
            Correr(a, 4.0, 18.0 * 1.3, 1.0);
            Correr(a, 4.0, 18.0, 6);
            Assert.Equal(asentada, a.Escala);

            // La escena se pone más pesada y se queda así: baja.
            Correr(a, 6.0, 26.0, 12);
            Assert.True(a.Escala < asentada);
            Assert.True(Fps(6.0, 26.0, a.Escala) >= 60.0 * EscalaAutomatica.Cae);
            var pesada = a.Escala;

            // Y cuando vuelve a aligerarse no sube: dentro de un caso solo baja.
            Correr(a, 4.0, 18.0, 10);
            Assert.Equal(pesada, a.Escala);
        }

        [Fact]
        public void SiBajarNoMejoraLosFpsLoDeshaceYDejaDeBajar()
        {
            var a = new EscalaAutomatica(0.5, 1.0);
            Correr(a, 4.0, 18.0, 10);
            var asentada = a.Escala;

            // Algo ajeno al dibujo (otro programa, el navegador) deja el visor en 50 fps a cualquier
            // escala: bajar no sirve. Prueba un paso, ve que no mejora y regresa a donde estaba.
            var cambios = 0;
            for (var i = 0; i < 50 * 30; i++)
            {
                cambios += a.Cuadro(1.0 / 50.0) ? 1 : 0;
            }

            Assert.Equal(2, cambios);
            Assert.Equal(asentada, a.Escala);
        }

        [Fact]
        public void AlCargarOtroCasoBuscaDeNuevoDesdeUnPocoMasArriba()
        {
            var a = new EscalaAutomatica(0.5, 1.0);
            Correr(a, 6.0, 26.0, 10);
            var pesada = a.Escala;

            a.Reiniciar();
            Assert.False(a.Estable);
            Assert.Equal(Math.Min(1.0, pesada * EscalaAutomatica.Ventaja), a.Escala, 6);
            Assert.Equal(0, a.Cambios);

            // El caso siguiente es más ligero: recupera nitidez.
            Correr(a, 3.0, 10.0, 10);
            Assert.True(a.Escala > pesada);
        }

        [Fact]
        public void LosCuadrosLargosNoCuentan()
        {
            var a = new EscalaAutomatica(0.5, 1.0);
            for (var i = 0; i < 20; i++)
            {
                Assert.False(a.Cuadro(0.4));
            }

            Assert.Equal(1.0, a.Escala);
            Assert.False(a.Estable);
        }

        [Fact]
        public void SoloMediaLlevaEscalaAutomatica()
        {
            var media = Calidades.Perfil(NivelCalidad.Media);
            Assert.Equal(0.5, media.EscalaMinima);
            Assert.Equal(1.0, media.EscalaMaxima);
            Assert.True(Calidades.EscalaEsAutomatica(media));
            foreach (var n in new[] { NivelCalidad.Baja, NivelCalidad.Alta, NivelCalidad.Ultra })
            {
                var p = Calidades.Perfil(n);
                Assert.False(Calidades.EscalaEsAutomatica(p));
                Assert.Equal(1.0, p.EscalaMinima);
                Assert.Equal(1.0, p.EscalaMaxima);
            }
        }
    }
}
