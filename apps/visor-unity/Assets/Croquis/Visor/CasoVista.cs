using System;
using System.Collections.Generic;
using Croquis.Generated;
using UnityEngine;
using UnityEngine.Rendering;
using Material = UnityEngine.Material;

namespace Croquis.Visor
{
    /// <summary>
    /// Lo que es del caso y no del entorno: los objetos colocados, los dispositivos de control, las
    /// huellas y manchas que deja el choque, las evidencias que declaró el perito y los puntos de C1.
    /// Lo que cambia con el tiempo queda en `EscenaDinamica`, que solo lee lo que ya viene resuelto.
    /// </summary>
    public static class CasoVista
    {
        public static EscenaDinamica Construir(Transform raiz, Caso3D caso, Terreno terreno, bool noche)
        {
            var padre = new GameObject("caso").transform;
            padre.SetParent(raiz, false);
            var dinamica = padre.gameObject.AddComponent<EscenaDinamica>();
            Objetos(padre, caso.Resultado.Objetos, terreno);
            var e = caso.Escenario;
            if (e == null)
            {
                return dinamica;
            }

            Dispositivos(padre, e.Dispositivos, terreno, dinamica);
            Huellas(padre, e.Huellas, terreno, dinamica);
            Manchas(padre, e.Manchas, terreno, dinamica);
            Evidencias(padre, e.Evidencias, terreno, e.Semilla);
            dinamica.Marcadores = Marcadores(padre, e.Marcadores, terreno);
            return dinamica;
        }

        private static Vector3 Dir(double grados)
        {
            var r = (float)grados * Mathf.Deg2Rad;
            return new Vector3(Mathf.Cos(r), 0f, Mathf.Sin(r));
        }

        // ---- Objetos colocados ------------------------------------------------------------------------

        private static void Objetos(Transform padre, ResultadoObjeto[] objetos, Terreno terreno)
        {
            if (objetos == null || objetos.Length == 0)
            {
                return;
            }

            var concreto = new Malla();
            var madera = new Malla();
            var muro = new Malla();
            var metal = new Malla();
            var troncos = new Malla();
            var copas = new Malla();
            var copasPlanta = new Malla();
            var placas = new Malla();
            foreach (var o in objetos)
            {
                var pie = terreno.P(o.X, o.Y);
                var eje = Dir(o.RumboDeg);
                var lado = Vector3.Cross(Vector3.up, eje);
                var tipo = o.Tipo.ToString();
                var alto = (float)o.AltoM;
                switch (o.Forma)
                {
                    case Forma.Cilindro:
                    {
                        var r = (float)(o.RadioM ?? Math.Max(o.LargoM, o.AnchoM) / 2.0);
                        // Un poste de concreto es más ancho abajo; con brazo corto si es de luz.
                        concreto.Prisma(pie, r * 1.15f, alto, 12, r * 0.75f);
                        if (tipo == "Poste" && alto > 5f)
                        {
                            madera.Caja(pie + Vector3.up * (alto - 0.7f), eje, lado, 1.6f, 0.1f, 0.1f);
                        }

                        break;
                    }

                    case Forma.Arbol:
                    {
                        var copa = o.Copa;
                        var tronco = copa != null ? (float)copa.TroncoAltoM : alto * 0.4f;
                        var radio = (float)(o.RadioM ?? 0.2);
                        troncos.Prisma(pie, radio * 1.2f, tronco + 0.6f, 10, radio * 0.8f);
                        var medidas = Materiales.MedidasArbol("fresno");
                        var ancho = medidas.x * (alto / medidas.y);
                        for (var c = 0; c < 3; c++)
                        {
                            var d = Dir(o.RumboDeg + c * 60.0) * (ancho / 2f);
                            copas.Tarjeta(pie - d, pie + d, pie + d + Vector3.up * alto, pie - d + Vector3.up * alto);
                        }

                        var h = pie + Vector3.up * (alto * 0.62f);
                        var rr = ancho * 0.5f;
                        copasPlanta.Tarjeta(
                            h + new Vector3(-rr, 0, -rr), h + new Vector3(rr, 0, -rr), h + new Vector3(rr, 0, rr), h + new Vector3(-rr, 0, rr));
                        break;
                    }

                    case Forma.Senal:
                        metal.Prisma(pie, 0.035f, alto, 8);
                        placas.Caja(pie + Vector3.up * (alto - 0.75f) + eje * 0.04f, lado, eje, 0.7f, 0.7f, 0.03f);
                        break;
                    default:
                    {
                        var m = tipo == "Contenedor" || tipo == "ParadaAutobus" ? metal : muro;
                        m.Caja(pie, eje, lado, (float)o.LargoM, alto, (float)o.AnchoM, 0.5f);
                        break;
                    }
                }
            }

            concreto.Poner(padre, "postes_colocados", Materiales.Pbr("concreto", new Color(0.82f, 0.82f, 0.82f)));
            madera.Poner(padre, "crucetas_colocadas", Materiales.Liso(new Color(0.3f, 0.25f, 0.2f), 0.1f));
            muro.Poner(padre, "muros_colocados", Materiales.Pbr("tabique", new Color(1.5f, 0.95f, 0.78f)));
            metal.Poner(padre, "metal_colocado", Materiales.Liso(new Color(0.42f, 0.45f, 0.48f), 0.5f, 0.7f));
            troncos.Poner(padre, "troncos_colocados", Materiales.Liso(new Color(0.3f, 0.24f, 0.18f), 0.08f));
            copas.Poner(padre, "arboles_colocados", Materiales.Arbol("fresno", "frente"));
            copasPlanta.Poner(padre, "copas_colocadas", Materiales.Arbol("fresno", "planta"));
            placas.Poner(padre, "placas_colocadas", Materiales.Liso(new Color(0.9f, 0.9f, 0.88f), 0.4f));
        }

