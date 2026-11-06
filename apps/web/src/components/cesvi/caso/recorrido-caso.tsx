"use client";
/**
 * El recorrido de un caso de expediente (ADR 0079): nuevo, importado, de la reproducción o
 * guardado. La misma barra y los mismos pasos que el caso de AXA, con Presentar / Trabajar y los
 * temas. A la izquierda va el paso; a la derecha, el escenario: el mapa (montado todo el recorrido,
 * para el croquis del dictamen) y, cuando se pide, el 3D de la reconstrucción.
 *
 * Lo que marca el perito lleva fuente «perito»; lo que supone Croquis, «supuesto», hasta que el
 * perito lo confirma. La validación del dictamen se guarda con el caso (ADR 0075).
 */
import { LEGEND_TEXT_CESVI } from "@croquis/scene-schema";
import {
  comparar,
  coordinar,
  criteriosVacios,
  conPosicion,
  delPerito,
  medidasDe,
  pizarraDeEscena,
  pizarraNueva,
  posesDeImpacto,
  posicionesEncimadas,
  conHipotesis,
  preguntaPendiente,
  reconstruccionContraCesvi,
  supuestoAlNoSaber,
  supuestosDeclarados,
  verificacionCesvi,
  type ContextoPizarra,
  type EscenaNarrada,
  type Expediente,
  type Pizarra,
  type SalidaCorpus,
} from "@croquis/cesvi";
import type { OverpassResponse } from "@croquis/croquis-2d";
import { preloadRenderer, type ViewerExportApi } from "@croquis/viewer";
import type { Map as MapaMl } from "maplibre-gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Hipotesis } from "@/components/visor/hypothesis-panel";
import {
  ACEPTA_CASO,
  casoParaGuardar,
  leerCasoGuardado,
  nombreArchivoCaso,
  validacionVigente,
  type ReporteCesvi,
  type ValidacionPerito,
} from "@/lib/caso-guardado";
import { guardarCaso, idNuevo, type CasoExpediente } from "@/lib/casos";
import { avisarCambio } from "@/lib/casos-navegador";
import type { DatosDictamenCaso } from "@/lib/dictamen-caso";
import { callesCerca, objetosCerca } from "@/lib/calles-del-mapa";
import { downloadBytes } from "@/lib/download";
import {
  CLAVES_PASOS,
  enLista,
  faltaDelLugar,
  faltaEnPaso,
  impactosAColocar,
  pasoAbierto,
} from "@/lib/pasos-caso";
import { MODALIDAD } from "@/lib/nombres-cesvi";
import { colorDeVehiculo } from "@/lib/vehiculos-cesvi";
import { leerTransiciones, useTema, useTransiciones, type Modo } from "@/lib/preferencias-cesvi";
import ejemplo from "../../../../../../data/cesvi/grabaciones/escenas/cesvi-e814f085db.json";
import { Calculos, type DistanciaRestos } from "../calculos";
import { Expediente as ExpedienteCesvi } from "../expediente";
import { ComparacionDeclaracion } from "../comparacion-declaracion";
import { DictamenCaso } from "../dictamen-caso";
import { CargaReporte } from "../importar-dictamen";
import { subpasoLugar } from "@/lib/colocar";
import { leerReporte } from "@/lib/lectura-reporte";
import { actoDePaso, actosDelCaso, continuarA, rutaDeActo, type ClaveActo } from "@/lib/actos";
import { BarraRecorrido, PASOS } from "../recorrido/barra";
import { TransicionActo } from "../recorrido/transicion-acto";
import { MaquetaCaso } from "../escena/maqueta-caso";
import { EscenaFacil, ResumenDeLaEscena } from "../escena/escena-facil";
import { PresentarCaso } from "./presentar-caso";
import { ActoDanos } from "./analisis-laboratorio";
import { ActoContraste, filaDeRestos } from "./contraste-laboratorio";
import { HechoLaboratorio } from "./hecho-laboratorio";
import { CifraReconstruccion, DetalleReconstruccion } from "./hoja-reconstruccion";
import { protagonista, tipImpacto, tipVehiculo } from "@/lib/reconstruccion-lab";
import { tomarArchivo } from "@/lib/archivo-pendiente";
import {
  cifraContraste,
  conteoCriterios,
  criteriosContraste,
  lecturaFisica,
} from "@/lib/contraste-lab";
import { textoDano, tituloDelHecho } from "@/lib/hecho-laboratorio";
import { nombreVehiculo } from "@/lib/escena-facil";
import { PasoCaso, PasoHecho, PasoNumeros, claveItem, type ItemLugar } from "./pasos";
import { BitacoraAgentes } from "./bitacora";
import { MapaEscena, type HerramientaMapa, type HuellaMapa } from "./piezas";
import {
  ElegirHipotesis,
  PanelReconstruccion,
  useReconstruccion,
  Visor3dCaso,
  type PosicionMovil,
} from "./reconstruccion";

/** De dónde viene la escena de un caso, para la bitácora de la pizarra (R12b). */
const ORIGEN_ESCENA: Record<CasoExpediente["origen"], string> = {
  nuevo: "caso nuevo",
  importado: "reporte importado",
  reporte: "reporte de la reproducción",
  guardado: "guardado en este equipo",
  ejemplo: "caso de ejemplo",
};

/** El Lector y el Físico de la app no tienen otra lectura ni otro solver que los del recorrido. */
const SIN_LECTOR: ContextoPizarra["leer"] = () => Promise.resolve(null);

const DETALLE: Record<CasoExpediente["origen"], string> = {
  nuevo:
    "Narra el hecho como en un reporte de CESVI. Croquis lo ordena en la escena, pregunta solo lo que más cambia la reconstrucción y tú colocas a los vehículos en el mapa.",
  importado:
    "Sube un reporte de CESVI en PDF, Markdown o texto. Claude lo lee y Croquis arma el expediente con la frase de donde sale cada dato; lo que no está en el texto se descarta.",
  reporte:
    "Un reporte de la prueba congelada de E-R4: Croquis recibió la narración sin las conclusiones. Reconstrúyelo y compáralo con lo que concluyó CESVI.",
  guardado: "Un caso que guardaste en este equipo, con lo que marcaste y tu validación.",
  ejemplo:
    "Un caso real de CESVI que ya analizaron en su reporte: Croquis lo reconstruye y reproduce sus números con su método.",
};

/** Con el 3D a la vista, los avisos del reloj no mueven el mapa (está desmontado). */
const IGNORAR_POSICIONES = (): undefined => undefined;

