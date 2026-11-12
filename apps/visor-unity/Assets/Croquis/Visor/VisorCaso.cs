using System;
using System.Collections.Generic;
using Croquis.Core;
using Croquis.Generated;
using UnityEngine;
using UnityEngine.UI;
using Ejes = Croquis.Core.Ejes;
using Material = UnityEngine.Material;

namespace Croquis.Visor
{
    /// <summary>El caso abierto: sus vehículos, su escenario y la línea de tiempo. Solo reproduce el Resultado.</summary>
    [RequireComponent(typeof(CamaraVisor))]
    public sealed class VisorCaso : MonoBehaviour
    {
        private readonly List<VehiculoVista> vehiculos = new List<VehiculoVista>();
        private readonly List<PersonaVista> personas = new List<PersonaVista>();
        private readonly CargadorModelos modelos = new CargadorModelos();
        private readonly CargadorCuerpos cuerpos = new CargadorCuerpos();
        private Transform raiz;
        private GameObject piso;
        private Light sol;
        private EscenaDinamica dinamica;
        private double inicio;
        private double fin;

        public double Tiempo { get; private set; }

        /// <summary>El final del Resultado (s): el instante de la foto «en reposo».</summary>
        public double Fin => fin;
        public bool Reproduciendo { get; set; }

        /// <summary>La raíz del caso armado (para perfilar).</summary>
        public Transform Raiz => raiz;

        /// <summary>Al llegar al final vuelve al principio (la medición de E6 reproduce sin parar).</summary>
        public bool Bucle { get; set; }

        /// <summary>Si ya hay un caso armado (la calidad automática no mide durante la carga).</summary>
        public bool Cargado { get; private set; }
        public float Velocidad { get; set; } = 1f;
        public CamaraVisor Camara { get; private set; }

        /// <summary>El modo edición en 3D (U6).</summary>
        public EditorEscena Editor => editor != null ? editor : editor = gameObject.AddComponent<EditorEscena>();

        private EditorEscena editor;

        private void Awake()
        {
            Camara = GetComponent<CamaraVisor>();
            piso = GameObject.Find("Piso");
            sol = FindFirstObjectByType<Light>();
        }

