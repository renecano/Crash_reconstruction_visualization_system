using System.Collections.Generic;
using Croquis.Core;
using Croquis.Generated;
using UnityEngine;
using Postura = Croquis.Core.Postura;

namespace Croquis.Visor
{
    /// <summary>
    /// Una persona del Resultado (U3), con el cuerpo de MakeHuman (CC0) del visor web: sin rasgos y con
    /// ropa neutra (CLAUDE.md, regla 5), a la estatura del Resultado. Los peatones, ciclistas y
    /// motociclistas siguen su trayectoria con la postura de su fase; los ocupantes van sentados en su
    /// asiento y se desplazan lo que dio el solver. Si el cuerpo no se puede bajar, un maniquí de
    /// piezas. Unity no calcula nada de esto.
    /// </summary>
    public sealed class PersonaVista : MonoBehaviour
    {
        /// <summary>El maniquí de respaldo y la segunda variante del ocupante (sin cinturón).</summary>
        public static readonly Color Ropa = new Color(0.33f, 0.4f, 0.52f);
        public static readonly Color RopaSinCinturon = new Color(0.8f, 0.56f, 0.24f);
        private static readonly Color Piel = new Color(0.7f, 0.6f, 0.52f);
        private static readonly Color Pantalon = new Color(0.22f, 0.25f, 0.3f);

        /// <summary>Altura de la cadera sobre el piso del vehículo (m), para los ocupantes.</summary>
        private const float CaderaEnAsiento = 0.52f;

        /// <summary>El centro de masa, como fracción de la estatura: ahí va el origen del cuerpo.</summary>
        private const float FraccionCg = 0.55f;

        private ResultadoPersona persona;
        private VarianteElement variante;
        private (double X, double Y) asiento;
        private Terreno terreno;
        private Transform cuerpo;
        private float estatura;

        // Del maniquí de respaldo.
        private Transform piernaIzq;
        private Transform piernaDer;

        // Del cuerpo de MakeHuman: cada hueso con su rotación de reposo y el eje «a la derecha» del cuerpo
        // en su marco, para doblarlo hacia adelante o hacia atrás.
        private readonly Dictionary<string, (Transform Hueso, Quaternion Reposo, Vector3 Eje)> huesos =
            new Dictionary<string, (Transform, Quaternion, Vector3)>();

        /// <summary>Peatón, ciclista o motociclista: va por su trayectoria.</summary>
        public static async Awaitable<PersonaVista> ConTrayectoriaAsync(
            Transform padre, ResultadoPersona p, Terreno terreno, CargadorCuerpos cuerpos)
        {
            var go = new GameObject("persona_" + p.Id);
            go.transform.SetParent(padre, false);
            var vista = go.AddComponent<PersonaVista>();
            vista.persona = p;
            vista.terreno = terreno;
            await vista.ArmarAsync(cuerpos, p.Id, Ropa);
            return vista;
        }

        /// <summary>Un ocupante: hijo de su vehículo, sentado, con una variante de su desplazamiento.</summary>
        public static async Awaitable<PersonaVista> OcupanteAsync(
            Transform vehiculo, ResultadoPersona p, ResultadoVehiculo v, VarianteElement variante, bool segunda,
            CargadorCuerpos cuerpos)
        {
            var go = new GameObject("ocupante_" + p.Id + (variante.Cinturon ? "_con_cinturon" : "_sin_cinturon"));
            go.transform.SetParent(vehiculo, false);
            var vista = go.AddComponent<PersonaVista>();
            vista.persona = p;
            vista.variante = variante;
            vista.asiento = Personas.Asiento(p.Ocupante.Asiento, v.Dimensiones.LargoM, v.Dimensiones.AnchoM);
            // La segunda variante (sin cinturón, cuando no se declaró) es el maniquí de otro color: así se
            // distinguen las dos sin inventar ropa.
            if (segunda)
            {
                vista.ArmarManiqui((float)p.EstaturaM, RopaSinCinturon);
            }
            else
            {
                await vista.ArmarAsync(cuerpos, p.Id, Ropa);
            }

            vista.Posar(Postura.Sentado, 0.0);
            foreach (var t in go.GetComponentsInChildren<Transform>(true))
            {
                t.gameObject.layer = vehiculo.gameObject.layer;
            }

            return vista;
        }

