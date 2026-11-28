using System;
using System.Linq;
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

        /// <summary>Los vehículos de la versión superpuesta (ADR 0123): translúcidos, sin daño, con el mismo reloj.</summary>
        private readonly List<VehiculoVista> fantasmas = new List<VehiculoVista>();

        // El énfasis del impacto (ronda 4, punto 5): su instante, la marca y los restos.
        private double tImpacto = double.NaN;
        private ImpactoVista impacto;

        /// <summary>La cámara lenta automática en el impacto (encendida por omisión).</summary>
        public bool EnfasisActivo { get; set; } = true;

        /// <summary>El instante del primer impacto del caso (NaN si no hay).</summary>
        public double TImpacto => tImpacto;

        /// <summary>El azul claro del fantasma, translúcido.</summary>
        private static readonly Color ColorFantasma = new Color(0.55f, 0.78f, 1f, 0.35f);

        /// <summary>Lo que se suma al instante de la reconstrucción para tener el de la versión (s).</summary>
        private double desfaseFantasma;
        private string etiquetaFantasma;

        /// <summary>El piso del modo «mapa real» (ADR 0124).</summary>
        private readonly PisoMapaVista pisoMapa = new PisoMapaVista();

        /// <summary>Lo del escenario que apagó el mapa, para prenderlo igual al quitarlo.</summary>
        private readonly List<GameObject> apagadosPorElMapa = new List<GameObject>();

        /// <summary>
        /// Lo del escenario que se queda con el mapa: la leyenda, la sonda de reflejos (se vuelve a
        /// tomar), la lluvia y la luz de las luminarias (de noche el piso se ve con la luz del caso).
        /// Calles, suelo, edificios, árboles, cerros, postes y charcos se apagan.
        /// </summary>
        private static readonly HashSet<string> SeQuedanConElMapa = new HashSet<string>
        {
            "leyenda", "sonda_reflejos", "lluvia", "lluvia_particulas", "salpicaduras", "luz_luminaria",
        };

        private bool conEscenario;
        private Terreno terrenoDelCaso = new Terreno();

        /// <summary>Mientras se arma un caso, el mensaje `piso` espera a que termine (gana sobre el del paquete).</summary>
        private bool cargando;
        private bool hayPisoPendiente;
        private Piso pisoPendiente;

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
            letreroLenta = Letrero();
        }

        /// <summary>«Cámara lenta ×N», arriba al centro, mientras la reproducción va más lenta que el tiempo real.</summary>
        private GameObject letreroLenta;
        private Text textoLenta;

        private GameObject Letrero()
        {
            var go = new GameObject("letrero_camara_lenta");
            go.transform.SetParent(transform, false);
            var canvas = go.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = 101;
            var escala = go.AddComponent<CanvasScaler>();
            escala.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            escala.referenceResolution = new Vector2(1280, 720);
            // El mismo recuadro de la leyenda (contraste AA de día y de noche, `Leyenda3d`).
            var fondo = new GameObject("fondo").AddComponent<Image>();
            fondo.transform.SetParent(go.transform, false);
            var f = Leyenda3d.Fondo;
            fondo.color = new Color((float)f.R, (float)f.G, (float)f.B, (float)f.A);
            fondo.raycastTarget = false;
            var caja = fondo.gameObject.AddComponent<HorizontalLayoutGroup>();
            caja.padding = new RectOffset(12, 12, 5, 5);
            caja.childControlWidth = true;
            caja.childControlHeight = true;
            var ajuste = fondo.gameObject.AddComponent<ContentSizeFitter>();
            ajuste.horizontalFit = ContentSizeFitter.FitMode.PreferredSize;
            ajuste.verticalFit = ContentSizeFitter.FitMode.PreferredSize;
            var rf = fondo.rectTransform;
            rf.anchorMin = rf.anchorMax = rf.pivot = new Vector2(0.5f, 1f);
            rf.anchoredPosition = new Vector2(0f, -14f);
            textoLenta = new GameObject("texto").AddComponent<Text>();
            textoLenta.transform.SetParent(fondo.transform, false);
            textoLenta.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            textoLenta.fontSize = 18;
            textoLenta.fontStyle = FontStyle.Bold;
            var t = Leyenda3d.Texto;
            textoLenta.color = new Color((float)t.R, (float)t.G, (float)t.B, (float)t.A);
            textoLenta.horizontalOverflow = HorizontalWrapMode.Overflow;
            textoLenta.raycastTarget = false;
            go.SetActive(false);
            return go;
        }

        /// <summary>Si algún vehículo trae trayecto previo, y dónde empieza la reconstrucción.</summary>
        private bool hayPrevio;
        private double tInicioResultado;

        /// <summary>Lo que dice el letrero mientras un vehículo va por su trayecto previo (también en pausa: el video se graba así).</summary>
        public const string LetreroPrevio = "Trayecto ilustrativo: no es evidencia";

        private void MostrarLetrero(double ritmo)
        {
            var texto = hayPrevio && Tiempo < tInicioResultado - 1e-6
                ? LetreroPrevio
                : Reproduciendo ? EnfasisImpacto.EtiquetaCamaraLenta(ritmo) : null;
            if (texto != null && textoLenta.text != texto)
            {
                textoLenta.text = texto;
            }

            if (letreroLenta.activeSelf != (texto != null))
            {
                letreroLenta.SetActive(texto != null);
            }
        }

        /// <summary>
        /// Cuánto tardó cada paso de la última carga (ms), para saber en qué se va el tiempo hasta ver
        /// el caso (U6). Lo contesta `depurar` `{"carga": true}` y queda en la bitácora.
        /// </summary>
        public Dictionary<string, double> PasosDeCarga { get; } = new Dictionary<string, double>();

        private System.Diagnostics.Stopwatch reloj;

        /// <summary>Lo que tardó leer el último mensaje `cargarCaso` (ms) y cuánto medía el paquete.</summary>
        public (double Sobre, double Paquete, int Caracteres) LecturaDelPaquete { get; set; }

        private void Paso(string nombre)
        {
            PasosDeCarga[nombre] = Math.Round(reloj.Elapsed.TotalMilliseconds, 1);
        }

        /// <summary>
        /// El turno de la carga más nueva (René, 2026-11-20: Tollocan tronaba). La web manda otro
        /// `cargarCaso` cuando cambia la escena (las calles del mapa llegan después); la carga nueva destruye
        /// la anterior, y la anterior, al volver de un `await`, tocaba lo destruido. Ahora se detiene ahí
        /// (`CargaReemplazada`), sin tocar nada ni avisar «error».
        /// </summary>
        private int turnoDeCarga;

        /// <summary>Si la carga `mio` ya no es la más nueva, se detiene.</summary>
        private void Vigente(int mio)
        {
            if (mio != turnoDeCarga)
            {
                throw new CargaReemplazada();
            }
        }

        public async Awaitable CargarAsync(Caso3D caso)
        {
            var mio = ++turnoDeCarga;
            leyendaVisible = true;
            danoMedido = Array.Exists(caso.Resultado?.Vehiculos ?? new ResultadoVehiculo[0], v => DanoDelCaso.UsaMedido(v.Dano));
            Omisiones.Limpiar();
            PasosDeCarga.Clear();
            PasosDeCarga["leer_sobre"] = Math.Round(LecturaDelPaquete.Sobre, 1);
            PasosDeCarga["leer_paquete"] = Math.Round(LecturaDelPaquete.Paquete, 1);
            PasosDeCarga["caracteres_paquete"] = LecturaDelPaquete.Caracteres;
            reloj = System.Diagnostics.Stopwatch.StartNew();
            Reproduciendo = false;
            Cargado = false;
            // Un caso nuevo empieza sin el piso ni el fantasma del anterior: los trae el paquete o el
            // mensaje `piso` que llegue mientras se arma.
            cargando = true;
            hayPisoPendiente = false;
            pisoPendiente = null;
            pisoMapa.Quitar();
            apagadosPorElMapa.Clear();
            if (raiz != null)
            {
                Destroy(raiz.gameObject);
            }

            vehiculos.Clear();
            personas.Clear();
            fantasmas.Clear();
            desfaseFantasma = 0.0;
            etiquetaFantasma = null;
            dinamica = null;
            impacto = null;
            tImpacto = double.NaN;
            raiz = new GameObject("Caso").transform;
            var r = caso.Resultado;
            var e = caso.Escenario;
            var noche = e != null && e.Ambiente.Noche;
            // El cielo del caso baja mientras se arman los vehículos (en la web es un archivo aparte).
            var cielo = e != null ? Cielos.CargarAsync(EscenarioVista.NombreDelCielo(e.Ambiente)) : null;
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
                try
                {
                    vista.Partes = await modelos.ArmarAsync(go.transform, v, color);
                }
                catch (Exception ex) when (!(ex is CargaReemplazada))
                {
                    // Sin su modelo (o con un dato que no se pudo leer), el vehículo va como una caja con sus
                    // medidas y el perito lo sabe: no se abre el visor de respaldo por eso.
                    Vigente(mio);
                    Omisiones.Anotar("el modelo de " + v.Id + " (va como una caja con sus medidas)", ex);
                    var d = v.Dimensiones;
                    Omisiones.Intentar("la caja de " + v.Id, () => ArmadorVehiculo.Procedural(
                        go.transform, new MedidasVehiculo(d.LargoM, d.AnchoM, d.AltoM, d.DistanciaEntreEjesM)));
                }

                Vigente(mio);
                // El daño del solver sobre la carrocería: se prepara aquí y se ve desde su impacto.
                Omisiones.Intentar("el daño de " + v.Id, () => vista.Dano = DanoVista.Preparar(go.transform, v, r));
                // Un roce bajo el umbral de CRASH3 no hunde la lámina: rayones y la pintura del otro.
                Omisiones.Intentar("el roce de " + v.Id, () =>
                {
                    var contra = RozaduraDelCaso.De(v, r)?.Contra;
                    var otro = contra != null && e?.Vehiculos != null ? Array.Find(e.Vehiculos, x => x.Id == contra) : null;
                    vista.Roce = RozaduraVista.Preparar(go.transform, v, r, color, otro?.Color != null ? Materiales.Hex(otro.Color, Color.gray) : (Color?)null);
                });
                vista.Frenado = extra?.Frenado;
                // De dónde venía (ilustrativo, no evidencia): antes de `t_inicio` va por su trayecto previo.
                vista.Previo = Previo.Hay(extra?.TrayectoPrevio) ? extra.TrayectoPrevio : null;
                vista.TInicioResultado = r.TInicio;
                Omisiones.Intentar("las luces de " + v.Id, () => vista.Luces(noche, extra == null || extra.Faros, (float)v.Dimensiones.LargoM));
                foreach (var tr in go.GetComponentsInChildren<Transform>(true))
                {
                    tr.gameObject.layer = EscenarioVista.CapaVehiculos;
                }

                if (Calidad.Perfil.SombrasUnidas)
                {
                    Omisiones.Intentar("la sombra de " + v.Id, () => SombrasUnidas.Unir(go.transform, "sombra_vehiculo"));
                }

                if (e != null)
                {
                    Omisiones.Intentar("la sombra de contacto de " + v.Id, () => SombraDeContacto(go.transform, (float)v.Dimensiones.LargoM, (float)v.Dimensiones.AnchoM, noche));
                }
                vehiculos.Add(vista);
            }

            // Con escenario (ADR 0112) se dibuja lo que calculó TS y se esconde el piso liso de U1.
            // El piso es plano salvo que la escena declare terreno (C3): entonces todo se arma sobre él.
            // El relieve real del lugar, si el caso lo trae (ronda 4): el piso sube y baja como el del solver.
            Terreno terreno = null;
            if (!Omisiones.Intentar("el relieve real (el piso va plano)", () => terreno = TerrenoVista.De(e?.Terreno, RelieveMalla.De(caso.Relieve), e?.Estructura)))
            {
                terreno = TerrenoVista.De(e?.Terreno, null, e?.Estructura);
            }
            var zona = Encuadre.ZonaDeInteres(r);
            EscenarioVista.CentroDelHecho = new Vector2((float)zona.CentroX, (float)zona.CentroY);
            EscenarioVista.ClaroDelHecho = (float)zona.Lado * 0.6f + 4f;
            if (e != null)
            {
                Paso("vehiculos");
                await cielo;
                Vigente(mio);
                Paso("cielo");
            // El camellón (de las calles de OSM del caso) y el paisaje árido, antes de armar el entorno:
            // quitan lo que no va y ponen sus árboles (docs/contrato-unity.md §3).
            List<List<Camellon.Punto>> camellones = null;
            Omisiones.Intentar("el camellón", () =>
            {
                var lugar = caso.Escena?.Lugar;
                camellones = Camellon.Buscar(lugar?.RedVial?.Vias, lugar?.AnchoCarril?.Valor ?? 3.5, e.Centro.X, e.Centro.Y, 180);
                Camellon.Despejar(e, camellones);
                var arboles = Camellon.Arbolado(camellones, e.Entorno?.Arboles, e.Semilla);
                foreach (var a in arboles)
                {
                    a.Z = terreno.Z((float)a.X, (float)a.Y) + CamellonVista.Alto;
                }

                if (e.Entorno != null && arboles.Count > 0)
                {
                    e.Entorno.Arboles = (e.Entorno.Arboles ?? new ArbolEscenario[0]).Concat(arboles).ToArray();
                }
            });
            Omisiones.Intentar("el paisaje árido", () => Paisaje.Arido(e));
            Omisiones.Intentar("la calzada despejada", () => Calzada.Despejar(e));
            // Y donde pasa un vehículo del caso, sin defensas atravesadas en su recorrido.
            Omisiones.Intentar("las defensas fuera del recorrido", () => Calzada.AbrirPasoEnBarreras(e, (r.Vehiculos ?? new ResultadoVehiculo[0])
                .Where(v => v.Trayectoria?.X != null && v.Dimensiones != null)
                .Select(v => new Calzada.Recorrido { X = v.Trayectoria.X, Y = v.Trayectoria.Y, Medio = v.Dimensiones.AnchoM / 2.0 + Calzada.HolguraRecorrido })
                .ToList()));
            Omisiones.Intentar("el escenario", () => EscenarioVista.Construir(raiz, e, sol, Camera.main, terreno));
            Omisiones.Intentar("el camellón", () => CamellonVista.Construir(raiz.Find("escenario"), camellones, terreno, e.Ambiente, e.Semilla));
            Paso("escenario");
            }
            else
            {
                // Sin escenario no hay entorno que aclarar, pero la vista sigue siendo ilustrativa.
                EscenarioVista.Leyenda(raiz, false);
            }

            Omisiones.Intentar("el terreno", () => TerrenoVista.Dibujar(raiz, e?.Terreno, terreno, e != null && e.Ambiente.Mojado));
            Omisiones.Intentar("los objetos y las marcas del caso", () => dinamica = CasoVista.Construir(raiz, caso, terreno, noche));
            Omisiones.Intentar("el énfasis del impacto", () =>
            {
                tImpacto = r.PuntoImpacto != null ? Fantasmas.TImpacto(r) : double.NaN;
                impacto = ImpactoVista.Construir(raiz, r, tImpacto, terreno, noche);
            });
            // El trayecto previo: la reproducción empieza donde empieza el más largo, con su ruta punteada
            // y el entorno lejano ligero.
            inicio = Previo.InicioDelCaso(r.TInicio, vehiculos.Select(x => x.Previo));
            tInicioResultado = r.TInicio;
            hayPrevio = inicio < r.TInicio;
            if (hayPrevio)
            {
                Omisiones.Intentar("el trayecto previo", () => RutaPreviaVista.Construir(raiz, vehiculos, terreno, e?.Suelo, e?.Entorno?.Paisaje, noche));
            }

            Paso("caso_y_terreno");
            Omisiones.Intentar("la edición en 3D", () => Editor.Preparar(r.Objetos, terreno));
            foreach (var v in vehiculos)
            {
                v.Terreno = terreno;
            }

            try
            {
                await ArmarFantasmasAsync(caso, terreno, mio);
            }
            catch (Exception ex) when (!(ex is CargaReemplazada))
            {
                Omisiones.Anotar("la versión superpuesta", ex);
            }

            Vigente(mio);

            // Los vehículos estacionados, con el modelo de su clase y quietos (antes salían como una caja
            // de tabique). Sus medidas son las del objeto; sin clase, un sedán.
            foreach (var o in r.Objetos ?? new ResultadoObjeto[0])
            {
                if (o.Tipo != PurpleTipo.VehiculoEstacionado)
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

                Vigente(mio);

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
                    var persona = await PersonaVista.ConTrayectoriaAsync(raiz, p, terreno, cuerpos);
                    Vigente(mio);
                    personas.Add(persona);
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
                    var persona = await PersonaVista.OcupanteAsync(vehiculos[k].transform, p, r.Vehiculos[k], variantes[i], i > 0, cuerpos);
                    Vigente(mio);
                    personas.Add(persona);
                }
            }

            if (piso != null)
            {
                piso.SetActive(e == null);
            }

            Paso("estacionados_y_personas");
            Camara.Abrir(caso);
            Camara.Vehiculos = vehiculos;
            Camara.Ocupantes.Clear();
            Camara.Ocupantes.AddRange(personas.FindAll(x => x.VehiculoId != null));
            Camara.Peatones.Clear();
            Camara.Peatones.AddRange(personas.FindAll(x => x.VehiculoId == null));
            Camara.Caso = this;
            Camara.Arbol = ArbolCercano(e, Camara.Centro);
            Camara.Estorbos.Clear();
            Camara.Bultos.Clear();
            Camara.Copas.Clear();
            Camara.Troncos.Clear();
            foreach (var arbol in e?.Entorno?.Arboles ?? new ArbolEscenario[0])
            {
                if (arbol.Tipo != 2)
                {
                    Camara.Copas.Add(new Vector3((float)arbol.X, (float)arbol.Y, Mathf.Max(1.6f, (float)arbol.CopaM * 1.3f)));
                }

                Camara.Troncos.Add(new Vector4((float)arbol.X, (float)arbol.Y, 0.35f, (float)(arbol.AlturaM ?? 6.0) * 0.5f));
            }

            // Lo del caso (el árbol, el poste, el muro del choque) también tapa: las cámaras lo rodean.
            foreach (var o in r.Objetos ?? new ResultadoObjeto[0])
            {
                switch (o.Forma)
                {
                    case Forma.Arbol:
                        // Solo el tronco: la copa del árbol del choque está sobre el contacto y descartaría
                        // toda toma hacia él.
                        Camara.Troncos.Add(new Vector4((float)o.X, (float)o.Y, Mathf.Max(0.3f, (float)(o.RadioM ?? 0.2) * 1.5f), (float)(o.Copa?.TroncoAltoM ?? o.AltoM * 0.4)));
                        break;
                    case Forma.Cilindro:
                        Camara.Troncos.Add(new Vector4((float)o.X, (float)o.Y, Mathf.Max(0.3f, (float)(o.RadioM ?? 0.2) * 1.5f), (float)o.AltoM));
                        break;
                    default:
                        if (o.LargoM > 0.5 && o.AltoM > 1.0)
                        {
                            var rumbo = (float)(o.RumboDeg * Math.PI / 180.0);
                            Camara.Bultos.Add(new CamaraVisor.Bulto
                            {
                                C = new Vector2((float)o.X, (float)o.Y),
                                U = new Vector2(Mathf.Cos(rumbo), Mathf.Sin(rumbo)),
                                Hw = (float)o.LargoM / 2f,
                                Hd = (float)Math.Max(o.AnchoM, 0.2) / 2f,
                                Alto = (float)o.AltoM,
                            });
                        }

                        break;
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
                Camara.Troncos.Add(new Vector4((float)l.X, (float)l.Y, 0.3f, (float)l.AlturaM));
            }

            foreach (var p in e?.Entorno?.Postes ?? new PosteEscenario[0])
            {
                Camara.Estorbos.Add(new Vector2((float)p.X, (float)p.Y));
                Camara.Troncos.Add(new Vector4((float)p.X, (float)p.Y, 0.3f, 9f)); // el poste del entorno no trae su altura
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
                        // Las copas conservan su capa: «Desde arriba» no las dibuja.
                        if (t.gameObject.layer != CamaraVisor.CapaCopas)
                        {
                            t.gameObject.layer = CamaraVisor.CapaDinamica;
                        }
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
                Paso("antes_de_unir_sombras");
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
                Paso("sombras_unidas");
                Camara.HornearMinimapa();
            }

            // El piso del mapa real, después de unir las sombras (la unión del escenario se apaga con él)
            // y antes de que se hornee el minimapa, unos cuadros después (lo lleva de fondo). El del
            // mensaje gana al del paquete.
            conEscenario = e != null;
            terrenoDelCaso = terreno;
            Camara.Terreno = terreno;
            var pedido = hayPisoPendiente ? pisoPendiente : caso.Piso;
            hayPisoPendiente = false;
            pisoPendiente = null;
            cargando = false;
            if (pedido != null && pedido.Imagen != null)
            {
                try
                {
                    PonerPiso(pedido);
                }
                catch (FormatException ex)
                {
                    // Un piso que no sirve no detiene la reconstrucción: queda el entorno procedural. No se
                    // avisa con `error`: la web lo tomaría como falla de la carga.
                    Debug.LogWarning("[piso] " + ex.Message);
                }
            }

            ActualizarLeyenda();
            Paso("piso");

            Calidad.Aplicar();
            Cargado = true;
            Calidad.Reiniciar();
            Paso("total");
            // El primer cuadro con la escena completa: ahí se compilan sus shaders y se suben sus texturas.
            await Awaitable.NextFrameAsync();
            Vigente(mio);
            Paso("primer_cuadro");
            await Awaitable.NextFrameAsync();
            Vigente(mio);
            Paso("segundo_cuadro");
            Debug.Log("[carga] " + string.Join(", ", PasosDeCarga.Select(kv => kv.Key + " " + kv.Value + " ms")));
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

        /// <summary>
        /// Los vehículos de la versión superpuesta (ADR 0123): el mismo modelo que en la reconstrucción,
        /// con un material translúcido y sin daño, sombras, luces ni minimapa propio. Van en la capa de
        /// los vehículos: fuera de la sonda de reflejos y del fondo horneado del minimapa. Las cámaras no
        /// los conocen. Solo los que en la versión van por otro lado (`Fantasmas.VehiculosADibujar`).
        /// </summary>
        private async Awaitable ArmarFantasmasAsync(Caso3D caso, Terreno terreno, int mio)
        {
            var version = caso.Fantasma?.Resultado;
            if (version?.Vehiculos == null)
            {
                return;
            }

            var hipotesis = Fantasmas.EsHipotesis(caso.Fantasma.Etiqueta);
            desfaseFantasma = Fantasmas.Desfase(caso.Resultado, version, hipotesis);
            var letrero = Fantasmas.Letrero(caso.Fantasma.Etiqueta);
            var dibujar = Fantasmas.VehiculosADibujar(caso.Resultado, version);
            var material = Materiales.Calca(ColorFantasma, 0.4f);
            foreach (var v in version.Vehiculos)
            {
                if (Array.IndexOf(dibujar, v.Id) < 0)
                {
                    continue;
                }

                var go = new GameObject("fantasma_version_" + v.Id);
                go.transform.SetParent(raiz, false);
                try
                {
                    await modelos.ArmarAsync(go.transform, v, (Color?)null);
                    Vigente(mio);
                }
                catch (ModeloNoCargo ex)
                {
                    // Sin su modelo, la versión no tapa la reconstrucción: se queda sin ese fantasma.
                    Debug.LogWarning("[fantasma] " + ex.Message);
                    Destroy(go);
                    continue;
                }

                foreach (var r in go.GetComponentsInChildren<Renderer>(true))
                {
                    var ms = r.sharedMaterials;
                    for (var i = 0; i < ms.Length; i++)
                    {
                        ms[i] = material;
                    }

                    r.sharedMaterials = ms;
                    r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
                    r.receiveShadows = false;
                }

                foreach (var t in go.GetComponentsInChildren<Transform>(true))
                {
                    t.gameObject.layer = EscenarioVista.CapaVehiculos;
                }

                var vista = go.AddComponent<VehiculoVista>();
                vista.Trayectoria = v.Trayectoria;
                vista.Datos = v;
                vista.Terreno = terreno;
                // Su propio daño (el de su `resultado`), en su instante: con otra velocidad, otra deformación.
                Omisiones.Intentar("el daño de la versión de " + v.Id, () => vista.Dano = DanoVista.Preparar(go.transform, v, version));
                vista.Letrero = EtiquetaMundo.CrearDestacada(go.transform, letrero);
                vista.AltoLetrero = (float)(v.Dimensiones?.AltoM ?? 1.5) + 0.7f;
                fantasmas.Add(vista);
            }

            Camara.Fantasmas.Clear();
            Camara.Fantasmas.AddRange(fantasmas);
            if (fantasmas.Count > 0)
            {
                etiquetaFantasma = string.IsNullOrWhiteSpace(caso.Fantasma.Etiqueta) ? "otra versión del caso" : caso.Fantasma.Etiqueta;
            }
        }

        /// <summary>
        /// El mensaje `piso` (puente 1.3.0): pone la imagen del mapa real, o con `Imagen` nula vuelve al
        /// entorno procedural, sin recargar el caso. Mientras se arma un caso, espera a que termine.
        /// </summary>
        /// <exception cref="FormatException">La imagen o sus medidas no sirven; el piso queda como estaba.</exception>
        public void CambiarPiso(Piso p)
        {
            if (cargando)
            {
                pisoPendiente = p;
                hayPisoPendiente = true;
                return;
            }

            if (raiz == null)
            {
                return;
            }

            if (p == null || p.Imagen == null)
            {
                if (!pisoMapa.Puesto)
                {
                    return;
                }

                pisoMapa.Quitar();
                Entorno(true);
            }
            else
            {
                PonerPiso(p);
            }

            // El fondo del minimapa cambia con el piso; y es otra carga de dibujo.
            if (Calidad.Perfil.MinimapaHorneado)
            {
                Camara.HornearMinimapa();
            }

            Calidad.Reiniciar();
        }

        /// <summary>Abre la imagen (si no sirve, nada cambia), la pone y apaga el entorno procedural.</summary>
        private void PonerPiso(Piso p)
        {
            PisoMapa.Revisar(p.CentroX, p.CentroY, p.LadoM);
            var tex = PisoMapaVista.Abrir(p.Imagen);
            pisoMapa.Poner(raiz, tex, p.CentroX, p.CentroY, p.LadoM, p.Atribucion, terrenoDelCaso);
            Entorno(false);
        }

        /// <summary>
        /// Prende o apaga lo procedural del escenario (calles, suelo, edificios, árboles, cerros, postes,
        /// charcos y la unión de sus sombras), toma de nuevo la sonda de reflejos y cambia la leyenda.
        /// Lo del caso (vehículos, personas, daño, evidencias, marcadores, objetos y terreno declarados),
        /// el cielo y la luz no se tocan.
        /// </summary>
        private void Entorno(bool procedural)
        {
            var escenario = raiz != null ? raiz.Find("escenario") : null;
            if (procedural)
            {
                foreach (var go in apagadosPorElMapa)
                {
                    if (go != null)
                    {
                        go.SetActive(true);
                    }
                }

                apagadosPorElMapa.Clear();
            }
            else if (escenario != null)
            {
                foreach (Transform hijo in escenario)
                {
                    if (!SeQuedanConElMapa.Contains(hijo.name) && hijo.gameObject.activeSelf)
                    {
                        hijo.gameObject.SetActive(false);
                        apagadosPorElMapa.Add(hijo.gameObject);
                    }
                }
            }

            if (piso != null)
            {
                // El piso liso de U1 solo va en un caso sin escenario y sin mapa.
                piso.SetActive(procedural && !conEscenario);
            }

            var sonda = escenario != null ? escenario.Find("sonda_reflejos") : null;
            var reflejos = sonda != null ? sonda.GetComponent<ReflectionProbe>() : null;
            if (reflejos != null)
            {
                reflejos.RenderProbe();
            }

            ActualizarLeyenda();
        }

        /// <summary>
        /// Si se ve la leyenda ilustrativa de Unity (puente 1.4.0, mensaje `leyenda`). La web la apaga
        /// solo mientras pone la suya encima (Presentar). Cada caso cargado empieza con ella a la vista.
        /// </summary>
        public bool LeyendaVisible
        {
            get => leyendaVisible;
            set
            {
                leyendaVisible = value;
                var texto = EscenarioVista.TextoDeLeyenda(raiz);
                var lienzo = texto != null ? texto.GetComponentInParent<Canvas>(true) : null;
                if (lienzo != null)
                {
                    lienzo.gameObject.SetActive(value);
                }
            }
        }

        private bool leyendaVisible = true;

        private void ActualizarLeyenda()
        {
            var texto = EscenarioVista.TextoDeLeyenda(raiz);
            if (texto != null)
            {
                texto.text = Leyenda3d.Mensaje(conEscenario, pisoMapa.Puesto ? pisoMapa.Atribucion : null, etiquetaFantasma, danoMedido);
            }
        }

        /// <summary>Si algún vehículo del caso se dibuja con los C1–C6 que midió el perito.</summary>
        private bool danoMedido;

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

            // La versión, alineada por su impacto; pasado su final se queda en su última pose.
            foreach (var g in fantasmas)
            {
                g.Colocar(Tiempo + desfaseFantasma);
                g.Letrero?.Mostrar(true, g.transform.position + Vector3.up * g.AltoLetrero);
            }

            if (dinamica != null)
            {
                dinamica.Actualizar(Tiempo);
            }

            impacto?.Colocar(Tiempo);
        }

        private void Update()
        {
            // Cámara lenta automática en el impacto: el ritmo cambia, las poses no (ronda 4, punto 5).
            var factor = EnfasisActivo ? EnfasisImpacto.FactorCamaraLenta(Tiempo, tImpacto) : 1.0;
            MostrarLetrero(Velocidad * factor);
            if (!Reproduciendo)
            {
                return;
            }

            Fijar(Tiempo + Time.unscaledDeltaTime * Velocidad * factor);
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

        /// <summary>La carrocería deformada con el daño del Resultado; nulo si no trae daño que dibujar.</summary>
        public DanoVista Dano { get; set; }

        /// <summary>De dónde venía (ilustrativo): el trayecto antes de `TInicioResultado`; nulo sin él.</summary>
        public TrayectoPrevio Previo { get; set; }

        public double TInicioResultado { get; set; }

        /// <summary>Los rayones y la pintura ajena de un roce sin deformación; nulo si no hubo roce.</summary>
        public RozaduraVista Roce { get; set; }

        /// <summary>
        /// Si se tiende después del impacto (dos ruedas que el solver arrastra caídas) y hacia qué lado:
        /// ±1; 0, no. La caída es ilustrativa: el solver no la calcula (ADR 0114).
        /// </summary>
        public int CaidaLado { get; set; }

        private EtiquetaMundo etiqueta;
        private List<Renderer> carroceria;
        private GameObject contorno;
        public TramoFreno[] Frenado { get; set; }

        /// <summary>El letrero de una versión superpuesta («Hipótesis»), siempre a la vista; nulo en la reconstrucción.</summary>
        public EtiquetaMundo Letrero { get; set; }
        public float AltoLetrero { get; set; }

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
            Dano?.Mostrar(t);
            Roce?.Mostrar(t);
            var p = Ejes.AUnity(Previo != null && t < TInicioResultado ? Core.Previo.Pose(Previo, t) : Muestreo.Pose(Trayectoria, t));
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
        private RectTransform caja;
        private bool visible;
        private Vector3 donde;

        // Los letreros destacados encendidos: si dos caen casi en el mismo lugar de la pantalla (los dos
        // fantasmas vistos desde arriba), solo se dibuja el primero.
        private static readonly System.Collections.Generic.List<EtiquetaMundo> Destacados = new System.Collections.Generic.List<EtiquetaMundo>();

        /// <summary>
        /// Un letrero destacado (el de una versión superpuesta, «Hipótesis»): más grande, en negrita y con
        /// el recuadro de contraste AA de la leyenda (`Leyenda3d`), para leerse sobre cualquier fondo.
        /// </summary>
        public static EtiquetaMundo CrearDestacada(Transform padre, string mensaje)
        {
            var e = Crear(padre, mensaje);
            e.texto.fontSize = 16;
            e.texto.fontStyle = FontStyle.Bold;
            e.texto.rectTransform.sizeDelta = new Vector2(260f, 26f);
            Destroy(e.texto.GetComponent<Outline>());
            var fondo = new GameObject("fondo").AddComponent<Image>();
            fondo.transform.SetParent(e.lienzo, false);
            fondo.transform.SetAsFirstSibling();
            var f = Leyenda3d.Fondo;
            fondo.color = new Color((float)f.R, (float)f.G, (float)f.B, (float)f.A);
            fondo.raycastTarget = false;
            e.caja = fondo.rectTransform;
            e.caja.sizeDelta = new Vector2(e.texto.preferredWidth + 18f, 26f);
            fondo.enabled = false;
            Destacados.Add(e);
            return e;
        }

        private void OnDestroy()
        {
            Destacados.Remove(this);
        }

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
            var tapado = false;
            if (caja != null)
            {
                foreach (var otro in Destacados)
                {
                    if (otro == this)
                    {
                        break;
                    }

                    if (otro.visible && otro.texto.enabled && (camara.WorldToScreenPoint(otro.donde) - p).sqrMagnitude < 40f * 40f)
                    {
                        tapado = true;
                        break;
                    }
                }
            }

            if (p.z <= 0f || tapado)
            {
                texto.enabled = false;
                if (caja != null)
                {
                    caja.GetComponent<Image>().enabled = false;
                }

                return;
            }

            RectTransformUtility.ScreenPointToLocalPointInRectangle(lienzo, p, null, out var local);
            texto.rectTransform.anchoredPosition = local;
            texto.enabled = true;
            if (caja != null)
            {
                caja.anchoredPosition = local;
                caja.GetComponent<Image>().enabled = true;
            }
        }
    }

    /// <summary>Una carga que reemplazó otra más nueva: se detiene en silencio (`VisorCaso.Vigente`).</summary>
    public sealed class CargaReemplazada : System.Exception
    {
        public CargaReemplazada()
            : base("La reemplazó una carga más nueva.")
        {
        }
    }
}
