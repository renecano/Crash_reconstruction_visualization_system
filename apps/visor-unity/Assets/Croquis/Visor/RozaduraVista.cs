using Croquis.Core;
using Croquis.Generated;
using UnityEngine;

namespace Croquis.Visor
{
    /// <summary>
    /// El roce bajo el umbral de CRASH3 (René, 2026-11-27): rayones y la pintura del otro vehículo sobre la
    /// lámina de la zona de contacto, en proporción a la energía (`RozaduraDelCaso`). No mueve un vértice:
    /// la deformación es solo la del solver. Se ve desde el impacto del vehículo.
    /// </summary>
    public sealed class RozaduraVista
    {
        private readonly GameObject raiz;
        private readonly double desde;

        private RozaduraVista(GameObject raiz, double desde)
        {
            this.raiz = raiz;
            this.desde = desde;
        }

        /// <summary>Nulo si el vehículo no tiene roce que dibujar. `propia` y `pinturaAjena`: los colores del caso, si se saben.</summary>
        public static RozaduraVista Preparar(Transform vehiculo, ResultadoVehiculo v, Caso3DResultado r, Color? propia, Color? pinturaAjena)
        {
            var z = RozaduraDelCaso.De(v, r);
            if (z == null || vehiculo == null)
            {
                return null;
            }

            // Sobre la lámina real; sin modelo (la caja de respaldo), sobre la cara de la caja.
            DanoVista.Carroceria(vehiculo, out var todos, out var triangulos);
            if (todos.Count > 0)
            {
                DanoDelCaso.FijarFrente(z.Campo, todos, triangulos);
            }

            // En un nodo propio: lo que cuelga directo del vehículo se toma por carrocería.
            var raiz = new GameObject("roce");
            raiz.transform.SetParent(vehiculo, false);
            var semilla = DanoDelCaso.Semilla(r != null ? r.Semilla : 0L, v.Id);
            var i = (float)z.Intensidad;
            // Sobre pintura clara el rayón se ve oscuro (hule y plástico del otro, mugre); sobre oscura, claro
            // (el primer expuesto). Más marcados con más energía.
            var clara = propia.HasValue && propia.Value.grayscale > 0.55f;
            var raya = clara ? new Color(0.22f, 0.22f, 0.23f) : new Color(0.86f, 0.86f, 0.84f);
            Pieza(raiz.transform, "abrasion", RozaduraDelCaso.Abrasion(z, semilla), Materiales.Calca(new Color(raya.r, raya.g, raya.b, Mathf.Lerp(0.12f, 0.3f, i)), 0.05f));
            Pieza(raiz.transform, "rayones", RozaduraDelCaso.Rayones(z, semilla), Materiales.Calca(new Color(raya.r, raya.g, raya.b, Mathf.Lerp(0.45f, 0.9f, i)), 0.15f));
            if (pinturaAjena.HasValue)
            {
                var c = pinturaAjena.Value;
                Pieza(raiz.transform, "pintura_ajena", RozaduraDelCaso.Pintura(z, semilla), Materiales.Calca(new Color(c.r, c.g, c.b, Mathf.Lerp(0.3f, 0.75f, i)), 0.4f));
            }

            Debug.Log("[roce] " + v.Id + " E = " + Mathf.RoundToInt((float)z.EnergiaJ) + " J, umbral de CRASH3 " + Mathf.RoundToInt((float)z.UmbralJ) + " J, intensidad " + i.ToString("0.00", System.Globalization.CultureInfo.InvariantCulture) + (z.Contra != null ? ", contra " + z.Contra : string.Empty));
            var vista = new RozaduraVista(raiz, z.Desde);
            vista.Mostrar(double.NegativeInfinity);
            return vista;
        }

        public void Mostrar(double t)
        {
            var ver = t >= desde - 1e-9;
            if (raiz != null && raiz.activeSelf != ver)
            {
                raiz.SetActive(ver);
            }
        }

        private static void Pieza(Transform padre, string nombre, MallaRoce m, UnityEngine.Material material)
        {
            if (m.Triangulos.Length == 0)
            {
                return;
            }

            var vs = new Vector3[m.Vertices.Length];
            for (var k = 0; k < vs.Length; k++)
            {
                vs[k] = new Vector3((float)m.Vertices[k].X, (float)m.Vertices[k].Y, (float)m.Vertices[k].Z);
            }

            var malla = new Mesh { name = nombre, vertices = vs, triangles = m.Triangulos };
            malla.RecalculateNormals();
            malla.RecalculateBounds();
            var go = new GameObject(nombre);
            go.transform.SetParent(padre, false);
            go.AddComponent<MeshFilter>().sharedMesh = malla;
            var mr = go.AddComponent<MeshRenderer>();
            mr.sharedMaterial = material;
            mr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
        }
    }
}