        // ---- Dispositivos -----------------------------------------------------------------------------

        private static void Dispositivos(Transform padre, DispositivoEscenario[] lista, Terreno terreno, EscenaDinamica dinamica)
        {
            if (lista == null || lista.Length == 0)
            {
                return;
            }

            var postes = new Malla();
            var cajas = new Malla();
            var rojas = new Malla();
            var blancas = new Malla();
            var topes = new Malla();
            foreach (var d in lista)
            {
                var pie = terreno.P(d.X, d.Y);
                var mira = Dir(d.RumboDeg);
                var lado = Vector3.Cross(Vector3.up, mira);
                switch (d.Tipo)
                {
                    case TipoDispositivo.Semaforo:
                    case TipoDispositivo.SemaforoPeatonal:
                    {
                        var peatonal = d.Tipo == TipoDispositivo.SemaforoPeatonal;
                        var alto = peatonal ? 2.6f : 3.6f;
                        postes.Prisma(pie, 0.09f, alto, 10, 0.07f);
                        var n = peatonal ? 2 : 3;
                        var cabeza = pie + Vector3.up * alto;
                        cajas.Caja(cabeza - Vector3.up * (0.32f * n), lado, mira, 0.34f, 0.32f * n + 0.06f, 0.26f);
                        var luces = new MeshRenderer[3];
                        var orden = peatonal
                            ? new[] { ColorLuz.Rojo, ColorLuz.Verde }
                            : new[] { ColorLuz.Rojo, ColorLuz.Amarillo, ColorLuz.Verde };
                        for (var k = 0; k < orden.Length; k++)
                        {
                            var c = cabeza - Vector3.up * (0.16f + 0.32f * k) + mira * 0.135f;
                            var m = new Malla();
                            Disco(m, c, lado, mira, 0.11f, 18);
                            // La visera sobre cada luz.
                            cajas.Caja(c + Vector3.up * 0.12f + mira * 0.09f, lado, mira, 0.26f, 0.015f, 0.2f);
                            var go = m.Poner(padre, "luz_" + d.Id + "_" + orden[k], EscenaDinamica.Apagada(orden[k]), false);
                            luces[(int)IndiceDe(orden[k])] = go.GetComponent<MeshRenderer>();
                        }

                        dinamica.Semaforos.Add(new EscenaDinamica.Semaforo { Luces = d.Luces, Intermitente = d.Intermitente, Focos = luces });
                        break;
                    }

                    case TipoDispositivo.Alto:
                        postes.Prisma(pie, 0.035f, 2.9f, 8);
                        Disco(rojas, pie + Vector3.up * 2.45f + mira * 0.045f, lado, mira, 0.38f, 8, Mathf.PI / 8f);
                        break;
                    case TipoDispositivo.CedaElPaso:
                        postes.Prisma(pie, 0.035f, 2.9f, 8);
                        Disco(blancas, pie + Vector3.up * 2.45f + mira * 0.045f, lado, mira, 0.46f, 3, -Mathf.PI / 2f);
                        break;
                    case TipoDispositivo.Tope:
                    {
                        // Un tope de lomo: media caña baja a lo ancho, con franjas.
                        const int Pasos = 8;
                        for (var k = 0; k < Pasos; k++)
                        {
                            var u0 = k / (float)Pasos;
                            var u1 = (k + 1) / (float)Pasos;
                            Vector3 P(float u, float s) => pie + mira * ((u - 0.5f) * 1.5f) + lado * s + Vector3.up * (0.08f * Mathf.Sin(Mathf.PI * u) + 0.004f);
                            topes.Cuadro(P(u0, -3.5f), P(u0, 3.5f), P(u1, 3.5f), P(u1, -3.5f), 1f, true);
                        }

                        break;
                    }

                    default:
                        postes.Prisma(pie, 0.035f, 2.9f, 8);
                        Disco(blancas, pie + Vector3.up * 2.45f + mira * 0.045f, lado, mira, 0.36f, 20, 0f);
                        break;
                }
            }

            postes.Poner(padre, "postes_dispositivos", Materiales.Liso(new Color(0.2f, 0.21f, 0.22f), 0.45f, 0.6f));
            cajas.Poner(padre, "cajas_semaforo", Materiales.Liso(new Color(0.05f, 0.05f, 0.05f), 0.35f));
            rojas.Poner(padre, "placas_alto", Materiales.Emisivo(new Color(0.62f, 0.07f, 0.07f), new Color(0.07f, 0.008f, 0.008f)));
            blancas.Poner(padre, "placas_blancas", Materiales.Emisivo(new Color(0.9f, 0.9f, 0.88f), new Color(0.1f, 0.1f, 0.1f)));
            topes.Poner(padre, "topes", Materiales.Liso(new Color(0.75f, 0.6f, 0.12f), 0.25f));
        }

