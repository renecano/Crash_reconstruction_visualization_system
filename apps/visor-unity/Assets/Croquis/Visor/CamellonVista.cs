using System.Collections.Generic;
using Croquis.Core;
using Croquis.Generated;
using UnityEngine;

namespace Croquis.Visor
{
    /// <summary>
    /// El camellón de una avenida de dos cuerpos (`Camellon`, de las calles de OSM del caso): una franja
    /// de pasto 18 cm arriba de la calzada, con su guarnición gris a los dos lados y matas. Los árboles
    /// van con los del entorno (`Camellon.Arbolado`). Es entorno procedural: se apaga con el piso del
    /// mapa real, como el resto.
    /// </summary>
    public static class CamellonVista
    {
        public const float Alto = 0.18f;

        public static void Construir(Transform escenario, List<List<Camellon.Punto>> camellones, Terreno terreno, AmbienteEscenario a, long semilla)
        {
            if (escenario == null || camellones == null || camellones.Count == 0)
            {
                return;
            }

            var raiz = new GameObject("camellon").transform;
            raiz.SetParent(escenario, false);
            var pasto = new Malla();
            var guarnicion = new Malla();
            var matas = new Malla { NormalArriba = true };
            var azar = new Azar(semilla + 6151);
            foreach (var c in camellones)
            {
                for (var i = 0; i < c.Count; i++)
                {
                    var p = c[i];
                    // La orilla izquierda y la derecha de cada punto, a medio ancho del eje.
                    var nx = -p.DirY * p.Ancho / 2.0;
                    var ny = p.DirX * p.Ancho / 2.0;
                    if (i + 1 < c.Count)
                    {
                        var q = c[i + 1];
                        var mx = -q.DirY * q.Ancho / 2.0;
                        var my = q.DirX * q.Ancho / 2.0;
                        var i0 = terreno.P(p.X + nx, p.Y + ny, Alto);
                        var d0 = terreno.P(p.X - nx, p.Y - ny, Alto);
                        var i1 = terreno.P(q.X + mx, q.Y + my, Alto);
                        var d1 = terreno.P(q.X - mx, q.Y - my, Alto);
                        pasto.Cuadro(d0, d1, i1, i0, 0.5f, true);
                        Cara(guarnicion, terreno, p.X + nx, p.Y + ny, q.X + mx, q.Y + my);
                        Cara(guarnicion, terreno, p.X - nx, p.Y - ny, q.X - mx, q.Y - my);
                    }

                    if (i == 0 || i == c.Count - 1)
                    {
                        Cara(guarnicion, terreno, p.X + nx, p.Y + ny, p.X - nx, p.Y - ny);
                    }

                    // Matas en manchones: dos o tres por punto, lejos de la guarnición.
                    var cuantas = 2 + (int)(azar.Siguiente() * 2f);
                    for (var k = 0; k < cuantas; k++)
                    {
                        var u = azar.Entre(-0.42f, 0.42f) * (float)p.Ancho;
                        var v = azar.Entre(-1.5f, 1.5f);
                        var x = p.X + -p.DirY * u + p.DirX * v;
                        var y = p.Y + p.DirX * u + p.DirY * v;
                        var alto = azar.Entre(0.25f, 0.6f);
                        var giro = azar.Entre(0f, Mathf.PI);
                        var pie = terreno.P(x, y, Alto - 0.02f);
                        for (var h = 0; h < 2; h++)
                        {
                            var d = new Vector3(Mathf.Cos(giro + h * Mathf.PI / 2f), 0f, Mathf.Sin(giro + h * Mathf.PI / 2f)) * (alto * 0.8f);
                            matas.Tarjeta(pie - d, pie + d, pie + d + Vector3.up * alto, pie - d + Vector3.up * alto);
                        }
                    }
                }
            }

            var tinte = a.Noche ? new Color(0.36f, 0.5f, 0.34f) : new Color(0.62f, 0.86f, 0.46f);
            pasto.Poner(raiz, "camellon_pasto", Materiales.Pbr("pasto", tinte), false);
            guarnicion.Poner(raiz, "camellon_guarnicion", Materiales.Liso(new Color(0.62f, 0.61f, 0.58f), 0.15f));
            matas.Poner(raiz, "camellon_matas", Materiales.Mata(false, a.Noche), false);
        }

        /// <summary>La cara vertical de la guarnición, del piso a la altura del camellón.</summary>
        private static void Cara(Malla m, Terreno terreno, double ax, double ay, double bx, double by)
        {
            var p0 = terreno.P(ax, ay);
            var p1 = terreno.P(bx, by);
            m.Cuadro(p0, p1, p1 + Vector3.up * Alto, p0 + Vector3.up * Alto, 0.5f, true);
        }
    }
}
