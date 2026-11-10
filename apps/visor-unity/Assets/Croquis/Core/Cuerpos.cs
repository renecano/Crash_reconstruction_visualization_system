using System;
using System.Text;
using Newtonsoft.Json.Linq;

namespace Croquis.Core
{
    /// <summary>
    /// Los cuerpos de MakeHuman (CC0) que también usa el visor web (`packages/viewer/src/body-assets.ts`,
    /// `assets/ASSETS.md`): qué variante toca, sus colores por región y la región de cada vértice, que
    /// viene en un atributo propio del glTF (`_REGION`) que glTFast no importa.
    /// </summary>
    public static class Cuerpos
    {
        /// <summary>Las regiones del cuerpo, en el orden de `_REGION` (personas.json).</summary>
        public static readonly string[] Regiones = { "piel", "camisa", "pantalon", "zapatos", "cabello", "ojos" };

        private static readonly string[] Piel = { "#f1c9a5", "#e0ac83", "#c68e63", "#a26b45", "#7c4f32", "#5a3826" };

        // Sin tonos cafés ni beige: la camisa no debe confundirse con la piel.
        private static readonly string[] Camisa = { "#5c6f86", "#7a8b6f", "#6b6f78", "#8c8f94", "#4f6a74", "#7d4b55", "#3f5f8a" };
        private static readonly string[] Pantalon = { "#2f3742", "#3b3f45", "#4a4f57", "#55503f", "#2b2e33" };
        private static readonly string[] Cabello = { "#241c17", "#3a2a1f", "#1a1716", "#4a3628" };

        /// <summary>
        /// La variante del cuerpo. El Resultado no trae la edad: con menos de 1.45 m, el de niñez; si
        /// no, el de adultez.
        /// </summary>
        public static string Variante(double estatura)
        {
            return estatura < 1.45 ? "nino" : "adulto";
        }

        /// <summary>El mismo número en [0, 1) que `hash01` del visor web (FNV-1a de 32 bits).</summary>
        public static double Hash01(string s)
        {
            unchecked
            {
                var h = 0x811c9dc5u;
                foreach (var c in s)
                {
                    h ^= c;
                    h *= 0x01000193u;
                }

                return h / 4294967296.0;
            }
        }

        /// <summary>Los colores de cada región (hex), deterministas por persona, como en la web.</summary>
        public static string[] Paleta(string id)
        {
            string Elegir(string[] lista, string sal)
            {
                var k = (int)Math.Floor(Hash01(id + ":" + sal) * lista.Length);
                return lista[Math.Min(k, lista.Length - 1)];
            }

            return new[]
            {
                Elegir(Piel, "piel"),
                Elegir(Camisa, "camisa"),
                Elegir(Pantalon, "pantalon"),
                "#2a2622",
                Elegir(Cabello, "cabello"),
                "#1b1d20",
            };
        }

        /// <summary>
        /// Un atributo de vértice del primer primitivo de la primera malla de un .glb, como números.
        /// Lee el encabezado JSON y el bloque binario; admite flotantes y enteros sin signo.
        /// </summary>
        public static float[] Atributo(byte[] glb, string nombre)
        {
            if (glb.Length < 20 || BitConverter.ToUInt32(glb, 0) != 0x46546C67)
            {
                throw new FormatException("No es un .glb.");
            }

            var largoJson = BitConverter.ToInt32(glb, 12);
            var json = JObject.Parse(Encoding.UTF8.GetString(glb, 20, largoJson));
            var inicioBin = 20 + largoJson + 8;
            var indice = (int?)json["meshes"]?[0]?["primitives"]?[0]?["attributes"]?[nombre];
            if (indice == null)
            {
                return null;
            }

            var acc = json["accessors"][indice.Value];
            var vista = json["bufferViews"][(int)acc["bufferView"]];
            var cuenta = (int)acc["count"];
            var tipo = (int)acc["componentType"];
            var desde = inicioBin + ((int?)vista["byteOffset"] ?? 0) + ((int?)acc["byteOffset"] ?? 0);
            var tam = tipo == 5126 ? 4 : tipo == 5123 ? 2 : tipo == 5121 ? 1 : 0;
            if (tam == 0 || (string)acc["type"] != "SCALAR")
            {
                throw new FormatException("Atributo de un tipo que no se esperaba.");
            }

            var paso = (int?)vista["byteStride"] ?? tam;
            var salida = new float[cuenta];
            for (var i = 0; i < cuenta; i++)
            {
                var p = desde + i * paso;
                salida[i] = tipo == 5126 ? BitConverter.ToSingle(glb, p) : tipo == 5123 ? BitConverter.ToUInt16(glb, p) : glb[p];
            }

            return salida;
        }

        /// <summary>
        /// Los triángulos de cada región: un triángulo va con la región de su primer vértice (las
        /// regiones del modelo no se cruzan dentro de un triángulo).
        /// </summary>
        public static int[][] TriangulosPorRegion(int[] triangulos, float[] region)
        {
            var listas = new System.Collections.Generic.List<int>[Regiones.Length];
            for (var k = 0; k < listas.Length; k++)
            {
                listas[k] = new System.Collections.Generic.List<int>();
            }

            for (var i = 0; i + 2 < triangulos.Length; i += 3)
            {
                var r = (int)Math.Round(region[triangulos[i]]);
                r = Math.Max(0, Math.Min(Regiones.Length - 1, r));
                listas[r].Add(triangulos[i]);
                listas[r].Add(triangulos[i + 1]);
                listas[r].Add(triangulos[i + 2]);
            }

            var salida = new int[listas.Length][];
            for (var k = 0; k < listas.Length; k++)
            {
                salida[k] = listas[k].ToArray();
            }

            return salida;
        }
    }
}
