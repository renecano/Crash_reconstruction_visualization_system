using System.Collections.Generic;
using Croquis.Core;
using Croquis.Generated;
using UnityEngine;

namespace Croquis.Visor
{
    /// <summary>
    /// Lo que se ve alrededor del golpe (ronda 4, punto 5; René, 2026-11-18). Las reglas están en
    /// `EnfasisImpacto` (Core, probadas con `dotnet test`).
    ///
    /// - **La marca del contacto:** la raspadura oscura del piso en el punto de impacto del Resultado.
    ///   Aparece en el impacto y se queda.
    /// - **Restos y vidrios:** salen del punto de contacto hacia el avance de los vehículos y caen al
    ///   piso. Son ilustrativos, con semilla, y no cambian ningún número: la deformación sigue siendo la
    ///   del solver (`DanoVista`).
    /// </summary>
    public sealed class ImpactoVista
    {
        private readonly List<(Transform T, EnfasisImpacto.Resto R)> piezas = new List<(Transform, EnfasisImpacto.Resto)>();
        private readonly double tImpacto;
        private readonly Terreno terreno;
        private GameObject marca;
        private GameObject nube;

        private ImpactoVista(double tImpacto, Terreno terreno)
        {
            this.tImpacto = tImpacto;
            this.terreno = terreno;
        }

        /// <summary>Arma la marca y la nube del primer impacto; nulo si el Resultado no trae impacto.</summary>
        public static ImpactoVista Construir(Transform padre, Caso3DResultado r, double tImpacto, Terreno terreno, bool noche)
        {
            if (r?.PuntoImpacto == null || double.IsNaN(tImpacto) || terreno == null)
            {
                return null;
            }

            var v = new ImpactoVista(tImpacto, terreno);
            var px = r.PuntoImpacto.X;
            var py = r.PuntoImpacto.Y;

            // La raspadura: una elipse irregular oscura, apenas sobre el piso.
            var m = new Malla();
            var azar = new Azar((int)(r.Semilla % int.MaxValue) + 977);
            const int lados = 24;
            var c = terreno.P(px, py, 0.028f);
            for (var k = 0; k < lados; k++)
            {
                var a0 = k * Mathf.PI * 2f / lados;
                var a1 = (k + 1) * Mathf.PI * 2f / lados;
                var r0 = 0.75f + azar.Entre(-0.18f, 0.18f);
                var r1 = 0.75f + azar.Entre(-0.18f, 0.18f);
                var p0 = terreno.P(px + Mathf.Cos(a0) * r0 * 1.3f, py + Mathf.Sin(a0) * r0, 0.028f);
                var p1 = terreno.P(px + Mathf.Cos(a1) * r1 * 1.3f, py + Mathf.Sin(a1) * r1, 0.028f);
                m.Cuadro(c, p0, p1, c, 1f, true);
            }

            v.marca = m.Poner(padre, "impacto_marca", Materiales.Calca(new Color(0.03f, 0.03f, 0.03f, 0.62f), 0.25f), false);
            v.marca.SetActive(false);

            // La nube: hacia el avance medio de los vehículos en el impacto.
            var rumbo = AvanceEnElImpacto(r, tImpacto);
            v.nube = new GameObject("impacto_restos");
            v.nube.transform.SetParent(padre, false);
            var vidrio = Materiales.Emisivo(new Color(0.75f, 0.85f, 0.88f), noche ? new Color(0.22f, 0.26f, 0.28f) : new Color(0.12f, 0.15f, 0.16f));
            var plastico = Materiales.Liso(new Color(0.09f, 0.09f, 0.1f), 0.45f);
            foreach (var resto in EnfasisImpacto.Nube(px, py, rumbo, 7.0, 44, (int)(r.Semilla % int.MaxValue) + 31))
            {
                var pieza = new Malla();
                var t = (float)resto.Tamano;
                if (resto.Vidrio)
                {
                    pieza.Cuadro(new Vector3(-t, 0, -t * 0.6f), new Vector3(t, 0, -t * 0.4f), new Vector3(t * 0.7f, 0.004f, t), new Vector3(-t * 0.8f, 0, t * 0.7f), 1f, true);
                }
                else
                {
                    pieza.Caja(Vector3.zero, Vector3.right, Vector3.forward, t, t * 0.35f, t * 0.7f);
                }

                var go = pieza.Poner(v.nube.transform, resto.Vidrio ? "vidrio" : "resto", resto.Vidrio ? vidrio : plastico, false);
                go.transform.localRotation = Quaternion.Euler(0f, (float)resto.Giro, 0f);
                go.SetActive(false);
                v.piezas.Add((go.transform, resto));
            }

            return v;
        }

        /// <summary>El rumbo (grados, en el plano de la escena) del avance medio de los vehículos en el impacto.</summary>
        private static double AvanceEnElImpacto(Caso3DResultado r, double t)
        {
            double vx = 0, vy = 0;
            foreach (var veh in r.Vehiculos ?? new ResultadoVehiculo[0])
            {
                var tr = veh.Trayectoria;
                if (tr?.T == null || tr.T.Length == 0)
                {
                    continue;
                }

                var i = 0;
                while (i + 1 < tr.T.Length && tr.T[i + 1] <= t)
                {
                    i++;
                }

                // Justo antes del golpe: hacia donde iba.
                var k = System.Math.Max(0, i - 1);
                vx += tr.Vx[k];
                vy += tr.Vy[k];
            }

            return System.Math.Atan2(vy, vx) * 180.0 / System.Math.PI;
        }

        /// <summary>Pone la marca y los restos del instante `t`.</summary>
        public void Colocar(double t)
        {
            if (marca != null)
            {
                marca.SetActive(t >= tImpacto);
            }

            foreach (var (tr, r) in piezas)
            {
                var p = EnfasisImpacto.PosicionResto(r, t, tImpacto);
                if (tr.gameObject.activeSelf != p.Visible)
                {
                    tr.gameObject.SetActive(p.Visible);
                }

                if (!p.Visible)
                {
                    continue;
                }

                var piso = terreno.P(p.X, p.Y, 0.02f);
                tr.position = piso + Vector3.up * (float)p.Z;
            }
        }
    }
}