export function RecorridoCaso({
  inicial,
  actoInicial = null,
}: {
  inicial: CasoExpediente;
  /** El acto de la ruta (`/<caso>/<acto>`, prompt §4): se abre ahí si ya se puede. */
  actoInicial?: ClaveActo | null;
}) {
  // El trozo del renderer 3D se baja al entrar al caso, no al abrir el 3D (René, 2026-11-04).
  useEffect(() => {
    void preloadRenderer().catch(() => undefined);
  }, []);
  // Trabajar para armar un caso; Presentar para un reporte de la reproducción (se consulta).
  const [modo, setModo] = useState<Modo>(inicial.origen === "reporte" ? "presentar" : "trabajar");
  const tema = useTema(modo);
  const [paso, setPaso] = useState(0);
  const [titulo, setTitulo] = useState(inicial.titulo);
  const [reporte, setReporte] = useState<ReporteCesvi | null>(inicial.reporte);
  const [texto, setTexto] = useState(inicial.narracion ?? "");
  const [leida, setLeida] = useState<EscenaNarrada | null>(inicial.escena);
  const [expediente, setExpediente] = useState<Expediente | null>(
    inicial.escena?.expediente ?? null,
  );
  const [validacion, setValidacion] = useState<ValidacionPerito | null>(inicial.validacion);
  const [estado, setEstado] = useState<string | null>(null);
  // El hecho (Laboratorio §8): leído, se ve el relato marcado; «Editar el relato» abre el editor.
  const [editandoRelato, setEditandoRelato] = useState(false);
  const [noSe, setNoSe] = useState<Set<string>>(new Set());
  // El paso del lugar (V2): la herramienta del mapa, el elemento elegido de la lista guiada, el
  // punto y el rumbo de cada impacto (para su flecha), lo que se deshace y lo último medido.
  const [herramientaMapa, setHerramientaMapa] = useState<HerramientaMapa>("colocar");
  const [elegido, setElegido] = useState<ItemLugar | null>(null);
  /** «No sé dónde quedó» (B): esos vehículos van sin posición final; la reconstrucción no la inventa. */
  const [desconocidos, setDesconocidos] = useState<readonly string[]>(
    inicial.finalesDesconocidos ?? [],
  );
  const [puntosImpacto, setPuntosImpacto] = useState<Record<number, { lat: number; lon: number }>>(
    {},
  );
  // La escena fácil (René, 2026-11-05): «No sé por dónde venía», «Quedó junto al choque», si no
  // llegaron las calles del mapa y el lugar que se buscó (para pedir sus calles).
  const [direccionesNoSe, setDireccionesNoSe] = useState<readonly string[]>(
    inicial.direccionesSupuestas ?? [],
  );
  const [juntoAlChoque, setJuntoAlChoque] = useState<readonly string[]>([]);
  const [callesFallaron, setCallesFallaron] = useState(false);
  const [centroBuscado, setCentroBuscado] = useState<{ lat: number; lon: number } | null>(null);
  const [rumbosImpacto, setRumbosImpacto] = useState<Record<number, number>>({});
  const [historial, setHistorial] = useState<Expediente[]>([]);
  const [calles, setCalles] = useState<OverpassResponse | null>(null);
  const [objetos, setObjetos] = useState<OverpassResponse | null>(null);
  const [, setMedida] = useState<number | null>(null);
  const [mapa, setMapa] = useState<MapaMl | null>(null);
  const [moviles, setMoviles] = useState<PosicionMovil[]>([]);
  // La vista del escenario: la que se eligió o, al reconstruir, la maqueta (Laboratorio §8).
  const [vistaElegida, setVista] = useState<"mapa" | "3d" | "maqueta" | null>(null);
  const [camaraPedida, setCamaraPedida] = useState<{ camara: string; n: number } | null>(null);
  const [declarada, setDeclarada] = useState<Hipotesis | null>(null);
  const [comparacionDeclarada, setComparacionDeclarada] =
    useState<DatosDictamenCaso["declarada"]>(null);
  const [exportApi, setExportApi] = useState<ViewerExportApi | null>(null);
  const [guardadoId, setGuardadoId] = useState<string | null>(
    inicial.origen === "guardado" ? inicial.id : null,
  );
  const [avisoGuardado, setAvisoGuardado] = useState<string | null>(null);
  // AXA: los criterios de correspondencia de los daños que marca el perito (método de CESVI).
  const [criterios, setCriterios] = useState({ A: criteriosVacios(), B: criteriosVacios() });
  // AXA: la distancia de los restos del método de CESVI (la del reporte, o la que cambie el perito).
  const [distancia, setDistancia] = useState<DistanciaRestos>({
    valor: String(inicial.ejemplo?.calculos.desplazamiento.D_m.valor ?? ""),
    fuente: "dictamen",
  });
  const rec = useReconstruccion(expediente);
  // La pizarra de R12b (ADR 0093): lo que escriben los agentes y su bitácora.
  const [pizarra, setPizarra] = useState<Pizarra>(() =>
    inicial.escena
      ? pizarraDeEscena(inicial.narracion, inicial.escena, {
          conclusiones: inicial.reporte?.conclusiones ?? null,
          origen: ORIGEN_ESCENA[inicial.origen],
          bitacora: inicial.bitacora,
        })
      : pizarraNueva(inicial.narracion, { conclusiones: inicial.reporte?.conclusiones ?? null }),
  );
  // La última pizarra, para los efectos que coordinan sin volver a correr con cada mensaje.
  const pizarraRef = useRef(pizarra);
  useEffect(() => {
    pizarraRef.current = pizarra;
  }, [pizarra]);
  // El mapa a pantalla completa (V2): se cierra con «Contraer» o con Esc.
  const [expandido, setExpandido] = useState(false);
  useEffect(() => {
    if (!expandido) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpandido(false);
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [expandido]);
  // Si un reposo supuesto no cabe con la deformación medida hay dos hipótesis; el perito elige
  // (ADR 0091). Mientras no elija se ve la del daño medido, y se dice.
  // La elección se guarda con el caso; al reconstruir se aplica si esa hipótesis sigue existiendo.
  const [hipotesis, setHipotesis] = useState<string | null>(inicial.hipotesisElegida ?? null);
  const r = useMemo(
    () => (rec.r?.hipotesis && hipotesis ? conHipotesis(rec.r, hipotesis) : rec.r),
    [rec.r, hipotesis],
  );

  // Un caso con reporte se lee del reporte: su narración no se edita ni va al dictamen.
  const editable = reporte === null;
  const narracion = editable ? texto.trim() || null : null;
  const pasos = PASOS.filter((_, i) => i !== 6 || reporte !== null);
  const clave = (i: number) => PASOS.indexOf(pasos[i]!);
  const actual = clave(paso);
  const vista = vistaElegida ?? (actual === 3 && r ? "maqueta" : "mapa");
  // Los actos del Laboratorio (prompt §4) y la transición al entrar a uno (§5): completa al entrar
  // al caso y al presentar, corta entre actos al trabajar; nada con «Transiciones» apagado o con
  // `prefers-reduced-motion`.
  const actos = actosDelCaso(pasos.map((n) => CLAVES_PASOS[PASOS.indexOf(n)]!));
  const actoIdx = Math.max(0, actoDePaso(actos, paso));
  const transicionesActivas = useTransiciones();
  const [transicion, setTransicion] = useState<{
    id: number;
    n: number;
    nombre: string;
    larga: boolean;
  } | null>(null);
  const actoVisto = useRef<number | null>(null);
  const claveActo = actos[actoIdx]?.clave;
  useEffect(() => {
    const previo = actoVisto.current;
    actoVisto.current = actoIdx;
    if (previo === actoIdx || !leerTransiciones()) return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    const larga = previo === null || modo === "presentar";
    const nombre = actos[actoIdx]?.nombre ?? "";
    const r = requestAnimationFrame(() =>
      setTransicion({ id: performance.now(), n: actoIdx + 1, nombre, larga }),
    );
    return () => cancelAnimationFrame(r);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al cambiar de acto
  }, [claveActo]);
  const terminarTransicion = useCallback(() => setTransicion(null), []);
  const irA = (i: number) => setPaso(Math.max(0, Math.min(pasos.length - 1, i)));
  const panelPaso = useRef<HTMLElement>(null);
  useEffect(() => {
    panelPaso.current?.scrollTo({ top: 0 });
  }, [paso]);
  // El Redactor escribe cuando el perito abre el dictamen con una reconstrucción (R12b).
  const enDictamen = actual === PASOS.length - 1;
  useEffect(() => {
    const p = pizarraRef.current;
    if (!enDictamen || !rec.r || p.dictamen || !p.escena) return;
    void coordinar(delPerito(p, "Abre el dictamen.", { pideDictamen: true }), {
      leer: SIN_LECTOR,
    }).then(setPizarra);
  }, [enDictamen, rec.r]);

  const evidencia = expediente?.versiones?.find((v) => v.tipo === "evidencia");
  const posiciones = useMemo(() => evidencia?.posiciones ?? [], [evidencia]);
  const verificacion = useMemo(
    () => (expediente ? verificacionCesvi(expediente) : []),
    [expediente],
  );
  // Lo que el caso no trae, como supuesto declarado con su justificación (ADR 0091).
  const supuestos = useMemo(
    () => (expediente ? supuestosDeclarados(expediente, r) : []),
    [expediente, r],
  );
  // La velocidad de la reconstrucción contra la de cada método del reporte (ADR 0091).
  const contraCesvi = useMemo(
    () => (expediente && r ? reconstruccionContraCesvi(expediente, r) : null),
    [expediente, r],
  );
  // La reproducción trae la comparación medida en E-R4; un reporte importado se compara aquí.
  const comparacionReporte = useMemo(
    () =>
      inicial.comparacion ??
      (reporte && expediente && leida
        ? comparar(reporte.conclusiones, expediente, leida.posiciones, texto)
        : null),
    [inicial.comparacion, reporte, expediente, leida, texto],
  );
  // Las que siguen pendientes con lo que ya tiene el expediente (y las que no dijo «No sé»).
  const preguntas = (leida?.preguntas ?? []).filter(
    (p) =>
      !noSe.has(p.clave) &&
      expediente !== null &&
      preguntaPendiente(
        p,
        expediente,
        posiciones.filter((x) => x.fase === "final"),
      ),
  );

  const cambiarExpediente = (e: Expediente) => {
    setExpediente(e);
    setLeida((l) => (l ? { ...l, expediente: e } : l));
  };
  const abrirEscena = (e: EscenaNarrada) => {
    setLeida(e);
    setExpediente(e.expediente);
    setNoSe(new Set());
    setValidacion(null);
    setElegido(null);
    setPuntosImpacto({});
    setRumbosImpacto({});
    setHistorial([]);
  };

  // La lectura pasa por la pizarra (R12b): el Lector (Claude), el Verificador de citas (que puede
  // pedir una relectura), el Validador y el Preguntador.
  const leer = async () => {
    setEditandoRelato(false);
    setEstado("Leyendo la narración…");
    let motivo: string | null = null;
    const leerConClaude: ContextoPizarra["leer"] = async (t, rechazadas) => {
      const res = await fetch("/api/cesvi/escena", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: t, ...(rechazadas?.length ? { rechazadas } : {}) }),
      });
      const d = (await res.json()) as { metodo?: string; motivo?: string; salida?: SalidaCorpus };
      if (d.metodo !== "claude" || !d.salida) {
        motivo = d.motivo ?? "sin respuesta";
        return null;
      }
      return d.salida;
    };
    try {
      const p = await coordinar(
        pizarraNueva(texto, { conclusiones: reporte?.conclusiones ?? null }),
        { leer: leerConClaude },
      );
      setPizarra(p);
      if (!p.escena) {
        setEstado(`No se pudo leer con Claude (${motivo ?? "sin respuesta"}).`);
        return;
      }
      abrirEscena({ ...p.escena, preguntas: p.preguntas });
      setEstado(null);
    } catch {
      setEstado("No se pudo leer la narración.");
    }
  };

  // El Físico escribe la reconstrucción en la pizarra; si la física no cuadra, le pide evidencia al
  // Preguntador, y sus preguntas se suman a las del hecho.
  useEffect(() => {
    const hecha = rec.r;
    if (!hecha || !expediente) return;
    const actual = pizarraRef.current;
    const base =
      actual.escena || !leida
        ? actual
        : pizarraDeEscena(narracion, leida, {
            conclusiones: reporte?.conclusiones ?? null,
            origen: ORIGEN_ESCENA[inicial.origen],
          });
    if (!base.escena) return;
    void coordinar(delPerito(base, "Pide reconstruir.", { pideReconstruir: true, expediente }), {
      leer: SIN_LECTOR,
      reconstruir: () => Promise.resolve(hecha),
    }).then((p) => {
      setPizarra(p);
      setLeida((l) => (l ? { ...l, preguntas: p.preguntas } : l));
    });
    // Solo cuando llega una reconstrucción nueva.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rec.r]);

  const abrirArchivo = async (f: File) => {
    let datos: unknown;
    try {
      datos = JSON.parse(await f.text());
    } catch {
      setAvisoGuardado("El archivo no es un caso de Croquis.");
      return;
    }
    const c = leerCasoGuardado(datos);
    if ("error" in c) {
      setAvisoGuardado(c.error);
      return;
    }
    abrirEscena(c.escena);
    setTexto(c.narracion ?? "");
    setReporte(c.reporte);
    setValidacion(c.validacion);
    setHipotesis(c.hipotesisElegida);
    setDesconocidos(c.finalesDesconocidos);
    setDireccionesNoSe(c.direccionesSupuestas);
    // La bitácora del archivo sigue en la pizarra (R12b): se escribe después de ella.
    setPizarra(
      pizarraDeEscena(c.narracion, c.escena, {
        conclusiones: c.reporte?.conclusiones ?? null,
        origen: "archivo del caso",
        bitacora: c.bitacora,
      }),
    );
    if (c.titulo) setTitulo(c.titulo);
    setAvisoGuardado(
      c.validacion
        ? `Caso abierto. Validó ${c.validacion.perito}: reconstruye para descargar el dictamen.`
        : "Caso abierto, sin validar.",
    );
  };

  const archivoCaso = () =>
    leida && expediente
      ? casoParaGuardar({
          narracion,
          escena: leida,
          expediente,
          validacion,
          titulo,
          reporte,
          bitacora: pizarra.bitacora,
          hipotesisElegida: hipotesis,
          finalesDesconocidos: desconocidos,
          direccionesSupuestas: direccionesNoSe,
        })
      : null;
  const guardarEnEquipo = () => {
    const a = archivoCaso();
    if (!a) return;
    const id = guardadoId ?? idNuevo();
    try {
      guardarCaso(window.localStorage, id, a);
      setGuardadoId(id);
      avisarCambio();
      setAvisoGuardado("Guardado en este equipo: aparece en la lista de casos.");
    } catch {
      setAvisoGuardado("No se pudo guardar en este navegador; descarga el archivo del caso.");
    }
  };

  // --- El paso 1 (V2): qué es el caso y cuánto lleva --------------------------------------------
  const etiqueta =
    inicial.origen === "nuevo"
      ? "Caso nuevo"
      : inicial.origen === "guardado"
        ? "Caso guardado"
        : `${inicial.origen === "ejemplo" ? "Caso de ejemplo" : "Reporte de CESVI"}${reporte?.conclusiones.modalidad ? ` · ${(MODALIDAD[reporte.conclusiones.modalidad] ?? reporte.conclusiones.modalidad).toLowerCase()}` : ""}`;
  const lugarFalta = expediente ? faltaDelLugar(expediente) : null;
  const avance = [
    { nombre: "Narración del hecho", listo: leida !== null },
    { nombre: "Vehículos", listo: (expediente?.vehiculos.length ?? 0) > 0 },
    { nombre: "Lugar en el mapa", listo: lugarFalta !== null && lugarFalta.impactos.length === 0 },
    {
      nombre: "Dónde quedó cada vehículo",
      listo: lugarFalta !== null && lugarFalta.finales.length === 0,
    },
  ];

  // --- El paso del lugar (V2) ------------------------------------------------------------------
  const impactos = expediente ? impactosAColocar(expediente) : [];
  const poseDe = (v: string, fase: string) =>
    posiciones.find((p) => p.vehiculo === v && p.fase === fase);
  const requeridos: ItemLugar[] = expediente
    ? [
        ...impactos.map((i): ItemLugar => ({ tipo: "impacto", orden: i.orden })),
        ...expediente.vehiculos
          .filter((v) => !desconocidos.includes(v.id))
          .map((v): ItemLugar => ({ tipo: "final", vehiculo: v.id })),
      ]
    : [];
  const vehiculosDe = (orden: number) => impactos.find((x) => x.orden === orden)?.vehiculos ?? [];
  const colocado = (i: ItemLugar) =>
    i.tipo === "impacto"
      ? vehiculosDe(i.orden).every((v) => poseDe(v, "impacto"))
      : Boolean(poseDe(i.vehiculo, i.tipo));
  const activo: ItemLugar | null = elegido ?? requeridos.find((i) => !colocado(i)) ?? null;
  /** El punto de un impacto: el que marcó el perito, o el centro de sus poses (caso reabierto). */
  const puntoDe = (orden: number) => {
    if (puntosImpacto[orden]) return puntosImpacto[orden];
    const ps = vehiculosDe(orden).flatMap((v) => poseDe(v, "impacto") ?? []);
    if (!ps.length) return null;
    return {
      lat: ps.reduce((a, p) => a + p.punto.lat, 0) / ps.length,
      lon: ps.reduce((a, p) => a + p.punto.lon, 0) / ps.length,
    };
  };
  // Las calles del lugar para el 3D (R10): se piden en cuanto hay punto de impacto (al marcarlo o al
  // abrir un caso que ya lo tiene) y el 3D las agrega cuando llegan.
  // Antes de marcar el choque, alrededor del lugar buscado o del lugar del caso: Croquis propone el
  // cruce y las flechas con ellas.
  const origenCalles = puntoDe(1) ?? centroBuscado ?? expediente?.caso.lugar?.coordenadas ?? null;
  const claveCalles = origenCalles
    ? `${origenCalles.lon.toFixed(3)},${origenCalles.lat.toFixed(3)}`
    : null;
  useEffect(() => {
    if (!claveCalles) return;
    const [lon, lat] = claveCalles.split(",").map(Number) as [number, number];
    let vivo = true;
    void callesCerca([lon, lat]).then((c) => {
      if (!vivo) return;
      setCalles(c);
      setCallesFallaron(c === null);
    });
    void objetosCerca([lon, lat]).then((o) => {
      if (vivo) setObjetos(o);
    });
    return () => {
      vivo = false;
    };
  }, [claveCalles]);
  const rumboDeItem = (i: ItemLugar): number | null => {
    if (i.tipo === "impacto") {
      const primero = vehiculosDe(i.orden)[0];
      return (
        rumbosImpacto[i.orden] ?? (primero ? (poseDe(primero, "impacto")?.rumbo ?? null) : null)
      );
    }
    return poseDe(i.vehiculo, i.tipo)?.rumbo ?? null;
  };
  const colorItem = (i: ItemLugar) =>
    i.tipo === "impacto" ? "#FF5B2E" : colorDeVehiculo(i.vehiculo);
  /** Las poses de un impacto desde su punto; en una carambola, solo las de quien entra en él. */
  const conImpacto = (
    e: Expediente,
    orden: number,
    punto: { lat: number; lon: number },
    rumbo: number,
  ): Expediente => {
    const antes = new Set(impactos.filter((x) => x.orden < orden).flatMap((x) => x.vehiculos));
    let r = e;
    for (const p of posesDeImpacto(e, punto, rumbo, orden)) {
      if (antes.has(p.vehiculo)) continue;
      // Lo que propone Croquis: un fantasma hasta que el perito lo acepta o lo mueve.
      r = conPosicion(r, {
        vehiculo: p.vehiculo,
        fase: "impacto",
        punto: p.punto,
        rumbo: p.rumbo,
        fuente: "supuesto",
      });
    }
    return r;
  };
  /** Coloca algo de la lista: con un clic en el mapa (rumbo actual) o soltándolo de la bandeja. */
  const colocarItem = (
    item: ItemLugar,
    punto: { lat: number; lon: number },
    rumbo: number | null,
  ) => {
    // Se coloca en el paso del lugar y al trabajar; al presentar el mapa solo se mira.
    if (modo !== "trabajar" || actual !== 2 || !expediente) return;
    setHistorial((h) => [...h, expediente]);
    if (item.tipo === "impacto") {
      const r = rumbo ?? rumboDeItem(item) ?? 0;
      setPuntosImpacto((m) => ({ ...m, [item.orden]: punto }));
      // Si el mapa está lejos (a nivel de colonia o más), se acerca al punto para ver los vehículos.
      if (mapa && mapa.getZoom() < 17) mapa.easeTo({ center: [punto.lon, punto.lat], zoom: 19 });
      setRumbosImpacto((m) => ({ ...m, [item.orden]: r }));
      cambiarExpediente(conImpacto(expediente, item.orden, punto, r));
    } else {
      const r = rumbo ?? rumboDeItem(item) ?? poseDe(item.vehiculo, "impacto")?.rumbo ?? 0;
      cambiarExpediente(
        conPosicion(expediente, { vehiculo: item.vehiculo, fase: item.tipo, punto, rumbo: r }),
      );
    }
    // Se queda activo para girarlo; «Listo» pasa al siguiente.
    setElegido(item);
  };
  const colocar = (punto: { lat: number; lon: number }) => {
    if (activo) colocarItem(activo, punto, null);
  };
  const girar = (rumbo: number) => {
    if (!expediente || !activo) return;
    if (activo.tipo === "impacto") {
      const p = puntoDe(activo.orden);
      if (!p) return;
      setRumbosImpacto((m) => ({ ...m, [activo.orden]: rumbo }));
      cambiarExpediente(conImpacto(expediente, activo.orden, p, rumbo));
    } else {
      const pose = poseDe(activo.vehiculo, activo.tipo);
      if (!pose) return;
      cambiarExpediente(
        conPosicion(expediente, {
          vehiculo: activo.vehiculo,
          fase: activo.tipo,
          punto: pose.punto,
          rumbo,
        }),
      );
    }
  };
  const flecha =
    actual === 2 && modo === "trabajar" && activo && colocado(activo)
      ? (() => {
          const punto =
            activo.tipo === "impacto"
              ? puntoDe(activo.orden)
              : (poseDe(activo.vehiculo, activo.tipo)?.punto ?? null);
          return punto
            ? { punto, rumbo: rumboDeItem(activo) ?? 0, color: colorItem(activo) }
            : null;
        })()
      : null;
  const huellas: HuellaMapa[] = expediente
    ? posiciones.flatMap((p) => {
        const v = expediente.vehiculos.find((x) => x.id === p.vehiculo);
        if (!v) return [];
        return [
          {
            vehiculo: p.vehiculo,
            fase: p.fase,
            punto: p.punto,
            rumbo: p.rumbo,
            ...medidasDe(v),
            clase: v.clase ?? "sedan_mediano",
            color: colorDeVehiculo(p.vehiculo),
          },
        ];
      })
    : [];
  // Colocar en el mapa (punto 3 de René): la bandeja con lo que falta, el anillo del elegido y los
  // fantasmas de lo que propone Croquis (las poses de impacto que el perito no ha aceptado).
  const itemDeClave = (clave: string): ItemLugar | null => {
    const [tipo, resto] = clave.split(":") as [string, string];
    if (tipo === "impacto") return { tipo: "impacto", orden: Number(resto) };
    if (tipo === "final" || tipo === "inicial") return { tipo, vehiculo: resto };
    return null;
  };
  const medidasDeVehiculo = (id: string | undefined) => {
    const v = expediente?.vehiculos.find((x) => x.id === id);
    return v
      ? { ...medidasDe(v), clase: v.clase ?? "sedan_mediano" }
      : { largo: 4.5, ancho: 1.8, clase: "sedan_mediano" };
  };
  // La colocación en tres pasos (B): impacto, por dónde venía cada uno y dónde quedó.
  const ordenVehiculos = impactos.flatMap((i) => i.vehiculos);
  const subpaso =
    actual === 2 && expediente
      ? subpasoLugar({
          impactoColocado: requeridos.some((i) => i.tipo === "impacto" && colocado(i)),
          sinConfirmar: [...new Set(ordenVehiculos)].filter(
            (v) => poseDe(v, "impacto")?.fuente === "supuesto",
          ),
          sinFinal: expediente.vehiculos
            .map((v) => v.id)
            .filter((v) => !desconocidos.includes(v) && !poseDe(v, "final")),
        })
      : null;
  /** Paso 2: el perito elige por dónde venía un vehículo (una flecha sobre un carril). */
  const elegirDireccion = (vehiculo: string, rumbo: number) => {
    if (!expediente) return;
    const imp = impactos.find((i) => i.vehiculos.includes(vehiculo));
    const pose = poseDe(vehiculo, "impacto");
    if (!imp || !pose) return;
    setHistorial((h) => [...h, expediente]);
    let e = expediente;
    if (imp.vehiculos[0] === vehiculo) {
      // El primero gira todo el impacto: los demás se recolocan por sus zonas de contacto.
      const p = puntoDe(imp.orden);
      if (p) {
        setRumbosImpacto((m) => ({ ...m, [imp.orden]: rumbo }));
        e = conImpacto(e, imp.orden, p, rumbo);
      }
    }
    const nueva = e.versiones
      ?.find((v) => v.tipo === "evidencia")
      ?.posiciones?.find((x) => x.vehiculo === vehiculo && x.fase === "impacto");
    cambiarExpediente(
      conPosicion(e, {
        vehiculo,
        fase: "impacto",
        punto: nueva?.punto ?? pose.punto,
        rumbo: imp.vehiculos[0] === vehiculo ? (nueva?.rumbo ?? rumbo) : rumbo,
        fuente: "perito",
      }),
    );
  };
  const colocacion =
    actual === 2 && modo === "trabajar" && expediente
      ? {
          bandeja: requeridos
            .filter((i) => !colocado(i))
            .map((i) => ({
              clave: claveItem(i),
              etiqueta: i.tipo === "impacto" ? `X${i.orden}` : i.vehiculo,
              ...medidasDeVehiculo(i.tipo === "impacto" ? vehiculosDe(i.orden)[0] : i.vehiculo),
              color: colorItem(i),
            })),
          seleccion:
            activo && colocado(activo)
              ? (() => {
                  const vehiculo =
                    activo.tipo === "impacto"
                      ? (vehiculosDe(activo.orden)[0] ?? "V1")
                      : activo.vehiculo;
                  const punto =
                    activo.tipo === "impacto"
                      ? puntoDe(activo.orden)
                      : (poseDe(activo.vehiculo, activo.tipo)?.punto ?? null);
                  return punto
                    ? {
                        clave: claveItem(activo),
                        vehiculo,
                        punto,
                        rumbo: rumboDeItem(activo) ?? 0,
                        ...medidasDeVehiculo(vehiculo),
                        color: colorItem(activo),
                      }
                    : null;
                })()
              : null,
          fantasmas: posiciones
            .filter((p) => p.fase === "impacto" && p.fuente === "supuesto")
            .map((p) => ({
              clave: `fantasma:${p.vehiculo}`,
              vehiculo: p.vehiculo,
              punto: p.punto,
              rumbo: p.rumbo,
              ...medidasDeVehiculo(p.vehiculo),
              color: colorDeVehiculo(p.vehiculo),
            })),
          impacto: puntoDe(1),
          direcciones:
            subpaso?.n === 2 && subpaso.vehiculo
              ? (() => {
                  const pose = poseDe(subpaso.vehiculo, "impacto");
                  return pose
                    ? {
                        vehiculo: subpaso.vehiculo,
                        punto: pose.punto,
                        propuesta: pose.rumbo,
                        color: colorDeVehiculo(subpaso.vehiculo),
                      }
                    : null;
                })()
              : null,
          onDireccion: elegirDireccion,
          // Paso 3: la pieza fantasma sale delante de su pose de impacto, en su rumbo, para
          // arrastrarla; no es una posición hasta que el perito la suelta.
          piezaFinal:
            subpaso?.n === 3 && subpaso.vehiculo
              ? (() => {
                  const v = subpaso.vehiculo;
                  const pose = poseDe(v, "impacto");
                  if (!pose) return null;
                  const m = medidasDeVehiculo(v);
                  const d = m.largo * 1.6;
                  const a = (pose.rumbo * Math.PI) / 180;
                  const lat = pose.punto.lat + (d * Math.cos(a)) / 111_320;
                  const lon =
                    pose.punto.lon +
                    (d * Math.sin(a)) / (111_320 * Math.cos((pose.punto.lat * Math.PI) / 180));
                  return {
                    clave: `final:${v}`,
                    etiqueta: v,
                    ...m,
                    color: colorDeVehiculo(v),
                    punto: { lat, lon },
                    rumbo: pose.rumbo,
                  };
                })()
              : null,
          trayectorias: (expediente.vehiculos ?? []).flatMap((v) => {
            const puntos = (["inicial", "impacto", "final"] as const).flatMap(
              (f) => poseDe(v.id, f)?.punto ?? [],
            );
            return puntos.length >= 2
              ? [{ vehiculo: v.id, color: colorDeVehiculo(v.id), puntos }]
              : [];
          }),
          rumboPreferido: (clave: string) => {
            const i = itemDeClave(clave);
            return i && i.tipo !== "impacto"
              ? (poseDe(i.vehiculo, "impacto")?.rumbo ?? null)
              : null;
          },
          onSoltar: (clave: string, punto: { lat: number; lon: number }, rumbo: number) => {
            const i = itemDeClave(clave);
            if (i) colocarItem(i, punto, rumbo);
          },
          onGirar: girar,
          onAceptar: (vehiculo: string) => {
            const p = poseDe(vehiculo, "impacto");
            if (!p) return;
            setHistorial((h) => [...h, expediente]);
            cambiarExpediente(
              conPosicion(expediente, {
                vehiculo,
                fase: "impacto",
                punto: p.punto,
                rumbo: p.rumbo,
                fuente: "perito",
              }),
            );
          },
        }
      : null;
  const deshacer = () => {
    const previo = historial[historial.length - 1];
    if (!previo) return;
    setHistorial((h) => h.slice(0, -1));
    cambiarExpediente(previo);
  };

  const inicio =
    inicial.origen === "importado" && !leida ? (
      <CargaReporte
        onImportado={(d, archivo) => {
          abrirEscena(d);
          setTexto(d.narracion.descripcion);
          setReporte({ nombre: archivo, conclusiones: d.narracion.conclusiones });
          setTitulo(`Reporte de CESVI · ${archivo}`);
          setPaso(1);
        }}
      />
    ) : inicial.origen === "nuevo" && !leida ? (
      <div className="solo-trabajar flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="boton-principal"
          onClick={() => irA(1)}
          data-testid="empezar-narracion"
        >
          Escribir la narración del hecho
        </button>
        <label className="boton-secundario cursor-pointer">
          Abrir un caso guardado (.croquis)
          <input
            type="file"
            accept={ACEPTA_CASO}
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void abrirArchivo(f);
              e.target.value = "";
            }}
            data-testid="abrir-caso"
          />
        </label>
        <span className="t-nota w-full text-texto-3">
          Los archivos de caso de antes (.json) también se abren.
        </span>
      </div>
    ) : null;

  const sinEscena = (
    <p className="t-nota" data-testid="sin-escena">
      {inicial.origen === "importado"
        ? "Primero carga el reporte en el paso «El caso»."
        : "Primero narra el hecho y léelo en el paso «El hecho»."}
    </p>
  );

  const nombresPantalla: Record<string, string> = expediente
    ? Object.fromEntries(
        expediente.vehiculos.map((v) => [v.id, nombreVehiculo(v, expediente.vehiculos)]),
      )
    : {};
  const letraDe = (id: string) =>
    String.fromCharCode(65 + Math.max(0, expediente?.vehiculos.findIndex((v) => v.id === id) ?? 0));
  const nombreLab = (id: string) => `${letraDe(id)} · ${nombresPantalla[id] ?? id}`;

  const cuerpo = (() => {
    if (actual === 0)
      return (
        <PasoCaso
          titulo={titulo}
          etiqueta={etiqueta}
          detalle={DETALLE[inicial.origen]}
          escena={leida}
          reporte={reporte}
          editable={modo === "trabajar"}
          onExpediente={cambiarExpediente}
          avance={avance}
          extra={inicial.ejemplo ? <ExpedienteCesvi caso={inicial.ejemplo} /> : null}
          inicio={
            <>
              {inicio}
              {avisoGuardado ? (
                <p role="status" className="t-nota" data-testid="caso-abierto">
                  {avisoGuardado}
                </p>
              ) : null}
            </>
          }
        />
      );
    if (actual === 1 && leida && !editandoRelato && (!editable || texto.trim()))
      return (
        <HechoLaboratorio
          escena={leida}
          narracion={texto}
          editable={editable}
          preguntas={preguntas}
          onExpediente={cambiarExpediente}
          onNoSe={(c) => {
            setNoSe((s) => new Set([...s, c]));
            const queda = pizarra.pedidoEvidencia ? supuestoAlNoSaber(c, supuestos) : null;
            if (queda) setPizarra((p) => delPerito(p, `No sé (${c}). ${queda}`));
          }}
          onIrAlMapa={() => irA(2)}
          onEditar={() => setEditandoRelato(true)}
        />
      );
    if (actual === 1)
      return (
        <PasoHecho
          narracion={texto}
          editable={editable}
          onNarracion={setTexto}
          onLeer={() => void leer()}
          onEjemplo={() => setTexto(ejemplo.narracion)}
          onCargarReporte={
            inicial.origen === "nuevo"
              ? () =>
                  void (async () => {
                    // A3: el perito pegó el reporte entero; se lee como en «Cargar un reporte».
                    const nombre = "reporte pegado en la narración";
                    setEstado(
                      "Leyendo el reporte con Claude (dos lecturas; puede tardar un par de minutos)…",
                    );
                    const r = await leerReporte(texto, nombre);
                    if (!r.ok) {
                      setEstado(r.motivo);
                      return;
                    }
                    abrirEscena(r.importado);
                    setTexto(r.importado.narracion.descripcion);
                    setReporte({ nombre, conclusiones: r.importado.narracion.conclusiones });
                    setTitulo(`Reporte de CESVI · ${nombre}`);
                    setEstado(null);
                    setPaso(1);
                  })()
              : undefined
          }
          estado={estado}
          escena={leida}
          preguntas={preguntas}
          onExpediente={cambiarExpediente}
          onNoSe={(c) => {
            setNoSe((s) => new Set([...s, c]));
            // A una pregunta del Físico (R12b), «No sé» deja el supuesto con su nombre en la bitácora.
            const queda = pizarra.pedidoEvidencia ? supuestoAlNoSaber(c, supuestos) : null;
            if (queda) setPizarra((p) => delPerito(p, `No sé (${c}). ${queda}`));
          }}
          onIrAlMapa={(vehiculo) => {
            setElegido({ tipo: "final", vehiculo });
            irA(2);
          }}
        />
      );
    if (!expediente || !leida) return sinEscena;
    if (actual === 2)
      return (
        <ResumenDeLaEscena
          estado={{
            expediente,
            desconocidos,
            direccionesNoSe,
            juntoAlChoque,
            puntos: puntosImpacto,
          }}
          impactos={impactos}
          narracion={texto.trim() || null}
          calles={calles}
        />
      );
    if (actual === 3)
      return (
        <div className={`flex flex-col ${r ? "gap-3" : "gap-5"}`}>
          {r ? (
            <CifraReconstruccion
              r={r}
              nombres={Object.fromEntries(
                (expediente?.vehiculos ?? []).map((v) => [v.id, nombreLab(v.id)]),
              )}
              mensajes={pizarra.bitacora.length}
              decisiones={[
                ...direccionesNoSe.map((v) => `por dónde venía ${nombreLab(v)}`),
                ...desconocidos.map((v) => `dónde quedó ${nombreLab(v)}`),
              ]}
              onRepetir={() => void rec.reconstruir()}
            />
          ) : null}
          {r?.hipotesis ? (
            <ElegirHipotesis
              r={r}
              elegida={hipotesis}
              onElegir={(clave) => {
                setHipotesis(clave);
                const h = r.hipotesis?.find((x) => x.clave === clave);
                if (h) setPizarra((p) => delPerito(p, `Elige la hipótesis «${h.titulo}».`));
              }}
            />
          ) : null}
          {/* Sin reconstruir, o si el caso cambió después, el panel va a la vista con su aviso. */}
          {!r || rec.vieja ? <PanelReconstruccion rec={rec} /> : null}
          <DetalleReconstruccion plegado={r !== null}>
            {r && !rec.vieja ? <PanelReconstruccion rec={rec} /> : null}
            <BitacoraAgentes bitacora={pizarra.bitacora} />
            {r ? (
              <ComparacionDeclaracion
                expediente={expediente}
                reconstruccion={r}
                textoInicial={inicial.ejemplo?.declaracion.texto}
                declaranteInicial={
                  inicial.ejemplo
                    ? inicial.ejemplo.declaracion.conductor === "B"
                      ? "V2"
                      : "V1"
                    : undefined
                }
                onHipotesis={setDeclarada}
                onComparacion={setComparacionDeclarada}
              />
            ) : null}
          </DetalleReconstruccion>
        </div>
      );
    if (actual === 4)
      return (
        <ActoDanos
          expediente={expediente}
          r={r}
          supuestos={supuestos}
          criterios={inicial.ejemplo ? criterios : null}
          onCriterio={(l, clave, v) =>
            setCriterios((c) => ({ ...c, [l]: { ...c[l], [clave]: v } }))
          }
          letraDe={letraDe}
          nombreDe={nombreLab}
        />
      );
    if (actual === 5)
      return (
        <div className="flex flex-col gap-8">
          <PasoNumeros r={r} verificacion={verificacion} contraCesvi={contraCesvi} />
          {inicial.ejemplo ? (
            <Calculos caso={inicial.ejemplo} distancia={distancia} onDistancia={setDistancia} />
          ) : null}
        </div>
      );
    if (actual === 6 && reporte && comparacionReporte)
      return (
        <ActoContraste
          reporte={reporte}
          comparacion={comparacionReporte}
          caso={inicial.ejemplo ?? null}
          r={r}
          calles={calles}
          letraDe={letraDe}
          contra={contraCesvi}
          restos={inicial.ejemplo ? filaDeRestos(inicial.ejemplo) : null}
        />
      );
    return r ? (
      <DictamenCaso
        expediente={expediente}
        narracion={narracion}
        reconstruccion={r}
        verificacion={verificacion}
        declarada={comparacionDeclarada}
        exportApi={vista === "3d" ? exportApi : null}
        mapa={mapa}
        validacion={validacion}
        onValidacion={setValidacion}
        tema={tema}
        bitacora={pizarra.bitacora}
        supuestos={supuestos}
        titulo={tituloDelHecho(expediente, texto.trim() || null)}
        relato={texto.trim() || null}
        casoId={inicial.ejemplo ? `${inicial.ejemplo.aseguradora} ${inicial.ejemplo.id}` : null}
        lugar={[expediente.caso.lugar?.municipio?.valor, expediente.caso.lugar?.estado?.valor]
          .filter(Boolean)
          .join(", ")}
        calles={calles}
        contra={comparacionReporte ? cifraContraste(comparacionReporte) : null}
        letraDe={letraDe}
        acciones={{
          guardarAqui: guardarEnEquipo,
          guardarArchivo: () => {
            const a = archivoCaso();
            if (!a) return;
            downloadBytes(
              new TextEncoder().encode(
                `${JSON.stringify(a, null, 2)}\n`,
              ) as Uint8Array<ArrayBuffer>,
              nombreArchivoCaso(titulo),
              "application/json",
            );
          },
          aviso: avisoGuardado,
        }}
      />
    ) : (
      <p className="t-nota">Reconstruye en «La reconstrucción» para armar el dictamen.</p>
    );
  })();

  const verMapa = vista === "mapa" || !r;
  // Presentar a pantalla completa necesita la reconstrucción; sin ella, se consulta el recorrido.
  const presentando = modo === "presentar" && r !== null && !rec.vieja;
  // La reconstrucción (el pico, Laboratorio §8): la escena a sangre y la hoja encima.
  const pico = actual === 3 && !expandido;
  // Los daños y Contra CESVI ocupan todo el ancho, sin mapa (Laboratorio §8).
  const hojaAncha = actual === 4 || actual === 6 || actual === 7;
  // El 3D solo dibuja cuando se ve: oculto seguía a todo ritmo y ahogaba la página (la foto del
  // dictamen lo despierta si le hace falta).
  const visorAlaVista = vista === "3d" && !presentando && !hojaAncha && actual !== 1;
  const vPico = r ? protagonista(r) : null;
  const idPico =
    r && vPico ? Object.entries(r.ids).find(([, id]) => id === vPico.vehiculo)?.[0] : null;
  // Lo obligatorio de cada paso (V2): «Siguiente» dice qué falta y los pasos futuros esperan.
  const claves = pasos.map((n) => CLAVES_PASOS[PASOS.indexOf(n)]!);
  const estadoPasos = {
    esperaReporte: inicial.origen === "importado" && !leida,
    expediente,
    reconstruido: r !== null && !rec.vieja,
    finalesDesconocidos: desconocidos,
    nombres: nombresPantalla,
  };
  // La escena fácil ocupa todo en «La escena» al trabajar; el mapa de antes queda montado debajo
  // (el dictamen toma de él la imagen del croquis).
  const escenaFacil = actual === 2 && modo === "trabajar" && expediente !== null && leida !== null;
  const falta = faltaEnPaso(claves[paso]!, estadoPasos);
  // Posiciones finales encimadas: se avisan con la propuesta para separarlas (comentario de René).
  const encimadas = useMemo(
    () => (expediente ? posicionesEncimadas(expediente) : []),
    [expediente],
  );
  const abierto = (i: number) => pasoAbierto(claves, i, estadoPasos);
  const siguienteNombre = pasos[paso + 1];
  // El mapa es el contenido en el lugar y la reconstrucción; en los demás pasos, una tarjeta.
  const grande = actual === 2 || actual === 3;
  const lugar = expediente?.caso.lugar;
  const lugarTexto = [lugar?.descripcion?.valor, lugar?.municipio?.valor, lugar?.estado?.valor]
    .filter(Boolean)
    .join(", ");
  // «Continuar a…» nombra el acto siguiente cuando el paso que sigue empieza otro acto (prompt §4).
  const actoSiguiente = actos[actoDePaso(actos, paso + 1)];
  const nombreSiguiente =
    actoSiguiente && actoDePaso(actos, paso + 1) !== actoIdx
      ? actoSiguiente.nombre
      : siguienteNombre;
  const textoSiguiente = nombreSiguiente ? continuarA(nombreSiguiente) : "";
  // Un .croquis abierto o soltado en la lista de casos.
  const abrirArchivoRef = useRef(abrirArchivo);
  useEffect(() => {
    abrirArchivoRef.current = abrirArchivo;
  });
  useEffect(() => {
    // Se toma dentro del cuadro: en modo estricto el efecto corre dos veces y el primero se cancela.
    const id = requestAnimationFrame(() => {
      const f = tomarArchivo("caso");
      if (f) void abrirArchivoRef.current(f);
    });
    return () => cancelAnimationFrame(id);
  }, []);

  // Rutas por acto (prompt §4): se abre en el acto de la ruta si ya se puede, y la ruta sigue al acto
  // sin recargar (el estado del recorrido vive aquí).
  const actoDeRutaVisto = useRef(false);
  useEffect(() => {
    if (actoDeRutaVisto.current) return;
    actoDeRutaVisto.current = true;
    if (!actoInicial) return;
    const destino = actos.find((a) => a.clave === actoInicial)?.pasos[0];
    if (destino === undefined || destino === paso || !abierto(destino)) return;
    const r = requestAnimationFrame(() => irA(destino));
    return () => cancelAnimationFrame(r);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al abrir el caso
  }, []);
  useEffect(() => {
    if (!claveActo) return;
    const ruta = rutaDeActo(window.location.pathname, claveActo);
    if (ruta !== window.location.pathname)
      window.history.replaceState(window.history.state, "", ruta + window.location.search);
  }, [claveActo]);
  return (
    <div
      className="fixed inset-0 flex flex-col bg-fondo text-texto"
      data-tema={tema}
      data-modo={modo}
      data-testid="recorrido-caso"
      data-origen={inicial.origen}
      data-acto={actos[actoIdx]?.clave}
    >
      {transicion ? (
        <TransicionActo
          key={transicion.id}
          numero={transicion.n}
          nombre={transicion.nombre}
          larga={transicion.larga}
          onFin={terminarTransicion}
        />
      ) : null}
      {presentando && r ? (
        <PresentarCaso
          r={r}
          calles={calles}
          clave={
            inicial.ejemplo
              ? `${inicial.ejemplo.aseguradora} ${inicial.ejemplo.id} · km ${inicial.ejemplo.lugar.kilometro.replace(/^km\s*/i, "")}`
              : titulo
          }
          tema={tema}
          lugar={[lugar?.municipio?.valor, lugar?.estado?.valor].filter(Boolean).join(", ")}
          modalidad={
            comparacionReporte?.modalidad.cesvi
              ? (MODALIDAD[comparacionReporte.modalidad.cesvi] ??
                comparacionReporte.modalidad.cesvi)
              : null
          }
          contra={comparacionReporte ? cifraContraste(comparacionReporte) : null}
          fisica={
            comparacionReporte
              ? lecturaFisica(contraCesvi, cifraContraste(comparacionReporte)?.vehiculo ?? null)
              : null
          }
          letraDe={letraDe}
          conteo={
            comparacionReporte ? conteoCriterios(criteriosContraste(comparacionReporte)) : null
          }
          nombreDe={nombreLab}
          onSalir={() => setModo("trabajar")}
        />
      ) : null}
      <BarraRecorrido
        pasos={pasos}
        actos={actos}
        transiciones={transicionesActivas}
        paso={paso}
        irA={(i) => {
          if (i <= paso || abierto(i)) irA(i);
        }}
        abierto={abierto}
        modo={modo}
        onModo={setModo}
        tema={tema}
        resumen={titulo}
        completo={Boolean(expediente && validacionVigente(validacion, expediente, narracion))}
        onExportar={() => {
          if (!abierto(pasos.length - 1)) return;
          setModo("trabajar");
          irA(pasos.length - 1);
        }}
      />
      {escenaFacil && expediente && leida ? (
        <div className="relative min-h-0 flex-1" data-testid="escena-fondo">
          <EscenaFacil
            tema={tema}
            estado={{
              expediente,
              desconocidos,
              direccionesNoSe,
              juntoAlChoque,
              puntos: puntosImpacto,
            }}
            onEstado={(x) => {
              cambiarExpediente(x.expediente);
              setDesconocidos(x.desconocidos);
              setDireccionesNoSe(x.direccionesNoSe);
              setJuntoAlChoque(x.juntoAlChoque);
              setPuntosImpacto({ ...x.puntos });
            }}
            impactos={impactos}
            narracion={texto.trim() || null}
            posicionesNarradas={leida.posiciones}
            calles={calles}
            callesFallaron={callesFallaron}
            lugar={expediente.caso.lugar?.coordenadas ?? null}
            descripcionLugar={expediente.caso.lugar?.descripcion?.valor ?? null}
            zona={{
              municipio: expediente.caso.lugar?.municipio?.valor,
              estado: expediente.caso.lugar?.estado?.valor,
            }}
            onBuscarCalles={setCentroBuscado}
            onVerReconstruccion={() => irA(paso + 1)}
            onNota={(t) => setPizarra((x) => delPerito(x, t))}
          />
        </div>
      ) : null}
      <div
        className={`relative flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto lg:flex-row lg:overflow-hidden ${pico ? "lg:justify-end lg:p-4" : "p-4 md:p-7"} ${escenaFacil ? "hidden" : ""}`}
      >
        <main
          ref={panelPaso}
          className={`flex min-h-0 min-w-0 flex-col gap-5 lg:overflow-y-auto ${pico ? "escena-hoja z-10 gap-3 p-5 lg:w-[456px] lg:shrink-0 lg:px-7 lg:pt-5 lg:pb-7" : grande ? "lg:w-[440px] lg:shrink-0" : "lg:flex-1"} ${hojaAncha ? "lg:-mx-7 lg:-my-7 lg:px-7 lg:py-7" : ""}`}
          aria-label={pasos[paso]}
          data-testid="panel-paso"
          data-paso={actual + 1}
        >
          <p className={pico || hojaAncha ? "sr-only" : "t-rotulo"} data-testid="rotulo-acto">
            Acto {actoIdx + 1} de {actos.length} · {actos[actoIdx]?.nombre}
            {(actos[actoIdx]?.pasos.length ?? 0) > 1
              ? ` · ${(actos[actoIdx]?.pasos.indexOf(paso) ?? 0) + 1} de ${actos[actoIdx]?.pasos.length}: ${pasos[paso]}`
              : ""}
          </p>
          {cuerpo}
          <div
            className={`mt-auto flex flex-col gap-2 ${pico ? "pt-3" : "pt-4"} ${pico ? "sticky -bottom-5 z-10 -mx-5 -mb-5 bg-superficie px-5 pb-5 lg:-bottom-7 lg:-mx-7 lg:-mb-7 lg:px-7 lg:pb-7" : ""}`}
          >
            {(actual === 2 || actual === 3) && modo === "trabajar"
              ? encimadas.map((enc) => (
                  <div
                    key={enc.vehiculos.join("-")}
                    role="status"
                    className="flex flex-wrap items-center gap-3 border-l-2 border-senal pl-3"
                    data-testid="aviso-encimadas"
                  >
                    <p className="t-nota">
                      <b className="text-texto">
                        {enc.vehiculos[0]} y {enc.vehiculos[1]} quedaron encimados
                      </b>{" "}
                      en su posición final ({enc.traslape_m.toFixed(2)} m). Dos vehículos en reposo
                      no ocupan el mismo lugar.
                    </p>
                    <button
                      type="button"
                      className="boton-secundario"
                      data-testid="separar-encimadas"
                      onClick={() => {
                        if (!expediente) return;
                        setHistorial((h) => [...h, expediente]);
                        let r = expediente;
                        for (const pose of enc.propuesta)
                          r = conPosicion(r, { ...pose, fase: "final" });
                        cambiarExpediente(r);
                      }}
                    >
                      Separarlos
                    </button>
                  </div>
                ))
              : null}
            {falta.length ? (
              <p className="t-nota" role="status" data-testid="falta-para-seguir">
                Para seguir falta: <b className="text-texto">{enLista(falta)}</b>.
              </p>
            ) : null}
            <div className="flex justify-between gap-3">
              <button
                type="button"
                className="boton-secundario"
                onClick={() => irA(paso - 1)}
                disabled={paso === 0}
                aria-label="Anterior"
                data-testid="anterior"
              >
                {pico ? "←" : "← Anterior"}
              </button>
              {siguienteNombre ? (
                <button
                  type="button"
                  className={`boton-principal boton-continuar ${pico ? "flex-1" : ""}`}
                  onClick={() => irA(paso + 1)}
                  disabled={falta.length > 0}
                  data-testid="siguiente"
                >
                  {textoSiguiente}
                  <span className="flecha-continuar" aria-hidden="true">
                    →
                  </span>
                </button>
              ) : null}
            </div>
          </div>
        </main>
        <section
          className={
            expandido
              ? "fixed inset-0 z-40 bg-fondo"
              : // En el hecho no hay mapa (A5): se queda montado pero oculto, para no volver a
                // cargarlo al llegar al lugar (MapLibre se ajusta solo al reaparecer).
                pico
                ? "relative order-first min-h-[60vh] overflow-hidden lg:absolute lg:inset-0 lg:min-h-0"
                : `relative min-h-[50vh] overflow-hidden rounded-panel border border-linea-suave ${grande ? "lg:flex-1" : "lg:h-[460px] lg:w-[420px] lg:shrink-0 lg:self-start"} ${actual === 7 ? "pointer-events-none invisible absolute! h-[460px] w-[640px]" : actual === 1 || hojaAncha ? "hidden" : ""}`
          }
          aria-label="Mapa"
          data-testid="escenario"
          data-expandido={expandido ? "si" : "no"}
        >
          {/* Bajo el 3D el mapa queda montado pero quieto: no recibe posiciones ni se vuelve a
              dibujar (ADR 0104); el dictamen toma de aquí la imagen del croquis. */}
          <div
            className={`absolute inset-0 ${pico ? "lg:right-[488px]" : ""} ${verMapa ? "" : "invisible"}`}
          >
            <MapaEscena
              tema={tema}
              onMapa={setMapa}
              posiciones={posiciones}
              moviles={moviles}
              impactos={rec.impactos}
              onClic={colocar}
              inicio={lugar?.coordenadas ?? null}
              lugarTexto={lugarTexto}
              lugarZona={{ municipio: lugar?.municipio?.valor, estado: lugar?.estado?.valor }}
              herramienta={actual === 2 && modo === "trabajar" ? herramientaMapa : "mover"}
              pedirLugar={actual === 2 || expandido}
              huellas={huellas}
              flecha={colocacion ? null : flecha}
              colocacion={colocacion}
              onFlecha={girar}
              onMedida={setMedida}
              onDeshacer={actual === 2 && modo === "trabajar" ? deshacer : undefined}
            />
          </div>
          {r ? (
            <div
              className={`absolute inset-0 bg-fondo ${pico ? "lg:right-[488px]" : ""} ${vista === "3d" ? "" : "pointer-events-none invisible"}`}
            >
              <Visor3dCaso
                r={r}
                activo={visorAlaVista}
                camaraPedida={camaraPedida}
                aSangre={pico}
                contraCesvi={contraCesvi}
                declarada={declarada}
                onExportApi={setExportApi}
                // Con el 3D a la vista el mapa está desmontado: no hace falta mover sus
                // marcadores (cada aviso del reloj volvía a dibujar toda la página, ~200 ms en
                // una laptop; René, 2026-11-04). Al volver al mapa, el reloj se pausa y avisa una
                // vez con el instante en que quedó.
                onPosiciones={verMapa ? setMoviles : IGNORAR_POSICIONES}
                calles={calles}
                objetos={objetos}
                expandido={expandido}
                supuestos={supuestos}
              />
            </div>
          ) : null}
          {/* La maqueta del caso (Laboratorio §7): la escena desde arriba, generada del resultado. */}
          {r && vista === "maqueta" ? (
            <div
              className={`absolute inset-0 ${pico ? "lg:right-[488px]" : "bg-fondo p-3 pt-16"}`}
              data-testid="panel-maqueta"
            >
              <MaquetaCaso
                r={r}
                calles={calles}
                nombres={Object.fromEntries(
                  Object.entries(r.ids).map(([resId, id]) => [resId, nombreLab(String(id))]),
                )}
                tips={Object.fromEntries(
                  Object.entries(r.ids).map(([resId, id]) => {
                    const v = expediente?.vehiculos.find((x) => x.id === id);
                    return [
                      resId,
                      tipVehiculo({
                        nombre: nombreLab(String(id)),
                        masaKg: v?.masa?.valor ?? null,
                        masaDe: v?.masa?.fuente ?? null,
                        impactoKmh:
                          r.velocidades.find((x) => x.vehiculo === id)?.impacto?.p50 ?? null,
                        dano: expediente ? textoDano(expediente, String(id)) : null,
                      }),
                    ];
                  }),
                )}
                tipDelImpacto={tipImpacto(
                  Object.values(r.ids)
                    .map((id) => letraDe(String(id)))
                    .sort()
                    .join(" y "),
                  posiciones.find((p) => p.fase === "impacto")?.fuente ?? null,
                )}
                anchoVia={
                  inicial.ejemplo
                    ? { m: inicial.ejemplo.lugar.ancho_arroyo_m.valor, de: "del reporte" }
                    : null
                }
                detalles={Object.fromEntries(
                  Object.entries(r.ids).flatMap(([resId, id]) => {
                    const d = expediente ? textoDano(expediente, String(id)) : null;
                    return d ? [[resId, d.charAt(0).toLowerCase() + d.slice(1)]] : [];
                  }),
                )}
              />
            </div>
          ) : null}
          {!posiciones.length && !grande && !expandido ? (
            <div className="vidrio pointer-events-none absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 rounded-panel px-5 py-4 text-center">
              <span className="t-interfaz font-semibold">El lugar aún no está marcado</span>
              <span className="t-nota">Lo marcas en el paso 3.</span>
            </div>
          ) : null}
          {actual === 2 && modo === "trabajar" && verMapa ? (
            <div
              className={`pointer-events-none absolute z-10 flex flex-col gap-2 ${expandido ? "top-5 left-1/2 -translate-x-1/2 items-center" : "top-3 left-3 items-start"}`}
            >
              {/* El contenedor deja pasar el puntero (no tapa lo que se arrastra en el mapa); los botones no. */}
              <div
                className="segmentado pointer-events-auto"
                role="tablist"
                aria-label="Herramienta del mapa"
              >
                {(
                  [
                    ["colocar", "Colocar"],
                    ["mover", "Mover mapa"],
                    ["medir", "Medir"],
                  ] as const
                ).map(([h, nombre]) => (
                  <button
                    key={h}
                    type="button"
                    role="tab"
                    aria-selected={herramientaMapa === h}
                    className="px-3"
                    onClick={() => setHerramientaMapa(h)}
                    data-testid={`herramienta-${h}`}
                  >
                    {nombre}
                  </button>
                ))}
              </div>
              {herramientaMapa === "colocar" ? (
                <p className="vidrio t-nota pointer-events-none rounded-control px-3 py-1.5">
                  En «Colocar» el mapa no se mueve. Mantén Espacio para moverlo.
                </p>
              ) : herramientaMapa === "medir" ? (
                <p className="vidrio t-nota pointer-events-none rounded-control px-3 py-1.5">
                  Toca los dos extremos de lo que mides.
                </p>
              ) : null}
            </div>
          ) : null}
          <div className={`absolute z-10 flex gap-2 ${pico ? "top-4 left-4" : "top-3 right-3"}`}>
            {r ? (
              <div
                className={`segmentado ${pico ? "segmentado-tinta" : ""}`}
                role="tablist"
                aria-label="Vista"
              >
                {(
                  [
                    ["maqueta", "maqueta", pico ? "Cenital" : "Maqueta", null],
                    ...(pico && idPico && vPico
                      ? ([
                          [
                            "detras",
                            "3d",
                            `Detrás de ${letraDe(vPico.vehiculo)}`,
                            `detras-${idPico}`,
                          ],
                          [
                            "conductor",
                            "3d",
                            `Conductor ${letraDe(vPico.vehiculo)}`,
                            `conductor-${idPico}`,
                          ],
                        ] as const)
                      : []),
                    ["3d", "3d", pico ? "Órbita 3D" : "3D", pico ? "libre" : null],
                    ["mapa", "mapa", "Mapa", null],
                  ] as const
                ).map(([id, v, nombre, camara]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={
                      camara
                        ? vista === "3d" && camaraPedida?.camara === camara
                        : vista === v && (v !== "3d" || !pico)
                    }
                    className="px-3"
                    onClick={() => {
                      if (v === "mapa") setMoviles([]);
                      setVista(v);
                      if (camara) setCamaraPedida((c) => ({ camara, n: (c?.n ?? 0) + 1 }));
                    }}
                    data-testid={`vista-${id}`}
                  >
                    {nombre}
                  </button>
                ))}
              </div>
            ) : null}
            {pico ? null : (
              <button
                type="button"
                className="vidrio rounded-full px-4 py-2 text-[0.8125rem] font-medium"
                onClick={() => setExpandido(!expandido)}
                data-testid={expandido ? "contraer-mapa" : "expandir-mapa"}
              >
                {expandido ? "⤡ Contraer · Esc" : "⤢ Expandir"}
              </button>
            )}
          </div>
          {expandido ? (
            <>
              <aside
                className="vidrio absolute top-5 left-5 z-10 flex w-[300px] flex-col gap-2 rounded-panel p-4"
                aria-label="Lo que falta"
                data-testid="panel-expandido"
              >
                <span className="t-rotulo">
                  Paso {paso + 1} · {pasos[paso]}
                </span>
                <span className="t-nota">
                  {falta.length ? (
                    <>
                      Falta: <b className="text-texto">{enLista(falta)}</b>
                    </>
                  ) : (
                    "Listo: puedes seguir."
                  )}
                </span>
              </aside>
              {siguienteNombre ? (
                <div className="vidrio absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 items-center gap-4 rounded-full py-2 pr-2 pl-5">
                  <span className="t-nota">
                    {falta.length ? `Falta: ${enLista(falta)}` : "Todo listo en este paso."}
                  </span>
                  <button
                    type="button"
                    className="boton-principal boton-compacto"
                    disabled={falta.length > 0}
                    onClick={() => {
                      setExpandido(false);
                      irA(paso + 1);
                    }}
                  >
                    {textoSiguiente}
                    <span className="flecha-continuar" aria-hidden="true">
                      →
                    </span>
                  </button>
                </div>
              ) : null}
            </>
          ) : verMapa ? (
            // En el 3D la leyenda de CESVI va en la banda del visor (y no tapa sus controles).
            <p
              className={`vidrio pointer-events-none absolute bottom-3 z-10 px-2 py-1 text-[0.6875rem] text-texto-2 ${pico ? "right-3 lg:right-[500px]" : "right-3"}`}
            >
              {LEGEND_TEXT_CESVI}
            </p>
          ) : null}
        </section>
      </div>
    </div>
  );
}