        private static int IndiceDe(ColorLuz c)
        {
            return c == ColorLuz.Rojo ? 0 : c == ColorLuz.Amarillo ? 1 : 2;
        }

        /// <summary>Un disco plano de n lados que mira hacia `mira`, visible por los dos lados.</summary>
        private static void Disco(Malla m, Vector3 c, Vector3 lado, Vector3 mira, float radio, int n, float giro = 0f)
        {
            var centro = m.Vertice(c, new Vector2(0.5f, 0.5f));
            for (var k = 0; k <= n; k++)
            {
                var ang = giro + 2f * Mathf.PI * k / n;
                m.Vertice(c + lado * (Mathf.Cos(ang) * radio) + Vector3.up * (Mathf.Sin(ang) * radio), Vector2.zero);
                if (k > 0)
                {
                    m.Triangulo(centro, centro + k + 1, centro + k);
                    m.Triangulo(centro, centro + k, centro + k + 1);
                }
            }
        }

        // ---- Huellas y manchas ------------------------------------------------------------------------

        private static void Huellas(Transform padre, HuellaEscenario[] huellas, Terreno terreno, EscenaDinamica dinamica)
        {
            if (huellas == null || huellas.Length == 0)
            {
                return;
            }

            foreach (var tipo in new[] { TipoHuella.Frenado, TipoHuella.Derrape })
            {
                var lista = new List<HuellaEscenario>();
                foreach (var h in huellas)
                {
                    if (h.Tipo == tipo)
                    {
                        lista.Add(h);
                    }
                }

                if (lista.Count == 0)
                {
                    continue;
                }

                // En el orden en que aparecen: así se muestran con solo mover cuántos triángulos se ven.
                lista.Sort((x, y) => x.T.CompareTo(y.T));
                var m = new Malla();
                var tiempos = new double[lista.Count];
                for (var k = 0; k < lista.Count; k++)
                {
                    var q = lista[k].Esquinas;
                    tiempos[k] = lista[k].T;
                    m.Cuadro(
                        terreno.P(q[0], q[1], 0.016f), terreno.P(q[2], q[3], 0.016f),
                        terreno.P(q[4], q[5], 0.016f), terreno.P(q[6], q[7], 0.016f), 1f, true);
                }

                var alfa = tipo == TipoHuella.Frenado ? 0.78f : 0.55f;
                var go = m.Poner(padre, "huellas_" + tipo.ToString().ToLowerInvariant(), Materiales.Calca(new Color(0.02f, 0.02f, 0.02f, alfa), 0.3f), false);
                dinamica.Huellas.Add(new EscenaDinamica.Huella { Malla = go.GetComponent<MeshFilter>().sharedMesh, Tiempos = tiempos, IndicesPorCuadro = 12 });
            }
        }

