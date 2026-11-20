using System.Collections.Generic;
using Croquis.Core;
using Croquis.Generated;
using Croquis.Visor;
using NUnit.Framework;
using UnityEngine;

namespace Croquis.Tests
{
    /// <summary>
    /// El daño del solver dentro de Unity (auditoría del 2026-11-15, C2): la malla que queda en el
    /// MeshFilter, no solo lo que calcula el núcleo.
    /// </summary>
    public class DanoEnUnityTests
    {
        private const double Largo = 4.5;
        private const double Ancho = 1.7;
        private const double Alto = 1.5;

        /// <summary>Una rejilla en el frente (z = +largo/2) y otra atrás, en el marco del vehículo.</summary>
        private static Mesh Carroceria()
        {
            var v = new List<Vector3>();
            var t = new List<int>();
            const int N = 12;
            foreach (var z in new[] { (float)(Largo / 2.0), (float)(-Largo / 2.0) })
            {
                var b = v.Count;
                for (var i = 0; i <= N; i++)
                {
                    for (var j = 0; j <= N; j++)
                    {
                        v.Add(new Vector3((float)(-Ancho / 2.0 + Ancho * i / N), (float)(Alto * j / N), z));
                    }
                }

                for (var i = 0; i < N; i++)
                {
                    for (var j = 0; j < N; j++)
                    {
                        var a = b + i * (N + 1) + j;
                        t.AddRange(new[] { a, a + 1, a + N + 1, a + 1, a + N + 2, a + N + 1 });
                    }
                }
            }

            var malla = new Mesh { name = "carroceria" };
            malla.SetVertices(v);
            malla.SetTriangles(t, 0);
            malla.RecalculateNormals();
            return malla;
        }

        private static ResultadoVehiculo Vehiculo(double[] perfil)
        {
            return new ResultadoVehiculo
            {
                Id = "veh-a",
                Clase = "sedan_compacto",
                Dimensiones = new Dimensiones { LargoM = Largo, AnchoM = Ancho, AltoM = Alto, DistanciaEntreEjesM = 2.6 },
                Dano = perfil == null
                    ? null
                    : new Dano { PerfilM = perfil, AnchoM = 1.5, CentroM = 0.0, Cdc = new Cdc { Lado = Lado.F } },
                Trayectoria = new VehiculoTrayectoria
                {
                    T = new[] { -2.0, 2.0 },
                    X = new[] { 0.0, 0.0 },
                    Y = new[] { 0.0, 0.0 },
                    Rumbo = new[] { 0.0, 0.0 },
                    Z = new[] { 0.0, 0.0 },
                    Cabeceo = new[] { 0.0, 0.0 },
                    Alabeo = new[] { 0.0, 0.0 },
                },
            };
        }

        private static Caso3DResultado Resultado(double tImpacto)
        {
            return new Caso3DResultado
            {
                Semilla = 719300,
                Eventos = new[]
                {
                    new ResultadoEvento { Id = "ev-1", Tipo = StickyTipo.ImpactoVehiculoVehiculo, T = tImpacto, Actores = new[] { "veh-a", "veh-b" } },
                },
            };
        }

        private static VehiculoVista Armar(out MeshFilter pieza, out MeshFilter rueda)
        {
            var go = new GameObject("vehiculo_veh-a");
            var vista = go.AddComponent<VehiculoVista>();
            var cuerpo = new GameObject("carroceria");
            cuerpo.transform.SetParent(go.transform, false);
            pieza = cuerpo.AddComponent<MeshFilter>();
            pieza.sharedMesh = Carroceria();
            // Una rueda, en su propio nodo: no se deforma.
            var nodo = new GameObject("wheel_fl").transform;
            nodo.SetParent(go.transform, false);
            nodo.localPosition = new Vector3(0.8f, 0.3f, 1.3f);
            var llanta = new GameObject("llanta");
            llanta.transform.SetParent(nodo, false);
            rueda = llanta.AddComponent<MeshFilter>();
            rueda.sharedMesh = Carroceria();
            return vista;
        }

