using System.Collections.Generic;
using Croquis.Core;
using Croquis.Generated;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace Croquis.Visor
{
    /// <summary>
    /// Las cámaras del visor (U4): cenital, órbita, cinematográfica, acera, la de cada conductor (a la
    /// altura del ojo que usó `visibilidad`) y la libre. La cenital, la órbita y la libre se mueven con
    /// el ratón y con los dedos; «Ver todo» e «Ir al impacto» encuadran lo que importa (`Encuadre` del
    /// núcleo). Un minimapa en la esquina enseña la escena desde arriba y dónde está la cámara. Las
    /// automáticas no dependen del reloj de la máquina: su pose sale del instante del caso.
    /// </summary>
    public sealed class CamaraVisor : MonoBehaviour
    {
        private const float AnguloInicial = -120f;

        /// <summary>El ojo de un conductor de auto (AASHTO), si el Resultado no trae `visibilidad`.</summary>
        private const float AlturaOjosPorOmision = 1.08f;

        /// <summary>La capa del marcador de la cámara: solo la ve el minimapa.</summary>
        public const int CapaMinimapa = 31;

        /// <summary>
        /// Las copas de los árboles del caso (el árbol del choque): «Desde arriba» no las dibuja para que no
        /// tapen los vehículos (prueba como perito, 2026-11-27); el tronco sí se ve.
        /// </summary>
        public const int CapaCopasDelCaso = 30;

        /// <summary>La elevación de la órbita (grados): alta, para ver la calle por encima de las azoteas.</summary>
        private const float ElevacionOrbita = 50f;

        /// <summary>Qué parte de la pantalla llena lo que se encuadra en la cinematográfica.</summary>
        private const float LlenadoCinematica = 0.62f;

        [SerializeField]
        private Camera camara;

        private ZonaInteres zona = new ZonaInteres(0, 0, 20);
        private CajaPlano todo = new CajaPlano();
        private Caso3DResultado resultado;
        private string modo = "cinematica";
        private string conductor;
        private string persona;

        // La cámara «cerca» (capturas y modo foto): junto a un vehículo, a un azimut desde su frente, a una
        // distancia y una altura, mirando su cabina. `cerca:<id>:<azimut°>:<distancia m>:<altura m>`.
        private string cercaDe;
        private float cercaAzimut;
        private float cercaDistancia = 3.5f;
        private float cercaAltura = 1.6f;
        private double inicio;

        // Lo que se encuadra («Ver todo» o «Ir al impacto»): centro y lado, en metros de Croquis.
        private Vector3 marcoCentro;
        private float marcoLado = 20f;

        // La órbita: alrededor de `objetivo`, con rumbo y elevación en grados.
        private Vector3 objetivo;
        private float yaw = AnguloInicial;
        private float pitch = ElevacionOrbita;
        private float distOrbita = 30f;
        private bool orbitaTocada;

        /// <summary>Si el perito movió o acercó «Desde arriba» (o pidió un encuadre): entonces ya no sigue sola.</summary>
        private bool cenitalTocada;

        /// <summary>Los vehículos de la hipótesis («¿Y si…?», translúcidos): las tomas también los encuadran.</summary>
        public List<VehiculoVista> Fantasmas { get; } = new List<VehiculoVista>();

        // La libre: posición y hacia dónde mira.
        private Vector3 posLibre;
        private float yawLibre;
        private float pitchLibre;

        // La cenital: centro y altura.
        private Vector3 centroCenital;
        private float altoCenital = 40f;

        private Camera minimapa;

        /// <summary>
        /// Lo que se mueve o cambia con el tiempo y no es un vehículo (peatones, evidencias, semáforos,
        /// marcadores, lluvia): el minimapa lo dibuja en cada cuadro sobre su fondo horneado.
        /// </summary>
        public const int CapaDinamica = 2;

        private const int LadoFondo = 512;
        private const float AlturaHorneado = 120f;
        private const float AlturaMinimapa = 60f;
        private const int CapasDelMinimapa = (1 << EscenarioVista.CapaVehiculos) | (1 << CapaDinamica) | (1 << CapaMinimapa);

        /// <summary>
        /// Los vehículos como los dibuja el minimapa de baja y media: una malla por vehículo
        /// (`VehiculoEnMinimapa`), en la capa del minimapa. Con ellos, el minimapa no dibuja las piezas.
        /// </summary>
        public List<GameObject> VehiculosDelMinimapa { get; } = new List<GameObject>();

        private bool vehiculosUnidos = true;

        /// <summary>Para medir (U5): con false, el minimapa vuelve a dibujar los vehículos pieza por pieza.</summary>
        public bool VehiculosUnidos
        {
            get => vehiculosUnidos;
            set
            {
                vehiculosUnidos = value;
                foreach (var v in VehiculosDelMinimapa)
                {
                    if (v != null)
                    {
                        v.SetActive(value);
                    }
                }

                if (minimapa != null && fondo != null && fondo.activeSelf)
                {
                    minimapa.cullingMask = CapasPorCuadro;
                }
            }
        }

        /// <summary>Lo que el minimapa dibuja en cada cuadro sobre su fondo horneado.</summary>
        private int CapasPorCuadro =>
            vehiculosUnidos && VehiculosDelMinimapa.Count > 0 ? CapasDelMinimapa & ~(1 << EscenarioVista.CapaVehiculos) : CapasDelMinimapa;

        private RenderTexture fondoMinimapa;
        private GameObject fondo;
        private int hornear;
        private bool horneando;

        /// <summary>El minimapa se puede apagar para medir lo que cuesta (U5).</summary>
        public bool MinimapaVisible { get; set; } = true;
        private Transform marcador;
        private Vector3 ultimoRaton;
        private float ultimaSeparacion;

        public List<VehiculoVista> Vehiculos { get; set; } = new List<VehiculoVista>();

        /// <summary>Los ocupantes: en la cámara de un conductor se esconden los de su vehículo (el ojo va
        /// donde está su cabeza).</summary>
        public List<PersonaVista> Ocupantes { get; } = new List<PersonaVista>();

        /// <summary>Quienes van por su cuenta (peatón, ciclista sin vehículo del caso): la cámara
        /// «persona» los sigue (René, 2026-11-16).</summary>
        public List<PersonaVista> Peatones { get; } = new List<PersonaVista>();
        public VisorCaso Caso { get; set; }

        /// <summary>El árbol más cercano a la acción: la cámara de la acera se para junto a él.</summary>
        public Vector3? Arbol { get; set; }

        /// <summary>Postes y luminarias, en planta (x, y): la cámara de la acera no se para detrás de uno.</summary>
        public List<Vector2> Estorbos { get; } = new List<Vector2>();

        /// <summary>La distancia en planta del estorbo más cercano al tramo que va del ojo a 14 m hacia la mira.</summary>
        private float Despeje(Vector3 ojo, Vector3 mira, float largo = 14f)
        {
            var a = new Vector2(ojo.x, ojo.z);
            var dir = new Vector2(mira.x - ojo.x, mira.z - ojo.z).normalized;
            var menor = float.MaxValue;
            foreach (var e in Estorbos)
            {
                var u = Mathf.Clamp(Vector2.Dot(e - a, dir), 0f, largo);
                menor = Mathf.Min(menor, (e - (a + dir * u)).magnitude);
            }

            return menor;
        }

        /// <summary>Un edificio o una barda en planta: centro, eje a lo largo, medias medidas y alto.</summary>
        public struct Bulto
        {
            public Vector2 C;
            public Vector2 U;
            public float Hw;
            public float Hd;
            public float Alto;
        }

        /// <summary>Lo construido: ninguna cámara se mete en ello ni mira a través.</summary>
        public List<Bulto> Bultos { get; } = new List<Bulto>();

        /// <summary>Las copas de los árboles en planta (x, y, radio): la cinematográfica no mira a través.</summary>
        public List<Vector3> Copas { get; } = new List<Vector3>();

        private float azBase = float.NaN;
        private float giroMax = 8f;
        private float distK = 1f;
        private float altoExtra;

        private bool EnBulto(Vector3 p, float holgura)
        {
            foreach (var b in Bultos)
            {
                if (p.y > b.Alto + 0.3f)
                {
                    continue;
                }

                var dd = new Vector2(p.x, p.z) - b.C;
                var u = Vector2.Dot(dd, b.U);
                var v = -dd.x * b.U.y + dd.y * b.U.x;
                if (Mathf.Abs(u) < b.Hw + holgura && Mathf.Abs(v) < b.Hd + holgura)
                {
                    return true;
                }
            }

            return false;
        }

        /// <summary>El desvío de rumbo (grados) con que la cinematográfica encontró vista libre.</summary>
        private float desvioDespeje;

        private static readonly float[] EscalasDespeje = { 1f, 0.8f, 0.6f, 0.45f };

        /// <summary>
        /// El ojo de la cinematográfica: en el rumbo elegido más el último desvío que sirvió si está
        /// libre; si no, gira de 15 en 15 grados hacia los dos lados (lo más cerca del rumbo elegido
        /// gana), primero a la distancia que encuadra y después más cerca (hasta 7 m); si nada sirve,
        /// sube de 3 en 3 m. Sin vista libre en ningún lado, desde arriba.
        /// </summary>
        private Vector3 Despejar(Vector3 objetivo, Vector3 mira, float az, float dist, float alto)
        {
            Vector3 En(float a, float d, float h) => objetivo + new Vector3(Mathf.Cos(a) * d, h, Mathf.Sin(a) * d);
            var previo = En(az + desvioDespeje * Mathf.Deg2Rad, dist, alto);
            if (Despejada(previo, mira, true))
            {
                return previo;
            }

            foreach (var escala in EscalasDespeje)
            {
                var d = Mathf.Max(7f, dist * escala);
                for (var paso = 0; paso <= 12; paso++)
                {
                    for (var lado = 0; lado < (paso == 0 ? 1 : 2); lado++)
                    {
                        var desvio = (lado == 0 ? 1f : -1f) * paso * 15f;
                        var ojo = En(az + desvio * Mathf.Deg2Rad, d, alto);
                        if (Despejada(ojo, mira, true))
                        {
                            desvioDespeje = desvio;
                            return ojo;
                        }
                    }
                }

                if (d <= 7f)
                {
                    break;
                }
            }

            for (var h = alto + 3f; h <= 30f; h += 3f)
            {
                var ojo = En(az, dist, h);
                if (Despejada(ojo, mira, true))
                {
                    desvioDespeje = 0f;
                    return ojo;
                }
            }

            desvioDespeje = 0f;
            return En(az, 4f, 30f);
        }

        /// <summary>
        /// Dónde se para la cámara de la acera: a la altura de una persona junto al árbol (o, si el árbol está
        /// a más de 10 m del choque, a 10 m del choque en la línea hacia él), del lado del
        /// choque, si desde ahí se ve la acción sin nada en medio (y lo más despejado de postes y paredes).
        /// Si no, alrededor del choque, de 9 a 23 m, el punto con vista libre más cercano al árbol. Primero
        /// a 2.5 m de lo construido y luego a 1 m; si tampoco, sube de 1.5 en 1.5 m hasta 6.2 m. Es determinista: el mismo caso da el mismo lugar.
        /// </summary>
        private Vector3 PuntoDeAcera(Vector3 arbol, Vector3 accion)
        {
            var hacia = accion - arbol;
            hacia.y = 0f;
            var d = hacia.sqrMagnitude > 1e-4f ? hacia.normalized : Vector3.forward;
            // Si el árbol queda lejos del choque, la referencia se acerca sobre la misma línea: a lo más
            // a 10 m del choque, para que se vea de cerca.
            if (hacia.magnitude > 10f)
            {
                arbol = new Vector3(accion.x, arbol.y, accion.z) - d * 10f;
            }

            var costado = Vector3.Cross(Vector3.up, d);

            // Junto al árbol: el lugar con el choque a la vista y el cuadro más despejado.
            Vector3? JuntoAlArbol(float holgura)
            {
                var mejor = float.MinValue;
                Vector3? elegido = null;
                foreach (var atras in new[] { 3f, 6f, 9f, 1.5f })
                {
                    foreach (var alLado in new[] { 2.5f, -2.5f, 4.5f, -4.5f, 1f, -1f })
                    {
                        var otro = arbol - d * atras + costado * alLado + Vector3.up * 1.7f;
                        if (EnBulto(otro, holgura) || !Despejada(otro, accion))
                        {
                            continue;
                        }

                        // El cuadro entero libre: también a 5 m a cada lado del choque.
                        var nota = Mathf.Min(Despeje(otro, accion), 1.5f) - atras * 0.05f
                            + (Despejada(otro, accion + costado * 5f) ? 1f : 0f)
                            + (Despejada(otro, accion - costado * 5f) ? 1f : 0f);
                        if (nota > mejor)
                        {
                            mejor = nota;
                            elegido = otro;
                        }
                    }
                }

                return elegido;
            }

            // Alrededor del choque, de 9 a 23 m: el lugar con vista libre más cercano al árbol.
            Vector3? Alrededor(float holgura, float h)
            {
                var menor = float.MaxValue;
                Vector3? elegido = null;
                foreach (var radio in new[] { 9f, 12f, 15f, 19f, 23f })
                {
                    for (var k = 0; k < 24; k++)
                    {
                        var ang = k * Mathf.PI / 12f;
                        var otro = new Vector3(accion.x, 0f, accion.z) + new Vector3(Mathf.Cos(ang), 0f, Mathf.Sin(ang)) * radio + Vector3.up * h;
                        if (EnBulto(otro, holgura) || !Despejada(otro, accion))
                        {
                            continue;
                        }

                        var lejos = (new Vector2(otro.x, otro.z) - new Vector2(arbol.x, arbol.z)).magnitude;
                        if (lejos < menor)
                        {
                            menor = lejos;
                            elegido = otro;
                        }
                    }
                }

                return elegido;
            }

            // A 2.5 m de lo construido (una pared pegada llena medio cuadro); si no hay, a 1 m; y al final, más alto.
            var lugar = JuntoAlArbol(2.5f) ?? Alrededor(2.5f, 1.7f) ?? JuntoAlArbol(1f) ?? Alrededor(1f, 1.7f)
                ?? Alrededor(1f, 3.2f) ?? Alrededor(1f, 4.7f) ?? Alrededor(1f, 6.2f);
            if (lugar.HasValue)
            {
                return lugar.Value;
            }

            // Sin vista libre en ningún lado (no debería pasar): junto al árbol, como antes.
            return arbol - d * 6f + Vector3.up * 1.7f;
        }

        /// <summary>Si desde `ojo` se ve `mira` sin estar dentro de algo ni con algo en medio.</summary>
        private bool Despejada(Vector3 ojo, Vector3 mira, bool conCopas = false)
        {
            // El ojo nunca va sobre lo construido, a ninguna altura: una azotea llena el cuadro.
            if (EnBulto(new Vector3(ojo.x, 0f, ojo.z), 0.8f))
            {
                return false;
            }

            for (var k = 0; k < 24; k++)
            {
                var p = Vector3.Lerp(ojo, mira, k / 24f);
                if (k > 0 && EnBulto(p, 0.2f))
                {
                    return false;
                }

                if (conCopas && p.y < 10f)
                {
                    foreach (var c in Copas)
                    {
                        if ((new Vector2(p.x, p.z) - new Vector2(c.x, c.y)).magnitude < c.z)
                        {
                            return false;
                        }
                    }
                }
            }

            return true;
        }

        /// <summary>
        /// Dónde se para la cinematográfica: el rumbo más cercano al de siempre desde el que la acción
        /// se ve entera durante todo el giro. En una calle con fachadas eso es sobre la vía; si no hay
        /// lugar, se acerca, y al final sube como una grúa.
        /// </summary>
        private void Elegir(Vector3 centro, float dist, float alto)
        {
            foreach (var extra in new[] { 0f, 4f, 9f })
            {
                foreach (var k in new[] { 1f, 0.75f, 0.55f })
                {
                    for (var i = 0; i < 72; i++)
                    {
                        var a0 = AnguloInicial + ((i + 1) / 2) * 5f * (i % 2 == 0 ? 1f : -1f);
                        var d = Mathf.Max(8f, dist * k);
                        // El giro lento mueve la cámara a lo más 1.5 m a cada lado: cabe en una calle.
                        var g0 = Mathf.Min(8f, Mathf.Atan(1.5f / d) * Mathf.Rad2Deg);
                        var libre = true;
                        foreach (var g in new[] { -g0, 0f, g0 })
                        {
                            var az = (a0 + g) * Mathf.Deg2Rad;
                            var ojo = centro + new Vector3(Mathf.Cos(az) * d, alto + extra, Mathf.Sin(az) * d);
                            libre &= Despejada(ojo, centro + Vector3.up * 0.9f, true);
                            // Tampoco con un poste en medio.
                            libre &= Despeje(ojo, centro, d - 3f) > 0.7f;
                        }

                        if (libre)
                        {
                            giroMax = g0;
                            azBase = a0;
                            distK = d / dist;
                            altoExtra = extra;
                            return;
                        }
                    }
                }
            }

            azBase = AnguloInicial;
            distK = 1f;
            altoExtra = 14f;
        }

        public Vector3 Centro => new Vector3((float)zona.CentroX, 0f, (float)zona.CentroY);

        /// <summary>El modo de la cámara, como lo nombra el puente.</summary>
        public string Modo => modo == "conductor"
            ? "conductor:" + conductor
            : modo == "persona"
            ? "persona:" + persona
            : modo == "cerca"
                ? System.FormattableString.Invariant($"cerca:{cercaDe}:{cercaAzimut}:{cercaDistancia}:{cercaAltura}")
                : modo;

        /// <summary>La persona con ese id: un peatón, o quien va en una bici o una moto del caso.</summary>
        private PersonaVista PersonaDe(string id)
        {
            return Peatones.Find(x => x != null && x.name == "persona_" + id)
                ?? Ocupantes.Find(x => x != null && x.name == "persona_" + id);
        }

        public bool Cambiar(string nuevo)
        {
            if (nuevo == "libre" && camara != null)
            {
                // La libre arranca donde está la cámara: el perito sigue desde lo que ya veía.
                posLibre = camara.transform.position;
                var e = camara.transform.eulerAngles;
                yawLibre = e.y;
                pitchLibre = e.x > 180f ? e.x - 360f : e.x;
                modo = nuevo;
                return true;
            }

            if (nuevo == "cenital" || nuevo == "orbita" || nuevo == "cinematica" || nuevo == "acera" || nuevo == "automatica")
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

            if (nuevo != null && nuevo.StartsWith("persona:"))
            {
                var id = nuevo.Substring("persona:".Length);
                if (PersonaDe(id) != null)
                {
                    modo = "persona";
                    persona = id;
                    return true;
                }
            }

            if (nuevo != null && nuevo.StartsWith("cerca:"))
            {
                var partes = nuevo.Split(':');
                var inv = System.Globalization.CultureInfo.InvariantCulture;
                if (partes.Length == 5 && Vehiculos.Exists(v => v.name == "vehiculo_" + partes[1])
                    && float.TryParse(partes[2], System.Globalization.NumberStyles.Float, inv, out var az)
                    && float.TryParse(partes[3], System.Globalization.NumberStyles.Float, inv, out var dist)
                    && float.TryParse(partes[4], System.Globalization.NumberStyles.Float, inv, out var alt))
                {
                    modo = "cerca";
                    cercaDe = partes[1];
                    cercaAzimut = az;
                    cercaDistancia = Mathf.Clamp(dist, 0.5f, 60f);
                    cercaAltura = Mathf.Clamp(alt, 0.1f, 40f);
                    return true;
                }
            }

            return false;
        }

        public void Abrir(Caso3D caso)
        {
            resultado = caso.Resultado;
            zona = Encuadre.ZonaDeInteres(resultado);
            todo = Encuadre.VerTodo(caso);
            inicio = resultado.TInicio;
            azBase = float.NaN;
            tomaImpacto = null;
            desvioDespeje = 0f;
            orbitaTocada = false;
            cenitalTocada = false;
            yaw = AnguloInicial;
            pitch = ElevacionOrbita;
            // Al abrir, el marco es «Ver todo» sin cambiar de cámara: la de arranque sigue siendo la misma.
            var previo = modo;
            Encuadrar("todo");
            modo = previo;
            // El encuadre al abrir no es del perito: «Desde arriba» sigue sola a los vehículos.
            cenitalTocada = false;
            Minimapa();
        }

        /// <summary>
        /// «Ver todo» (`todo`) o «Ir al impacto» (`impacto`). La cenital, la órbita y la libre se
        /// acomodan a ese marco; desde la cinematográfica, la acera o un conductor se pasa a la órbita.
        /// Devuelve el modo en que queda la cámara.
        /// </summary>
        public string Encuadrar(string que)
        {
            if (que == "impacto")
            {
                marcoCentro = new Vector3((float)zona.CentroX, 0f, (float)zona.CentroY);
                marcoLado = (float)zona.Lado;
            }
            else
            {
                marcoCentro = new Vector3((float)todo.CentroX, 0f, (float)todo.CentroY);
                marcoLado = (float)System.Math.Max(todo.Ancho, todo.Alto);
            }

            var aspecto = camara != null ? camara.aspect : 16f / 9f;
            var ancho = que == "impacto" ? marcoLado : (float)todo.Ancho;
            var alto = que == "impacto" ? marcoLado : (float)todo.Alto;
            centroCenital = marcoCentro;
            altoCenital = (float)Lente.DistanciaParaVer(ancho, alto, 40f, aspecto) * 1.05f;
            // «Ver todo» o «Ir al impacto» es un encuadre pedido: «Desde arriba» se queda en él.
            cenitalTocada = true;
            objetivo = marcoCentro;
            // En la órbita, el marco se ve inclinado: su lado mayor a lo ancho y, a lo alto, lo que ocupa
            // visto con la elevación de la cámara.
            var mayor = Mathf.Max(ancho, alto);
            distOrbita = Mathf.Max(8f, (float)Lente.DistanciaParaVer(mayor, mayor * Mathf.Sin(pitch * Mathf.Deg2Rad), 40f, aspecto));
            if (modo == "libre")
            {
                PoseOrbita(out posLibre, out var mira);
                var r = Quaternion.LookRotation(mira - posLibre).eulerAngles;
                yawLibre = r.y;
                pitchLibre = r.x > 180f ? r.x - 360f : r.x;
            }
            else if (modo != "cenital" && modo != "orbita")
            {
                modo = "orbita";
            }

            return Modo;
        }

        private void PoseOrbita(out Vector3 ojo, out Vector3 mira)
        {
            var a = yaw * Mathf.Deg2Rad;
            var e = pitch * Mathf.Deg2Rad;
            mira = objetivo + Vector3.up * 0.8f;
            ojo = mira + new Vector3(Mathf.Cos(a) * Mathf.Cos(e), Mathf.Sin(e), Mathf.Sin(a) * Mathf.Cos(e)) * distOrbita;
        }

        /// <summary>
        /// El minimapa: una cámara ortográfica desde arriba en la esquina, con «Ver todo» y el norte hacia
        /// arriba, y una flecha donde está la cámara principal (en una capa que solo ve el minimapa).
        /// </summary>
        private void Minimapa()
        {
            if (camara == null)
            {
                return;
            }

            camara.cullingMask &= ~(1 << CapaMinimapa);
            if (minimapa == null)
            {
                var go = new GameObject("Minimapa");
                go.transform.SetParent(transform, false);
                minimapa = go.AddComponent<Camera>();
                minimapa.orthographic = true;
                minimapa.clearFlags = CameraClearFlags.SolidColor;
                minimapa.backgroundColor = new Color(0.16f, 0.17f, 0.19f);
                minimapa.depth = camara.depth + 1f;
                minimapa.nearClipPlane = 1f;
                minimapa.farClipPlane = 200f;
                var datos = go.AddComponent<UniversalAdditionalCameraData>();
                datos.renderShadows = false;
                datos.renderPostProcessing = false;
                datos.antialiasing = AntialiasingMode.None;

                var flecha = new Malla();
                var a = new Vector3(0f, 0f, 1.6f);
                var b = new Vector3(-0.9f, 0f, -1f);
                var c = new Vector3(0.9f, 0f, -1f);
                flecha.NormalArriba = true;
                flecha.Triangulo(flecha.Vertice(a, Vector2.zero), flecha.Vertice(c, Vector2.zero), flecha.Vertice(b, Vector2.zero));
                var m = flecha.Poner(transform, "marcador_camara", Materiales.Emisivo(new Color(1f, 0.35f, 0.12f), new Color(1f, 0.35f, 0.12f)), false, false);
                m.layer = CapaMinimapa;
                marcador = m.transform;
            }

            // Abajo a la derecha, un cuarto del alto de la pantalla.
            var alto = 0.26f;
            var ancho = alto / Mathf.Max(0.3f, camara.aspect);
            minimapa.rect = new Rect(1f - ancho - 0.015f, 0.025f, ancho, alto);
            var lado = Mathf.Max((float)todo.Ancho, (float)todo.Alto);
            minimapa.orthographicSize = lado / 2f * 1.05f;
            minimapa.transform.SetPositionAndRotation(
                new Vector3((float)todo.CentroX, AlturaHorneado, (float)todo.CentroY),
                Quaternion.Euler(90f, 0f, 0f));
            if (marcador != null)
            {
                marcador.localScale = Vector3.one * Mathf.Max(1.5f, lado / 28f);
            }

            // Hasta que se hornee el fondo (o siempre, en alta y ultra), el minimapa dibuja la escena
            // completa, como antes; la lluvia de baja y media no entra.
            minimapa.cullingMask = ~(1 << EscenarioVista.CapaLluvia);
            minimapa.SetVolumeFrameworkUpdateMode(VolumeFrameworkUpdateMode.ViaScripting);
            if (fondo != null)
            {
                fondo.SetActive(false);
            }
        }

        /// <summary>
        /// Pide hornear el fondo del minimapa (U5, ADR 0115): la escena fija se dibuja una sola vez en
        /// una textura, unos cuadros después de armar el caso, y desde entonces el minimapa solo dibuja
        /// por cuadro lo que se mueve (vehículos, peatones, evidencias, lluvia) sobre esa imagen. Antes
        /// dibujaba la escena entera dos veces por cuadro.
        /// </summary>
        public void HornearMinimapa()
        {
            hornear = 3;
        }

        private void Hornear()
        {
            if (minimapa == null || camara == null)
            {
                return;
            }

            if (fondoMinimapa == null)
            {
                fondoMinimapa = new RenderTexture(LadoFondo, LadoFondo, 24) { name = "minimapa_fondo" };
            }

            // Sin los faros: su mancha de luz quedaría pintada donde estaban los vehículos al hornear.
            var faros = new List<Light>();
            foreach (var v in Vehiculos)
            {
                foreach (var l in v.GetComponentsInChildren<Light>())
                {
                    if (l.enabled)
                    {
                        faros.Add(l);
                        l.enabled = false;
                    }
                }
            }

            var rect = minimapa.rect;
            var visible = minimapa.enabled;
            var p = minimapa.transform.position;
            minimapa.transform.position = new Vector3(p.x, AlturaHorneado, p.z);
            minimapa.rect = new Rect(0f, 0f, 1f, 1f);
            minimapa.cullingMask = ~(CapasDelMinimapa | (1 << EscenarioVista.CapaLluvia));
            minimapa.targetTexture = fondoMinimapa;
            minimapa.enabled = true;
            horneando = true;
            minimapa.Render();
            horneando = false;
            minimapa.targetTexture = null;
            minimapa.rect = rect;
            minimapa.enabled = visible;
            minimapa.cullingMask = CapasPorCuadro;
            // Más cerca del piso: la niebla global casi no tiñe lo que se dibuja por cuadro.
            minimapa.transform.position = new Vector3(p.x, AlturaMinimapa, p.z);
            foreach (var l in faros)
            {
                l.enabled = true;
            }

            if (fondo == null)
            {
                var m = new Malla();
                var j = m.Vertice(new Vector3(-1f, 0f, -1f), new Vector2(0f, 0f));
                m.Vertice(new Vector3(1f, 0f, -1f), new Vector2(1f, 0f));
                m.Vertice(new Vector3(1f, 0f, 1f), new Vector2(1f, 1f));
                m.Vertice(new Vector3(-1f, 0f, 1f), new Vector2(0f, 1f));
                m.Triangulo(j, j + 2, j + 1);
                m.Triangulo(j, j + 3, j + 2);
                var material = new UnityEngine.Material(Materiales.MinimapaFondo);
                material.SetTexture("_BaseMap", fondoMinimapa);
                fondo = m.Poner(transform, "minimapa_fondo", material, false, false);
                fondo.layer = CapaMinimapa;
            }

            // Debajo de todo, del tamaño de lo que ve el minimapa.
            var s = minimapa.orthographicSize;
            fondo.transform.SetPositionAndRotation(new Vector3(p.x, -60f, p.z), Quaternion.identity);
            fondo.transform.localScale = new Vector3(s, 1f, s);
            fondo.SetActive(true);
        }

        private bool nieblaGuardada;
        private bool nieblaCambiada;

        private void OnEnable()
        {
            RenderPipelineManager.beginCameraRendering += AntesDeDibujar;
            RenderPipelineManager.endCameraRendering += DespuesDeDibujar;
        }

        private void OnDisable()
        {
            RenderPipelineManager.beginCameraRendering -= AntesDeDibujar;
            RenderPipelineManager.endCameraRendering -= DespuesDeDibujar;
        }

        /// <summary>
        /// La niebla de URP es global: desde arriba, en una escena de lluvia, el minimapa vería solo su
        /// color. Se apaga mientras se dibuja el minimapa y se devuelve como estaba.
        /// </summary>
        private void AntesDeDibujar(ScriptableRenderContext _, Camera c)
        {
            // Solo al hornear el fondo, o mientras el minimapa todavía dibuja la escena completa.
            if (c != null && c == minimapa && (horneando || fondo == null || !fondo.activeSelf))
            {
                nieblaGuardada = RenderSettings.fog;
                nieblaCambiada = true;
                RenderSettings.fog = false;
            }
        }

        private void DespuesDeDibujar(ScriptableRenderContext _, Camera c)
        {
            if (c != null && c == minimapa && nieblaCambiada)
            {
                RenderSettings.fog = nieblaGuardada;
                nieblaCambiada = false;
            }
        }

        /// <summary>El ratón y los dedos: solo en las cámaras que el perito mueve.</summary>
        private void Update()
        {
            if (camara == null || (modo != "orbita" && modo != "cenital" && modo != "libre"))
            {
                ultimaSeparacion = 0f;
                return;
            }

            // Mientras el perito arrastra un objeto en modo edición, la cámara se queda quieta.
            if (EditorEscena.Arrastrando)
            {
                ultimoRaton = Input.mousePosition;
                ultimaSeparacion = 0f;
                return;
            }

            var mover = Vector2.zero;
            var acercar = 0f;
            var girar = Vector2.zero;
            if (Input.touchCount == 1)
            {
                var d = Input.GetTouch(0).deltaPosition;
                if (modo == "cenital")
                {
                    mover = d;
                }
                else
                {
                    girar = d;
                }

                ultimaSeparacion = 0f;
            }
            else if (Input.touchCount >= 2)
            {
                var t0 = Input.GetTouch(0);
                var t1 = Input.GetTouch(1);
                var sep = (t0.position - t1.position).magnitude;
                if (ultimaSeparacion > 0f)
                {
                    acercar = (sep - ultimaSeparacion) / Mathf.Max(80f, Screen.height * 0.25f);
                }

                ultimaSeparacion = sep;
                mover = (t0.deltaPosition + t1.deltaPosition) / 2f;
            }
            else
            {
                ultimaSeparacion = 0f;
                var raton = Input.mousePosition;
                var delta = (Vector2)(raton - ultimoRaton);
                ultimoRaton = raton;
                if (Input.GetMouseButton(0))
                {
                    if (modo == "cenital")
                    {
                        mover = delta;
                    }
                    else
                    {
                        girar = delta;
                    }
                }
                else if (Input.GetMouseButton(1) || Input.GetMouseButton(2))
                {
                    mover = delta;
                }

                acercar = Input.mouseScrollDelta.y * 0.12f;
            }

            if (girar != Vector2.zero || mover != Vector2.zero || acercar != 0f)
            {
                orbitaTocada = true;
                if (modo == "cenital")
                {
                    cenitalTocada = true;
                }
            }

            var escala = Screen.height > 0 ? 1f / Screen.height : 0.001f;
            switch (modo)
            {
                case "orbita":
                {
                    yaw -= girar.x * 0.25f;
                    pitch = Mathf.Clamp(pitch - girar.y * 0.2f, 5f, 85f);
                    distOrbita = Mathf.Clamp(distOrbita * (1f - acercar), 4f, Mathf.Max(60f, marcoLado * 4f));
                    if (mover != Vector2.zero)
                    {
                        var derecha = camara.transform.right;
                        var adelante = Vector3.Cross(derecha, Vector3.up);
                        objetivo -= (derecha * mover.x + adelante * mover.y) * distOrbita * escala;
                    }

                    break;
                }

                case "cenital":
                {
                    centroCenital -= new Vector3(mover.x, 0f, mover.y) * altoCenital * escala * 0.75f;
                    altoCenital = Mathf.Clamp(altoCenital * (1f - acercar), 6f, Mathf.Max(80f, marcoLado * 4f));
                    break;
                }

                default:
                {
                    yawLibre += girar.x * 0.2f;
                    pitchLibre = Mathf.Clamp(pitchLibre - girar.y * 0.2f, -80f, 85f);
                    var giro = Quaternion.Euler(pitchLibre, yawLibre, 0f);
                    var paso = Mathf.Max(2f, posLibre.y) * Time.unscaledDeltaTime * 2.5f;
                    var teclas = new Vector3(Input.GetAxisRaw("Horizontal"), 0f, Input.GetAxisRaw("Vertical"));
                    posLibre += giro * teclas * paso;
                    posLibre += giro * Vector3.forward * acercar * Mathf.Max(4f, posLibre.y) * 2f;
                    posLibre -= (giro * new Vector3(mover.x, mover.y, 0f)) * Mathf.Max(2f, posLibre.y) * escala;
                    // Nunca bajo el piso ni dentro de lo construido.
                    posLibre.y = Mathf.Max(0.4f, posLibre.y);
                    break;
                }
            }
        }

        public void Asignar(Camera c)
        {
            camara = c;
        }

        /// <summary>El campo de visión vertical de una lente de `mm` en formato de 35 mm.</summary>
        private static float CampoDeLente(float mm)
        {
            return 2f * Mathf.Atan(12f / mm) * Mathf.Rad2Deg;
        }

        private void LateUpdate()
        {
            if (camara == null)
            {
                return;
            }

            var centro = Centro;
            var lado = (float)zona.Lado;
            var t = Caso != null ? (float)(Caso.Tiempo - inicio) : 0f;
            ActualizarMinimapa();
            // En la cámara del conductor no se dibuja la carrocería propia, salvo un contorno tenue del
            // cofre y de los postes (René, 2026-11-10): se ve lo que el conductor alcanzaba a ver.
            foreach (var v in Vehiculos)
            {
                v.DesdeElAsiento(modo == "conductor" && v.name == "vehiculo_" + conductor);
            }

            foreach (var ocupante in Ocupantes)
            {
                if (ocupante != null)
                {
                    ocupante.gameObject.SetActive(!(modo == "conductor" && ocupante.VehiculoId == conductor));
                }
            }

            switch (modo)
            {
                case "cenital":
                    camara.fieldOfView = 40f;
                    if (!cenitalTocada && resultado != null && Caso != null)
                    {
                        // Encuadra los vehículos en el instante, el choque y las posiciones finales, con margen.
                        var e = CamaraAutomatica.Cenital(
                            CajaVehiculos(Caso.Tiempo),
                            Lente.VehiculosEn(resultado, resultado.TFin),
                            resultado.PuntoImpacto != null ? Contacto : (V3?)null,
                            40.0,
                            camara.aspect);
                        var suelo = resultado.PuntoImpacto != null ? (float)Suelo : 0f;
                        centroCenital = new Vector3((float)e.X, suelo, (float)e.Z);
                        altoCenital = (float)e.Alto;
                    }

                    camara.transform.SetPositionAndRotation(centroCenital + Vector3.up * altoCenital, Quaternion.Euler(90f, 0f, 0f));
                    return;
                case "orbita":
                {
                    camara.fieldOfView = 40f;
                    // Sin tocarla, gira despacio con el tiempo del caso; tocada, se queda donde la dejó el perito.
                    var yawAntes = yaw;
                    if (!orbitaTocada)
                    {
                        yaw = AnguloInicial + 3f * t;
                    }

                    PoseOrbita(out var ojo, out var mira);
                    if (!orbitaTocada)
                    {
                        yaw = yawAntes;
                    }

                    camara.transform.position = ojo;
                    camara.transform.LookAt(mira);
                    return;
                }

                case "libre":
                    camara.fieldOfView = 50f;
                    camara.transform.SetPositionAndRotation(posLibre, Quaternion.Euler(pitchLibre, yawLibre, 0f));
                    return;
                case "cerca":
                {
                    var v = Vehiculos.Find(x => x.name == "vehiculo_" + cercaDe);
                    if (v != null)
                    {
                        // Sigue al vehículo: el azimut se cuenta desde su frente, hacia su derecha.
                        camara.fieldOfView = 45f;
                        var tr = v.transform;
                        var dir = Quaternion.Euler(0f, tr.eulerAngles.y + cercaAzimut, 0f) * Vector3.forward;
                        var mira = tr.position + Vector3.up * 0.9f;
                        var ojo = tr.position + dir * cercaDistancia + Vector3.up * cercaAltura;
                        camara.transform.SetPositionAndRotation(ojo, Quaternion.LookRotation(mira - ojo, Vector3.up));
                        return;
                    }

                    break;
                }
                case "persona":
                {
                    // Sigue a la persona desde su costado derecho y un poco atrás, a la altura de un
                    // adulto parado: se ve su recorrido, el golpe y dónde queda (como la de three.js).
                    var p = PersonaDe(persona);
                    if (p != null)
                    {
                        camara.fieldOfView = 45f;
                        var tr = p.transform;
                        var frente = tr.forward;
                        frente.y = 0f;
                        if (frente.sqrMagnitude < 1e-4f)
                        {
                            frente = Vector3.forward;
                        }

                        frente.Normalize();
                        var derecha = Vector3.Cross(Vector3.up, frente);
                        var suelo = new Vector3(tr.position.x, 0f, tr.position.z);
                        var mira = suelo + Vector3.up * 0.9f;
                        var ojo = suelo + derecha * 6f - frente * 2f + Vector3.up * 2.4f;
                        camara.transform.SetPositionAndRotation(ojo, Quaternion.LookRotation(mira - ojo, Vector3.up));
                        return;
                    }

                    break;
                }

                case "conductor":
                {
                    var v = Vehiculos.Find(x => x.name == "vehiculo_" + conductor);
                    var datos = resultado?.Vehiculos != null ? System.Array.Find(resultado.Vehiculos, x => x.Id == conductor) : null;
                    if (v != null && datos != null)
                    {
                        // El ojo del conductor: en su asiento y a la altura que usó `visibilidad`.
                        camara.fieldOfView = 60f;
                        var tr = v.transform;
                        var asiento = Personas.Asiento(AsientoEnum.Conductor, datos.Dimensiones.LargoM, datos.Dimensiones.AnchoM, datos.Clase);
                        // En dos ruedas se va al centro, montado: el ojo de quien maneja, sobre el asiento.
                        var dosRuedas = PerfilClase.De(datos.Clase).DosRuedas;
                        var local = dosRuedas
                            ? new Vector3(0f, Mathf.Max(AlturaOjo(conductor), 1.45f), -0.1f * (float)datos.Dimensiones.LargoM)
                            : new Vector3(-(float)asiento.Y, AlturaOjo(conductor), (float)asiento.X + 0.15f);
                        camara.transform.SetPositionAndRotation(
                            tr.TransformPoint(local),
                            Quaternion.LookRotation(tr.forward, Vector3.up) * Quaternion.Euler(3f, 0f, 0f));
                        return;
                    }

                    break;
                }

                case "acera":
                {
                    // De pie en la acera, junto al árbol más cercano, mirando el choque (René, 2026-11-26:
                    // «que no quede frente a una barda»). Junto al árbol solo vale un lugar desde el que el
                    // choque se ve sin nada en medio; si ninguno, otro punto alrededor del choque con
                    // vista libre, lo más cerca del árbol; si tampoco, un poco más alto. Sin árboles, a
                    // la orilla de la vía.
                    camara.fieldOfView = 55f;
                    var accion = centro + Vector3.up * 1f;
                    if (Arbol.HasValue)
                    {
                        var ojo = PuntoDeAcera(Arbol.Value, accion);
                        camara.transform.position = ojo;
                        // El choque al centro, con un poco del árbol y la calle: se mira un poco arriba de la acción.
                        camara.transform.LookAt(accion + Vector3.up * 0.4f);
                    }
                    else
                    {
                        var a0 = AnguloInicial * Mathf.Deg2Rad;
                        var d0 = Mathf.Max(11f, lado * 0.55f);
                        camara.transform.position = centro + new Vector3(Mathf.Cos(a0) * d0, 1.7f, Mathf.Sin(a0) * d0);
                        camara.transform.LookAt(centro + Vector3.up);
                    }

                    return;
                }

                case "automatica":
                {
                    if (resultado?.PuntoImpacto != null && Caso != null)
                    {
                        camara.fieldOfView = 45f;
                        var toma = Automatica(Caso.Tiempo);
                        var ojoA = new Vector3((float)toma.Ojo.X, (float)toma.Ojo.Y, (float)toma.Ojo.Z);
                        var miraA = new Vector3((float)toma.Mira.X, (float)toma.Mira.Y, (float)toma.Mira.Z);
                        camara.transform.SetPositionAndRotation(ojoA, Quaternion.LookRotation(miraA - ojoA, Vector3.up));
                        return;
                    }

                    goto case "cinematica";
                }

                case "cinematica":
                {
                    // Como la del visor web: una lente de 50 mm en acciones chicas y de 35 mm en grandes,
                    // baja, a tres cuartos, girando despacio con el tiempo del caso. Encuadra los vehículos
                    // en el instante (y el impacto) para que llenen el cuadro: antes encuadraba toda la zona
                    // y los coches salían chicos (René, 2026-11-10).
                    var caja = resultado != null ? CajaVehiculos(Caso != null ? Caso.Tiempo : 0.0) : null;
                    var tam = caja != null && !caja.Vacia ? Mathf.Max((float)caja.Ancho, (float)caja.Alto) : lado;
                    var k = Mathf.Clamp01((tam - 12f) / 30f);
                    var vfov = CampoDeLente(Mathf.Lerp(50f, 35f, k));
                    camara.fieldOfView = vfov;
                    var dist = Mathf.Clamp(
                        (float)Lente.DistanciaParaVer(tam / LlenadoCinematica, tam * 0.5f / LlenadoCinematica, vfov, camara.aspect),
                        7f,
                        60f);
                    var alto = Mathf.Lerp(2.2f, 5.5f, k);
                    var objetivo = caja != null && !caja.Vacia
                        ? new Vector3((float)caja.CentroX, 0f, (float)caja.CentroY)
                        : centro;

                    if (float.IsNaN(azBase))
                    {
                        Elegir(centro, dist, alto);
                    }

                    // Gira despacio con el tiempo del caso, sin salirse del tramo que se revisó.
                    var az = (azBase + Mathf.Clamp(2.2f * t, -giroMax, giroMax)) * Mathf.Deg2Rad;
                    dist *= distK;
                    alto += altoExtra;
                    // En el golpe, la cinematográfica se acerca al punto de impacto (ronda 4, punto 5):
                    // lo encuadra y vuelve sola al encuadre de los vehículos.
                    if (resultado?.PuntoImpacto != null && Caso != null)
                    {
                        var peso = (float)EnfasisImpacto.PesoCamara(Caso.Tiempo, Caso.TImpacto);
                        if (peso > 0f)
                        {
                            var pi = new Vector3((float)resultado.PuntoImpacto.X, 0f, (float)resultado.PuntoImpacto.Y);
                            objetivo = Vector3.Lerp(objetivo, pi, peso);
                            dist = Mathf.Lerp(dist, Mathf.Max(7f, dist * 0.7f), peso);
                            alto = Mathf.Lerp(alto, Mathf.Max(1.6f, alto * 0.8f), peso);
                        }
                    }
                    // La distancia cambia con el instante y el rumbo se revisó con la del principio: si
                    // ahora algo tapa la vista (una fachada), primero se busca otro rumbo a la misma
                    // distancia, que es la que encuadra a los vehículos; después, más cerca; al final, más
                    // alto. El desvío que sirvió se conserva mientras siga libre, para que la cámara no
                    // salte de un lado al otro al reproducir (U6: la foto «antes» del dictamen salía con
                    // una pared enfrente y sin los vehículos).
                    var mira = objetivo + Vector3.up * 0.9f;
                    var ojo = Despejar(objetivo, mira, az, dist, alto);
                    camara.transform.position = ojo;
                    camara.transform.LookAt(mira);
                    return;
                }
            }

            camara.fieldOfView = 40f;
            PoseOrbita(out var o, out var mi);
            camara.transform.position = o;
            camara.transform.LookAt(mi);
        }

        private Toma? tomaImpacto;
        private List<Estorbo> fijos;

        /// <summary>Lo construido y las copas, como estorbos de `CamaraAutomatica`.</summary>
        private List<Estorbo> EstorbosFijos()
        {
            var lista = new List<Estorbo>();
            foreach (var b in Bultos)
            {
                lista.Add(new Estorbo { Cx = b.C.x, Cz = b.C.y, Ux = b.U.x, Uz = b.U.y, MedioLargo = b.Hw, MedioAncho = b.Hd, Y0 = -1.0, Y1 = b.Alto + 0.3 });
            }

            foreach (var c in Copas)
            {
                lista.Add(new Estorbo { Cx = c.x, Cz = c.y, MedioLargo = c.z, Y0 = 2.0, Y1 = 10.0, Cilindro = true });
            }

            return lista;
        }

        /// <summary>El piso, para la altura del contacto con relieve; nulo, plano.</summary>
        public Terreno Terreno { get; set; }

        private double Suelo => Terreno != null ? Terreno.Z((float)resultado.PuntoImpacto.X, (float)resultado.PuntoImpacto.Y) : 0.0;

        /// <summary>
        /// La caja de los vehículos en `t` (y el impacto), con los de la hipótesis donde se ven ahora: en un
        /// «¿Y si…?» que sale disparado, la cámara no los pierde.
        /// </summary>
        private CajaPlano CajaVehiculos(double t)
        {
            var caja = Lente.VehiculosEn(resultado, t) ?? new CajaPlano();
            foreach (var f in Fantasmas)
            {
                if (f == null || !f.gameObject.activeInHierarchy)
                {
                    continue;
                }

                var p = f.transform.position;
                var r = (float)(f.Datos?.Dimensiones?.LargoM ?? 4.5) / 2f;
                caja.Agregar(p.x - r, p.z - r);
                caja.Agregar(p.x + r, p.z + r);
            }

            return caja;
        }

        private V3 Contacto => new V3(resultado.PuntoImpacto.X, Suelo + CamaraAutomatica.AlturaContacto, resultado.PuntoImpacto.Y);

        /// <summary>
        /// La cámara «automática» (puente 1.5.0, el video): la llegada, el impacto de lado al contacto y el
        /// final desde arriba (`CamaraAutomatica`). El lado del impacto se elige una vez por caso, con los
        /// vehículos donde estaban en el impacto; las otras dos tomas siguen a los vehículos.
        /// </summary>
        private Toma Automatica(double t)
        {
            var tI = Caso.TImpacto;
            if (double.IsNaN(tI))
            {
                tI = 0.0;
            }

            if (tomaImpacto == null)
            {
                fijos = EstorbosFijos();
                var enImpacto = CamaraAutomatica.Vehiculos(resultado, tI, Suelo);
                var actores = Actores(tI);
                var a = actores.Count > 0 ? actores[0] : Contacto;
                var b = actores.Count > 1 ? actores[1] : Contacto;
                var todos = new List<Estorbo>(fijos);
                todos.AddRange(enImpacto);
                todos.AddRange(CamaraAutomatica.Vehiculos(resultado, tI + 0.5, Suelo));
                tomaImpacto = CamaraAutomatica.Impacto(Contacto, a, b, todos);
                Debug.Log("[cámara automática] impacto desde " + tomaImpacto.Value.Ojo.X.ToString("0.0") + ", " + tomaImpacto.Value.Ojo.Y.ToString("0.0") + ", " + tomaImpacto.Value.Ojo.Z.ToString("0.0"));
            }

            var aspecto = camara != null ? camara.aspect : 16f / 9f;
            var impacto = tomaImpacto.Value;
            var llegada = CamaraAutomatica.Panorama(CajaVehiculos(t), Contacto, impacto, 45.0, aspecto, new[] { 32.0, 45.0, 60.0, 80.0 }, fijos);
            var final = CamaraAutomatica.Panorama(Lente.VehiculosEn(resultado, resultado.TFin), Contacto, impacto, 45.0, aspecto, new[] { 62.0, 75.0, 88.0 }, fijos);
            var toma = CamaraAutomatica.En(t, tI, llegada, impacto, final);
            // Con trayecto previo, sigue al que viene de más lejos hasta que empieza la reconstrucción.
            VehiculoVista seguido = null;
            foreach (var v in Vehiculos)
            {
                if (v != null && v.Previo != null && (seguido == null || Previo.Inicio(v.Previo) < Previo.Inicio(seguido.Previo)))
                {
                    seguido = v;
                }
            }

            if (seguido != null)
            {
                var peso = CamaraAutomatica.PesoSeguimiento(t, seguido.TInicioResultado);
                if (peso > 0.0)
                {
                    var tr = seguido.transform;
                    var f = tr.forward;
                    var sigue = CamaraAutomatica.Seguir(new V3(tr.position.x, tr.position.y, tr.position.z), System.Math.Atan2(f.z, f.x));
                    toma = CamaraAutomatica.Mezclar(toma, sigue, peso);
                }
            }

            return toma;
        }

        /// <summary>El centro de los vehículos del impacto principal en `tI` (por los actores del evento; si no, los dos más cercanos al contacto).</summary>
        private List<V3> Actores(double tI)
        {
            var ids = new List<string>();
            foreach (var e in resultado.Eventos ?? new ResultadoEvento[0])
            {
                var esImpacto = e.Tipo == StickyTipo.ImpactoVehiculoVehiculo || e.Tipo == StickyTipo.ImpactoVehiculoObjeto || e.Tipo == StickyTipo.ImpactoVehiculoPersona;
                if (esImpacto && System.Math.Abs(e.T - tI) < 1e-3 && e.Actores != null)
                {
                    ids.AddRange(e.Actores);
                    break;
                }
            }

            var lista = new List<V3>();
            foreach (var v in resultado.Vehiculos)
            {
                if (ids.Count == 0 || ids.Contains(v.Id))
                {
                    var p = Muestreo.Pose(v.Trayectoria, tI);
                    lista.Add(new V3(p.X, 0.0, p.Y));
                }
            }

            var c = Contacto;
            lista.Sort((x, y) => ((x.X - c.X) * (x.X - c.X) + (x.Z - c.Z) * (x.Z - c.Z)).CompareTo((y.X - c.X) * (y.X - c.X) + (y.Z - c.Z) * (y.Z - c.Z)));
            return lista;
        }

        /// <summary>
        /// Para las pruebas (`depurar` `{"contacto": true}`): dónde cae el punto de contacto en la pantalla
        /// (fracción desde arriba a la izquierda), si queda dentro del cuadro y si nada lo tapa (lo
        /// construido, las copas y los vehículos donde están ahora).
        /// </summary>
        public (float Fx, float Fy, bool EnCuadro, bool Despejado)? ContactoEnPantalla()
        {
            if (camara == null || resultado?.PuntoImpacto == null)
            {
                return null;
            }

            var c = Contacto;
            var pp = camara.WorldToScreenPoint(new Vector3((float)c.X, (float)c.Y, (float)c.Z));
            var fx = pp.x / camara.pixelWidth;
            var fy = 1f - pp.y / camara.pixelHeight;
            var todos = EstorbosFijos();
            foreach (var v in Vehiculos)
            {
                if (v?.Datos?.Dimensiones == null)
                {
                    continue;
                }

                var tr = v.transform;
                var f = tr.forward;
                var d = v.Datos.Dimensiones;
                var e = Estorbo.Vehiculo(tr.position.x, tr.position.z, System.Math.Atan2(f.z, f.x), d.LargoM, d.AnchoM, d.AltoM);
                e.Y0 = tr.position.y - 0.5;
                e.Y1 = tr.position.y + d.AltoM;
                todos.Add(e);
            }

            var o = camara.transform.position;
            return (fx, fy, pp.z > 0f && fx >= 0f && fx <= 1f && fy >= 0f && fy <= 1f, CamaraAutomatica.Despejado(new V3(o.x, o.y, o.z), c, todos));
        }

        /// <summary>La altura del ojo del conductor en `visibilidad` del Resultado; si no, la de un auto.</summary>
        private float AlturaOjo(string vehiculo)
        {
            foreach (var v in resultado?.Visibilidad ?? new VisibilidadElement[0])
            {
                if (v.Observador == vehiculo && v.AlturaOjoM > 0.3)
                {
                    return (float)v.AlturaOjoM;
                }
            }

            return AlturaOjosPorOmision;
        }

        /// <summary>El minimapa se ve salvo en la cenital, que ya es la vista desde arriba.</summary>
        private void ActualizarMinimapa()
        {
            if (camara != null)
            {
                camara.cullingMask = modo == "cenital"
                    ? camara.cullingMask & ~(1 << CapaCopasDelCaso)
                    : camara.cullingMask | (1 << CapaCopasDelCaso);
            }

            if (minimapa == null)
            {
                return;
            }

            if (hornear > 0 && --hornear == 0)
            {
                Hornear();
            }

            minimapa.enabled = MinimapaVisible && modo != "cenital";
            if (marcador != null)
            {
                var p = camara.transform.position;
                var f = camara.transform.forward;
                marcador.SetPositionAndRotation(
                    new Vector3(p.x, 0.6f, p.z),
                    Quaternion.LookRotation(new Vector3(f.x, 0f, f.z).sqrMagnitude > 1e-4f ? new Vector3(f.x, 0f, f.z) : Vector3.forward, Vector3.up));
            }
        }
    }
}
