using System.Collections.Generic;
using Croquis.Core;
using Croquis.Generated;
using UnityEngine;

namespace Croquis.Visor
{
    /// <summary>
    /// Lo que se dibuja del trayecto previo (René, 2026-11-27; docs/contrato-unity.md §4): la ruta como
    /// línea punteada en otro color (es ilustrativa y se distingue del tramo reconstruido) y, lejos de la
    /// escena, un entorno ligero: la calle como una franja de asfalto y un piso grande debajo de todo. Cerca
    /// del choque queda la escena de siempre; lejos, nada de edificios ni árboles detallados: así un
    /// trayecto de kilómetros no traba el visor.
    /// </summary>
    public static class RutaPreviaVista
    {
        /// <summary>A partir de qué distancia del choque la calle va como franja sencilla (m).</summary>
        public const float Lejos = 160f;

        private const float AnchoCalle = 7f;

        public static void Construir(Transform padre, IEnumerable<VehiculoVista> vehiculos, Terreno terreno, SueloEscenario[] suelos, PaisajeEntorno? paisaje, bool noche)
        {
            var raiz = new GameObject("trayecto_previo").transform;
            raiz.SetParent(padre, false);
            var guiones = new Malla();
            var calle = new Malla();
            var centro = EscenarioVista.CentroDelHecho;
            float x0 = float.MaxValue, y0 = float.MaxValue, x1 = float.MinValue, y1 = float.MinValue, zMin = float.MaxValue;
            var hay = false;
            foreach (var v in vehiculos)
            {
                var tr = v.Previo;
                if (tr == null)
                {
                    continue;
                }

                hay = true;
                for (var i = 0; i < tr.X.Length; i++)
                {
                    var x = (float)tr.X[i];
                    var y = (float)tr.Y[i];
                    x0 = Mathf.Min(x0, x);
                    y0 = Mathf.Min(y0, y);
                    x1 = Mathf.Max(x1, x);
                    y1 = Mathf.Max(y1, y);
                    zMin = Mathf.Min(zMin, terreno.Z(x, y));
                    if (i == 0)
                    {
                        continue;
                    }

                    // Lejos de la escena, la calle es una franja de asfalto sobre el piso grande.
                    var a = new Vector2((float)tr.X[i - 1], (float)tr.Y[i - 1]);
                    var b = new Vector2(x, y);
                    if (((a + b) / 2f - centro).magnitude > Lejos)
                    {
                        Franja(calle, terreno, suelos, a, b, AnchoCalle, 0.05f);
                    }
                }

                foreach (var g in Previo.Guiones(tr))
                {
                    Franja(guiones, terreno, suelos, new Vector2((float)g.Ax, (float)g.Ay), new Vector2((float)g.Bx, (float)g.By), 0.45f, 0.09f);
                }
            }

            if (!hay)
            {
                return;
            }

            var color = new Color(0.25f, 0.78f, 1f);
            guiones.Poner(raiz, "ruta_punteada", Materiales.Emisivo(color, color * (noche ? 1.2f : 0.5f)), false);
            calle.Poner(raiz, "calle_lejana", Materiales.Liso(new Color(0.2f, 0.2f, 0.21f), 0.15f), false);

            // Un piso grande, un poco más abajo que lo más bajo de la ruta: lo tapa el suelo de la escena cerca y
            // se ve lejos, donde la escena ya no llega.
            var margen = 300f;
            var piso = new Malla();
            var z = (zMin == float.MaxValue ? 0f : zMin) - 0.25f;
            piso.Cuadro(
                new Vector3(x0 - margen, z, y0 - margen), new Vector3(x0 - margen, z, y1 + margen),
                new Vector3(x1 + margen, z, y1 + margen), new Vector3(x1 + margen, z, y0 - margen), 1f, true);
            var tierra = paisaje == PaisajeEntorno.Arido ? new Color(0.6f, 0.5f, 0.36f) : new Color(0.38f, 0.44f, 0.27f);
            piso.Poner(raiz, "piso_lejano", Materiales.Liso(noche ? tierra * 0.35f : tierra, 0.05f), false);
        }

        /// <summary>Una franja de `ancho` m sobre el piso, de `a` a `b` (planta: x este, y norte).</summary>
        private static void Franja(Malla m, Terreno terreno, SueloEscenario[] suelos, Vector2 a, Vector2 b, float ancho, float sobre)
        {
            var d = b - a;
            if (d.sqrMagnitude < 1e-6f)
            {
                return;
            }

            var n = new Vector2(-d.y, d.x).normalized * (ancho / 2f);
            // Encima de lo que esté más alto: el relieve o el suelo dibujado de la escena.
            Vector3 P(Vector2 q) => new Vector3(q.x, Mathf.Max(terreno.Z(q.x, q.y), (float)(Previo.AlturaSuelo(suelos, q.x, q.y) ?? double.NegativeInfinity)) + sobre, q.y);
            m.Cuadro(P(a - n), P(a + n), P(b + n), P(b - n), 1f, true);
        }
    }
}
