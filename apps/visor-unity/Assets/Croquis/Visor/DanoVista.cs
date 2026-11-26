using System.Collections.Generic;
using Croquis.Core;
using Croquis.Generated;
using UnityEngine;
using UnityEngine.Rendering;

namespace Croquis.Visor
{
    /// <summary>
    /// El daño del solver sobre la carrocería (auditoría del 2026-11-15, C2). Unity no calcula daño:
    /// deforma la malla con el perfil de aplastamiento del Resultado (`dano.perfil_m`, con su ancho, su
    /// centro, la cara del CDC y la PDOF), con el mismo `CampoDano` que se prueba sin Unity en
    /// `Croquis.Core`. Cada impacto posterior (`danos_posteriores`) se dibuja en su instante, encima del
    /// anterior (docs/contrato-unity.md §1).
    ///
    /// Al armar el vehículo, cada pieza de la carrocería que el daño toca se refina en la zona dañada
    /// (`Refinamiento`, para que los pliegues se vean en modelos de pocos vértices) y se prepara una copia
    /// deformada por impacto. Antes del primer impacto del vehículo se ve la original; desde cada
    /// impacto, la suya. Las ruedas no se deforman, y un vehículo sin modelo (la caja de respaldo)
    /// tampoco: no tiene malla donde se note.
    /// </summary>
    public sealed class DanoVista
    {
        /// <summary>El lado más largo de un triángulo en la zona dañada, después de refinar (m).</summary>
        private const double LadoMaximo = 0.06;

        /// <summary>Tope de vértices nuevos por pieza (memoria y tiempo de carga en WebGL).</summary>
        private const int TopeVertices = 40000;

        private readonly List<Pieza> piezas = new List<Pieza>();
        private readonly double[] desdes;
        private int etapaPuesta = -2;
        private double avance = -1.0;

        private DanoVista(double[] desdes)
        {
            this.desdes = desdes;
        }

        /// <summary>El instante del Resultado desde el que se ve el primer daño.</summary>
        public double Desde => desdes[0];

        /// <summary>Cuántas piezas de la carrocería cambian con el daño.</summary>
        public int Piezas => piezas.Count;

        /// <summary>El mayor desplazamiento de un vértice, en metros (para el diagnóstico y las pruebas).</summary>
        public double DesplazamientoMaximo { get; private set; }

