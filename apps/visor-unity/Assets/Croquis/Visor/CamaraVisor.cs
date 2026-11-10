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

        // La libre: posición y hacia dónde mira.
        private Vector3 posLibre;
        private float yawLibre;
        private float pitchLibre;

        // La cenital: centro y altura.
        private Vector3 centroCenital;
        private float altoCenital = 40f;

        private Camera minimapa;
        private Transform marcador;
        private Vector3 ultimoRaton;
        private float ultimaSeparacion;

        public List<VehiculoVista> Vehiculos { get; set; } = new List<VehiculoVista>();

        /// <summary>Los ocupantes: en la cámara de un conductor se esconden los de su vehículo (el ojo va
        /// donde está su cabeza).</summary>
        public List<PersonaVista> Ocupantes { get; } = new List<PersonaVista>();
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
        public string Modo => modo == "conductor" ? "conductor:" + conductor : modo;

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

            if (nuevo == "cenital" || nuevo == "orbita" || nuevo == "cinematica" || nuevo == "acera")
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

        public void Abrir(Caso3D caso)
        {
            resultado = caso.Resultado;
            zona = Encuadre.ZonaDeInteres(resultado);
            todo = Encuadre.VerTodo(caso);
            inicio = resultado.TInicio;
            azBase = float.NaN;
            orbitaTocada = false;
            yaw = AnguloInicial;
            pitch = ElevacionOrbita;
            // Al abrir, el marco es «Ver todo» sin cambiar de cámara: la de arranque sigue siendo la misma.
            var previo = modo;
            Encuadrar("todo");
            modo = previo;
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
                new Vector3((float)todo.CentroX, 120f, (float)todo.CentroY),
                Quaternion.Euler(90f, 0f, 0f));
            if (marcador != null)
            {
                marcador.localScale = Vector3.one * Mathf.Max(1.5f, lado / 28f);
            }
        }

        private bool nieblaGuardada;

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
            if (c != null && c == minimapa)
            {
                nieblaGuardada = RenderSettings.fog;
                RenderSettings.fog = false;
            }
        }

        private void DespuesDeDibujar(ScriptableRenderContext _, Camera c)
        {
            if (c != null && c == minimapa)
            {
                RenderSettings.fog = nieblaGuardada;
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
            // En la cámara del conductor, lo que está a menos de 0.75 m del ojo (el volante y el tablero
            // del modelo genérico) no se dibuja: a la altura del ojo de `visibilidad` taparía el camino.
            camara.nearClipPlane = modo == "conductor" ? 0.75f : 0.1f;
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
                case "conductor":
                {
                    var v = Vehiculos.Find(x => x.name == "vehiculo_" + conductor);
                    var datos = resultado?.Vehiculos != null ? System.Array.Find(resultado.Vehiculos, x => x.Id == conductor) : null;
                    if (v != null && datos != null)
                    {
                        // El ojo del conductor: en su asiento y a la altura que usó `visibilidad`.
                        camara.fieldOfView = 60f;
                        var tr = v.transform;
                        var asiento = Personas.Asiento(AsientoEnum.Conductor, datos.Dimensiones.LargoM, datos.Dimensiones.AnchoM);
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
                    // De pie junto al árbol más cercano, con la acción detrás: para juzgar el entorno de
                    // cerca. Sin árboles, a la orilla de la vía.
                    camara.fieldOfView = 55f;
                    if (Arbol.HasValue)
                    {
                        var haciaCentro = centro - Arbol.Value;
                        haciaCentro.y = 0f;
                        var d = haciaCentro.normalized;
                        var costado = Vector3.Cross(Vector3.up, d);
                        // De los lugares posibles, el primero fuera de los edificios y más despejado de postes.
                        var mira = Arbol.Value + d * 6f + Vector3.up * 3.2f;
                        var ojo = Arbol.Value - d * 9f + costado * 4.5f + Vector3.up * 1.7f;
                        var mejor = float.MinValue;
                        foreach (var atras in new[] { 9f, 6f, 12f })
                        {
                            foreach (var alLado in new[] { 4.5f, -4.5f, 2.5f, -2.5f, 1f, -1f })
                            {
                                var otro = Arbol.Value - d * atras + costado * alLado + Vector3.up * 1.7f;
                                var nota = Mathf.Min(Despeje(otro, mira), 1.5f);
                                if (EnBulto(otro, 1f))
                                {
                                    nota -= 100f;
                                }
                                else if (!Despejada(otro, mira))
                                {
                                    nota -= 50f;
                                }

                                if (nota > mejor)
                                {
                                    mejor = nota;
                                    ojo = otro;
                                }
                            }
                        }

                        if (mejor < 0f)
                        {
                            // Ningún lugar de esos quedó libre (una calle con fachadas pegadas): se
                            // rodea el árbol hasta ver su copa sin nada en medio, de preferencia con
                            // la acción al fondo.
                            var copa = Arbol.Value + Vector3.up * 3.2f;
                            var mejorVista = float.MinValue;
                            foreach (var radio in new[] { 7f, 9f, 5f, 11f })
                            {
                                for (var k = 0; k < 24; k++)
                                {
                                    var ang = k * Mathf.PI / 12f;
                                    var otro = Arbol.Value
                                        + new Vector3(Mathf.Cos(ang), 0f, Mathf.Sin(ang)) * radio
                                        + Vector3.up * 1.7f;
                                    if (EnBulto(otro, 0.9f) || !Despejada(otro, copa))
                                    {
                                        continue;
                                    }

                                    var hacia = Arbol.Value - otro;
                                    hacia.y = 0f;
                                    var vista = Vector3.Dot(hacia.normalized, d)
                                        + Mathf.Min(Despeje(otro, copa), 1.5f) * 0.2f;
                                    if (vista > mejorVista)
                                    {
                                        mejorVista = vista;
                                        ojo = otro;
                                        mira = copa + d * 2f;
                                    }
                                }
                            }
                        }

                        camara.transform.position = ojo;
                        camara.transform.LookAt(mira);
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

                case "cinematica":
                {
                    // Como la del visor web: una lente de 50 mm en acciones chicas y de 35 mm en grandes,
                    // baja, a tres cuartos, girando despacio con el tiempo del caso. Encuadra los vehículos
                    // en el instante (y el impacto) para que llenen el cuadro: antes encuadraba toda la zona
                    // y los coches salían chicos (René, 2026-11-10).
                    var caja = resultado != null ? Lente.VehiculosEn(resultado, Caso != null ? Caso.Tiempo : 0.0) : null;
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
                    camara.transform.position = objetivo + new Vector3(Mathf.Cos(az) * dist, alto, Mathf.Sin(az) * dist);
                    camara.transform.LookAt(objetivo + Vector3.up * 0.9f);
                    return;
                }
            }

            camara.fieldOfView = 40f;
            PoseOrbita(out var o, out var mi);
            camara.transform.position = o;
            camara.transform.LookAt(mi);
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
            if (minimapa == null)
            {
                return;
            }

            minimapa.enabled = modo != "cenital";
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