        private static void Manchas(Transform padre, ManchaEscenario[] manchas, Terreno terreno, EscenaDinamica dinamica)
        {
            if (manchas == null)
            {
                return;
            }

            foreach (var mancha in manchas)
            {
                var m = new Malla();
                var c = m.Vertice(Vector3.zero, Vector2.zero);
                const int Lados = 20;
                for (var k = 0; k <= Lados; k++)
                {
                    var ang = 2f * Mathf.PI * k / Lados;
                    var r = 1f + 0.14f * Mathf.Sin(3f * ang) + 0.08f * Mathf.Sin(7f * ang + 1f);
                    m.Vertice(new Vector3(Mathf.Cos(ang) * r, 0f, Mathf.Sin(ang) * r), Vector2.zero);
                    if (k > 0)
                    {
                        m.Triangulo(c, c + k + 1, c + k);
                    }
                }

                var go = m.Poner(padre, "mancha", Materiales.Charco, false);
                go.transform.position = terreno.P(mancha.X, mancha.Y, 0.012f);
                dinamica.Manchas.Add(new EscenaDinamica.Mancha { Objeto = go.transform, T0 = mancha.T0, Radio = (float)mancha.RadioM });
            }
        }

        // ---- Evidencias declaradas --------------------------------------------------------------------

