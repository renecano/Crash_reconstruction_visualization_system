using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace Croquis.Visor
{
    /// <summary>
    /// Los árboles como impostores (ADR 0113): cada uno es un solo cuadro que gira hacia la cámara y
    /// muestra, del atlas de su especie, la vista horneada más cercana a la dirección desde la que se
    /// le mira. No hay tarjetas cruzadas, así que no hay costura; a la altura de la acera se ve el
    /// árbol entero como lo dibujó Blender desde ahí.
    ///
    /// Todos los árboles de una especie van en una sola malla, que se rehace por cuadro en la CPU
    /// (cuatro vértices por árbol): una sola llamada de dibujo por especie, sin sombreador propio, que
    /// es lo que conviene en WebGL. La sombra la dan dos tarjetas cruzadas fijas que solo proyectan
    /// sombra, y desde arriba la copa es la tarjeta de planta de siempre.
    /// </summary>
    public sealed class ArbolesVista : MonoBehaviour
    {
        /// <summary>Hasta cuánto se inclina el cuadro hacia una cámara alta, para no verse de canto.</summary>
        private const float InclinacionMaxRad = 25f * Mathf.Deg2Rad;

        /// <summary>Desde qué elevación de la cámara se deja solo la tarjeta de planta.</summary>
        private const float DesdeArribaRad = 58f * Mathf.Deg2Rad;

        private struct Arbol
        {
            public Vector3 Pie;
            public float Lado;
            public float Centro;
            public float Giro;
        }

        private sealed class Grupo
        {
            public readonly List<Arbol> Arboles = new List<Arbol>();
            public Mesh Malla;
            public Vector3[] Vertices;
            public Vector3[] Normales;
            public Vector4[] Tangentes;
            public Vector2[] Uv;
            public int Vistas;
            public int Columnas;
            public float LadoModelo;
            public float AltoModelo;
            public Bounds Caja;
        }

        private readonly Dictionary<string, Grupo> grupos = new Dictionary<string, Grupo>();
        private Vector3 ultima = new Vector3(float.NaN, 0f, 0f);
        private Vector3 ultimaMira = Vector3.forward;

        /// <summary>Un árbol de `alto` metros con el pie en `pie` y su rumbo (rad, en planta).</summary>
        public void Agregar(string especie, Vector3 pie, float alto, float giroRad)
        {
            if (!grupos.TryGetValue(especie, out var g))
            {
                var m = Materiales.MedidasImpostor(especie);
                g = new Grupo { LadoModelo = m.x, AltoModelo = m.y, Vistas = (int)m.z, Columnas = (int)m.w };
                grupos[especie] = g;
            }

            var k = alto / g.AltoModelo;
            g.Arboles.Add(new Arbol { Pie = pie, Lado = g.LadoModelo * k, Centro = alto / 2f, Giro = giroRad });
        }

        /// <summary>Crea las mallas una vez agregados todos los árboles.</summary>
        public void Cerrar()
        {
            foreach (var par in grupos)
            {
                var g = par.Value;
                var n = g.Arboles.Count;
                g.Vertices = new Vector3[4 * n];
                g.Normales = new Vector3[4 * n];
                g.Tangentes = new Vector4[4 * n];
                g.Uv = new Vector2[4 * n];
                var triangulos = new int[6 * n];
                var caja = new Bounds(g.Arboles[0].Pie, Vector3.zero);
                var sombras = new Malla();
                for (var i = 0; i < n; i++)
                {
                    var a = g.Arboles[i];
                    triangulos[6 * i] = 4 * i;
                    triangulos[6 * i + 1] = 4 * i + 2;
                    triangulos[6 * i + 2] = 4 * i + 1;
                    triangulos[6 * i + 3] = 4 * i;
                    triangulos[6 * i + 4] = 4 * i + 3;
                    triangulos[6 * i + 5] = 4 * i + 2;
                    caja.Encapsulate(new Bounds(a.Pie + Vector3.up * a.Centro, Vector3.one * (a.Lado * 1.5f)));
                    // La sombra: las vistas 0 y un cuarto de vuelta, cruzadas y fijas.
                    foreach (var cuarto in new[] { 0, g.Vistas / 4 })
                    {
                        var ang = a.Giro + cuarto * 2f * Mathf.PI / g.Vistas;
                        var derecha = new Vector3(Mathf.Cos(ang), 0f, Mathf.Sin(ang)) * (a.Lado / 2f);
                        var centro = a.Pie + Vector3.up * a.Centro;
                        var arriba = Vector3.up * (a.Lado / 2f);
                        Cuadro(g, cuarto, out var u0, out var v0, out var u1, out var v1);
                        var j = sombras.Vertice(centro - derecha - arriba, new Vector2(u0, v0));
                        sombras.Vertice(centro + derecha - arriba, new Vector2(u1, v0));
                        sombras.Vertice(centro + derecha + arriba, new Vector2(u1, v1));
                        sombras.Vertice(centro - derecha + arriba, new Vector2(u0, v1));
                        sombras.Triangulo(j, j + 2, j + 1);
                        sombras.Triangulo(j, j + 3, j + 2);
                    }
                }

                g.Malla = new Mesh { name = "impostores_" + par.Key };
                g.Malla.MarkDynamic();
                g.Malla.vertices = g.Vertices;
                g.Malla.triangles = triangulos;
                g.Malla.bounds = caja;
                var go = new GameObject("arboles_" + par.Key);
                go.transform.SetParent(transform, false);
                go.AddComponent<MeshFilter>().sharedMesh = g.Malla;
                var mr = go.AddComponent<MeshRenderer>();
                var material = Materiales.Arbol(par.Key, "atlas");
                mr.sharedMaterial = material;
                mr.shadowCastingMode = ShadowCastingMode.Off;
                // No recibe sombra (lo fija su material, `arbol_<especie>_atlas`): sus propias tarjetas
                // de sombra lo cruzan y le dejaban una franja oscura al centro. Su luz y su volumen
                // salen de la normal horneada.
                mr.receiveShadows = false;
                var sombra = sombras.Poner(transform, "sombras_" + par.Key, material).GetComponent<MeshRenderer>();
                sombra.shadowCastingMode = ShadowCastingMode.ShadowsOnly;
                g.Caja = caja;
            }

            var camara = Camera.main;
            if (camara != null)
            {
                Actualizar(camara.transform.position, camara.transform.forward);
            }
            else
            {
                Actualizar(new Vector3(0f, 2f, -30f), Vector3.forward);
            }
        }

        /// <summary>El rectángulo de la vista `k` en el atlas (la fila 0 es la de arriba de la imagen).</summary>
        private static void Cuadro(Grupo g, int k, out float u0, out float v0, out float u1, out float v1)
        {
            var filas = g.Vistas / g.Columnas;
            var col = k % g.Columnas;
            var fila = k / g.Columnas;
            // Un margen mínimo: sin él, el filtrado trae el borde de la vista vecina.
            const float M = 0.0015f;
            u0 = (float)col / g.Columnas + M;
            u1 = (float)(col + 1) / g.Columnas - M;
            v1 = 1f - (float)fila / filas - M;
            v0 = 1f - (float)(fila + 1) / filas + M;
        }

        private void OnEnable()
        {
            RenderPipelineManager.beginCameraRendering += AntesDeDibujar;
        }

        private void OnDisable()
        {
            RenderPipelineManager.beginCameraRendering -= AntesDeDibujar;
        }

        /// <summary>
        /// Los cuadros se orientan justo antes de dibujar, hacia la cámara que va a dibujar: en
        /// `LateUpdate` podían quedar un cuadro atrás de la cámara del visor, que también se mueve ahí.
        /// </summary>
        private void AntesDeDibujar(ScriptableRenderContext contexto, Camera camara)
        {
            if (camara.cameraType != CameraType.Game)
            {
                return;
            }

            var t = camara.transform;
            if (t.position != ultima || t.forward != ultimaMira)
            {
                Actualizar(t.position, t.forward);
            }
        }

        private void Actualizar(Vector3 ojo, Vector3 mira)
        {
            ultima = ojo;
            ultimaMira = mira;
            // Con la cámara mirando casi a plomo (la cenital), todos los árboles van de planta: los de
            // la orilla del cuadro se verían acostados hacia afuera.
            var aPlomo = -mira.y > Mathf.Sin(DesdeArribaRad);
            foreach (var g in grupos.Values)
            {
                if (g.Malla == null)
                {
                    continue;
                }

                for (var i = 0; i < g.Arboles.Count; i++)
                {
                    var a = g.Arboles[i];
                    var haciaOjo = ojo - (a.Pie + Vector3.up * a.Centro);
                    var plano = new Vector3(haciaOjo.x, 0f, haciaOjo.z);
                    var lejos = plano.magnitude;
                    var h = lejos > 0.01f ? plano / lejos : Vector3.forward;
                    // Hacia una cámara alta el cuadro se inclina un poco, con el pie fijo en el suelo.
                    var elevacion = Mathf.Atan2(haciaOjo.y, Mathf.Max(lejos, 0.01f));
                    var j = 4 * i;
                    if (aPlomo || elevacion > DesdeArribaRad)
                    {
                        // Desde arriba el cuadro se vería como un árbol acostado: se pliega en un
                        // punto y queda la tarjeta de planta.
                        var punto = a.Pie + Vector3.up * a.Centro;
                        for (var q = 0; q < 4; q++)
                        {
                            g.Vertices[j + q] = punto;
                        }

                        continue;
                    }

                    var inclina = Mathf.Clamp(elevacion * 0.5f, 0f, InclinacionMaxRad);
                    var normal = h * Mathf.Cos(inclina) + Vector3.up * Mathf.Sin(inclina);
                    var derecha = Vector3.Cross(h, Vector3.up);
                    var arriba = Vector3.Cross(derecha, normal);
                    // La vista horneada más cercana: la 0 se tomó desde −Y del modelo.
                    var angulo = Mathf.Atan2(h.z, h.x) - a.Giro + Mathf.PI / 2f;
                    var k = Mathf.RoundToInt(angulo / (2f * Mathf.PI) * g.Vistas);
                    k = ((k % g.Vistas) + g.Vistas) % g.Vistas;
                    Cuadro(g, k, out var u0, out var v0, out var u1, out var v1);
                    var centro = a.Pie + arriba * a.Centro;
                    var dx = derecha * (a.Lado / 2f);
                    var dy = arriba * (a.Lado / 2f);
                    g.Vertices[j] = centro - dx - dy;
                    g.Vertices[j + 1] = centro + dx - dy;
                    g.Vertices[j + 2] = centro + dx + dy;
                    g.Vertices[j + 3] = centro - dx + dy;
                    g.Uv[j] = new Vector2(u0, v0);
                    g.Uv[j + 1] = new Vector2(u1, v0);
                    g.Uv[j + 2] = new Vector2(u1, v1);
                    g.Uv[j + 3] = new Vector2(u0, v1);
                    // La normal horneada está en el espacio de la cámara de Blender: derecha, arriba y
                    // hacia el ojo, que son la tangente, la bitangente y la normal del cuadro.
                    var tangente = new Vector4(derecha.x, derecha.y, derecha.z, -1f);
                    for (var q = 0; q < 4; q++)
                    {
                        g.Normales[j + q] = normal;
                        g.Tangentes[j + q] = tangente;
                    }
                }

                g.Malla.vertices = g.Vertices;
                g.Malla.normals = g.Normales;
                g.Malla.tangents = g.Tangentes;
                g.Malla.uv = g.Uv;
                g.Malla.bounds = g.Caja;
            }
        }
    }
}
