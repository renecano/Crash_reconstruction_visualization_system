using System;
using System.Collections.Generic;
using Croquis.Core;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace Croquis.Visor
{
    /// <summary>
    /// Ajusta un modelo a las medidas del caso, como el visor web: la carrocería se escala en cada eje y
    /// se reparte para que sus arcos caigan en los ejes del caso, y las ruedas se escalan parejo para
    /// que sigan redondas.
    ///
    /// En el glTF el frente es +x y la izquierda −z; glTFast invierte x al importar (frente −x). El
    /// vehículo en Unity mira a +z con la derecha en +x y el piso en y = 0.
    /// </summary>
    public static class ArmadorVehiculo
    {
        public static void Armar(Transform destino, Transform plantilla, JObject entrada, string clase, MedidasVehiculo m)
        {
            var sx = m.Largo / (double)entrada["largo_m"];
            var sy = m.Alto / (double)entrada["alto_m"];
            var sz = m.Ancho / (double)entrada["ancho_m"];
            var aPlantilla = plantilla.worldToLocalMatrix;

            // Solo las ruedas del manifiesto: dentro de cada una hay más nodos que también empiezan con
            // «wheel_» (la llanta, el rin).
            var nombres = new HashSet<string>();
            foreach (var r in (JArray)entrada["ruedas"])
            {
                nombres.Add((string)r["nombre"]);
            }

            var ruedas = new List<Transform>();
            foreach (var t in plantilla.GetComponentsInChildren<Transform>(true))
            {
                if (nombres.Contains(t.name))
                {
                    ruedas.Add(t);
                }
            }

            if (ruedas.Count != nombres.Count)
            {
                throw new ModeloNoCargo(
                    "El modelo trae " + ruedas.Count + " de las " + nombres.Count + " ruedas de su manifiesto.");
            }

            // Los ejes del modelo, ya escalado al largo del caso, contra los del caso.
            double suma1 = 0, suma2 = 0;
            int n1 = 0, n2 = 0;
            foreach (var r in ruedas)
            {
                var adelante = -aPlantilla.MultiplyPoint3x4(r.position).x * sx;
                if (adelante > 0)
                {
                    suma1 += adelante;
                    n1++;
                }
                else
                {
                    suma2 += adelante;
                    n2++;
                }
            }

            Func<double, double> reparto = null;
            if (n1 > 0 && n2 > 0)
            {
                EjesVehiculo.Posiciones(clase, m, out var delantero, out var trasero);
                reparto = EjesVehiculo.Reparto(suma1 / n1, suma2 / n2, delantero, trasero, m.Largo);
            }

            foreach (var mf in plantilla.GetComponentsInChildren<MeshFilter>(true))
            {
                if (EsDeRueda(mf.transform, ruedas))
                {
                    continue;
                }

                var matriz = aPlantilla * mf.transform.localToWorldMatrix;
                var malla = Copiar(mf.sharedMesh, p =>
                {
                    var q = matriz.MultiplyPoint3x4(p);
                    var adelante = -q.x * sx;
                    return new Vector3(
                        (float)(q.z * sz),
                        (float)(q.y * sy),
                        (float)(reparto != null ? reparto(adelante) : adelante));
                }, n =>
                {
                    var q = matriz.MultiplyVector(n);
                    return new Vector3((float)(q.z / sz), (float)(q.y / sy), (float)(-q.x / sx)).normalized;
                });
                Pieza(destino, mf.name, malla, mf.GetComponent<MeshRenderer>());
            }

            foreach (var r in ruedas)
            {
                var c = aPlantilla.MultiplyPoint3x4(r.position);
                var radio = Radio(entrada, r.name) * sy;
                var adelante = -c.x * sx;
                var rueda = new GameObject(r.name).transform;
                rueda.SetParent(destino, false);
                rueda.localPosition = new Vector3(
                    (float)(c.z * sz),
                    (float)radio,
                    (float)(reparto != null ? reparto(adelante) : adelante));
                foreach (var mf in r.GetComponentsInChildren<MeshFilter>(true))
                {
                    var matriz = aPlantilla * mf.transform.localToWorldMatrix;
                    var malla = Copiar(mf.sharedMesh, p =>
                    {
                        var q = matriz.MultiplyPoint3x4(p) - c;
                        return new Vector3((float)(q.z * sy), (float)(q.y * sy), (float)(-q.x * sy));
                    }, n =>
                    {
                        var q = matriz.MultiplyVector(n);
                        return new Vector3(q.z, q.y, -q.x).normalized;
                    });
                    Pieza(rueda, mf.name, malla, mf.GetComponent<MeshRenderer>());
                }
            }
        }

        /// <summary>Lo que no tiene modelo (bicicleta y scooter) es una caja de sus medidas, hasta U3.</summary>
        public static void Procedural(Transform destino, MedidasVehiculo m)
        {
            var caja = GameObject.CreatePrimitive(PrimitiveType.Cube);
            UnityEngine.Object.Destroy(caja.GetComponent<Collider>());
            caja.name = "procedural";
            caja.transform.SetParent(destino, false);
            caja.transform.localPosition = new Vector3(0f, (float)m.Alto / 2f, 0f);
            caja.transform.localScale = new Vector3((float)m.Ancho, (float)m.Alto, (float)m.Largo);
        }

        private static double Radio(JObject entrada, string nombre)
        {
            foreach (var r in (JArray)entrada["ruedas"])
            {
                if ((string)r["nombre"] == nombre)
                {
                    return (double)r["radio"];
                }
            }

            throw new ModeloNoCargo("El manifiesto no trae el radio de «" + nombre + "».");
        }

        private static bool EsDeRueda(Transform t, List<Transform> ruedas)
        {
            for (var p = t; p != null; p = p.parent)
            {
                if (ruedas.Contains(p))
                {
                    return true;
                }
            }

            return false;
        }

        private static Mesh Copiar(Mesh origen, Func<Vector3, Vector3> punto, Func<Vector3, Vector3> normal)
        {
            var vertices = origen.vertices;
            var normales = origen.normals;
            for (var i = 0; i < vertices.Length; i++)
            {
                vertices[i] = punto(vertices[i]);
            }

            for (var i = 0; i < normales.Length; i++)
            {
                normales[i] = normal(normales[i]);
            }

            var copia = new Mesh { name = origen.name, indexFormat = origen.indexFormat };
            copia.vertices = vertices;
            if (normales.Length > 0)
            {
                copia.normals = normales;
            }

            copia.uv = origen.uv;
            copia.colors32 = origen.colors32;
            copia.subMeshCount = origen.subMeshCount;
            for (var s = 0; s < origen.subMeshCount; s++)
            {
                copia.SetTriangles(origen.GetTriangles(s), s, false);
            }

            copia.RecalculateBounds();
            if (origen.tangents.Length > 0)
            {
                copia.RecalculateTangents();
            }

            return copia;
        }

        private static void Pieza(Transform padre, string nombre, Mesh malla, MeshRenderer origen)
        {
            var go = new GameObject(nombre);
            go.transform.SetParent(padre, false);
            go.AddComponent<MeshFilter>().sharedMesh = malla;
            var mr = go.AddComponent<MeshRenderer>();
            if (origen != null)
            {
                mr.sharedMaterials = origen.sharedMaterials;
            }
        }
    }
}