        private static void Evidencias(Transform padre, EvidenciaEscenario[] evidencias, Terreno terreno, long semilla)
        {
            if (evidencias == null || evidencias.Length == 0)
            {
                return;
            }

            var trazos = new Malla();
            var vidrios = new Malla();
            var restos = new Malla();
            var azar = new Azar(semilla + 211);
            foreach (var ev in evidencias)
            {
                var p = ev.Puntos;
                if (ev.Tipo == TipoEvidencia.Vidrios || ev.Tipo == TipoEvidencia.Restos)
                {
                    // Regados alrededor de los puntos declarados y entre ellos.
                    var malla = ev.Tipo == TipoEvidencia.Vidrios ? vidrios : restos;
                    var cuantos = ev.Tipo == TipoEvidencia.Vidrios ? 90 : 26;
                    for (var k = 0; k < cuantos * p.Length; k++)
                    {
                        var a = p[k % p.Length];
                        var b = p[(k + 1) % p.Length];
                        var u = azar.Siguiente();
                        var x = (float)(a.X + (b.X - a.X) * u) + azar.Entre(-0.9f, 0.9f);
                        var y = (float)(a.Y + (b.Y - a.Y) * u) + azar.Entre(-0.9f, 0.9f);
                        var tam = ev.Tipo == TipoEvidencia.Vidrios ? azar.Entre(0.012f, 0.04f) : azar.Entre(0.04f, 0.16f);
                        var giro = Dir(azar.Entre(0f, 360f));
                        var c = terreno.P(x, y, 0.004f);
                        if (ev.Tipo == TipoEvidencia.Vidrios)
                        {
                            var ld = Vector3.Cross(Vector3.up, giro);
                            malla.Cuadro(c - giro * tam - ld * tam * 0.6f, c + giro * tam - ld * tam * 0.4f, c + giro * tam * 0.7f + ld * tam, c - giro * tam * 0.8f + ld * tam * 0.7f + Vector3.up * 0.006f, 1f, true);
                        }
                        else
                        {
                            malla.Caja(c, giro, Vector3.Cross(Vector3.up, giro), tam, tam * azar.Entre(0.15f, 0.5f), tam * azar.Entre(0.4f, 1f));
                        }
                    }

                    continue;
                }

                for (var k = 0; k + 1 < p.Length; k++)
                {
                    var a = terreno.P(p[k].X, p[k].Y, 0.015f);
                    var b = terreno.P(p[k + 1].X, p[k + 1].Y, 0.015f);
                    var d = b - a;
                    if (d.sqrMagnitude < 0.0025f)
                    {
                        continue;
                    }

                    var ld = Vector3.Cross(Vector3.up, d.normalized) * 0.11f;
                    trazos.Cuadro(a - ld, b - ld, b + ld, a + ld, 1f, true);
                }
            }

            trazos.Poner(padre, "evidencias_marcas", Materiales.Calca(new Color(0.02f, 0.02f, 0.02f, 0.7f), 0.3f), false);
            vidrios.Poner(padre, "evidencias_vidrios", Materiales.Emisivo(new Color(0.75f, 0.85f, 0.88f), new Color(0.12f, 0.15f, 0.16f)), false);
            restos.Poner(padre, "evidencias_restos", Materiales.Liso(new Color(0.09f, 0.09f, 0.1f), 0.45f));
        }

        // ---- Marcadores de C1 -------------------------------------------------------------------------

        private static GameObject Marcadores(Transform padre, MarcadorEscenario[] marcadores, Terreno terreno)
        {
            var raiz = new GameObject("marcadores");
            raiz.transform.SetParent(padre, false);
            if (marcadores == null)
            {
                return raiz;
            }

            var mallas = new Dictionary<TipoMarcador, Malla>();
            foreach (var mk in marcadores)
            {
                if (!mallas.TryGetValue(mk.Tipo, out var m))
                {
                    mallas[mk.Tipo] = m = new Malla();
                }

                var c = terreno.P(mk.X, mk.Y, 0.03f);
                // Un anillo en el piso y un alfiler con su rombo: se ve desde arriba y desde la calle.
                var radio = mk.Tipo == TipoMarcador.PrimerGolpe ? 0.55f : 0.4f;
                const int Lados = 28;
                for (var k = 0; k < Lados; k++)
                {
                    var a0 = 2f * Mathf.PI * k / Lados;
                    var a1 = 2f * Mathf.PI * (k + 1) / Lados;
                    Vector3 R(float a, float r) => c + new Vector3(Mathf.Cos(a) * r, 0f, Mathf.Sin(a) * r);
                    m.Cuadro(R(a0, radio * 0.78f), R(a0, radio), R(a1, radio), R(a1, radio * 0.78f), 1f, true);
                }

                m.Prisma(c, 0.015f, 1.9f, 6);
                var punta = c + Vector3.up * 2.1f;
                m.Prisma(punta - Vector3.up * 0.2f, 0.001f, 0.2f, 4, 0.16f);
                m.Prisma(punta, 0.16f, 0.2f, 4, 0.001f);
            }

            foreach (var par in mallas)
            {
                Color color;
                switch (par.Key)
                {
                    case TipoMarcador.PrimerGolpe:
                        color = new Color(0.95f, 0.25f, 0.12f);
                        break;
                    case TipoMarcador.ChoqueIntermedio:
                        color = new Color(0.98f, 0.6f, 0.1f);
                        break;
                    default:
                        color = new Color(0.15f, 0.55f, 0.95f);
                        break;
                }

                par.Value.Poner(raiz.transform, "marcadores_" + par.Key.ToString().ToLowerInvariant(), Materiales.Emisivo(color, color * 1.4f), false, false);
            }

            return raiz;
        }
    }