        /// <summary>
        /// Prepara el daño de un vehículo ya armado. Nulo si el Resultado no trae daño que dibujar para
        /// él (`DanoDelCaso.Etapas`) o si ninguna pieza cambia.
        /// </summary>
        public static DanoVista Preparar(Transform vehiculo, ResultadoVehiculo v, Caso3DResultado r)
        {
            var etapas = DanoDelCaso.Etapas(v, r);
            if (etapas.Count == 0 || vehiculo == null)
            {
                return null;
            }

            var desdes = new double[etapas.Count];
            for (var k = 0; k < etapas.Count; k++)
            {
                desdes[k] = etapas[k].Desde;
            }

            var dano = new DanoVista(desdes);
            var semilla = DanoDelCaso.Semilla(r != null ? r.Semilla : 0L, v.Id);
            var carroceria = new List<MeshFilter>();
            var todos = new List<V3>();
            var triangulos = new List<int>();
            foreach (var filtro in vehiculo.GetComponentsInChildren<MeshFilter>(true))
            {
                // La carrocería son las piezas que cuelgan directo del vehículo, con sus vértices en el
                // marco del vehículo (`ArmadorVehiculo.Armar`). Las ruedas van en su propio nodo y la
                // caja de respaldo va escalada: ninguna de las dos se deforma.
                var t = filtro.transform;
                var original = filtro.sharedMesh;
                if (t.parent != vehiculo || t.localPosition != Vector3.zero || t.localScale != Vector3.one || t.localRotation != Quaternion.identity
                    || original == null || !original.isReadable)
                {
                    continue;
                }

                carroceria.Add(filtro);
                foreach (var i in original.triangles)
                {
                    triangulos.Add(todos.Count + i);
                }

                foreach (var p in original.vertices)
                {
                    todos.Add(new V3(p.x, p.y, p.z));
                }
            }

            // La profundidad se cuenta desde el frente real de toda la carrocería, no desde la caja.
            foreach (var e in etapas)
            {
                DanoDelCaso.FijarFrente(e.Campo, todos, triangulos);
            }

            var antesTodos = new List<V3>();
            var despuesTodos = new List<V3>();
            foreach (var filtro in carroceria)
            {
                var antes = Refinar(filtro.sharedMesh, etapas) ?? filtro.sharedMesh;
                var mallas = Deformar(antes, etapas, semilla, out var maximo, out var primera);
                if (mallas == null)
                {
                    continue;
                }

                filtro.sharedMesh = antes;
                dano.piezas.Add(new Pieza { Filtro = filtro, Antes = antes, Etapas = mallas });
                dano.DesplazamientoMaximo = System.Math.Max(dano.DesplazamientoMaximo, maximo);
                foreach (var p in antes.vertices)
                {
                    antesTodos.Add(new V3(p.x, p.y, p.z));
                }

                foreach (var p in primera)
                {
                    despuesTodos.Add(new V3(p.x, p.y, p.z));
                }
            }

            if (dano.piezas.Count == 0)
            {
                return null;
            }

            // Lo que se hundió de verdad la lámina en C1–C6, contra lo que pide el solver (en la bitácora).
            var campo = etapas[0].Campo;
            dano.Pedido = campo.Perfil;
            dano.Medido = DanoDelCaso.Medir(campo, antesTodos, despuesTodos, out var alli);
            dano.PedidoAlli = alli;
            dano.CampoPrimero = campo;
            Debug.Log("[daño] " + v.Id + " C1–C6 (cm) solver " + Cm(dano.Pedido) + " · en la malla " + Cm(dano.Medido) + " · el solver donde se midió " + Cm(dano.PedidoAlli));
            return dano;
        }

        /// <summary>El perfil del primer impacto que pide el solver y el que quedó en la malla (m), C1 a C6.</summary>
        public double[] Pedido { get; private set; }
        public double[] Medido { get; private set; }

        /// <summary>Lo que pide el perfil del solver en los puntos de lámina donde se midió cada estación (m).</summary>
        public double[] PedidoAlli { get; private set; }

        private CampoDano CampoPrimero { get; set; }

        private static string Cm(double[] c)
        {
            var partes = new string[c.Length];
            for (var k = 0; k < c.Length; k++)
            {
                partes[k] = double.IsNaN(c[k]) ? "—" : (c[k] * 100.0).ToString("0.0", System.Globalization.CultureInfo.InvariantCulture);
            }

            return string.Join(" ", partes);
        }

        /// <summary>
        /// Para revisar el daño (capturas): por estación C1–C6, en el marco del vehículo, el frente antes del
        /// golpe, el frente a la profundidad del solver y el frente a la profundidad que quedó en la malla.
        /// </summary>
        public List<(Vector3 Frente, Vector3 Pedido, Vector3 Medido)> Estaciones()
        {
            // A la altura donde se mide (el centro de la banda de la estructura).
            var altura = (float)((CampoPrimero.Banda0 + CampoPrimero.Banda1) / 2.0);
            var lista = new List<(Vector3, Vector3, Vector3)>();
            var c = CampoPrimero;
            for (var k = 0; k < 6; k++)
            {
                var u = c.Estacion(k);
                var f = c.FrenteEnEstacion(k);
                Vector3 En(double a)
                {
                    var p = DanoDelCaso.AUnity(c.Afuera * a + c.ALoLargo * u);
                    return new Vector3((float)p.X, altura, (float)p.Z);
                }

                lista.Add((En(f), En(f - Pedido[k]), En(f - (double.IsNaN(Medido[k]) ? 0.0 : Medido[k]))));
            }

            return lista;
        }