        public async Awaitable CargarAsync(Caso3D caso)
        {
            Reproduciendo = false;
            Cargado = false;
            if (raiz != null)
            {
                Destroy(raiz.gameObject);
            }

            vehiculos.Clear();
            personas.Clear();
            dinamica = null;
            raiz = new GameObject("Caso").transform;
            var r = caso.Resultado;
            var e = caso.Escenario;
            var noche = e != null && e.Ambiente.Noche;
            inicio = r.TInicio;
            fin = r.TFin;
            foreach (var v in r.Vehiculos)
            {
                var go = new GameObject("vehiculo_" + v.Id);
                go.transform.SetParent(raiz, false);
                var vista = go.AddComponent<VehiculoVista>();
                vista.Trayectoria = v.Trayectoria;
                vista.Datos = v;
                vista.CaidaLado = Caida.SeArrastraCaido(r, v) ? Caida.Lado(v.Trayectoria) : 0;
                var extra = e?.Vehiculos != null ? Array.Find(e.Vehiculos, x => x.Id == v.Id) : null;
                var color = extra?.Color != null ? Materiales.Hex(extra.Color, Color.gray) : (Color?)null;
                vista.Partes = await modelos.ArmarAsync(go.transform, v, color);
                vista.Frenado = extra?.Frenado;
                vista.Luces(noche, extra == null || extra.Faros, (float)v.Dimensiones.LargoM);
                foreach (var tr in go.GetComponentsInChildren<Transform>(true))
                {
                    tr.gameObject.layer = EscenarioVista.CapaVehiculos;
                }

                if (Calidad.Perfil.SombrasUnidas)
                {
                    SombrasUnidas.Unir(go.transform, "sombra_vehiculo");
                }

                if (e != null)
                {
                    SombraDeContacto(go.transform, (float)v.Dimensiones.LargoM, (float)v.Dimensiones.AnchoM, noche);
                }
                vehiculos.Add(vista);
            }

            // Con escenario (ADR 0112) se dibuja lo que calculó TS y se esconde el piso liso de U1.
            // El piso es plano salvo que la escena declare terreno (C3): entonces todo se arma sobre él.
            var terreno = TerrenoVista.De(e?.Terreno);
            var zona = Encuadre.ZonaDeInteres(r);
            EscenarioVista.CentroDelHecho = new Vector2((float)zona.CentroX, (float)zona.CentroY);
            EscenarioVista.ClaroDelHecho = (float)zona.Lado * 0.6f + 4f;
            if (e != null)
            {
                EscenarioVista.Construir(raiz, e, sol, Camera.main, terreno);
            }

            TerrenoVista.Dibujar(raiz, e?.Terreno, terreno, e != null && e.Ambiente.Mojado);
            dinamica = CasoVista.Construir(raiz, caso, terreno, noche);
            Editor.Preparar(r.Objetos, terreno);
            foreach (var v in vehiculos)
            {
                v.Terreno = terreno;
            }

            // Los vehículos estacionados, con el modelo de su clase y quietos (antes salían como una caja
            // de tabique). Sus medidas son las del objeto; sin clase, un sedán.
            foreach (var o in r.Objetos ?? new ResultadoObjeto[0])
            {
                if (o.Tipo != IndigoTipo.VehiculoEstacionado)
                {
                    continue;
                }

                var go = new GameObject("estacionado_" + o.Id);
                go.transform.SetParent(raiz, false);
                var v = new ResultadoVehiculo
                {
                    Id = o.Id,
                    Clase = string.IsNullOrEmpty(o.ClaseVehiculo) ? "sedan_mediano" : o.ClaseVehiculo,
                    Dimensiones = new Dimensiones
                    {
                        LargoM = o.LargoM,
                        AnchoM = o.AnchoM,
                        AltoM = o.AltoM,
                        DistanciaEntreEjesM = 0.6 * o.LargoM,
                    },
                };
                try
                {
                    await modelos.ArmarAsync(go.transform, v, (Color?)null);
                }
                catch (ModeloNoCargo ex)
                {
                    Debug.LogWarning("[estacionado] " + ex.Message);
                }

                var pie = terreno.P(o.X, o.Y);
                go.transform.SetPositionAndRotation(pie, Quaternion.Euler(0f, 90f - (float)o.RumboDeg, 0f));
                if (e != null)
                {
                    SombraDeContacto(go.transform, (float)o.LargoM, (float)o.AnchoM, noche);
                }
            }

            // U3: las personas. Con trayectoria propia, por su cuenta; los ocupantes, en su vehículo.
            foreach (var p in r.Personas ?? new ResultadoPersona[0])
            {
                if (Personas.TieneTrayectoria(p))
                {
                    personas.Add(await PersonaVista.ConTrayectoriaAsync(raiz, p, terreno, cuerpos));
                    continue;
                }

                var k = Array.FindIndex(r.Vehiculos, v => v.Id == p.VehiculoId);
                if (p.Ocupante == null || k < 0)
                {
                    continue;
                }

                var variantes = Personas.VariantesADibujar(p.Ocupante);
                for (var i = 0; i < variantes.Length; i++)
                {
                    // Sin cinturón declarado van las dos variantes; la segunda, de otro color.
                    personas.Add(await PersonaVista.OcupanteAsync(vehiculos[k].transform, p, r.Vehiculos[k], variantes[i], i > 0, cuerpos));
                }
            }

            if (piso != null)
            {
                piso.SetActive(e == null);
            }

            Camara.Abrir(caso);
            Camara.Vehiculos = vehiculos;
            Camara.Ocupantes.Clear();
            Camara.Ocupantes.AddRange(personas.FindAll(x => x.VehiculoId != null));
            Camara.Caso = this;
            Camara.Arbol = ArbolCercano(e, Camara.Centro);
            Camara.Estorbos.Clear();
            Camara.Bultos.Clear();
            Camara.Copas.Clear();
            foreach (var arbol in e?.Entorno?.Arboles ?? new ArbolEscenario[0])
            {
                if (arbol.Tipo != 2)
                {
                    Camara.Copas.Add(new Vector3((float)arbol.X, (float)arbol.Y, Mathf.Max(1.6f, (float)arbol.CopaM * 1.3f)));
                }
            }

            foreach (var ed in e?.Entorno?.Edificios ?? new EdificioEscenario[0])
            {
                Camara.Bultos.Add(new CamaraVisor.Bulto
                {
                    C = new Vector2((float)ed.X, (float)ed.Y),
                    U = new Vector2(Mathf.Cos((float)ed.RumboRad), Mathf.Sin((float)ed.RumboRad)),
                    Hw = (float)ed.LargoM / 2f,
                    Hd = (float)ed.FondoM / 2f,
                    Alto = ed.Tipo == TipoLote.Baldio ? 2.3f : (float)ed.AltoM,
                });
            }

            foreach (var l in e?.Luminarias ?? new LuminariaEscenario[0])
            {
                Camara.Estorbos.Add(new Vector2((float)l.X, (float)l.Y));
            }

            foreach (var p in e?.Entorno?.Postes ?? new PosteEscenario[0])
            {
                Camara.Estorbos.Add(new Vector2((float)p.X, (float)p.Y));
            }
            Fijar(inicio);
            // Lo que se mueve o cambia con el tiempo va en su capa: el minimapa lo dibuja por cuadro
            // sobre el fondo horneado de la escena fija.
            foreach (Transform hijo in raiz)
            {
                if (hijo.name == "caso" || hijo.name.StartsWith("persona_", StringComparison.Ordinal))
                {
                    foreach (var t in hijo.GetComponentsInChildren<Transform>(true))
                    {
                        t.gameObject.layer = CamaraVisor.CapaDinamica;
                    }
                }
            }

            Camara.VehiculosDelMinimapa.Clear();
            if (Calidad.Perfil.VehiculosUnidosEnMinimapa)
            {
                // Al final, con el vehículo ya armado: el minimapa lo dibuja con una sola malla.
                foreach (var v in vehiculos)
                {
                    var unido = VehiculoEnMinimapa.Crear(v.transform);
                    if (unido != null)
                    {
                        Camara.VehiculosDelMinimapa.Add(unido);
                    }
                }
            }

            if (Calidad.Perfil.SombrasUnidas)
            {
                // Lo fijo del escenario; lo del caso (evidencias, semáforos) cambia con el tiempo y se queda.
                SombrasUnidas.Unir(raiz.Find("escenario"), "sombras_del_escenario");
                foreach (Transform hijo in raiz)
                {
                    if (hijo.name.StartsWith("estacionado_", StringComparison.Ordinal))
                    {
                        SombrasUnidas.Unir(hijo, "sombra_vehiculo");
                    }
                }
            }

            if (Calidad.Perfil.MinimapaHorneado)
            {
                Camara.HornearMinimapa();
            }

            Calidad.Aplicar();
            Cargado = true;
            Calidad.Reiniciar();
        }