    /// <summary>
    /// Lo que cambia con el tiempo y no es movimiento de vehículos: las luces de los semáforos, las
    /// huellas que van apareciendo y las manchas que crecen. No decide nada: los instantes vienen
    /// resueltos en el paquete.
    /// </summary>
    public sealed class EscenaDinamica : MonoBehaviour
    {
        public struct Semaforo
        {
            public LuzSemaforo[] Luces;
            public bool Intermitente;
            /// <summary>Rojo, amarillo y verde (el amarillo falta en los peatonales).</summary>
            public MeshRenderer[] Focos;
        }

        public struct Huella
        {
            public Mesh Malla;
            public double[] Tiempos;
            public int IndicesPorCuadro;
            public int[] Todos;
        }

        public struct Mancha
        {
            public Transform Objeto;
            public double T0;
            public float Radio;
        }

        public readonly List<Semaforo> Semaforos = new List<Semaforo>();
        public readonly List<Huella> Huellas = new List<Huella>();
        public readonly List<Mancha> Manchas = new List<Mancha>();

        public GameObject Marcadores { get; set; }

        private static readonly Color[] Colores =
        {
            new Color(1f, 0.12f, 0.08f), new Color(1f, 0.72f, 0.1f), new Color(0.15f, 1f, 0.35f),
        };

        public static Material Apagada(ColorLuz c)
        {
            var i = c == ColorLuz.Rojo ? 0 : c == ColorLuz.Amarillo ? 1 : 2;
            return Materiales.Liso(Colores[i] * 0.12f, 0.6f);
        }

        private static Material Encendida(int i)
        {
            return Materiales.Emisivo(Colores[i], Colores[i] * 6f);
        }

        public void Actualizar(double t)
        {
            foreach (var s in Semaforos)
            {
                var luz = ColorLuz.Apagado;
                if (s.Intermitente)
                {
                    // 55 destellos por minuto, como en el visor web.
                    var ciclos = t * 55.0 / 60.0;
                    luz = ciclos - Math.Floor(ciclos) < 0.5 ? ColorLuz.Amarillo : ColorLuz.Apagado;
                }
                else if (s.Luces != null)
                {
                    foreach (var l in s.Luces)
                    {
                        if (l.T <= t + 1e-6)
                        {
                            luz = l.Luz;
                        }
                    }

                    if (s.Luces.Length > 0 && t < s.Luces[0].T)
                    {
                        luz = s.Luces[0].Luz;
                    }
                }

                var encendida = luz == ColorLuz.Rojo ? 0 : luz == ColorLuz.Amarillo ? 1 : luz == ColorLuz.Verde ? 2 : -1;
                for (var i = 0; i < 3; i++)
                {
                    if (s.Focos[i] != null)
                    {
                        s.Focos[i].sharedMaterial = i == encendida
                            ? Encendida(i)
                            : Apagada(i == 0 ? ColorLuz.Rojo : i == 1 ? ColorLuz.Amarillo : ColorLuz.Verde);
                    }
                }
            }

            for (var k = 0; k < Huellas.Count; k++)
            {
                var h = Huellas[k];
                if (h.Todos == null)
                {
                    h.Todos = h.Malla.triangles;
                    Huellas[k] = h;
                }

                var visibles = 0;
                while (visibles < h.Tiempos.Length && h.Tiempos[visibles] <= t)
                {
                    visibles++;
                }

                h.Malla.SetSubMesh(0, new SubMeshDescriptor(0, visibles * h.IndicesPorCuadro), MeshUpdateFlags.DontRecalculateBounds);
            }

            foreach (var m in Manchas)
            {
                // Crece en unos segundos desde que empieza a derramarse.
                var k = Mathf.Clamp01((float)(t - m.T0) / 4f);
                var r = m.Radio * Mathf.Sqrt(k);
                m.Objeto.gameObject.SetActive(r > 0.01f);
                m.Objeto.localScale = new Vector3(r, 1f, r);
            }
        }
    }
}