        /// <summary>
        /// Pone la malla que toca en el instante `t`: la original antes del primer impacto, la de cada
        /// impacto desde su instante y, en los `EnfasisImpacto.DuracionDanoS` de cada golpe, la que va de
        /// la anterior a la suya (ronda 4, punto 5). Termina exactamente en la deformación del solver.
        /// </summary>
        public void Mostrar(double t)
        {
            var k = -1;
            while (k + 1 < desdes.Length && t >= desdes[k + 1] - 1e-9)
            {
                k++;
            }

            var f = k < 0 ? 0.0 : EnfasisImpacto.AvanceDano(t, desdes[k]);
            if (k == etapaPuesta && System.Math.Abs(f - avance) < 1e-4)
            {
                return;
            }

            etapaPuesta = k;
            avance = f;
            foreach (var p in piezas)
            {
                if (p.Filtro == null)
                {
                    continue;
                }

                var desde = k <= 0 ? p.Antes : p.Etapas[k - 1];
                if (k < 0)
                {
                    p.Filtro.sharedMesh = p.Antes;
                }
                else if (f >= 1.0)
                {
                    p.Filtro.sharedMesh = p.Etapas[k];
                }
                else
                {
                    p.Filtro.sharedMesh = p.Transicion(desde, p.Etapas[k], f);
                }
            }
        }

        /// <summary>
        /// Una copia de la malla con los triángulos de la zona dañada partidos (UV, normales, tangentes y
        /// colores, interpolados), o nulo si ningún triángulo se parte.
        /// </summary>
        private static Mesh Refinar(Mesh m, List<(double Desde, CampoDano Campo)> etapas)
        {
            var subs = new int[m.subMeshCount][];
            for (var s = 0; s < subs.Length; s++)
            {
                if (m.GetTopology(s) != MeshTopology.Triangles)
                {
                    return null;
                }

                subs[s] = m.GetTriangles(s);
            }

            var vs = m.vertices;
            var entrada = new V3[vs.Length];
            for (var i = 0; i < vs.Length; i++)
            {
                entrada[i] = new V3(vs[i].x, vs[i].y, vs[i].z);
            }

            bool EnZona(V3 p)
            {
                foreach (var e in etapas)
                {
                    if (DanoDelCaso.Toca(e.Campo, p))
                    {
                        return true;
                    }
                }

                return false;
            }

            var r = Refinamiento.Partir(entrada, subs, EnZona, LadoMaximo, 4, TopeVertices);
            if (r.Padres.Count == 0)
            {
                return null;
            }

            var n = r.Posiciones.Count;
            var fina = new Mesh { name = m.name + "_fino", indexFormat = n > 65535 ? IndexFormat.UInt32 : IndexFormat.UInt16 };
            var posiciones = new Vector3[n];
            for (var i = 0; i < n; i++)
            {
                var p = r.Posiciones[i];
                posiciones[i] = new Vector3((float)p.X, (float)p.Y, (float)p.Z);
            }

            fina.vertices = posiciones;
            var normales = m.normals;
            if (normales.Length == vs.Length)
            {
                var lista = new List<Vector3>(normales);
                foreach (var (a, b) in r.Padres)
                {
                    lista.Add((lista[a] + lista[b]).normalized);
                }

                fina.SetNormals(lista);
            }

            var tangentes = m.tangents;
            if (tangentes.Length == vs.Length)
            {
                var lista = new List<Vector4>(tangentes);
                foreach (var (a, b) in r.Padres)
                {
                    var t = ((Vector3)lista[a] + (Vector3)lista[b]).normalized;
                    lista.Add(new Vector4(t.x, t.y, t.z, lista[a].w));
                }

                fina.SetTangents(lista);
            }

            var colores = m.colors;
            if (colores.Length == vs.Length)
            {
                var lista = new List<Color>(colores);
                foreach (var (a, b) in r.Padres)
                {
                    lista.Add(Color.Lerp(lista[a], lista[b], 0.5f));
                }

                fina.SetColors(lista);
            }

            var uv = new List<Vector4>();
            for (var canal = 0; canal < 8; canal++)
            {
                if (!m.HasVertexAttribute((VertexAttribute)((int)VertexAttribute.TexCoord0 + canal)))
                {
                    continue;
                }

                uv.Clear();
                m.GetUVs(canal, uv);
                if (uv.Count != vs.Length)
                {
                    continue;
                }

                foreach (var (a, b) in r.Padres)
                {
                    uv.Add((uv[a] + uv[b]) * 0.5f);
                }

                fina.SetUVs(canal, uv);
            }

            fina.subMeshCount = subs.Length;
            for (var s = 0; s < subs.Length; s++)
            {
                fina.SetTriangles(r.Triangulos[s], s, false);
            }

            fina.RecalculateBounds();
            return fina;
        }

