using System.Collections.Generic;
using Croquis.Core;
using Croquis.Generated;
using UnityEngine;
using UnityEngine.Rendering;

namespace Croquis.Visor
{
    /// <summary>
    /// Lo que se ve alrededor del golpe (ronda 4, punto 5; René, 2026-11-18).
    ///
    /// - **La marca del contacto:** la raspadura oscura del piso en el punto de impacto del Resultado.
    ///   Aparece en el impacto y se queda.
    /// - **Los pedazos** de cada impacto (docs/contrato-unity.md §1): granitos de vidrio templado, lascas
    ///   de plástico y de mica, y tiras de lámina, en la cantidad que da la energía de la deformación.
    ///   Vuelan, rebotan, se arrastran y se detienen con la física de `Restos` (Core, probada con
    ///   `dotnet test`). Son decoración con semilla y no cambian ningún número: la deformación sigue
    ///   siendo la del solver (`DanoVista`).
    /// </summary>
    public sealed class ImpactoVista
    {
        private readonly List<(Transform T, Restos.Pieza P, double T0)> piezas = new List<(Transform, Restos.Pieza, double)>();
        private readonly double tImpacto;
        private readonly Terreno terreno;
        private GameObject marca;

        private ImpactoVista(double tImpacto, Terreno terreno)
        {
            this.tImpacto = tImpacto;
            this.terreno = terreno;
        }

        /// <summary>Cuántos pedazos se armaron (para el diagnóstico).</summary>
        public int Pedazos => piezas.Count;

        /// <summary>Arma la marca del primer impacto y los pedazos de todos; nulo si el Resultado no trae impactos.</summary>
        public static ImpactoVista Construir(Transform padre, Caso3DResultado r, double tImpacto, Terreno terreno, bool noche)
        {
            if (r == null || terreno == null)
            {
                return null;
            }

            var impactos = Restos.Impactos(r);
            if (impactos.Count == 0 && (r.PuntoImpacto == null || double.IsNaN(tImpacto)))
            {
                return null;
            }

            var v = new ImpactoVista(tImpacto, terreno);
            if (r.PuntoImpacto != null && !double.IsNaN(tImpacto))
            {
                v.marca = Marca(padre, r, terreno);
            }

            var nube = new GameObject("impacto_restos");
            nube.transform.SetParent(padre, false);
            var formas = new Dictionary<(Restos.Material, int), (Mesh Malla, Vector3 Escala)>();
            for (var k = 0; k < impactos.Count; k++)
            {
                var imp = impactos[k];
                var semilla = (int)((r.Semilla + 31 + 7919L * k) % int.MaxValue);
                foreach (var p in Restos.Nube(imp.X, imp.Y, imp.Fuentes, imp.EnergiaJ, semilla))
                {
                    var llave = (p.Tipo, p.Variante);
                    if (!formas.TryGetValue(llave, out var forma))
                    {
                        forma = Forma(p.Tipo, p.Variante);
                        formas[llave] = forma;
                    }

                    var go = new GameObject(p.Tipo == Restos.Material.Vidrio ? "vidrio" : p.Tipo == Restos.Material.Plastico ? "plastico" : "lamina");
                    go.transform.SetParent(nube.transform, false);
                    go.transform.localScale = forma.Escala * (float)p.Tamano;
                    go.AddComponent<MeshFilter>().sharedMesh = forma.Malla;
                    var mr = go.AddComponent<MeshRenderer>();
                    mr.sharedMaterial = MaterialDe(p.Tipo, p.Variante);
                    mr.shadowCastingMode = p.Tipo != Restos.Material.Vidrio && p.Tamano > 0.05 ? ShadowCastingMode.On : ShadowCastingMode.Off;
                    go.SetActive(false);
                    v.piezas.Add((go.transform, p, imp.T));
                }
            }

            return v;
        }

        /// <summary>La raspadura: una elipse irregular oscura, apenas sobre el piso.</summary>
        private static GameObject Marca(Transform padre, Caso3DResultado r, Terreno terreno)
        {
            var px = r.PuntoImpacto.X;
            var py = r.PuntoImpacto.Y;
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

            var marca = m.Poner(padre, "impacto_marca", Materiales.Calca(new Color(0.03f, 0.03f, 0.03f, 0.62f), 0.25f), false);
            marca.SetActive(false);
            return marca;
        }

