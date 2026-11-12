using System;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.Rendering;

namespace Croquis.Visor
{
    /// <summary>
    /// Para diagnosticar tirones (U5, ADR 0115): de cada cuadro guarda cuánto duró y en qué se fue,
    /// en tres tramos del hilo principal, y si en él hubo recolección de memoria:
    ///
    /// - **antes del dibujo:** los guiones (reproducción, cámara), la animación y las partículas;
    /// - **dibujo:** URP armando el cuadro (recorte, sombras, órdenes de dibujo);
    /// - **después:** entregar el cuadro al navegador y esperar el siguiente (ahí cae también la
    ///   recolección de memoria, que en WebGL solo corre al final del cuadro).
    ///
    /// No cuesta nada apagado: se enciende con `depurar` `{"tirones": true}` y se consulta igual.
    /// </summary>
    public static class Tirones
    {
        private const int Cupo = 1200;
        private static readonly float[] Total = new float[Cupo];
        private static readonly float[] Antes = new float[Cupo];
        private static readonly float[] Dibujo = new float[Cupo];
        private static readonly byte[] Recolecciones = new byte[Cupo];
        private static int n;
        private static bool encendido;
        private static double inicioCuadro;
        private static double inicioDibujo;
        private static double finDibujo;
        private static double dibujoDelCuadro;
        private static int recoleccionesAntes;

        public static void Encender()
        {
            if (encendido)
            {
                return;
            }

            encendido = true;
            var reloj = new GameObject("tirones");
            UnityEngine.Object.DontDestroyOnLoad(reloj);
            reloj.AddComponent<RelojDeTirones>();
            RenderPipelineManager.beginContextRendering += AlEmpezar;
            RenderPipelineManager.endContextRendering += AlTerminar;
        }

        /// <summary>Al principio de cada cuadro (antes que cualquier otro `Update`): cierra el anterior.</summary>
        public static void Cuadro()
        {
            if (!encendido)
            {
                return;
            }

            var ahora = Time.realtimeSinceStartupAsDouble;
            var recolecciones = GC.CollectionCount(0);
            if (inicioCuadro > 0.0 && inicioDibujo >= inicioCuadro)
            {
                var i = n % Cupo;
                Total[i] = (float)((ahora - inicioCuadro) * 1000.0);
                Antes[i] = (float)((inicioDibujo - inicioCuadro) * 1000.0);
                Dibujo[i] = (float)(dibujoDelCuadro * 1000.0);
                Recolecciones[i] = (byte)Math.Min(255, recolecciones - recoleccionesAntes);
                n++;
            }

            inicioCuadro = ahora;
            inicioDibujo = 0.0;
            dibujoDelCuadro = 0.0;
            recoleccionesAntes = recolecciones;
        }

        private static void AlEmpezar(ScriptableRenderContext _, List<Camera> __)
        {
            finDibujo = Time.realtimeSinceStartupAsDouble;
            if (inicioDibujo <= 0.0)
            {
                inicioDibujo = finDibujo;
            }
        }

        private static void AlTerminar(ScriptableRenderContext _, List<Camera> __)
        {
            dibujoDelCuadro += Time.realtimeSinceStartupAsDouble - finDibujo;
        }

        /// <summary>
        /// Los cuadros lentos (más de 1.6 veces la mediana) de los últimos guardados, con sus tramos, y
        /// el promedio de los normales para comparar. Vacía la memoria para la siguiente consulta.
        /// </summary>
        public static JObject Informe()
        {
            var cuantos = Math.Min(n, Cupo);
            var orden = new float[cuantos];
            Array.Copy(Total, orden, cuantos);
            Array.Sort(orden);
            var mediana = cuantos > 0 ? orden[cuantos / 2] : 0f;
            var lentos = new JArray();
            double antes = 0.0, dibujo = 0.0, despues = 0.0;
            var normales = 0;
            var conRecoleccion = 0;
            var lentosConRecoleccion = 0;
            for (var i = 0; i < cuantos; i++)
            {
                var resto = Total[i] - Antes[i] - Dibujo[i];
                conRecoleccion += Recolecciones[i] > 0 ? 1 : 0;
                if (Total[i] > 1.6f * mediana)
                {
                    lentosConRecoleccion += Recolecciones[i] > 0 ? 1 : 0;
                    if (lentos.Count < 60)
                    {
                        lentos.Add(new JArray(Math.Round(Total[i], 1), Math.Round(Antes[i], 1), Math.Round(Dibujo[i], 1), Math.Round(resto, 1), (int)Recolecciones[i]));
                    }
                }
                else
                {
                    antes += Antes[i];
                    dibujo += Dibujo[i];
                    despues += resto;
                    normales++;
                }
            }

            var informe = new JObject
            {
                { "cuadros", cuantos },
                { "mediana_ms", Math.Round(mediana, 2) },
                { "lentos", cuantos - normales },
                { "lentos_con_recoleccion", lentosConRecoleccion },
                { "cuadros_con_recoleccion", conRecoleccion },
                { "normal_antes_ms", normales > 0 ? Math.Round(antes / normales, 2) : 0.0 },
                { "normal_dibujo_ms", normales > 0 ? Math.Round(dibujo / normales, 2) : 0.0 },
                { "normal_despues_ms", normales > 0 ? Math.Round(despues / normales, 2) : 0.0 },
                { "columnas", "total, antes del dibujo, dibujo, después, recolecciones" },
                { "cuadros_lentos", lentos },
            };
            n = 0;
            return informe;
        }
    }

    /// <summary>Marca el principio de cada cuadro antes que los demás guiones.</summary>
    [DefaultExecutionOrder(-10000)]
    public sealed class RelojDeTirones : MonoBehaviour
    {
        private void Update()
        {
            Tirones.Cuadro();
        }
    }
}
