using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace Croquis.Visor
{
    /// <summary>
    /// La pasada de sombras con pocas llamadas de dibujo (U5, ADR 0115). Cada pieza opaca de un
    /// vehículo o del escenario proyectaba su sombra con su propia llamada; aquí todas las de una raíz
    /// se unen en una sola malla que solo proyecta sombra, y las piezas dejan de proyectarla. La sombra
    /// es la misma (la misma geometría, con el mismo recorte de caras); solo cambia cuántas órdenes
    /// recibe la GPU: en WebGL cada una cuesta.
    ///
    /// Lo que no es opaco de punta a punta (vidrio, follaje recortado) se queda como estaba.
    /// </summary>
    public static class SombrasUnidas
    {
        /// <summary>Para comparar al perfilar: con true no se une nada (se fija antes de cargar el caso).</summary>
        public static bool Separadas { get; set; }

        public static void Unir(Transform raiz, string nombre)
        {
            if (Separadas || raiz == null)
            {
                return;
            }

            // Una malla por recorte de caras: el de cada material (2, caras traseras; 0, ninguna).
            var porRecorte = new Dictionary<int, List<CombineInstance>>();
            var unidos = new List<MeshRenderer>();
            var aRaiz = raiz.worldToLocalMatrix;
            foreach (var mr in raiz.GetComponentsInChildren<MeshRenderer>(false))
            {
                if (!mr.enabled || mr.shadowCastingMode != ShadowCastingMode.On || mr.GetComponentInParent<PersonaVista>() != null)
                {
                    continue;
                }

                var mf = mr.GetComponent<MeshFilter>();
                var malla = mf != null ? mf.sharedMesh : null;
                var materiales = mr.sharedMaterials;
                if (malla == null || !malla.isReadable || materiales.Length < malla.subMeshCount)
                {
                    continue;
                }

                var opaco = true;
                for (var i = 0; i < malla.subMeshCount; i++)
                {
                    opaco &= malla.GetTopology(i) == MeshTopology.Triangles && Opaco(materiales[i]);
                }

                if (!opaco)
                {
                    continue;
                }

                var matriz = aRaiz * mr.transform.localToWorldMatrix;
                for (var i = 0; i < malla.subMeshCount; i++)
                {
                    var recorte = materiales[i].HasProperty("_Cull") ? Mathf.RoundToInt(materiales[i].GetFloat("_Cull")) : 2;
                    if (!porRecorte.TryGetValue(recorte, out var lista))
                    {
                        porRecorte[recorte] = lista = new List<CombineInstance>();
                    }

                    lista.Add(new CombineInstance { mesh = malla, subMeshIndex = i, transform = matriz });
                }

                unidos.Add(mr);
            }

            foreach (var par in porRecorte)
            {
                var union = new Mesh { name = nombre, indexFormat = IndexFormat.UInt32 };
                union.CombineMeshes(par.Value.ToArray(), true, true, false);
                var go = new GameObject(nombre + (par.Key == 2 ? string.Empty : "_recorte" + par.Key));
                go.transform.SetParent(raiz, false);
                go.layer = raiz.gameObject.layer;
                go.AddComponent<MeshFilter>().sharedMesh = union;
                var sombra = go.AddComponent<MeshRenderer>();
                sombra.sharedMaterial = Materiales.SoloSombra(par.Key);
                sombra.shadowCastingMode = ShadowCastingMode.ShadowsOnly;
                sombra.receiveShadows = false;
            }

            foreach (var mr in unidos)
            {
                mr.shadowCastingMode = ShadowCastingMode.Off;
            }
        }

        /// <summary>Un material que proyecta su sombra entera: opaco, sin recorte por alfa y con su pasada de sombra.</summary>
        private static bool Opaco(Material m)
        {
            return m != null
                && m.renderQueue < (int)RenderQueue.AlphaTest
                && !m.IsKeywordEnabled("_ALPHATEST_ON")
                && m.FindPass("ShadowCaster") >= 0
                && m.GetShaderPassEnabled("ShadowCaster");
        }
    }
}