        /// <summary>
        /// Las copias deformadas de una malla, una por impacto (cada una con los daños de los anteriores),
        /// o nulo si ningún daño mueve sus vértices.
        /// </summary>
        private static Mesh[] Deformar(Mesh antes, List<(double Desde, CampoDano Campo)> etapas, int semilla, out double maximo, out Vector3[] primera)
        {
            var vertices = antes.vertices;
            var triangulos = antes.triangles;
            var entrada = new V3[vertices.Length];
            for (var i = 0; i < vertices.Length; i++)
            {
                entrada[i] = new V3(vertices[i].x, vertices[i].y, vertices[i].z);
            }

            maximo = 0.0;
            var acumulado = new Vector3[vertices.Length];
            var movido = new bool[vertices.Length];
            var mallas = new Mesh[etapas.Count];
            primera = null;
            for (var k = 0; k < etapas.Count; k++)
            {
                var salida = DanoDelCaso.Deformar(etapas[k].Campo, entrada, triangulos, semilla + k);
                var nuevos = new Vector3[vertices.Length];
                for (var i = 0; i < vertices.Length; i++)
                {
                    acumulado[i] += new Vector3((float)(salida[i].X - entrada[i].X), (float)(salida[i].Y - entrada[i].Y), (float)(salida[i].Z - entrada[i].Z));
                    var d = acumulado[i].magnitude;
                    if (d > 1e-5f)
                    {
                        movido[i] = true;
                        maximo = System.Math.Max(maximo, d);
                    }

                    nuevos[i] = vertices[i] + acumulado[i];
                }

                mallas[k] = Copia(antes, nuevos, movido, k);
                primera = primera ?? nuevos;
            }

            return maximo > 0.0 ? mallas : null;
        }

        private static Mesh Copia(Mesh antes, Vector3[] vertices, bool[] movido, int etapa)
        {
            var despues = Object.Instantiate(antes);
            despues.name = antes.name + "_dano" + (etapa > 0 ? "_" + etapa : string.Empty);
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
            public Mesh[] Etapas;
            private Mesh enMedio;
            private Mesh hacia;
            private Vector3[] va;
            private Vector3[] vd;
            private Vector3[] vm;

            /// <summary>La malla a una fracción `f` del camino entre `desde` y `a`.</summary>
            public Mesh Transicion(Mesh desde, Mesh a, double f)
            {
                if (enMedio == null)
                {
                    enMedio = Object.Instantiate(a);
                    enMedio.name = Antes.name + "_golpe";
                    enMedio.MarkDynamic();
                    vm = new Vector3[a.vertexCount];
                }

                if (hacia != a)
                {
                    hacia = a;
                    va = desde.vertices;
                    vd = a.vertices;
                    enMedio.normals = a.normals;
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