        /// <summary>
        /// La sombra de contacto: una mancha suave bajo la carrocería, que asienta el vehículo en el piso
        /// con cualquier luz. La sombra del sol sigue saliendo del mapa de sombras.
        /// </summary>
        private static void SombraDeContacto(Transform vehiculo, float largo, float ancho, bool noche)
        {
            var m = new Malla();
            var w = ancho / 2f + 0.3f;
            var l = largo / 2f + 0.3f;
            m.Tarjeta(new Vector3(-w, 0.035f, -l), new Vector3(w, 0.035f, -l), new Vector3(w, 0.035f, l), new Vector3(-w, 0.035f, l));
            var sombra = m.Poner(vehiculo, "sombra_contacto", Materiales.SombraContacto(noche ? 0.55f : 0.7f), false, false);
            if (Calidad.Perfil.MinimapaHorneado)
            {
                // En la capa de su vehículo: se mueve con él, y así no queda horneada en el fondo del
                // minimapa donde el vehículo empezó.
                sombra.layer = vehiculo.gameObject.layer;
            }
        }

        /// <summary>El árbol más cercano a la acción, para la cámara de la acera.</summary>
        private static Vector3? ArbolCercano(Escenario e, Vector3 centro)
        {
            Vector3? mejor = null;
            var distancia = float.MaxValue;
            foreach (var a in e?.Entorno?.Arboles ?? new ArbolEscenario[0])
            {
                if (a.Tipo == 2)
                {
                    continue;
                }

                var p = new Vector3((float)a.X, (float)a.Z, (float)a.Y);
                var d = (p - centro).magnitude;
                if (d < distancia)
                {
                    distancia = d;
                    mejor = p;
                }
            }

            return mejor;
        }

        public void Marcadores(bool visibles)
        {
            if (dinamica != null && dinamica.Marcadores != null)
            {
                dinamica.Marcadores.SetActive(visibles);
            }
        }

        public void Fijar(double t)
        {
            Tiempo = Math.Max(inicio, Math.Min(fin, t));
            foreach (var v in vehiculos)
            {
                v.Colocar(Tiempo);
            }

            foreach (var p in personas)
            {
                p.Colocar(Tiempo);
            }

            if (dinamica != null)
            {
                dinamica.Actualizar(Tiempo);
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
                if (Bucle)
                {
                    Fijar(inicio);
                }
                else
                {
                    Reproduciendo = false;
                }
            }
        }
    }