        private async Awaitable ArmarAsync(CargadorCuerpos cuerpos, string id, Color respaldo)
        {
            estatura = Mathf.Max(0.5f, (float)persona.EstaturaM);
            cuerpo = new GameObject("cuerpo").transform;
            cuerpo.SetParent(transform, false);
            var modelo = cuerpos == null ? null : await cuerpos.CrearAsync(cuerpo, Cuerpos.Variante(estatura), id);
            if (modelo == null)
            {
                Destroy(cuerpo.gameObject);
                ArmarManiqui(estatura, respaldo);
                return;
            }

            // Pies en y = 0 y 1 m de alto: a la estatura y con el centro de masa en el origen.
            modelo.transform.localScale = Vector3.one * estatura;
            modelo.transform.localPosition = new Vector3(0f, -FraccionCg * estatura, 0f);
            var derecha = cuerpo.rotation * Vector3.right;
            foreach (var t in modelo.GetComponentsInChildren<Transform>(true))
            {
                huesos[t.name] = (t, t.localRotation, Quaternion.Inverse(t.rotation) * derecha);
            }
        }

        /// <summary>
        /// El maniquí de respaldo, con su origen en el centro de masa: así la `z` del Resultado lo pone a
        /// la altura correcta de pie, en el aire o tendido.
        /// </summary>
        private void ArmarManiqui(float h, Color ropa)
        {
            estatura = Mathf.Max(0.5f, h);
            h = estatura;
            var cg = FraccionCg * h;
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

        /// <summary>Una pierna del maniquí con su pivote en la cadera.</summary>
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

        /// <summary>
        /// Dobla un hueso alrededor del eje «a la derecha» del cuerpo: negativo, hacia adelante (el
        /// muslo de quien se sienta); positivo, hacia atrás (la rodilla).
        /// </summary>
        private void Doblar(string hueso, float grados)
        {
            if (huesos.TryGetValue(hueso, out var h))
            {
                h.Hueso.localRotation = h.Reposo * Quaternion.AngleAxis(grados, h.Eje);
            }
        }

        private void Posar(Postura postura, double t)
        {
            var paso = postura == Postura.Caminando ? 22f * Mathf.Sin((float)t * 2f * Mathf.PI * 0.9f) : 0f;
            var sentado = postura == Postura.Sentado;
            if (huesos.Count > 0)
            {
                Doblar("muslo_i", sentado ? -85f : paso);
                Doblar("muslo_d", sentado ? -85f : -paso);
                Doblar("pierna_i", sentado ? 85f : Mathf.Max(0f, -paso) * 0.8f);
                Doblar("pierna_d", sentado ? 85f : Mathf.Max(0f, paso) * 0.8f);
                // Los brazos hacia el manubrio o el volante al ir sentado; al caminar, contrarios a las piernas.
                Doblar("brazo_i", sentado ? -40f : -paso * 0.7f);
                Doblar("brazo_d", sentado ? -40f : paso * 0.7f);
                Doblar("antebrazo_i", sentado ? -30f : 0f);
                Doblar("antebrazo_d", sentado ? -30f : 0f);
                return;
            }

            if (piernaIzq == null)
            {
                return;
            }

            piernaIzq.localRotation = Quaternion.Euler(sentado ? -90f : paso, 0f, 0f);
            piernaDer.localRotation = Quaternion.Euler(sentado ? -90f : -paso, 0f, 0f);
        }

        public void Colocar(double t)
        {
            if (cuerpo == null)
            {
                return;
            }

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
            Posar(p.Postura, t);
        }

        /// <summary>
        /// En el marco del vehículo de Unity: +Z adelante, +X a la derecha (la `y` de Croquis va a la
        /// izquierda). La cadera sobre el asiento y el desplazamiento del solver desde el impacto.
        /// </summary>
        private void ColocarOcupante(double t)
        {
            var d = Personas.Desplazamiento(variante, t);
            var cadera = CaderaEnAsiento + (FraccionCg - 0.5f) * estatura;
            transform.localPosition = new Vector3(-(float)(asiento.Y + d.Dy), cadera, (float)(asiento.X + d.Dx));
            transform.localRotation = Quaternion.identity;
        }
    }
}