        /// <summary>
        /// La forma de un pedazo, de tamaño 1 (se escala con el suyo): un granito casi cúbico de vidrio
        /// templado, una lasca plana de plástico de cinco lados o una tira de lámina doblada.
        /// </summary>
        private static (Mesh, Vector3) Forma(Restos.Material tipo, int variante)
        {
            var m = new Malla();
            var azar = new Azar(1009 + 17 * (int)tipo + variante);
            switch (tipo)
            {
                case Restos.Material.Vidrio:
                    m.Caja(Vector3.zero, Vector3.right, Vector3.forward, 1f, 1f, 1f);
                    return (m.Cerrar("resto_vidrio"), new Vector3(azar.Entre(0.7f, 1f), azar.Entre(0.45f, 0.7f), azar.Entre(0.6f, 0.9f)));
                case Restos.Material.Plastico:
                    m.Prisma(Vector3.zero, 0.5f, 0.05f, 5 + variante % 2);
                    return (m.Cerrar("resto_plastico"), new Vector3(1f, 1f, azar.Entre(0.4f, 0.75f)));
                default:
                    // Dos hojas con un doblez de 25° a 60°, de dos caras.
                    var doblez = azar.Entre(25f, 60f) * Mathf.Deg2Rad;
                    var alto = new Vector3(0.5f * Mathf.Cos(doblez), 0.5f * Mathf.Sin(doblez), 0f);
                    var ancho = azar.Entre(0.25f, 0.45f);
                    m.Cuadro(new Vector3(-0.5f, 0f, -ancho), new Vector3(0f, 0f, -ancho), new Vector3(0f, 0f, ancho), new Vector3(-0.5f, 0f, ancho), 1f, true);
                    m.Cuadro(new Vector3(0f, 0f, -ancho), alto + new Vector3(0f, 0f, -ancho * 0.8f), alto + new Vector3(0f, 0f, ancho * 0.8f), new Vector3(0f, 0f, ancho), 1f, true);
                    return (m.Cerrar("resto_lamina"), Vector3.one);
            }
        }

        /// <summary>Vidrio verdoso que brilla con la luz; fascia negra, micas roja, ámbar y clara; lámina gris.</summary>
        private static UnityEngine.Material MaterialDe(Restos.Material tipo, int variante)
        {
            switch (tipo)
            {
                case Restos.Material.Vidrio:
                    return Materiales.Liso(new Color(0.66f, 0.78f, 0.76f), 0.95f);
                case Restos.Material.Plastico:
                    switch (variante)
                    {
                        case 1:
                            return Materiales.Liso(new Color(0.58f, 0.03f, 0.02f), 0.85f);
                        case 2:
                            return Materiales.Liso(new Color(0.95f, 0.45f, 0.04f), 0.85f);
                        case 3:
                            return Materiales.Liso(new Color(0.84f, 0.86f, 0.9f), 0.9f);
                        default:
                            return Materiales.Liso(new Color(0.05f, 0.05f, 0.055f), 0.35f);
                    }

                default:
                    return Materiales.Liso(new Color(0.56f, 0.58f, 0.6f), 0.55f, 0.85f);
            }
        }

        /// <summary>Pone la marca y los pedazos del instante `t`.</summary>
        public void Colocar(double t)
        {
            if (marca != null)
            {
                marca.SetActive(t >= tImpacto);
            }

            foreach (var (tr, p, t0) in piezas)
            {
                var pose = Restos.Posicion(p, t - t0);
                if (tr.gameObject.activeSelf != pose.Visible)
                {
                    tr.gameObject.SetActive(pose.Visible);
                }

                if (!pose.Visible)
                {
                    continue;
                }

                tr.position = terreno.P(pose.X, pose.Y, 0.004 + pose.Z);
                // En el aire da vueltas sobre su eje; en el piso queda tendido y solo gira mientras se arrastra.
                tr.rotation = pose.EnPiso
                    ? Quaternion.Euler(0f, (float)(p.Rumbo + pose.Angulo), 0f)
                    : Quaternion.AngleAxis((float)pose.Angulo, new Vector3((float)p.EjeX, (float)p.EjeZ, (float)p.EjeY));
            }
        }
    }
}
