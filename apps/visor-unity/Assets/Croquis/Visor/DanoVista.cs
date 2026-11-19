using System.Collections.Generic;
using Croquis.Core;
using Croquis.Generated;
using UnityEngine;

namespace Croquis.Visor
{
    /// <summary>
    /// El daño del solver sobre la carrocería (auditoría del 2026-11-15, C2). Unity no calcula daño:
    /// deforma la malla con el perfil de aplastamiento del Resultado (`dano.perfil_m`, con su ancho, su
    /// centro y la cara del CDC), con el mismo `CampoDano` que se prueba sin Unity en `Croquis.Core`.
    ///
    /// Al armar el vehículo se prepara, por cada pieza de la carrocería que el daño toca, una copia
    /// deformada de su malla. Antes del primer impacto del vehículo se ve la original; desde ese
    /// instante, la deformada. Las ruedas no se deforman, y un vehículo sin modelo (la caja de
    /// respaldo) tampoco: no tiene malla donde se note.
    /// </summary>
    public sealed class DanoVista
    {
        private readonly List<Pieza> piezas = new List<Pieza>();
        private double avance = -1.0;

        private DanoVista(double desde)
        {
            Desde = desde;
        }

        /// <summary>El instante del Resultado desde el que se ve el daño.</summary>
        public double Desde { get; }

        /// <summary>Cuántas piezas de la carrocería cambian con el daño.</summary>
        public int Piezas => piezas.Count;

        /// <summary>El mayor desplazamiento de un vértice, en metros (para el diagnóstico y las pruebas).</summary>
        public double DesplazamientoMaximo { get; private set; }

        /// <summary>
        /// Prepara el daño de un vehículo ya armado. Nulo si el Resultado no trae daño que dibujar para
        /// él (`DanoDelCaso.Campo`) o si ninguna pieza cambia.
        /// </summary>
        public static DanoVista Preparar(Transform vehiculo, ResultadoVehiculo v, Caso3DResultado r)
        {
            var campo = DanoDelCaso.Campo(v);
            if (campo == null || vehiculo == null)
            {
                return null;
            }

            var dano = new DanoVista(DanoDelCaso.Instante(r, v.Id));
            var semilla = DanoDelCaso.Semilla(r != null ? r.Semilla : 0L, v.Id);
            foreach (var filtro in vehiculo.GetComponentsInChildren<MeshFilter>(true))
            {
                // La carrocería son las piezas que cuelgan directo del vehículo, con sus vértices en el
                // marco del vehículo (`ArmadorVehiculo.Armar`). Las ruedas van en su propio nodo y la
                // caja de respaldo va escalada: ninguna de las dos se deforma.
                var t = filtro.transform;
                if (t.parent != vehiculo || t.localPosition != Vector3.zero || t.localScale != Vector3.one || t.localRotation != Quaternion.identity)
                {
                    continue;
                }

                var antes = filtro.sharedMesh;
                if (antes == null || !antes.isReadable)
                {
                    continue;
                }

                var despues = Deformar(antes, campo, semilla, out var maximo);
                if (despues == null)
                {
                    continue;
                }

                dano.piezas.Add(new Pieza { Filtro = filtro, Antes = antes, Despues = despues });
                dano.DesplazamientoMaximo = System.Math.Max(dano.DesplazamientoMaximo, maximo);
            }

            return dano.piezas.Count > 0 ? dano : null;
        }

        /// <summary>
        /// Pone la malla que toca en el instante `t`: la original antes del impacto, la deformada después
        /// y, en los `EnfasisImpacto.DuracionDanoS` del golpe, la que va de una a otra (ronda 4, punto 5:
        /// que el choque se vea). Termina exactamente en la deformación del solver.
        /// </summary>
        public void Mostrar(double t)
        {
            var f = EnfasisImpacto.AvanceDano(t, Desde);
            if (System.Math.Abs(f - avance) < 1e-4)
            {
                return;
            }

            avance = f;
            foreach (var p in piezas)
            {
                if (p.Filtro == null)
                {
                    continue;
                }

                if (f <= 0.0)
                {
                    p.Filtro.sharedMesh = p.Antes;
                }
                else if (f >= 1.0)
                {
                    p.Filtro.sharedMesh = p.Despues;
                }
                else
                {
                    p.Filtro.sharedMesh = p.Transicion(f);
                }
            }
        }

        /// <summary>La copia deformada de una malla, o nulo si el daño no mueve ninguno de sus vértices.</summary>
        private static Mesh Deformar(Mesh antes, CampoDano campo, int semilla, out double maximo)
        {
            var vertices = antes.vertices;
            var entrada = new V3[vertices.Length];
            for (var i = 0; i < vertices.Length; i++)
            {
                entrada[i] = new V3(vertices[i].x, vertices[i].y, vertices[i].z);
            }

            var salida = DanoDelCaso.Deformar(campo, entrada, antes.triangles, semilla);
            maximo = 0.0;
            var movido = new bool[vertices.Length];
            for (var i = 0; i < vertices.Length; i++)
            {
                var nuevo = new Vector3((float)salida[i].X, (float)salida[i].Y, (float)salida[i].Z);
                var d = (nuevo - vertices[i]).magnitude;
                if (d > 1e-5f)
                {
                    movido[i] = true;
                    maximo = System.Math.Max(maximo, d);
                }

                vertices[i] = nuevo;
            }

            if (maximo <= 0.0)
            {
                return null;
            }

            var despues = Object.Instantiate(antes);
            despues.name = antes.name + "_dano";
            despues.vertices = vertices;
            // Las normales se rehacen solo donde la lámina se movió: el resto conserva las del modelo.
            var originales = antes.normals;
            despues.RecalculateNormals();
            if (originales.Length == vertices.Length)
            {
                var normales = despues.normals;
                for (var i = 0; i < normales.Length; i++)
                {
                    if (!movido[i])
                    {
                        normales[i] = originales[i];
                    }
                }

                despues.normals = normales;
            }

            despues.RecalculateBounds();
            if (antes.tangents.Length > 0)
            {
                despues.RecalculateTangents();
            }

            return despues;
        }

        private sealed class Pieza
        {
            public MeshFilter Filtro;
            public Mesh Antes;
            public Mesh Despues;
            private Mesh enMedio;
            private Vector3[] va;
            private Vector3[] vd;
            private Vector3[] vm;

            /// <summary>La malla a una fracción `f` del camino entre la original y la deformada.</summary>
            public Mesh Transicion(double f)
            {
                if (enMedio == null)
                {
                    enMedio = Object.Instantiate(Despues);
                    enMedio.name = Antes.name + "_golpe";
                    enMedio.MarkDynamic();
                    va = Antes.vertices;
                    vd = Despues.vertices;
                    vm = new Vector3[va.Length];
                }

                var k = (float)f;
                for (var i = 0; i < va.Length; i++)
                {
                    vm[i] = Vector3.LerpUnclamped(va[i], vd[i], k);
                }

                enMedio.vertices = vm;
                return enMedio;
            }
        }
    }
}
