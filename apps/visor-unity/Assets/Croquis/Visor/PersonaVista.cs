using Croquis.Core;
using Croquis.Generated;
using UnityEngine;

namespace Croquis.Visor
{
    /// <summary>
    /// Una persona del Resultado (U3): un maniquí neutro, sin rasgos ni nada gráfico (CLAUDE.md, regla
    /// 5), a la estatura del Resultado. Los peatones, ciclistas y motociclistas siguen su trayectoria
    /// con la postura de su fase; los ocupantes van sentados en su asiento y se desplazan lo que dio
    /// el solver. Unity no calcula nada de esto.
    /// </summary>
    public sealed class PersonaVista : MonoBehaviour
    {
        /// <summary>La ropa del maniquí y la de la variante sin cinturón, cuando no se declaró.</summary>
        public static readonly Color Ropa = new Color(0.33f, 0.4f, 0.52f);
        public static readonly Color RopaSinCinturon = new Color(0.8f, 0.56f, 0.24f);
        private static readonly Color Piel = new Color(0.7f, 0.6f, 0.52f);
        private static readonly Color Pantalon = new Color(0.22f, 0.25f, 0.3f);

        /// <summary>Altura de la cadera sobre el asiento del vehículo (m), para los ocupantes.</summary>
        private const float CaderaEnAsiento = 0.52f;

        private ResultadoPersona persona;
        private VarianteElement variante;
        private (double X, double Y) asiento;
        private Terreno terreno;
        private Transform cuerpo;
        private Transform piernaIzq;
        private Transform piernaDer;
        private float estatura;

        /// <summary>Peatón, ciclista o motociclista: va por su trayectoria.</summary>
        public static PersonaVista ConTrayectoria(Transform padre, ResultadoPersona p, Terreno terreno)
        {
            var go = new GameObject("persona_" + p.Id);
            go.transform.SetParent(padre, false);
            var vista = go.AddComponent<PersonaVista>();
            vista.persona = p;
            vista.terreno = terreno;
            vista.Armar((float)p.EstaturaM, Ropa);
            return vista;
        }

        /// <summary>Un ocupante: hijo de su vehículo, sentado, con una variante de su desplazamiento.</summary>
        public static PersonaVista Ocupante(
            Transform vehiculo, ResultadoPersona p, ResultadoVehiculo v, VarianteElement variante, Color ropa)
        {
            var go = new GameObject("ocupante_" + p.Id + (variante.Cinturon ? "_con_cinturon" : "_sin_cinturon"));
            go.transform.SetParent(vehiculo, false);
            go.layer = vehiculo.gameObject.layer;
            var vista = go.AddComponent<PersonaVista>();
            vista.persona = p;
            vista.variante = variante;
            vista.asiento = Personas.Asiento(p.Ocupante.Asiento, v.Dimensiones.LargoM, v.Dimensiones.AnchoM);
            vista.Armar((float)p.EstaturaM, ropa);
            vista.Sentar();
            foreach (var t in go.GetComponentsInChildren<Transform>(true))
            {
                t.gameObject.layer = go.layer;
            }

            return vista;
        }

