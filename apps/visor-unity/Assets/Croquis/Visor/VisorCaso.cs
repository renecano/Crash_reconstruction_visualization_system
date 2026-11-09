using System.Collections.Generic;
using Croquis.Core;
using Croquis.Generated;
using UnityEngine;
using Ejes = Croquis.Core.Ejes;

namespace Croquis.Visor
{
    /// <summary>El caso abierto: sus vehículos y la línea de tiempo. Solo reproduce el Resultado.</summary>
    [RequireComponent(typeof(CamaraVisor))]
    public sealed class VisorCaso : MonoBehaviour
    {
        private readonly List<VehiculoVista> vehiculos = new List<VehiculoVista>();
        private readonly CargadorModelos modelos = new CargadorModelos();
        private Transform raiz;
        private GameObject piso;
        private Light sol;
        private double inicio;
        private double fin;

        public double Tiempo { get; private set; }
        public bool Reproduciendo { get; set; }
        public float Velocidad { get; set; } = 1f;
        public CamaraVisor Camara { get; private set; }

        private void Awake()
        {
            Camara = GetComponent<CamaraVisor>();
            piso = GameObject.Find("Piso");
            sol = FindFirstObjectByType<Light>();
        }

        public async Awaitable CargarAsync(Caso3D caso)
        {
            Reproduciendo = false;
            if (raiz != null)
            {
                Destroy(raiz.gameObject);
            }

            vehiculos.Clear();
            raiz = new GameObject("Caso").transform;
            var r = caso.Resultado;
            inicio = r.TInicio;
            fin = r.TFin;
            foreach (var v in r.Vehiculos)
            {
                var go = new GameObject("vehiculo_" + v.Id);
                go.transform.SetParent(raiz, false);
                var vista = go.AddComponent<VehiculoVista>();
                vista.Trayectoria = v.Trayectoria;
                await modelos.ArmarAsync(go.transform, v);
                vehiculos.Add(vista);
            }

            // Con escenario (ADR 0112) se dibuja lo que calculó TS y se esconde el piso liso de U1.
            if (caso.Escenario != null)
            {
                EscenarioVista.Construir(raiz, caso.Escenario, sol, Camera.main);
            }

            if (piso != null)
            {
                piso.SetActive(caso.Escenario == null);
            }

            Fijar(inicio);
            Camara.Abrir(r);
            Camara.Vehiculos = vehiculos;
            Camara.Caso = this;
        }

        public void Fijar(double t)
        {
            Tiempo = System.Math.Max(inicio, System.Math.Min(fin, t));
            foreach (var v in vehiculos)
            {
                v.Colocar(Tiempo);
            }
        }

        private void Update()
        {
            if (!Reproduciendo)
            {
                return;
            }

            Fijar(Tiempo + Time.unscaledDeltaTime * Velocidad);
            if (Tiempo >= fin)
            {
                Reproduciendo = false;
            }
        }
    }

    /// <summary>Un vehículo en la escena: su Transform sigue la trayectoria y nada más.</summary>
    public sealed class VehiculoVista : MonoBehaviour
    {
        public VehiculoTrayectoria Trayectoria { get; set; }

        public void Colocar(double t)
        {
            var p = Ejes.AUnity(Muestreo.Pose(Trayectoria, t));
            transform.SetPositionAndRotation(
                new Vector3((float)p.Px, (float)p.Py, (float)p.Pz),
                Quaternion.Euler((float)p.EulerX, (float)p.EulerY, (float)p.EulerZ));
        }
    }
}
