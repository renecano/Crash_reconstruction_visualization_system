using Croquis.Core;
using Croquis.Generated;
using Croquis.Visor;
using NUnit.Framework;
using UnityEngine;

namespace Croquis.Tests
{
    /// <summary>D2 dentro de Unity: lo que queda en el Transform, no solo lo que calcula el núcleo.</summary>
    public class PoseEnUnityTests
    {
        private const float UnCentimetro = 0.01f;
        private const float UnDecimoDeGrado = 0.1f;

        private static VehiculoVista Vista(VehiculoTrayectoria tr)
        {
            var v = new GameObject("vehiculo").AddComponent<VehiculoVista>();
            v.Trayectoria = tr;
            return v;
        }

        private static VehiculoTrayectoria Unica(double x, double y, double rumbo, double z, double cabeceo, double alabeo)
        {
            return new VehiculoTrayectoria
            {
                T = new[] { 0.0, 1.0 },
                X = new[] { x, x },
                Y = new[] { y, y },
                Rumbo = new[] { rumbo, rumbo },
                Z = new[] { z, z },
                Cabeceo = new[] { cabeceo, cabeceo },
                Alabeo = new[] { alabeo, alabeo },
            };
        }

        [Test]
        public void ElTransformQuedaEnLaPosicionDelResultado()
        {
            var v = Vista(Unica(120.5, -33.25, 0.4, 1.75, 0, 0));
            v.Colocar(0.5);
            Assert.Less(Vector3.Distance(v.transform.position, new Vector3(120.5f, 1.75f, -33.25f)), UnCentimetro);
            Object.DestroyImmediate(v.gameObject);
        }

        [Test]
        public void ElFrenteMiraSegunElRumbo()
        {
            foreach (var grados in new[] { 0.0, 37.0, 90.0, 180.0, -120.0 })
            {
                var r = grados * Mathf.Deg2Rad;
                var v = Vista(Unica(0, 0, r, 0, 0, 0));
                v.Colocar(0);
                var esperado = new Vector3(Mathf.Cos((float)r), 0f, Mathf.Sin((float)r));
                Assert.Less(Vector3.Angle(v.transform.forward, esperado), UnDecimoDeGrado, "rumbo " + grados);
                Object.DestroyImmediate(v.gameObject);
            }
        }

        [Test]
        public void ElCabeceoPositivoSubeLaNarizYElAlabeoBajaLaDerecha()
        {
            var cabeceo = 0.2;
            var v = Vista(Unica(0, 0, 0.7, 0, cabeceo, 0));
            v.Colocar(0);
            Assert.AreEqual(Mathf.Sin((float)cabeceo), v.transform.forward.y, 1e-3f);
            Object.DestroyImmediate(v.gameObject);

            var alabeo = 0.2;
            v = Vista(Unica(0, 0, 0.7, 0, 0, alabeo));
            v.Colocar(0);
            Assert.AreEqual(-Mathf.Sin((float)alabeo), v.transform.right.y, 1e-3f);
            Object.DestroyImmediate(v.gameObject);
        }
    }
}
