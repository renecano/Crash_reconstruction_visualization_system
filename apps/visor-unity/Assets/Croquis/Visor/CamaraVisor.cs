using System.Collections.Generic;
using Croquis.Core;
using Croquis.Generated;
using UnityEngine;

namespace Croquis.Visor
{
    /// <summary>
    /// Las cámaras de U1 y U2: cenital, órbita y una del conductor sencilla, las que hacen falta para
    /// ver la reproducción y revisar el escenario. La cinematográfica, la libre y el encuadre fino
    /// llegan en U4. La órbita solo gira mientras se reproduce: así una pausa da siempre la misma
    /// imagen.
    /// </summary>
    public sealed class CamaraVisor : MonoBehaviour
    {
        private const float AnguloInicial = -120f;
        private const float AlturaOjos = 1.25f;

        [SerializeField]
        private Camera camara;

        private ZonaInteres zona = new ZonaInteres(0, 0, 20);
        private string modo = "orbita";
        private string conductor;
        private float angulo = AnguloInicial;

        public List<VehiculoVista> Vehiculos { get; set; } = new List<VehiculoVista>();
        public VisorCaso Caso { get; set; }

        public bool Cambiar(string nuevo)
        {
            if (nuevo == "cenital" || nuevo == "orbita" || nuevo == "calle")
            {
                modo = nuevo;
                return true;
            }

            if (nuevo != null && nuevo.StartsWith("conductor:"))
            {
                var id = nuevo.Substring("conductor:".Length);
                if (Vehiculos.Exists(v => v.name == "vehiculo_" + id))
                {
                    modo = "conductor";
                    conductor = id;
                    return true;
                }
            }

            return false;
        }

        public void Abrir(Caso3DResultado r)
        {
            zona = Encuadre.ZonaDeInteres(r);
            angulo = AnguloInicial;
        }

        public void Encuadrar(string _)
        {
            angulo = AnguloInicial;
        }

        public void Asignar(Camera c)
        {
            camara = c;
        }

        private void LateUpdate()
        {
            if (camara == null)
            {
                return;
            }

            var centro = new Vector3((float)zona.CentroX, 0f, (float)zona.CentroY);
            var lado = (float)zona.Lado;
            if (modo == "cenital")
            {
                camara.fieldOfView = 40f;
                camara.transform.SetPositionAndRotation(
                    centro + Vector3.up * lado * 1.5f,
                    Quaternion.Euler(90f, 0f, 0f));
                return;
            }

            if (modo == "conductor")
            {
                var v = Vehiculos.Find(x => x.name == "vehiculo_" + conductor);
                if (v != null)
                {
                    // El ojo va un poco adelante del centro, a la altura de una persona sentada.
                    camara.fieldOfView = 60f;
                    var t = v.transform;
                    camara.transform.SetPositionAndRotation(
                        t.position + t.up * AlturaOjos + t.forward * 0.4f,
                        Quaternion.LookRotation(t.forward, Vector3.up) * Quaternion.Euler(4f, 0f, 0f));
                    return;
                }
            }

            if (modo == "calle")
            {
                // A la altura de los ojos de alguien parado junto a la vía, mirando al impacto.
                camara.fieldOfView = 50f;
                var ac = AnguloInicial * Mathf.Deg2Rad;
                var dc = Mathf.Max(11f, lado * 0.55f);
                camara.transform.position = centro + new Vector3(Mathf.Cos(ac) * dc, 1.65f, Mathf.Sin(ac) * dc);
                camara.transform.LookAt(centro + Vector3.up * 1.0f);
                return;
            }

            if (Caso != null && Caso.Reproduciendo)
            {
                angulo += Time.unscaledDeltaTime * 3f;
            }

            camara.fieldOfView = 40f;
            var a = angulo * Mathf.Deg2Rad;
            var d = Mathf.Max(14f, lado * 0.9f);
            camara.transform.position = centro + new Vector3(Mathf.Cos(a) * d, d * 0.35f, Mathf.Sin(a) * d);
            camara.transform.LookAt(centro + Vector3.up * 0.8f);
        }
    }
}