    /// <summary>Las piezas de un vehículo que cambian: calaveras y faros.</summary>
    public sealed class PartesVehiculo
    {
        public readonly List<MeshRenderer> Calaveras = new List<MeshRenderer>();
        public readonly List<MeshRenderer> Faros = new List<MeshRenderer>();
        public readonly Dictionary<MeshRenderer, Material[]> Originales = new Dictionary<MeshRenderer, Material[]>();
    }

    /// <summary>Un vehículo en la escena: su Transform sigue la trayectoria, y sus luces, lo que dice el paquete.</summary>
    public sealed class VehiculoVista : MonoBehaviour
    {
        private static readonly Color Rojo = new Color(0.9f, 0.05f, 0.03f);
        private bool noche;
        private bool frenando;

        public VehiculoTrayectoria Trayectoria { get; set; }
        public ResultadoVehiculo Datos { get; set; }
        public PartesVehiculo Partes { get; set; }

        /// <summary>
        /// Si se tiende después del impacto (dos ruedas que el solver arrastra caídas) y hacia qué lado:
        /// ±1; 0, no. La caída es ilustrativa: el solver no la calcula (ADR 0114).
        /// </summary>
        public int CaidaLado { get; set; }

        private EtiquetaMundo etiqueta;
        private List<Renderer> carroceria;
        private GameObject contorno;
        public TramoFreno[] Frenado { get; set; }

        /// <summary>El piso, para posar el vehículo sobre él cuando la trayectoria no trae altura.</summary>
        public Terreno Terreno { get; set; }

        /// <summary>Faros y calaveras de noche: brillan, y un foco ilumina el asfalto de adelante.</summary>
        public void Luces(bool esDeNoche, bool farosEncendidos, float largo)
        {
            noche = esDeNoche && farosEncendidos;
            if (Partes == null || !noche)
            {
                return;
            }

            foreach (var f in Partes.Faros)
            {
                Poner(f, Materiales.Emisivo(new Color(1f, 0.97f, 0.9f), new Color(9f, 8.5f, 7.5f)));
            }

            Calaveras(false);
            // En baja y media, un solo foco al centro, más abierto: alumbra lo mismo y cuesta la mitad.
            var unFoco = Calidad.Perfil.FocosPorVehiculo == 1;
            foreach (var lado in unFoco ? new[] { 0f } : new[] { -0.55f, 0.55f })
            {
                var luz = new GameObject("faro").AddComponent<Light>();
                luz.transform.SetParent(transform, false);
                luz.transform.localPosition = new Vector3(lado, 0.68f, largo / 2f - 0.15f);
                luz.transform.localRotation = Quaternion.Euler(7f, lado * 3f, 0f);
                luz.type = LightType.Spot;
                luz.spotAngle = unFoco ? 86f : 70f;
                luz.innerSpotAngle = 12f;
                luz.range = 55f;
                // Moderada: a quemarropa contra otra carrocería no debe tapar el punto de contacto.
                luz.intensity = unFoco ? 1050f : 650f;
                luz.color = new Color(1f, 0.95f, 0.86f);
                luz.shadows = LightShadows.None;
            }
        }

        private static void Poner(MeshRenderer r, Material m)
        {
            var ms = r.sharedMaterials;
            for (var i = 0; i < ms.Length; i++)
            {
                ms[i] = m;
            }

            r.sharedMaterials = ms;
        }

        private void Calaveras(bool freno)
        {
            if (Partes == null)
            {
                return;
            }

            foreach (var c in Partes.Calaveras)
            {
                if (freno)
                {
                    Poner(c, Materiales.Emisivo(Rojo, Rojo * 7f));
                }
                else if (noche)
                {
                    // De noche van encendidas tenues aunque no frene.
                    Poner(c, Materiales.Emisivo(Rojo * 0.7f, Rojo * 1.3f));
                }
                else
                {
                    c.sharedMaterials = Partes.Originales[c];
                }
            }
        }