        [Test]
        public void ElDanoDelResultadoQuedaEnLaMallaDesdeElImpacto()
        {
            var perfil = new[] { 0.20, 0.35, 0.45, 0.45, 0.35, 0.20 };
            var v = Vehiculo(perfil);
            var vista = Armar(out var pieza, out var rueda);
            vista.Trayectoria = v.Trayectoria;
            vista.Datos = v;
            var original = pieza.sharedMesh;
            var deRueda = rueda.sharedMesh;
            vista.Dano = DanoVista.Preparar(vista.transform, v, Resultado(0.0));

            Assert.NotNull(vista.Dano, "el vehículo trae perfil del solver: debe llevar daño");
            Assert.AreEqual(1, vista.Dano.Piezas, "solo la carrocería cambia");
            Assert.AreEqual(0.0, vista.Dano.Desde, 1e-9);
            // Se hunde lo que dice el perfil del solver (las arrugas son de ±3 %).
            Assert.That(vista.Dano.DesplazamientoMaximo, Is.InRange(0.5 * 0.45, 1.05 * 0.45 + 0.01));

            // Antes del impacto, la malla del modelo.
            vista.Colocar(-1.0);
            Assert.AreSame(original, pieza.sharedMesh);

            // Desde el impacto, la deformada: el frente se fue hacia atrás y la parte de atrás no se movió.
            vista.Colocar(0.5);
            Assert.AreNotSame(original, pieza.sharedMesh);
            var antes = original.vertices;
            var despues = pieza.sharedMesh.vertices;
            Assert.AreEqual(antes.Length, despues.Length);
            var hundido = 0f;
            for (var i = 0; i < antes.Length; i++)
            {
                if (antes[i].z > 0f)
                {
                    hundido = Mathf.Max(hundido, antes[i].z - despues[i].z);
                }
                else
                {
                    Assert.AreEqual(antes[i].z, despues[i].z, 1e-6f, "la parte de atrás se movió");
                }
            }

            Assert.That(hundido, Is.InRange(0.5f * 0.45f, 1.05f * 0.45f + 0.01f));
            Assert.AreSame(deRueda, rueda.sharedMesh, "las ruedas no se deforman");

            // Al regresar el tiempo, vuelve la malla del modelo.
            vista.Colocar(-0.5);
            Assert.AreSame(original, pieza.sharedMesh);
            Object.DestroyImmediate(vista.gameObject);
        }

        [Test]
        public void EnElGolpeLaDeformacionCreceHastaLaDelSolver()
        {
            // Ronda 4, punto 5: el choque se ve; a la mitad del golpe va a medio camino, y al final es
            // exactamente la del solver.
            var v = Vehiculo(new[] { 0.45, 0.45, 0.45, 0.45, 0.45, 0.45 });
            var vista = Armar(out var pieza, out _);
            vista.Trayectoria = v.Trayectoria;
            var original = pieza.sharedMesh;
            vista.Dano = DanoVista.Preparar(vista.transform, v, Resultado(0.0));
            float Hundido()
            {
                var a = original.vertices;
                var b = pieza.sharedMesh.vertices;
                var h = 0f;
                for (var i = 0; i < a.Length; i++)
                {
                    h = Mathf.Max(h, a[i].z - b[i].z);
                }

                return h;
            }

            vista.Colocar(1.0);
            var final = Hundido();
            vista.Colocar(EnfasisImpacto.DuracionDanoS / 2);
            var medio = Hundido();
            Assert.That(medio, Is.GreaterThan(0.2f * final).And.LessThan(0.8f * final));
            vista.Colocar(1.0);
            Assert.AreEqual(final, Hundido(), 1e-6f);
            Object.DestroyImmediate(vista.gameObject);
        }

        [Test]
        public void EnUnaCarambolaElDanoEsperaAlImpactoDeEseVehiculo()
        {
            var v = Vehiculo(new[] { 0.1, 0.2, 0.3, 0.3, 0.2, 0.1 });
            var vista = Armar(out var pieza, out _);
            vista.Trayectoria = v.Trayectoria;
            var original = pieza.sharedMesh;
            vista.Dano = DanoVista.Preparar(vista.transform, v, Resultado(0.8));
            Assert.AreEqual(0.8, vista.Dano.Desde, 1e-9);
            vista.Colocar(0.5);
            Assert.AreSame(original, pieza.sharedMesh, "todavía no lo golpean");
            vista.Colocar(0.9);
            Assert.AreNotSame(original, pieza.sharedMesh);
            Object.DestroyImmediate(vista.gameObject);
        }

        [Test]
        public void SinPerfilDelSolverNoSeInventaDano()
        {
            var vista = Armar(out _, out _);
            Assert.IsNull(DanoVista.Preparar(vista.transform, Vehiculo(null), Resultado(0.0)));
            Assert.IsNull(DanoVista.Preparar(vista.transform, Vehiculo(new[] { 0.0, 0.0, 0.0, 0.0, 0.0, 0.0 }), Resultado(0.0)));
            Object.DestroyImmediate(vista.gameObject);
        }
    }
}
