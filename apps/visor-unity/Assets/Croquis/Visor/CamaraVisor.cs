using Croquis.Core;
using Croquis.Generated;
using UnityEngine;

namespace Croquis.Visor
{
    /// <summary>
    /// Las cámaras de U1: cenital y órbita, las que hacen falta para ver la reproducción y medirla. Las
    /// demás y el encuadre fino llegan en U4.
    /// </summary>
    public sealed class CamaraVisor : MonoBehaviour
    {
        [SerializeField]
        private Camera camara;

        private ZonaInteres zona = new ZonaInteres(0, 0, 20);
        private string modo = "orbita";
        private float angulo = -120f;

        public bool Cambiar(string nuevo)
        {
            if (nuevo != "cenital" && nuevo != "orbita")
            {
                return false;
            }

            modo = nuevo;
            return true;
        }

        public void Abrir(Caso3DResultado r)
        {
            zona = Encuadre.ZonaDeInteres(r);
        }

        public void Encuadrar(string _)
        {
            angulo = -120f;
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
                camara.transform.SetPositionAndRotation(
                    centro + Vector3.up * lado * 1.5f,
                    Quaternion.Euler(90f, 0f, 0f));
                return;
            }

            angulo += Time.unscaledDeltaTime * 3f;
            var a = angulo * Mathf.Deg2Rad;
            var d = Mathf.Max(12f, lado * 0.9f);
            camara.transform.position = centro + new Vector3(Mathf.Cos(a) * d, d * 0.45f, Mathf.Sin(a) * d);
            camara.transform.LookAt(centro + Vector3.up * 0.8f);
        }
    }
}