        public void Colocar(double t)
        {
            var p = Ejes.AUnity(Muestreo.Pose(Trayectoria, t));
            var posicion = new Vector3((float)p.Px, (float)p.Py, (float)p.Pz);
            var giro = Quaternion.Euler((float)p.EulerX, (float)p.EulerY, (float)p.EulerZ);
            if (Terreno != null && !Terreno.Plano && (Trayectoria.Z == null || Trayectoria.Z.Length == 0))
            {
                // Provisional hasta W5: el solver todavía no entrega z, cabeceo ni alabeo, así que el
                // vehículo se posa sobre el piso dibujado. No cambia x, y ni el rumbo del Resultado.
                var adelante = giro * Vector3.forward;
                var derecha = giro * Vector3.right;
                float Z(Vector3 q) => Terreno.Z(q.x, q.z);
                var zf = Z(posicion + adelante * 1.3f);
                var zt = Z(posicion - adelante * 1.3f);
                var zd = Z(posicion + derecha * 0.75f);
                var zi = Z(posicion - derecha * 0.75f);
                posicion.y = (zf + zt + zd + zi) / 4f;
                giro *= Quaternion.Euler(-Mathf.Atan2(zf - zt, 2.6f) * Mathf.Rad2Deg, 0f, Mathf.Atan2(zd - zi, 1.5f) * Mathf.Rad2Deg);
            }

            if (CaidaLado != 0 && Datos != null)
            {
                // Tendida sobre su costado: gira sobre su eje largo y sube lo que mide de lado.
                var alabeo = (float)Caida.Alabeo(CaidaLado, t);
                giro *= Quaternion.Euler(0f, 0f, -alabeo * Mathf.Rad2Deg);
                posicion.y += Mathf.Abs(Mathf.Sin(alabeo)) * (float)Datos.Dimensiones.AnchoM * 0.45f;
                Etiqueta(t, posicion);
            }

            transform.SetPositionAndRotation(posicion, giro);
            var frena = false;
            if (Frenado != null)
            {
                foreach (var f in Frenado)
                {
                    frena |= t >= f.Desde && t <= f.Hasta;
                }
            }

            if (frena != frenando)
            {
                frenando = frena;
                Calaveras(frena);
            }
        }

        /// <summary>
        /// «Posición final ilustrativa» sobre la moto en reposo: el solver no calcula cómo cae, así que
        /// la pose tendida no es un resultado.
        /// </summary>
        private void Etiqueta(double t, Vector3 donde)
        {
            if (etiqueta == null)
            {
                etiqueta = EtiquetaMundo.Crear(transform.parent, "Posición final ilustrativa");
            }

            etiqueta.Mostrar(t >= Caida.Reposo(Trayectoria) - 1e-6, donde + Vector3.up * 1.1f);
        }

        /// <summary>
        /// La vista desde el asiento (U4, René 2026-11-10): sin la carrocería propia, salvo un contorno
        /// tenue del cofre y de los postes, para que se vea lo que el conductor alcanzaba a ver.
        /// </summary>
        public void DesdeElAsiento(bool si)
        {
            if (carroceria == null)
            {
                carroceria = new List<Renderer>();
                foreach (var r in GetComponentsInChildren<Renderer>(true))
                {
                    // Los ocupantes los esconde la cámara; aquí solo la carrocería.
                    if (r.GetComponentInParent<PersonaVista>() == null)
                    {
                        carroceria.Add(r);
                    }
                }
            }

            foreach (var r in carroceria)
            {
                if (r != null)
                {
                    r.enabled = !si;
                }
            }

            if (si && contorno == null && Datos != null && !PerfilClase.De(Datos.Clase).DosRuedas)
            {
                contorno = Contorno.Armar(transform, Datos);
            }

            if (contorno != null)
            {
                contorno.SetActive(si);
            }
        }
    }

    /// <summary>
    /// El contorno de referencia de la vista del conductor: el borde del cofre y los postes del
    /// parabrisas, en trazos finos y tenues, a la medida del vehículo. Es una referencia, no el modelo.
    /// </summary>
    public static class Contorno
    {
        private const float Grosor = 0.007f;

