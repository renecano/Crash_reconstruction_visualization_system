using System.Collections.Generic;
using UnityEngine;

namespace Croquis.Visor
{
    /// <summary>
    /// Los materiales del escenario. Son reglas de dibujo, no datos del caso (ADR 0112). Se crean una
    /// vez por color y se reusan, para que URP los agrupe.
    /// </summary>
    public static class Materiales
    {
        private static readonly Dictionary<string, Material> Cache = new Dictionary<string, Material>();
        private static Shader lit;

        private static Shader Lit => lit != null ? lit : lit = Shader.Find("Universal Render Pipeline/Lit");

        /// <summary>Un material URP Lit opaco con su color y su lisura.</summary>
        public static Material Liso(Color color, float lisura = 0.2f, float metal = 0f)
        {
            var llave = ColorUtility.ToHtmlStringRGBA(color) + "|" + lisura + "|" + metal;
            if (Cache.TryGetValue(llave, out var m))
            {
                return m;
            }

            m = new Material(Lit) { name = "croquis_" + llave, enableInstancing = true };
            m.SetColor("_BaseColor", color);
            m.SetFloat("_Smoothness", lisura);
            m.SetFloat("_Metallic", metal);
            Cache[llave] = m;
            return m;
        }

        /// <summary>Un material que brilla solo: rayas de noche, focos de luminaria.</summary>
        public static Material Emisivo(Color color, Color brillo)
        {
            var llave = "emisivo|" + ColorUtility.ToHtmlStringRGBA(color) + "|" + ColorUtility.ToHtmlStringRGBA(brillo);
            if (Cache.TryGetValue(llave, out var m))
            {
                return m;
            }

            m = new Material(Lit) { name = "croquis_" + llave, enableInstancing = true };
            m.SetColor("_BaseColor", color);
            m.EnableKeyword("_EMISSION");
            m.SetColor("_EmissionColor", brillo);
            m.globalIlluminationFlags = MaterialGlobalIlluminationFlags.None;
            Cache[llave] = m;
            return m;
        }

        /// <summary>Un material con textura, para el suelo con sus parcelas.</summary>
        public static Material ConTextura(Texture2D textura, float lisura)
        {
            var m = new Material(Lit) { name = "croquis_suelo" };
            m.SetTexture("_BaseMap", textura);
            m.SetColor("_BaseColor", Color.white);
            m.SetFloat("_Smoothness", lisura);
            return m;
        }

        public static Color Hex(string hex, Color siFalla)
        {
            return ColorUtility.TryParseHtmlString(hex, out var c) ? c : siFalla;
        }
    }
}