        /// <summary>
        /// El maniquí con su origen en el centro de masa (al 55 % de la estatura): así la `z` del
        /// Resultado lo pone a la altura correcta de pie, en el aire o tendido.
        /// </summary>
        private void Armar(float h, Color ropa)
        {
            estatura = Mathf.Max(0.5f, h);
            h = estatura;
            var cg = 0.55f * h;
            cuerpo = new GameObject("cuerpo").transform;
            cuerpo.SetParent(transform, false);

            var tronco = new Malla();
            tronco.Prisma(new Vector3(0f, 0.5f * h - cg, 0f), 0.105f * h, 0.33f * h, 10, 0.12f * h);
            tronco.Prisma(new Vector3(-0.155f * h, 0.49f * h - cg, 0f), 0.034f * h, 0.33f * h, 8);
            tronco.Prisma(new Vector3(0.155f * h, 0.49f * h - cg, 0f), 0.034f * h, 0.33f * h, 8);
            tronco.Prisma(new Vector3(0f, 0.83f * h - cg, 0f), 0.03f * h, 0.03f * h, 8);
            tronco.Poner(cuerpo, "tronco", Materiales.Liso(ropa, 0.25f));

            var cabeza = new Malla();
            cabeza.Prisma(new Vector3(0f, 0.86f * h - cg, 0f), 0.06f * h, 0.13f * h, 14, 0.055f * h);
            cabeza.Poner(cuerpo, "cabeza", Materiales.Liso(Piel, 0.3f));

            piernaIzq = Pierna(cuerpo, h, cg, -1f);
            piernaDer = Pierna(cuerpo, h, cg, 1f);
        }

        /// <summary>Una pierna con su pivote en la cadera, para caminar o sentarse.</summary>
        private static Transform Pierna(Transform cuerpo, float h, float cg, float lado)
        {
            var cadera = new GameObject(lado < 0f ? "pierna_izquierda" : "pierna_derecha").transform;
            cadera.SetParent(cuerpo, false);
            cadera.localPosition = new Vector3(lado * 0.055f * h, 0.5f * h - cg, 0f);
            var m = new Malla();
            m.Prisma(new Vector3(0f, -0.5f * h, 0f), 0.045f * h, 0.5f * h, 8, 0.055f * h);
            m.Poner(cadera, "pierna", Materiales.Liso(Pantalon, 0.2f));
            return cadera;
        }

        /// <summary>Sentado: las piernas hacia adelante, horizontales.</summary>
        private void Sentar()
        {
            piernaIzq.localRotation = Quaternion.Euler(-90f, 0f, 0f);
            piernaDer.localRotation = Quaternion.Euler(-90f, 0f, 0f);
        }

        public void Colocar(double t)
        {
            if (variante != null)
            {
                ColocarOcupante(t);
                return;
            }

            var p = Personas.Pose(persona, t);
            var x = (float)p.X;
            var y = (float)p.Y;
            var suelo = terreno != null && !terreno.Plano ? terreno.Z(x, y) : 0f;
            transform.SetPositionAndRotation(
                new Vector3(x, suelo + (float)p.Z, y),
                Quaternion.Euler(0f, 90f - (float)(p.Rumbo * Mathf.Rad2Deg), 0f));
            cuerpo.localRotation = Quaternion.Euler((float)(p.Inclinacion * Mathf.Rad2Deg), 0f, 0f);
            switch (p.Postura)
            {
                case Postura.Sentado:
                    Sentar();
                    break;
                case Postura.Caminando:
                    // El paso, solo para que se lea que camina: 1.8 pasos por segundo.
                    var a = 22f * Mathf.Sin((float)t * 2f * Mathf.PI * 0.9f);
                    piernaIzq.localRotation = Quaternion.Euler(a, 0f, 0f);
                    piernaDer.localRotation = Quaternion.Euler(-a, 0f, 0f);
                    break;
                default:
                    piernaIzq.localRotation = Quaternion.identity;
                    piernaDer.localRotation = Quaternion.identity;
                    break;
            }
        }

        /// <summary>
        /// En el marco del vehículo de Unity: +Z adelante, +X a la derecha (la `y` de Croquis va a la
        /// izquierda). La cadera sobre el asiento y el desplazamiento del solver desde el impacto.
        /// </summary>
        private void ColocarOcupante(double t)
        {
            var d = Personas.Desplazamiento(variante, t);
            var cadera = CaderaEnAsiento + 0.05f * estatura;
            transform.localPosition = new Vector3(
                -(float)(asiento.Y + d.Dy),
                cadera,
                (float)(asiento.X + d.Dx));
            transform.localRotation = Quaternion.identity;
        }
    }
}