        public static GameObject Armar(Transform vehiculo, ResultadoVehiculo v)
        {
            var d = v.Dimensiones;
            var largo = (float)d.LargoM;
            var ancho = (float)d.AnchoM;
            var alto = (float)d.AltoM;
            var p = PerfilClase.De(v.Clase);
            // La cintura: donde termina la lámina y empieza el vidrio (la misma regla del daño).
            var cintura = Mathf.Max((float)p.AlturaLibre + 0.25f, (float)p.Cintura * alto);
            // Los de cabina adelante (van, combi, autobús, camión) casi no tienen cofre.
            var cofre = v.Clase == "van" || v.Clase == "microbus_combi" || v.Clase == "autobus"
                || v.Clase == "camion_unitario" || v.Clase == "tractocamion"
                ? 0.08f * largo
                : 0.28f * largo;
            var frente = largo / 2f - 0.06f;
            var baseParabrisas = largo / 2f - cofre;
            var m = new Malla();
            var x = ancho / 2f - 0.12f;
            // El borde del frente del cofre y sus dos orillas.
            Trazo(m, new Vector3(-x, cintura, frente), new Vector3(x, cintura, frente));
            Trazo(m, new Vector3(-x, cintura, frente), new Vector3(-x, cintura + 0.06f, baseParabrisas));
            Trazo(m, new Vector3(x, cintura, frente), new Vector3(x, cintura + 0.06f, baseParabrisas));
            // Los postes del parabrisas y el borde del techo.
            var arriba = alto - 0.06f;
            var techo = baseParabrisas - Mathf.Min(0.8f, (arriba - cintura) * 1.1f);
            var xt = ancho / 2f - 0.22f;
            Trazo(m, new Vector3(-x, cintura + 0.06f, baseParabrisas), new Vector3(-xt, arriba, techo));
            Trazo(m, new Vector3(x, cintura + 0.06f, baseParabrisas), new Vector3(xt, arriba, techo));
            Trazo(m, new Vector3(-xt, arriba, techo), new Vector3(xt, arriba, techo));
            var go = m.Poner(vehiculo, "contorno_conductor", Materiales.Calca(new Color(0.55f, 0.58f, 0.62f, 0.2f)), false, false);
            go.layer = vehiculo.gameObject.layer;
            return go;
        }

        /// <summary>Un trazo fino de `a` a `b`: un prisma de cuatro caras, visible desde cualquier lado.</summary>
        private static void Trazo(Malla m, Vector3 a, Vector3 b)
        {
            var eje = (b - a).normalized;
            var u = Vector3.Cross(eje, Mathf.Abs(eje.y) > 0.9f ? Vector3.right : Vector3.up).normalized * Grosor;
            var w = Vector3.Cross(eje, u).normalized * Grosor;
            var esquinas = new[] { u + w, u - w, -u - w, -u + w };
            for (var k = 0; k < 4; k++)
            {
                var c0 = esquinas[k];
                var c1 = esquinas[(k + 1) % 4];
                m.Cuadro(a + c0, b + c0, b + c1, a + c1, 1f, true);
            }
        }
    }

    /// <summary>Un letrero en pantalla sobre un punto de la escena (el texto de la leyenda, en chico).</summary>
    public sealed class EtiquetaMundo : MonoBehaviour
    {
        private RectTransform lienzo;
        private Text texto;
        private bool visible;
        private Vector3 donde;

        public static EtiquetaMundo Crear(Transform padre, string mensaje)
        {
            var go = new GameObject("etiqueta");
            go.transform.SetParent(padre, false);
            var canvas = go.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = 90;
            var escala = go.AddComponent<CanvasScaler>();
            escala.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            escala.referenceResolution = new Vector2(1280, 720);
            var e = go.AddComponent<EtiquetaMundo>();
            e.lienzo = (RectTransform)go.transform;
            e.texto = new GameObject("texto").AddComponent<Text>();
            e.texto.transform.SetParent(go.transform, false);
            e.texto.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            e.texto.fontSize = 13;
            e.texto.color = new Color(1f, 1f, 1f, 0.95f);
            e.texto.alignment = TextAnchor.MiddleCenter;
            e.texto.text = mensaje;
            e.texto.rectTransform.sizeDelta = new Vector2(260f, 22f);
            var sombra = e.texto.gameObject.AddComponent<Outline>();
            sombra.effectColor = new Color(0f, 0f, 0f, 0.8f);
            e.texto.enabled = false;
            return e;
        }

        /// <summary>Lo que se pide al fijar el instante; la posición en pantalla se calcula en cada cuadro.</summary>
        public void Mostrar(bool siVisible, Vector3 punto)
        {
            visible = siVisible;
            donde = punto;
        }

        // Después de que la cámara se acomodó (la cinematográfica se mueve sola aun en pausa).
        private void LateUpdate()
        {
            var camara = Camera.main;
            if (!visible || camara == null)
            {
                texto.enabled = false;
                return;
            }

            var p = camara.WorldToScreenPoint(donde);
            if (p.z <= 0f)
            {
                texto.enabled = false;
                return;
            }

            RectTransformUtility.ScreenPointToLocalPointInRectangle(lienzo, p, null, out var local);
            texto.rectTransform.anchoredPosition = local;
            texto.enabled = true;
        }
    }
}
