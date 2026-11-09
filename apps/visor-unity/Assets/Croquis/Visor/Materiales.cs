using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace Croquis.Visor
{
    /// <summary>
    /// Los materiales del escenario. Son reglas de dibujo, no datos del caso (ADR 0112). Las bases se
    /// preparan como assets antes del build (`PrepararEscenario`, ADR 0113), para que el build lleve sus
    /// variantes de sombreador; aquí solo se copian y se tiñen, una vez por combinación.
    /// </summary>
    public static class Materiales
    {
        private static readonly Dictionary<string, Material> Cache = new Dictionary<string, Material>();
        private static JObject manifiesto;

        private static Material Base(string nombre)
        {
            var m = Resources.Load<Material>("materiales/" + nombre);
            if (m == null)
            {
                throw new System.InvalidOperationException(
                    "Falta el material «" + nombre + "». Corre «Croquis/Preparar proyecto».");
            }

            return m;
        }

        /// <summary>Cuántos metros cubre una repetición de la textura (de `recursos_escenario.json`).</summary>
        public static float Mosaico(string textura)
        {
            if (manifiesto == null)
            {
                var t = Resources.Load<TextAsset>("recursos_escenario");
                manifiesto = t != null ? JObject.Parse(t.text) : new JObject();
            }

            return (float?)manifiesto["texturas"]?[textura]?["mosaico_m"] ?? 2f;
        }

        /// <summary>Un material PBR con sus texturas, teñido. `nombre` es el de `materiales/`.</summary>
        public static Material Pbr(string nombre, Color? tinte = null)
        {
            var c = tinte ?? Color.white;
            var llave = "pbr|" + nombre + "|" + ColorUtility.ToHtmlStringRGBA(c);
            if (Cache.TryGetValue(llave, out var m))
            {
                return m;
            }

            var b = Base(nombre);
            if (tinte == null)
            {
                Cache[llave] = b;
                return b;
            }

            m = new Material(b) { name = llave };
            m.SetColor("_BaseColor", b.GetColor("_BaseColor") * c);
            Cache[llave] = m;
            return m;
        }

        /// <summary>Un material opaco de un solo color.</summary>
        public static Material Liso(Color color, float lisura = 0.2f, float metal = 0f)
        {
            var llave = "liso|" + ColorUtility.ToHtmlStringRGBA(color) + "|" + lisura + "|" + metal;
            if (Cache.TryGetValue(llave, out var m))
            {
                return m;
            }

            m = new Material(Base("liso")) { name = llave };
            m.SetColor("_BaseColor", color);
            m.SetFloat("_Smoothness", lisura);
            m.SetFloat("_Metallic", metal);
            Cache[llave] = m;
            return m;
        }

        /// <summary>Un material que brilla solo: focos de luminaria, ventanas de noche.</summary>
        public static Material Emisivo(Color color, Color brillo)
        {
            var llave = "emisivo|" + ColorUtility.ToHtmlStringRGBA(color) + "|" + brillo;
            if (Cache.TryGetValue(llave, out var m))
            {
                return m;
            }

            m = new Material(Base("emisivo")) { name = llave };
            m.SetColor("_BaseColor", color);
            m.SetColor("_EmissionColor", brillo);
            Cache[llave] = m;
            return m;
        }

        /// <summary>Pintura sobre el piso (rayas, huellas), con su desgaste como transparencia.</summary>
        public static Material Calca(Color color, float lisura = 0.35f)
        {
            var llave = "calca|" + ColorUtility.ToHtmlStringRGBA(color) + "|" + lisura;
            if (Cache.TryGetValue(llave, out var m))
            {
                return m;
            }

            m = new Material(Base("calca")) { name = llave };
            m.SetColor("_BaseColor", color);
            m.SetFloat("_Smoothness", lisura);
            Cache[llave] = m;
            return m;
        }

        public static Material Vidrio => Base("vidrio");
        public static Material Charco => Base("charco");
        public static Material Lluvia => Base("lluvia");

        public static Material Arbol(string especie, string vista)
        {
            return Base("arbol_" + especie + "_" + vista);
        }

        /// <summary>El cielo HDRI y cuánto hay que girarlo para que su sol quede donde va.</summary>
        public static Material Cielo(string nombre, out float azimutSol)
        {
            Mosaico("asfalto");
            azimutSol = (float?)manifiesto["hdri"]?[nombre]?["azimut_sol_deg"] ?? 0f;
            var llave = "cielo|" + nombre;
            if (!Cache.TryGetValue(llave, out var m))
            {
                m = new Material(Base("cielo_" + nombre)) { name = llave };
                Cache[llave] = m;
            }

            return m;
        }

        /// <summary>Las medidas de la tarjeta de una especie (m), de `recursos_escenario.json`.</summary>
        public static Vector3 MedidasArbol(string especie)
        {
            Mosaico("asfalto");
            var a = manifiesto["arboles"]?[especie];
            return a == null
                ? new Vector3(5f, 6f, 5f)
                : new Vector3((float)a["ancho_m"], (float)a["alto_m"], (float)a["profundidad_m"]);
        }

        public static Color Hex(string hex, Color siFalla)
        {
            return ColorUtility.TryParseHtmlString(hex, out var c) ? c : siFalla;
        }
    }
}
