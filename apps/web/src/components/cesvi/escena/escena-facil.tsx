"use client";
/**
 * La escena, rehecha desde cero (René, 2026-11-05, tras la prueba con personas T4): que la entienda
 * un niño. Una pregunta a la vez, en palabras de todos los días; Croquis propone primero a partir de
 * la narración y la persona confirma con un toque. Referencia: `docs/cesvi/rediseno/escena-facil/`.
 *
 * Guarda lo mismo de antes en el expediente (posiciones, rumbos y la bandera de supuesto): el
 * solver no cambia. La lógica sin interfaz está en `lib/escena-facil.ts`.
 */
import { posesEnObstaculos } from "@/lib/poses-en-obstaculos";
import {
  formato as F,
  agregarObjeto,
  agregarPersona,
  cambiarTamano,
  cambiarTerreno,
  conHuella,
  conPosicion,
  conRestos,
  distanciaM,
  distanciaProyeccion,
  empalmesDeObjetos,
  escalarTerreno,
  friccionDeTabla,
  girarObjeto,
  girarPersona,
  girarTerreno,
  marcarFinalPersona,
  medidasDe,
  moverObjeto,
  nombrePersona,
  nombreSuperficie,
  objetosDe,
  piezasTerreno,
  posicionesEncimadas,
  impactosEncimados,
  quitarTerreno,
  rumboDeLlegada,
  TIPOS_OBJETO,
  usarRelieve,
  usaRelieve,
  type Expediente,
  type ObstaculoDelMapa,
  type PosicionDescrita,
  type RolPersona,
  type TipoObjeto,
  separarLugarYSentido,
} from "@croquis/cesvi";
import { overpassDeTeselas, type OverpassResponse } from "@croquis/croquis-2d";
import { RADIO_CALLES_M } from "@/lib/calles-del-mapa";
import { useSearchParams } from "next/navigation";
import { HerramientasEscena, ListaEscena } from "./lista-escena";
import {
  listaDeLaEscena,
  listaLista,
  proponerEscena,
  rumboDelSentido,
  type EscenaPropuesta,
  type ItemEscena,
} from "@/lib/escena-propuesta";
import type { Map as MapaMl } from "maplibre-gl";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ajustarACalle,
  avisarSinCalles,
  callesDe,
  cruceNarrado,
  carreteraNarrada,
  callesEn,
  choqueLejosDeCalles,
  coloresVehiculos,
  contraNarracion,
  elegirDireccion,
  flechaPropuesta,
  flechaDelToque,
  flechasDeLlegada,
  fueraDeLaCalle,
  girar,
  marcarFinal,
  nombreVehiculo,
  pasoActual,
  pasosEscena,
  poseDe,
  ponerEnLaCalle,
  proponerChoque,
  quedoJuntoAlChoque,
  finalDeLaNarracion,
  tocarChoque,
  ponerTerrenoEn,
  puntoDelChoqueTocado,
  tocarFinal,
  resumenEscena,
  rumboAlineado,
  sentidoEnElCaso,
  sinFinal,
  textoChoqueListo,
  textoFlecha,
  textoSentido,
  type Flecha,
  type ImpactoAColocar,
  type LineaResumen,
  type Punto,
} from "@/lib/escena-facil";
import { siluetaClase } from "@/lib/colocar";
import { interpretarLugar } from "@/lib/lugar-texto";
import { callesDelCaso, lugarClaro } from "@/lib/lugar-claro";
import { etiquetaOpcion, type OpcionLugar, zonaDeOpcion } from "@/lib/lugar-opcion";
import {
  agregarChoqueIntermedio,
  agregarPuntoDePaso,
  choquesIntermedios,
  articuloObjeto,
  marcarPrimerGolpe,
  OBJETOS_C1,
  primerGolpe,
  puntosDePaso,
  quitarChoqueIntermedio,
  quitarUltimoPuntoDePaso,
  resumenC1,
  resumenPersonas,
  type RespuestasC1,
} from "@/lib/escena-facil";
import {
  AvisoFaltaPersona,
  BarraSeleccion,
  PanelCorregir,
  alPersona,
  articuloPersona,
  type AccionSeleccion,
} from "./correccion";
import { AvisoEscenaCambio } from "./aviso-escena-cambio";
import { IconoPersona } from "./figura-persona";
import {
  accionDeTecla,
  capacidadesDe,
  deClave,
  desplazar,
  enCampoDeTexto,
  existe,
  alinearConLaCalle,
  fijarRumbo,
  voltear,
  girarSeleccion,
  moverA,
  personaFaltante,
  posicionDe,
  quitarSeleccion,
  seleccionables,
  type EstadoFrenteAEscena,
} from "@/lib/seleccion-escena";
import {
  COLOR_PERSONA,
  MapaFacil,
  trayectoDeLlegada,
  type CocheMapa,
  type FlechaMapa,
  type PersonaMapa,
  type TerrenoMapa,
  ZOOM_TRABAJO,
} from "./mapa-facil";
import { textoMedicion } from "@/lib/medir";
import { medidasDePieza, PreguntaTerreno, type PoniendoTerreno } from "./terreno";

/** Más lejos que esto del choque, un punto de C1 se confirma con una alerta (m). */
const GOLPE_LEJOS_M = 30;
const C1_LEJOS_M = 150;
/** Cuántos cambios guarda «Deshacer». */
const MAX_DESHACER = 200;

/** Lo que la escena cambia: el expediente y lo que la persona no sabía. */
export interface EstadoEscena {
  expediente: Expediente;
  /** «No sé dónde quedó». */
  desconocidos: readonly string[];
  /** «No sé por dónde venía». */
  direccionesNoSe: readonly string[];
  /** «Quedó junto al choque». */
  juntoAlChoque: readonly string[];
  /** El punto de cada choque, por orden. */
  puntos: Readonly<Record<number, Punto>>;
  /** C1 (W3): lo contestado en las preguntas de después de colocar los vehículos. */
  c1?: RespuestasC1;
}

type Mensaje = {
  tipo: "exito" | "alerta" | "error";
  texto: string;
  /** Una clave para no repetir una alerta que la persona ya descartó. */
  clave?: string;
  acciones?: { texto: string; hacer: () => void; principal?: boolean; id: string }[];
  deshacer?: boolean;
};

/** Cómo contesta el perito «¿Dónde quedó después del choque?». */
type OpcionFinal = "narracion" | "marcar" | "junto" | "nose";

export function EscenaFacil({
  tema,
  estado,
  onEstado,
  impactos,
  narracion,
  posicionesNarradas,
  calles: callesOverpass,
  callesFallaron: overpassFallo,
  onCallesDelMapa,
  lugar,
  descripcionLugar = null,
  zona,
  onBuscarCalles,
  onReintentarCalles,
  onVerReconstruccion,
  onNota,
  recalculo = null,
  onReconstruir,
  errorReconstruccion = null,
  obstaculos = [],
}: {
  tema: "claro" | "oscuro";
  estado: EstadoEscena;
  onEstado: (e: EstadoEscena) => void;
  impactos: readonly ImpactoAColocar[];
  narracion: string | null;
  /** Lo que la narración dice de cada posición (para citarlo junto a la pregunta). */
  posicionesNarradas: readonly PosicionDescrita[];
  calles: OverpassResponse | null;
  /** Las calles leídas de las teselas del mapa (ronda 4), para que el recorrido las use también. */
  onCallesDelMapa?: (r: OverpassResponse) => void;
  /** No llegaron las calles del mapa (sin red o el servicio no respondió). */
  callesFallaron: boolean;
  lugar: Punto | null;
  /** Cómo describe el lugar el caso («crucero de la calle Azucena esquina con Av. Reforma…»). */
  descripcionLugar?: string | null;
  zona: { municipio?: string; estado?: string };
  /** Pide las calles alrededor de un punto (el lugar buscado). */
  onBuscarCalles: (p: Punto) => void;
  /** Pide otra vez las calles cuando la consulta falló (René, 2026-11-25). */
  onReintentarCalles?: () => void;
  onVerReconstruccion: () => void;
  /** Lo que decide la persona y conviene anotar en la bitácora («No sé dónde quedó…»). */
  onNota: (texto: string) => void;
  /**
   * Cómo está la reconstrucción frente a esta escena: al día, recalculándose o vieja (la escena
   * cambió después de reconstruir; René, 2026-11-17: se dice y se ofrece reconstruir de nuevo).
   */
  recalculo?: EstadoFrenteAEscena;
  /** «Reconstruir de nuevo»: con la escena como está, sin borrar nada más. */
  onReconstruir?: () => void;
  /** Si la última reconstrucción falló, por qué. */
  errorReconstruccion?: string | null;
  /** Los edificios y muros del mapa (René, 2026-11-24): se avisa si un vehículo queda sobre uno. */
  obstaculos?: readonly ObstaculoDelMapa[];
}) {
  const e = estado.expediente;
  // Ronda 4 (René, 2026-11-18, propuesta 1): la escena ya armada con su lista. La de una pregunta a
  // la vez sigue con `?escena=anterior` (la guía de medición la usa para el «antes»).
  const sp = useSearchParams();
  const [nuevo] = useState(() => {
    const q = sp.get("escena");
    if (q === "anterior") return false;
    if (q === "nueva") return true;
    try {
      return localStorage.getItem("croquis.escena") !== "anterior";
    } catch {
      return true;
    }
  });
  const [confirmados, setConfirmados] = useState<ReadonlySet<string>>(new Set());
  const [guiaVista, setGuiaVista] = useState(false);
  // Ronda 4 (René, 2026-11-18): las calles de las teselas del mapa, mientras Overpass no llega (tarda
  // unos 35 s o no responde). Las flechas y el cruce salen de ahí en cuanto el mapa dibujó el lugar.
  const [mapaListo, setMapaListo] = useState<MapaMl | null>(null);
  const [callesTeselas, setCallesTeselas] = useState<{
    de: string;
    r: OverpassResponse;
  } | null>(null);
  // Sin choque ni lugar, el centro del mapa (ya está en el lugar buscado).
  const [centroMapa, setCentroMapa] = useState<Punto | null>(null);
  useEffect(() => {
    if (!mapaListo) return undefined;
    const alMover = () => {
      const c = mapaListo.getCenter();
      // Redondeado a ~10 m: una clave, no una cifra que se escriba.
      const r4 = (x: number) => Math.round(x * 1e4) / 1e4;
      // Solo de cerca (zoom 15 o más): de lejos, el centro del mapa no es un lugar del caso.
      setCentroMapa(mapaListo.getZoom() >= 15 ? { lat: r4(c.lat), lon: r4(c.lng) } : null);
    };
    mapaListo.on("moveend", alMover);
    mapaListo.once("idle", alMover);
    mapaListo.triggerRepaint();
    return () => {
      mapaListo.off("moveend", alMover);
    };
  }, [mapaListo]);
  // Las teselas de qué lugar ya se leyeron (con o sin calles): antes de eso no se avisa nada.
  const [teselasLeidas, setTeselasLeidas] = useState<string | null>(null);
  const centroTeselas = estado.puntos[1] ?? lugar ?? centroMapa;
  const claveTeselas = centroTeselas
    ? `${Math.round(centroTeselas.lon * 1e4)},${Math.round(centroTeselas.lat * 1e4)}`
    : null;
  useEffect(() => {
    if (callesOverpass || !mapaListo || !claveTeselas) return undefined;
    const [lon, lat] = claveTeselas.split(",").map((x) => Number(x) / 1e4) as [number, number];
    const leer = () => {
      try {
        const capa = (sourceLayer: string) =>
          mapaListo.querySourceFeatures("openmaptiles", { sourceLayer }) as unknown as Parameters<
            typeof overpassDeTeselas
          >[0];
        const r = overpassDeTeselas(
          capa("transportation"),
          capa("transportation_name"),
          [lon, lat],
          RADIO_CALLES_M,
        );
        if (r.elements.some((x) => x.type === "way")) {
          setCallesTeselas({ de: claveTeselas, r });
          onCallesDelMapa?.(r);
        }
        setTeselasLeidas(claveTeselas);
      } catch {
        // Sin las teselas (el estilo aún no carga): se espera a Overpass, como antes.
      }
    };
    // Al terminar de dibujar el lugar (las teselas ya están); si ya terminó, en el siguiente cuadro.
    mapaListo.once("idle", leer);
    mapaListo.triggerRepaint();
    return () => {
      mapaListo.off("idle", leer);
    };
  }, [callesOverpass, mapaListo, claveTeselas, onCallesDelMapa]);
  const deTeselas = callesTeselas?.de === claveTeselas ? callesTeselas.r : null;
  const calles = callesOverpass ?? deTeselas;
  // Ronda 4 (René): el aviso solo si de verdad no hay calles de ninguna fuente (Overpass, las teselas
  // de este mapa o las que ya leyó el recorrido), y una sola vez por lugar en la sesión.
  // La regla del aviso de calles, probada en `avisarSinCalles` (escena-facil.test.ts).
  const claveAvisoCalles = `croquis.aviso-calles:${claveTeselas ?? "sin-lugar"}`;
  const [avisoCallesVisto] = useState(() => {
    try {
      return sessionStorage.getItem(claveAvisoCalles) === "1";
    } catch {
      return false;
    }
  });
  const callesMapa = useMemo(() => callesDe(calles), [calles]);
  const vehiculos = e.vehiculos;
  const nombres = useMemo(
    () => Object.fromEntries(vehiculos.map((v) => [v.id, nombreVehiculo(v, vehiculos)])),
    [vehiculos],
  );
  const colores = useMemo(() => coloresVehiculos(vehiculos, narracion), [vehiculos, narracion]);
  const sentidos = useMemo(
    () =>
      Object.fromEntries(
        vehiculos.map((v) => [v.id, narracion ? sentidoEnElCaso(narracion, v, vehiculos) : null]),
      ),
    [vehiculos, narracion],
  );
  const c1 = useMemo(() => estado.c1 ?? {}, [estado.c1]);
  const pasos = pasosEscena(e, impactos, { ...estado, c1 });
  // C1: una pregunta que sigue abierta mientras se agregan choques o puntos, o que se reabre.
  const [editandoC1, setEditandoC1] = useState<"golpe" | "otros" | "paso" | "terreno" | null>(null);
  const [otro, setOtro] = useState<{
    abierto: boolean;
    vehiculo: string | null;
    objeto: string | null;
  }>({ abierto: false, vehiculo: null, objeto: null });
  const [pasoDe, setPasoDe] = useState<string | null>(null);
  // Mientras coloca dónde quedó un coche, ese paso sigue abierto hasta «Listo, así quedó».
  const [colocando, setColocando] = useState<string | null>(null);
  const [editando, setEditando] = useState<{
    tipo: "choque" | "direccion" | "final";
    id: string;
  } | null>(null);
  const [opcionFinal, setOpcionFinal] = useState<Record<string, OpcionFinal>>({});
  /** Dónde quedó como lo dice la narración (René, 2026-11-24), o null si no da una distancia. */
  const finalNarradoDe = (v: string) => {
    const n = posicionesNarradas.find((p) => p.vehiculo === v && p.fase === "final");
    return n
      ? finalDeLaNarracion(
          e,
          v,
          n.descripcion,
          posicionesNarradas.filter((x) => x.fase === "final"),
        )
      : null;
  };
  const [marcoYo, setMarcoYo] = useState(false);
  const [mensaje, setMensaje] = useState<Mensaje | null>(null);
  const [descartadas, setDescartadas] = useState<readonly string[]>([]);
  const [listaVista, setListaVista] = useState(false);
  const [mas, setMas] = useState(false);
  const [herramienta, setHerramienta] = useState<"medir" | { inicial: string } | null>(null);
  const [medicion, setMedicion] = useState<Punto[]>([]);
  // Esc termina la medición (ronda 2, A5), como dice su banda.
  useEffect(() => {
    if (herramienta !== "medir") return;
    const tecla = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape") return;
      setHerramienta(null);
      setMedicion([]);
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [herramienta]);
  const [busqueda, setBusqueda] = useState(
    separarLugarYSentido(descripcionLugar).lugar ?? descripcionLugar ?? "",
  );
  const [resultados, setResultados] = useState<OpcionLugar[]>([]);
  const [estadoBusqueda, setEstadoBusqueda] = useState<string | null>(null);
  const mapa = useRef<MapaMl | null>(null);
  const [pila, setPila] = useState<readonly EstadoEscena[]>([]);
  // W4: «Rehacer», lo seleccionado para corregir y el objeto que se va a poner con el siguiente toque.
  const [futuro, setFuturo] = useState<readonly EstadoEscena[]>([]);
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [poniendoObjeto, setPoniendoObjeto] = useState<TipoObjeto | null>(null);
  // A3: el peatón o el ciclista que se va a poner con el siguiente toque, y la persona a la que se le
  // marca dónde quedó (el siguiente toque fija su `final`).
  const [poniendoPersona, setPoniendoPersona] = useState<RolPersona | null>(null);
  const [marcandoFinal, setMarcandoFinal] = useState<string | null>(null);
  // Se pone una cosa a la vez: un objeto o una persona (`setPoniendo(null)` suelta las dos).
  const poniendo = poniendoObjeto;
  const setPoniendo = (t: TipoObjeto | null) => {
    setPoniendoObjeto(t);
    setPoniendoPersona(null);
  };
  const elegirPersona = (r: RolPersona | null) => {
    setPoniendoPersona(r);
    setPoniendoObjeto(null);
  };
  const objetosColocados = useMemo(() => objetosDe(e), [e]);
  // C3 (W5): lo que se va a poner en el terreno con el siguiente toque, y lo ya marcado.
  const [poniendoTerreno, setPoniendoTerreno] = useState<PoniendoTerreno | null>(null);
  const [otrasSuperficies, setOtrasSuperficies] = useState(false);
  const terrenoMarcado = useMemo(() => piezasTerreno(e), [e]);

  // El paso en curso: el que se edita, el coche que se coloca o el primero sin terminar.
  const enLista = nuevo && !editando && !editandoC1 && !colocando;
  const actual = useMemo(() => {
    if (enLista) return null;
    if (editandoC1) return { tipo: editandoC1, hecho: false };
    if (editando) {
      if (editando.tipo === "choque")
        return { tipo: "choque" as const, orden: Number(editando.id), hecho: false };
      const v = pasos.find((p) => p.tipo === "vehiculo" && p.vehiculo === editando.id);
      if (v && v.tipo === "vehiculo")
        return { ...v, direccion: editando.tipo === "final", final: false, hecho: false };
    }
    if (colocando) {
      const v = pasos.find((p) => p.tipo === "vehiculo" && p.vehiculo === colocando);
      if (v && v.tipo === "vehiculo") return { ...v, final: false, hecho: false };
    }
    return pasoActual(pasos);
  }, [enLista, editando, editandoC1, colocando, pasos]);
  const todoListo =
    pasoActual(pasos) === null && colocando === null && editando === null && editandoC1 === null;
  /** El nombre de un paso de la escena, como en la barra de avance. */
  const nombreDelPaso = (p: (typeof pasos)[number], detalle = false) =>
    p.tipo === "choque"
      ? impactos.length > 1
        ? `Choque ${p.orden}`
        : "El choque"
      : p.tipo === "vehiculo"
        ? !detalle
          ? nombres[p.vehiculo]!
          : p.direccion
            ? `dónde quedó ${nombres[p.vehiculo]!}`
            : `por dónde venía ${nombres[p.vehiculo]!}`
        : p.tipo === "golpe"
          ? "Primer golpe"
          : p.tipo === "otros"
            ? "Otros choques"
            : p.tipo === "paso"
              ? "Por dónde pasó"
              : "Terreno";
  const pendientes = pasos.filter((p) => !p.hecho).map((p) => nombreDelPaso(p, true));
  /** W4: con la escena lista y la tarjeta cerrada, lo colocado se toca para corregirlo. */
  const corrigiendo = (todoListo && listaVista) || enLista;
  /** A3: a quién se le marca dónde quedó; se suelta solo si la persona deja de estar seleccionada. */
  const marcando =
    corrigiendo && marcandoFinal && seleccion === `persona:${marcandoFinal}` ? marcandoFinal : null;
  const personasColocadas = useMemo(() => e.personas ?? [], [e]);
  const faltaPersona = useMemo(() => personaFaltante(e), [e]);

  /**
   * Un cambio con su «Deshacer». La pila guarda los últimos `MAX_DESHACER` estados: corregir «las
   * veces que sea» (René, 2026-11-17), también moviendo con las flechas paso a paso.
   */
  const cambiar = (siguiente: EstadoEscena, m?: Mensaje | null) => {
    setPila((x) => [...x.slice(-MAX_DESHACER), estado]);
    setFuturo([]);
    onEstado(siguiente);
    if (m !== undefined) setMensaje(m);
  };
  /** Lo seleccionado sigue seleccionado al deshacer o rehacer, si sigue en la escena. */
  const conservarSeleccion = (x: EstadoEscena) =>
    setSeleccion((s) => (s && existe(x.expediente, s) ? s : null));
  const deshacer = () => {
    const previo = pila.at(-1);
    if (!previo) return;
    setPila((x) => x.slice(0, -1));
    setFuturo((x) => [...x.slice(-MAX_DESHACER), estado]);
    onEstado(previo);
    setColocando(null);
    setEditando(null);
    conservarSeleccion(previo);
    if (!corrigiendo) setListaVista(false);
    setMensaje(null);
  };
  const rehacer = () => {
    const siguiente = futuro.at(-1);
    if (!siguiente) return;
    setFuturo((x) => x.slice(0, -1));
    setPila((x) => [...x.slice(-MAX_DESHACER), estado]);
    onEstado(siguiente);
    conservarSeleccion(siguiente);
    setMensaje(null);
  };
  const exito = (texto: string): Mensaje => ({ tipo: "exito", texto, deshacer: true });

  // Sin coordenadas en el caso, Croquis busca el lugar que dice la narración (la descripción del
  // lugar, el cruce o la primera calle, con el municipio) y propone con las calles de ahí.
  const [lugarNarrado, setLugarNarrado] = useState<Punto | null>(null);
  const [buscandoNarrado, setBuscandoNarrado] = useState(false);
  // Ronda 4 (René): si el lugar narrado no aparece, se pregunta (nunca el centro del municipio).
  const [narradoSinLugar, setNarradoSinLugar] = useState<string | null>(null);
  // El lugar que encontró el buscador, con sus opciones y su aviso: si no coincide claramente con la
  // narración, no se propone el choque ahí (René, 2026-11-25).
  const [busquedaNarrada, setBusquedaNarrada] = useState<{
    nombre: string;
    resultados: OpcionLugar[];
    aviso: string | null;
  } | null>(null);
  const yaBuscado = useRef(false);
  // Vivo mientras la escena está montada (en desarrollo React monta los efectos dos veces: la búsqueda
  // de la primera vuelta debe poder terminar).
  const montada = useRef(false);
  useEffect(() => {
    montada.current = true;
    return () => {
      montada.current = false;
    };
  }, []);
  useEffect(() => {
    if (lugar || yaBuscado.current || estado.puntos[1]) return;
    const cruce = narracion ? cruceNarrado(narracion) : null;
    // Ronda 4 (René): solo el lugar va al buscador, nunca la frase completa con su «rumbo a…».
    const consultas = [
      separarLugarYSentido(descripcionLugar).lugar,
      cruce ? `${cruce.calles[0]} y ${cruce.calles[1]}` : null,
      cruce?.calles[0] ?? null,
      narracion ? carreteraNarrada(narracion) : null,
    ].filter((x): x is string => Boolean(x?.trim()));
    if (!consultas.length) return;
    yaBuscado.current = true;
    const buscarEn = async () => {
      setBuscandoNarrado(true);
      let hallado = false;
      let aviso: string | null = null;
      for (const q of consultas) {
        const params = new URLSearchParams({ q });
        if (zona.municipio) params.set("municipio", zona.municipio);
        if (zona.estado) params.set("estado", zona.estado);
        try {
          const r = await fetch(`/api/lugar?${params.toString()}`);
          const d = (await r.json().catch(() => null)) as {
            resultados?: OpcionLugar[];
            aviso?: string | null;
          } | null;
          aviso ??= d?.aviso ?? null;
          // B5: sin el municipio ni el estado del caso, la primera opción puede ser de otro estado
          // (San Luis Potosí caía en la CDMX): se muestran las opciones para elegir.
          if (r.ok && d?.resultados?.length && !zona.municipio && !zona.estado) {
            if (montada.current) {
              setResultados(d.resultados);
              setEstadoBusqueda(
                "La narración no dice el municipio ni el estado: elige el lugar del caso.",
              );
            }
            hallado = true;
            break;
          }
          const p = r.ok ? d?.resultados?.[0] : undefined;
          // Solo una zona (la colonia, el municipio) no es el lugar del choque (revisión de la cadena,
          // René 2026-11-24): se prueba la consulta siguiente y, si nada es preciso, se pregunta.
          if (p?.precision === "zona") {
            aviso ??= `Solo se encontró la zona («${p.nombre}»), no el lugar del choque. Escribe las calles del cruce, pega las coordenadas o un link de Google Maps, o toca el lugar en el mapa.`;
            continue;
          }
          if (p && montada.current) {
            setLugarNarrado({ lat: p.lat, lon: p.lon });
            setBusquedaNarrada({
              nombre: p.nombre,
              resultados: d?.resultados ?? [],
              aviso: d?.aviso ?? null,
            });
            onBuscarCalles({ lat: p.lat, lon: p.lon });
            hallado = true;
            break;
          }
        } catch {
          break;
        }
      }
      if (montada.current) {
        setBuscandoNarrado(false);
        if (!hallado)
          setNarradoSinLugar(
            aviso ??
              `No se encontró «${consultas[0]}». ¿Dónde fue? Escribe las calles del cruce, pega las coordenadas o un link de Google Maps, o toca el lugar en el mapa.`,
          );
      }
    };
    void buscarEn();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- una vez, al abrir la escena
  }, []);
  const lugarBase = lugar ?? lugarNarrado;
  // ¿El lugar encontrado es el de la narración? Con las calles de alrededor (o con el aviso del
  // buscador, si dice que es de otro municipio). Si no es claro, el motivo.
  const dudaLugar = useMemo(() => {
    if (!busquedaNarrada || lugar || estado.puntos[1]) return null;
    if (!callesMapa.length && !/No apareci[oó] en/i.test(busquedaNarrada.aviso ?? "")) return null;
    const c = lugarClaro({
      narradas: callesDelCaso(narracion, descripcionLugar),
      calles: callesMapa,
      aviso: busquedaNarrada.aviso,
      encontrado: busquedaNarrada.nombre,
    });
    return c.clara ? null : c.motivo;
  }, [busquedaNarrada, lugar, estado.puntos, callesMapa, narracion, descripcionLugar]);
  // Con la duda, las opciones del buscador quedan a la vista para elegir (si el perito no buscó otra).
  const opcionesLugar =
    resultados.length || !dudaLugar || !busquedaNarrada ? resultados : busquedaNarrada.resultados;
  // Ronda 4 (René): «rumbo a Ciudad de México» es el sentido de llegada, no parte del lugar. El
  // destino se busca aparte; su rumbo desde el lugar del choque dice en qué sentido de la vía venía.
  const sentidoDelLugar = useMemo(() => {
    const deDescripcion = separarLugarYSentido(descripcionLugar).sentido;
    if (deDescripcion) return deDescripcion;
    return narracion ? separarLugarYSentido(narracion).sentido : null;
  }, [descripcionLugar, narracion]);
  const [destinoNarrado, setDestinoNarrado] = useState<Punto | null>(null);
  useEffect(() => {
    if (sentidoDelLugar?.tipo !== "destino" || !sentidoDelLugar.destino) return undefined;
    let vivo = true;
    const params = new URLSearchParams({ q: sentidoDelLugar.destino });
    void fetch(`/api/lugar?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { resultados?: OpcionLugar[] } | null) => {
        const p = d?.resultados?.[0];
        if (vivo && p) setDestinoNarrado({ lat: p.lat, lon: p.lon });
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [sentidoDelLugar]);
  // Diagnóstico (con `window.__croquisDiagnostico`): la escena a la vista de las pruebas, que la
  // comparan con la que arma la tabla del índice (René, 2026-11-26: «el mismo código que La escena»).
  useEffect(() => {
    const w = window as unknown as { __croquisDiagnostico?: boolean; __croquisEscena?: unknown };
    if (w.__croquisDiagnostico) w.__croquisEscena = { expediente: e, puntos: estado.puntos };
  }, [e, estado.puntos]);
  // La escena ya armada: al entrar, si nadie ha marcado el choque, Croquis la propone con lo que leyó
  // (con `?desde=cero`, también en un caso que ya trae posiciones, como AXA).
  const [escenaPropuesta, setEscenaPropuesta] = useState<EscenaPropuesta | null>(null);
  useEffect(() => {
    if (
      !nuevo ||
      escenaPropuesta ||
      ((estado.puntos[1] || (impactos[0]?.vehiculos ?? []).some((v) => poseDe(e, v, "impacto"))) &&
        sp.get("desde") !== "cero") ||
      (!lugarBase && !centroMapa) ||
      // El lugar encontrado no coincide claramente con la narración: primero, «¿Dónde fue?».
      dudaLugar
    )
      return undefined;
    // Con las calles (de las teselas o de Overpass) en cuanto lleguen; sin ellas, a los 10 s.
    const t = setTimeout(
      () => {
        // «desde=cero»: sin las posiciones que ya traía el caso (AXA trae las de su reporte).
        const deCero = sp.get("desde") === "cero";
        const p = proponerEscena({
          expediente: deCero
            ? { ...e, versiones: (e.versiones ?? []).map((v) => ({ ...v, posiciones: [] })) }
            : e,
          impactos,
          calles: callesMapa,
          narracion,
          lugar: lugarBase ?? centroMapa,
          nombreDe: (id) => nombres[id] ?? id,
          rumboNarrado: rumboDelSentido(sentidoDelLugar, destinoNarrado, lugarBase ?? centroMapa),
        });
        if (!p) return;
        setEscenaPropuesta(p);
        // Armada la escena (por ejemplo, al elegir el lugar dentro de la pregunta del choque), se
        // vuelve a la lista.
        setEditando(null);
        onEstado({
          ...estado,
          expediente: p.expediente,
          puntos: deCero ? p.puntos : { ...estado.puntos, ...p.puntos },
        });
      },
      callesMapa.length ? 0 : 10_000,
    );
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- se arma una vez, al tener calles
  }, [nuevo, escenaPropuesta, callesMapa, lugarBase, centroMapa, dudaLugar]);

  // Lo que Croquis propone para el primer choque.
  const propuesta = useMemo(
    () => proponerChoque(callesMapa, narracion, lugarBase),
    [callesMapa, narracion, lugarBase],
  );
  const puntoChoque = (orden: number): Punto | null => {
    if (estado.puntos[orden]) return estado.puntos[orden]!;
    const ps = (impactos.find((i) => i.orden === orden)?.vehiculos ?? []).flatMap(
      (v) => poseDe(e, v, "impacto") ?? [],
    );
    if (!ps.length) return null;
    return {
      lat: ps.reduce((a, p) => a + p.punto.lat, 0) / ps.length,
      lon: ps.reduce((a, p) => a + p.punto.lon, 0) / ps.length,
    };
  };

  const ponerChoque = (orden: number, p: Punto, calles: string[]) => {
    const primero = impactos.find((i) => i.orden === orden)?.vehiculos[0];
    const siguiente: EstadoEscena = {
      ...estado,
      expediente: tocarChoque(
        e,
        impactos,
        orden,
        p,
        primero ? (sentidos[primero] ?? null) : null,
        callesMapa,
      ),
      puntos: { ...estado.puntos, [orden]: p },
    };
    const lejos = choqueLejosDeCalles(callesMapa, p);
    cambiar(
      siguiente,
      lejos
        ? {
            tipo: "alerta",
            texto: "El choque quedó lejos de cualquier calle. ¿Fue ahí?",
            acciones: [
              {
                texto: "Llevarlo a la calle",
                id: "choque-a-la-calle",
                principal: true,
                hacer: () => {
                  const a = ajustarACalle(callesMapa, p, 500);
                  if (a) ponerChoque(orden, a.punto, callesEn(callesMapa, a.punto));
                },
              },
              { texto: "Así está bien", id: "choque-asi", hacer: () => setMensaje(null) },
            ],
          }
        : exito(textoChoqueListo(calles, impactos.length > 1, orden)),
    );
    setEditando(null);
    setMarcoYo(false);
    if (mapa.current && mapa.current.getZoom() < 19)
      mapa.current.easeTo({ center: [p.lon, p.lat], zoom: ZOOM_TRABAJO });
  };

  // Las flechas del vehículo en curso: una por calle que llega a su choque.
  const vehiculoActual = actual?.tipo === "vehiculo" ? actual.vehiculo : null;
  const impactoDe = (v: string) => impactos.find((i) => i.vehiculos.includes(v)) ?? null;
  const choqueDe = (v: string) => {
    const i = impactoDe(v);
    return i ? puntoChoque(i.orden) : null;
  };
  const choqueActual =
    vehiculoActual && actual?.tipo === "vehiculo" && !actual.direccion
      ? choqueDe(vehiculoActual)
      : null;
  const flechas = useMemo(
    () => (choqueActual ? flechasDeLlegada(callesMapa, choqueActual) : []),
    [callesMapa, choqueActual?.lat, choqueActual?.lon], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const propuestaFlecha = vehiculoActual
    ? flechaPropuesta(
        flechas,
        sentidos[vehiculoActual] ?? null,
        ((r) => (r === undefined ? null : rumboDeLlegada(e, vehiculoActual, r)))(
          poseDe(e, vehiculoActual, "impacto")?.rumbo,
        ),
      )
    : -1;

  const aplicarDireccion = (v: string, rumbo: number, noSe: boolean, texto: string) => {
    const c = choqueDe(v);
    if (!c) return;
    const siguiente: EstadoEscena = {
      ...estado,
      expediente: elegirDireccion(e, impactos, v, rumbo, puntoChoque, noSe),
      direccionesNoSe: noSe
        ? [...new Set([...estado.direccionesNoSe, v])]
        : estado.direccionesNoSe.filter((x) => x !== v),
    };
    cambiar(siguiente, exito(`¡Listo! ${texto}`));
    if (noSe)
      onNota(
        `No sé por dónde venía ${nombres[v]}: se usa la dirección que dan las zonas de contacto (supuesto).`,
      );
    setEditando(null);
  };
  const elegirFlecha = (i: number) => elegirLlegada(flechas[i]);
  const elegirLlegada = (f: Flecha | undefined) => {
    const v = vehiculoActual;
    if (!v || !f) return;
    const texto = `El ${nombres[v]} venía del ${f.desde}${f.calle ? `, por ${f.calle}` : ""}.`;
    const sentido = sentidos[v] ?? null;
    if (contraNarracion(f.rumbo, sentido)) {
      const narrada = flechas[flechaPropuesta(flechas, sentido, null)];
      setMensaje({
        tipo: "alerta",
        texto: `La narración dice que venía ${textoSentido(sentido!)}. ¿Seguro?`,
        acciones: [
          {
            texto: "Sí, venía así",
            id: "direccion-asi",
            principal: true,
            hacer: () => aplicarDireccion(v, f.rumbo, false, texto),
          },
          ...(narrada
            ? [
                {
                  texto: "Usar la de la narración",
                  id: "direccion-narrada",
                  hacer: () =>
                    aplicarDireccion(
                      v,
                      narrada.rumbo,
                      false,
                      `El ${nombres[v]} venía del ${narrada.desde}${narrada.calle ? `, por ${narrada.calle}` : ""}.`,
                    ),
                },
              ]
            : []),
        ],
      });
      return;
    }
    aplicarDireccion(v, f.rumbo, false, texto);
  };

  // Dónde quedó: con un toque, alineado a la calle; arrastrar es opcional; dos botones de 15°.
  const colocarFinal = (v: string, p: Punto) => {
    cambiar(
      {
        ...estado,
        expediente: tocarFinal(e, v, p, callesMapa),
        desconocidos: estado.desconocidos.filter((x) => x !== v),
        juntoAlChoque: estado.juntoAlChoque.filter((x) => x !== v),
      },
      null,
    );
    setColocando(v);
  };
  const terminarFinal = (v: string) => {
    const op = opcionFinal[v] ?? (finalNarradoDe(v) ? "narracion" : "marcar");
    if (op === "narracion") {
      const f = finalNarradoDe(v);
      if (!f) return;
      cambiar(
        {
          ...estado,
          expediente: marcarFinal(e, v, f.punto, f.rumbo),
          desconocidos: estado.desconocidos.filter((x) => x !== v),
          juntoAlChoque: estado.juntoAlChoque.filter((x) => x !== v),
        },
        exito(`¡Listo! El ${nombres[v]} quedó ${f.texto}, como dice la narración.`),
      );
      return;
    }
    if (op === "marcar") {
      if (!poseDe(e, v, "final")) return;
      setColocando(null);
      setEditando(null);
      setMensaje(exito(`¡Listo! Ya sabemos dónde quedó el ${nombres[v]}.`));
      return;
    }
    if (op === "junto") {
      cambiar(
        {
          ...estado,
          expediente: quedoJuntoAlChoque(e, v),
          desconocidos: estado.desconocidos.filter((x) => x !== v),
          juntoAlChoque: [...new Set([...estado.juntoAlChoque, v])],
        },
        exito(`¡Listo! El ${nombres[v]} quedó junto al choque.`),
      );
    } else {
      cambiar(
        {
          ...estado,
          expediente: sinFinal(e, v),
          desconocidos: [...new Set([...estado.desconocidos, v])],
          juntoAlChoque: estado.juntoAlChoque.filter((x) => x !== v),
        },
        exito(`¡Listo! Croquis calcula dónde quedó el ${nombres[v]} y el dictamen lo dice.`),
      );
      onNota(
        `No sé dónde quedó ${nombres[v]}: la reconstrucción va sin su posición final (no se supone ninguna).`,
      );
    }
    setColocando(null);
    setEditando(null);
  };

  // Las alertas que se calculan solas (coches encimados, un coche fuera de la calle) y el error sin
  // calles: salen del estado, sin efectos; «Así está bien» las descarta.
  const encimadas = useMemo(() => posicionesEncimadas(e), [e]);
  // Ronda 4 (René): encimados en el choque (más que un contacto), dicho en el momento.
  const encimadosChoque = useMemo(() => impactosEncimados(e), [e]);
  const enObstaculos = useMemo(() => posesEnObstaculos(e, obstaculos), [e, obstaculos]);
  const descartar = (clave: string) => {
    setDescartadas((d) => [...d, clave]);
    setMensaje(null);
  };
  const alertaAuto = ((): Mensaje | null => {
    const enc = encimadas.find((x) => !descartadas.includes(`encimados:${x.vehiculos.join("-")}`));
    if (enc) {
      const clave = `encimados:${enc.vehiculos.join("-")}`;
      const [a, b] = enc.vehiculos.map((v) => nombres[v] ?? v);
      return {
        tipo: "alerta",
        clave,
        texto: `Ojo: el ${b} quedó encima del ${a}. Dos coches no pueden quedar en el mismo lugar.`,
        acciones: [
          {
            texto: "Separarlos",
            id: "separar-encimadas",
            principal: true,
            hacer: () => {
              let x = e;
              for (const pose of enc.propuesta) x = conPosicion(x, { ...pose, fase: "final" });
              cambiar({ ...estado, expediente: x }, exito("¡Listo! Los separamos."));
            },
          },
          { texto: "Así está bien", id: "encimadas-asi", hacer: () => descartar(clave) },
        ],
      };
    }
    const ench = encimadosChoque.find(
      (x) =>
        !descartadas.includes(
          `choque-encimado:${x.orden}:${x.vehiculos.join("-")}:${x.objeto ?? ""}`,
        ),
    );
    if (ench) {
      const clave = `choque-encimado:${ench.orden}:${ench.vehiculos.join("-")}:${ench.objeto ?? ""}`;
      const [a, b] = ench.vehiculos.map((v) => nombres[v] ?? v);
      const con = ench.objeto
        ? (objetosColocados.find((o) => o.id === ench.objeto)?.nombre ?? "el objeto").toLowerCase()
        : `el ${b}`;
      return {
        tipo: "alerta",
        clave,
        texto: `Ojo: en el choque, el ${a} quedó encima de ${con} (${F.metros(ench.traslape_m)}). En un choque se tocan; encimados, la reconstrucción no sabe por qué cara fue el contacto.`,
        acciones: [
          {
            texto: "Separarlos",
            id: "separar-choque-encimado",
            principal: true,
            hacer: () => {
              let x = e;
              for (const pose of ench.propuesta) x = conPosicion(x, { ...pose, fase: "impacto" });
              cambiar(
                { ...estado, expediente: x },
                exito("¡Listo! Quedaron tocándose por la cara de contacto."),
              );
            },
          },
          {
            texto: "Así fue el contacto",
            id: "choque-encimado-asi",
            hacer: () => descartar(clave),
          },
        ],
      };
    }
    // Un vehículo sobre un edificio o atravesando un muro del mapa (René, 2026-11-24, punto 2).
    const enObs = enObstaculos.find(
      (x) => !descartadas.includes(`obstaculo:${x.vehiculo}:${x.fase}:${x.obstaculo.nombre}`),
    );
    if (enObs) {
      const clave = `obstaculo:${enObs.vehiculo}:${enObs.fase}:${enObs.obstaculo.nombre}`;
      const pose = poseDe(e, enObs.vehiculo, enObs.fase);
      const ajuste = pose ? ajustarACalle(callesMapa, pose.punto, 60) : null;
      return {
        tipo: "alerta",
        clave,
        texto: `Ojo: ${enObs.fase === "impacto" ? "en el choque" : "donde quedó"}, el ${nombres[enObs.vehiculo] ?? enObs.vehiculo} está sobre ${enObs.obstaculo.tipo === "edificio" ? "un edificio" : "un muro"} del mapa. Los vehículos no atraviesan casas ni muros: si la reconstrucción lo cruza, no cuadra.`,
        acciones: [
          ...(ajuste && pose
            ? [
                {
                  texto: "Llevarlo a la calle",
                  id: "obstaculo-a-la-calle",
                  principal: true,
                  hacer: () =>
                    cambiar(
                      {
                        ...estado,
                        expediente: conPosicion(e, {
                          vehiculo: enObs.vehiculo as never,
                          fase: enObs.fase,
                          punto: ajuste.punto,
                          rumbo: pose.rumbo,
                          fuente: "perito",
                        }),
                      },
                      exito(`¡Listo! Quedó sobre ${ajuste.calle.nombre ?? "la calle"}.`),
                    ),
                },
              ]
            : []),
          { texto: "Así fue", id: "obstaculo-asi", hacer: () => descartar(clave) },
        ],
      };
    }
    // W4: un objeto del lugar encima de un vehículo en reposo o de otro objeto.
    const emp = empalmesDeObjetos(e).find(
      (x) => !descartadas.includes(`empalme:${x.objeto}:${x.con}`),
    );
    if (emp) {
      const clave = `empalme:${emp.objeto}:${emp.con}`;
      const objeto = objetosColocados.find((o) => o.id === emp.objeto);
      const otro = emp.conVehiculo
        ? `del ${nombres[emp.con] ?? emp.con}`
        : `de ${(objetosColocados.find((o) => o.id === emp.con)?.nombre ?? "otro objeto").toLowerCase()}`;
      return {
        tipo: "alerta",
        clave,
        texto: `Ojo: ${objeto ? `${articuloObjeto(objeto.tipo).toLowerCase()} ${objeto.nombre.toLowerCase()}` : "un objeto"} quedó encima ${otro}.`,
        acciones: [
          {
            texto: "Separarlos",
            id: "separar-empalme",
            principal: true,
            hacer: () =>
              cambiar(
                { ...estado, expediente: moverObjeto(e, emp.objeto, emp.propuesta) },
                exito("¡Listo! Los separamos."),
              ),
          },
          { texto: "Así está bien", id: "empalme-asi", hacer: () => descartar(clave) },
        ],
      };
    }
    const v = colocando;
    const fin = v ? poseDe(e, v, "final") : null;
    if (v && fin && fueraDeLaCalle(callesMapa, fin.punto) && !descartadas.includes(`fuera:${v}`))
      return {
        tipo: "alerta",
        clave: `fuera:${v}`,
        texto: `El ${nombres[v]} quedó fuera de la calle.`,
        acciones: [
          {
            texto: "Ponerlo en la calle",
            id: "poner-en-la-calle",
            principal: true,
            hacer: () =>
              cambiar(
                { ...estado, expediente: ponerEnLaCalle(e, callesMapa, v) },
                exito(`¡Listo! El ${nombres[v]} quedó en la calle.`),
              ),
          },
          { texto: "Así está bien", id: "fuera-asi", hacer: () => descartar(`fuera:${v}`) },
        ],
      };
    // La consulta falló y no hay calles de ninguna fuente: no es que el lugar no tenga calles. Sin
    // ellas Croquis no calcula la velocidad (René, 2026-11-25).
    if (overpassFallo && !calles && onReintentarCalles)
      return {
        tipo: "alerta",
        clave: "calles-fallaron",
        texto:
          "No se pudieron cargar las calles: reintenta. Sin ellas, Croquis no calcula la velocidad.",
        acciones: [
          {
            texto: "Reintentar",
            id: "reintentar-calles-escena",
            principal: true,
            hacer: onReintentarCalles,
          },
        ],
      };
    if (
      avisarSinCalles({
        overpassFallo,
        hayCalles: Boolean(calles),
        teselasLeidasDe: teselasLeidas,
        lugar: claveTeselas,
        yaVisto: avisoCallesVisto,
        descartado: descartadas.includes("sin-calles"),
      })
    ) {
      try {
        sessionStorage.setItem(claveAvisoCalles, "1");
      } catch {
        // Sin almacenamiento, el aviso puede repetirse; no pasa nada más.
      }
      return {
        tipo: "alerta",
        clave: "sin-calles",
        texto:
          "Este lugar no tiene calles en los datos del mapa. Marca el choque tocando el mapa; la dirección de cada vehículo la eliges tú y Croquis no la supone.",
      };
    }
    return null;
  })();

  // --- C1 (W3): el primer golpe, los choques contra algo más y los puntos de paso ---------------
  const c1Con = (x: Partial<RespuestasC1>): EstadoEscena => ({ ...estado, c1: { ...c1, ...x } });
  /** Si el punto quedó lejos del choque, cuántos metros (para confirmar con una alerta). */
  const lejosDelChoque = (p: Punto, limite: number): number | null => {
    const c = puntoChoque(1);
    if (!c) return null;
    const d = distanciaM([c.lon, c.lat], [p.lon, p.lat]);
    return d > limite ? Math.round(d) : null;
  };
  const alertaLejos = (lejos: number): Mensaje => ({
    tipo: "alerta",
    texto: `Ese punto quedó a ${lejos} m del choque que marcaste. Si no era ahí, deshazlo y toca otra vez.`,
    deshacer: true,
  });
  const vehiculoOtro = otro.vehiculo ?? (vehiculos.length === 1 ? String(vehiculos[0]!.id) : null);
  const vehiculoPaso = pasoDe ?? (vehiculos.length === 1 ? String(vehiculos[0]!.id) : null);
  const marcarGolpe = (p: Punto) => {
    const lejos = lejosDelChoque(p, GOLPE_LEJOS_M);
    cambiar(
      { ...estado, expediente: marcarPrimerGolpe(e, impactos, p), c1: { ...c1, golpeNoSe: false } },
      lejos ? alertaLejos(lejos) : exito("¡Listo! Marcaste dónde fue el primer golpe."),
    );
    setEditandoC1(null);
  };
  const golpeNoSe = () => {
    cambiar(
      c1Con({ golpeNoSe: true }),
      exito("Sin problema: Croquis usa el lugar del choque que marcaste y el dictamen lo dice."),
    );
    onNota("No sé dónde fue el primer golpe: se usa el lugar del choque (supuesto).");
    setEditandoC1(null);
  };
  const agregarChoque = (v: string, objeto: string, p: Punto) => {
    const con = OBJETOS_C1.find((o) => o.id === objeto)?.con ?? objeto;
    const lejos = lejosDelChoque(p, C1_LEJOS_M);
    setEditandoC1("otros");
    cambiar(
      { ...estado, expediente: agregarChoqueIntermedio(e, v, objeto, p) },
      lejos
        ? alertaLejos(lejos)
        : exito(`¡Listo! El ${nombres[v]} chocó contra ${con} ahí. ¿Chocó contra algo más?`),
    );
    setOtro({ abierto: false, vehiculo: null, objeto: null });
  };
  const choquesTerminados = () => {
    const n = choquesIntermedios(e).length;
    cambiar(
      c1Con({ choquesListos: true }),
      exito(
        n
          ? "¡Listo! Quedaron marcados los choques contra objetos."
          : "Entendido: no chocó contra nada más.",
      ),
    );
    setOtro({ abierto: false, vehiculo: null, objeto: null });
    setEditandoC1(null);
  };
  const agregarPaso = (v: string, p: Punto) => {
    const n = puntosDePaso(e, v).length + 1;
    const lejos = lejosDelChoque(p, C1_LEJOS_M);
    setEditandoC1("paso");
    cambiar(
      { ...estado, expediente: agregarPuntoDePaso(e, v, p) },
      lejos
        ? alertaLejos(lejos)
        : exito(`Punto ${n} del ${nombres[v]}. Toca otro o termina con «Listo».`),
    );
  };
  const pasosTerminados = () => {
    const n = puntosDePaso(e).length;
    cambiar(
      c1Con({ pasosListos: true }),
      exito(
        n
          ? "¡Listo! La reconstrucción va a pasar por esos puntos."
          : "Sin puntos de paso: Croquis calcula el recorrido con lo demás.",
      ),
    );
    setPasoDe(null);
    setEditandoC1(null);
  };

  // --- C3 (W5): ¿Cómo es el terreno? -------------------------------------------------------------
  const ponerTerreno = (p: Punto, todo = false) => {
    const que = poniendoTerreno;
    if (!que) return;
    // Las zonas van a lo largo de la calle; el tope, atravesado (`ponerTerrenoEn`, la misma que la
    // tabla del índice).
    const siguiente = ponerTerrenoEn(e, callesMapa, que, p, todo);
    let texto: string;
    if (que.clase === "zona") {
      const nombre = nombreSuperficie(que.tipo).toLowerCase();
      texto = todo
        ? `¡Listo! Todo el lugar es de ${nombre}.`
        : `¡Listo! Marcaste una zona de ${nombre}. Agrega otra cosa o termina con «Listo».`;
    } else if (que.clase === "ondulacion") {
      texto = "¡Listo! Marcaste la zona ondulada. Sus medidas son un supuesto hasta que las midas.";
    } else {
      texto = "¡Listo! El tope quedó atravesado a la calle, con las medidas de la norma.";
    }
    cambiar({ ...estado, expediente: siguiente }, exito(texto));
    setPoniendoTerreno(null);
    // La pregunta sigue abierta: se puede marcar algo más.
    setEditandoC1("terreno");
  };
  const terrenoTerminado = () => {
    cambiar(
      c1Con({ terrenoListo: true }),
      exito(
        e.terreno
          ? "¡Listo! El terreno entra en la reconstrucción."
          : "Pavimento liso: la reconstrucción va en plano.",
      ),
    );
    setPoniendoTerreno(null);
    setEditandoC1(null);
  };

  // Un toque en el mapa, según la pregunta en curso.
  const tocar = (p: Punto) => {
    if (poniendo) {
      // W4: el objeto de la paleta va donde tocó; los tramos, a lo largo de la calle.
      const tipo = TIPOS_OBJETO.find((t) => t.tipo === poniendo)!;
      const rumbo = tipo.alargado && callesMapa.length ? rumboAlineado(callesMapa, p, 0) : 0;
      const { expediente, id } = agregarObjeto(e, poniendo, p, rumbo);
      cambiar(
        { ...estado, expediente },
        exito(
          `¡Listo! ${articuloObjeto(poniendo)} ${tipo.nombre.toLowerCase()} quedó donde tocaste.`,
        ),
      );
      setPoniendo(null);
      setSeleccion(`objeto:${id}`);
      return;
    }
    if (poniendoPersona) {
      // A3: la persona va donde la golpearon; se gira después hacia donde iba.
      const rol = poniendoPersona;
      const { expediente, id } = agregarPersona(e, rol, p, 0);
      cambiar(
        { ...estado, expediente },
        exito(`¡Listo! Colocaste ${alPersona(rol)}. Gíralo hacia donde iba y marca dónde quedó.`),
      );
      setPoniendoPersona(null);
      setListaVista(true);
      setSeleccion(`persona:${id}`);
      return;
    }
    if (marcando) {
      const x = marcarFinalPersona(e, marcando, p);
      const per = x.personas?.find((q) => q.id === marcando);
      const d = per ? distanciaProyeccion(per) : null;
      cambiar(
        { ...estado, expediente: x },
        exito(
          d !== null
            ? `¡Listo! Quedó a ${F.metros(d, 1)} de donde lo golpearon.`
            : "¡Listo! Marcaste dónde quedó.",
        ),
      );
      setMarcandoFinal(null);
      return;
    }
    if (corrigiendo) {
      // Tocar el mapa vacío suelta lo seleccionado.
      setSeleccion(null);
      return;
    }
    if (herramienta === "medir") {
      setMedicion((m) => (m.length >= 2 ? [p] : [...m, p]));
      return;
    }
    if (herramienta && typeof herramienta === "object") {
      const v = herramienta.inicial;
      const imp = poseDe(e, v, "impacto");
      const rumbo = rumboAlineado(callesMapa, p, imp?.rumbo ?? 0);
      cambiar(
        {
          ...estado,
          expediente: conPosicion(e, {
            vehiculo: v as Expediente["vehiculos"][number]["id"],
            fase: "inicial",
            punto: p,
            rumbo,
          }),
        },
        exito(`¡Listo! Marcaste dónde empezó el ${nombres[v]}.`),
      );
      setHerramienta(null);
      return;
    }
    if (actual?.tipo === "terreno") {
      ponerTerreno(p);
      return;
    }
    if (actual?.tipo === "golpe") {
      marcarGolpe(p);
      return;
    }
    if (actual?.tipo === "otros") {
      if (otro.abierto && vehiculoOtro && otro.objeto) agregarChoque(vehiculoOtro, otro.objeto, p);
      return;
    }
    if (actual?.tipo === "paso") {
      if (vehiculoPaso) agregarPaso(vehiculoPaso, p);
      return;
    }
    if (actual?.tipo === "choque") {
      const punto = puntoDelChoqueTocado(e, callesMapa, actual.orden, p);
      ponerChoque(actual.orden, punto, callesEn(callesMapa, punto));
      return;
    }
    if (actual?.tipo === "vehiculo" && !actual.direccion) {
      // Por dónde venía: además de las flechas, de donde tocó hacia el choque.
      const c = choqueDe(actual.vehiculo);
      if (c) elegirLlegada(flechaDelToque(callesMapa, c, p));
      return;
    }
    if (actual?.tipo === "vehiculo" && actual.direccion && !actual.final) {
      const v = actual.vehiculo;
      if ((opcionFinal[v] ?? "marcar") !== "marcar")
        setOpcionFinal((o) => ({ ...o, [v]: "marcar" }));
      const a = ajustarACalle(callesMapa, p, 8);
      colocarFinal(v, a?.punto ?? p);
    }
  };

  // Buscar el lugar (coordenadas, link de mapa o dirección en `/api/lugar`).
  const buscar = async () => {
    const texto = busqueda.trim();
    if (texto.length < 2) {
      setEstadoBusqueda("Escribe la calle y la colonia, o pega un link de Google Maps.");
      return;
    }
    const ir = (p: Punto) => {
      mapa.current?.easeTo({ center: [p.lon, p.lat], zoom: 18.5 });
      onBuscarCalles(p);
      setResultados([]);
      setEstadoBusqueda(null);
    };
    const directo = interpretarLugar(texto);
    if (directo.tipo === "punto") {
      ir(directo);
      return;
    }
    setEstadoBusqueda("Buscando…");
    const params = new URLSearchParams({ q: texto });
    if (zona.municipio) params.set("municipio", zona.municipio);
    if (zona.estado) params.set("estado", zona.estado);
    try {
      const r = await fetch(`/api/lugar?${params.toString()}`);
      const d = (await r.json().catch(() => null)) as {
        resultados?: OpcionLugar[];
        aviso?: string | null;
        error?: string;
      } | null;
      if (!r.ok || !d?.resultados) {
        setEstadoBusqueda(d?.error ?? "No se pudo buscar. Mueve el mapa hasta el lugar.");
        return;
      }
      // B5: siempre las opciones con su municipio y estado; el perito elige (nunca salta a la primera).
      setResultados(d.resultados);
      setEstadoBusqueda(
        d.aviso ??
          (d.resultados.length
            ? "Elige el lugar del caso."
            : "No se encontró. Prueba con otra calle."),
      );
    } catch {
      setEstadoBusqueda("Sin conexión: no se puede buscar. Mueve el mapa hasta el lugar.");
    }
  };

  // --- W4: corregir después ----------------------------------------------------------------------
  const paso = (id: string) => /^paso-(.+)-(\d+)$/.exec(id);
  const nombreDeSeleccion = (clave: string): string => {
    const { tipo, id } = deClave(clave);
    if (tipo === "coche") return `El ${nombres[id] ?? id}`;
    if (tipo === "objeto") return objetosColocados.find((o) => o.id === id)?.nombre ?? "Objeto";
    if (tipo === "persona") {
      // «Peatón · Proyección 14.0 m»; su punto final, «Dónde quedó: Peatón».
      const final = id.endsWith(":final");
      const pid = final ? id.slice(0, -":final".length) : id;
      const per = personasColocadas.find((x) => x.id === pid);
      if (!per) return "Persona";
      const nombre = nombrePersona(e, pid);
      if (final) return `Dónde quedó: ${nombre}`;
      const d = distanciaProyeccion(per);
      return d !== null ? `${nombre} · Proyección ${F.metros(d, 1)}` : nombre;
    }
    if (tipo === "terreno") {
      const t = terrenoMarcado.find((x) => x.id === id);
      return t ? `${t.nombre} · ${medidasDePieza(t)}` : "Terreno";
    }
    if (id === "golpe") return "Primer golpe";
    const q = paso(id);
    if (q) return `Punto ${q[2]} del ${nombres[q[1]!] ?? q[1]}`;
    const orden = Number(id.replace("objeto-", ""));
    const c = choquesIntermedios(e).find((x) => x.orden === orden);
    return c ? (OBJETOS_C1.find((o) => o.id === c.objeto)?.texto ?? c.objeto) : "Marca";
  };
  /** Al soltar lo seleccionado en otro lugar (o moverlo con las flechas): se guarda y se dice. */
  const moverSeleccion = (clave: string, p: Punto) => {
    const x = moverA(e, impactos, clave, p);
    if (!x) return;
    const nombre = nombreDeSeleccion(clave);
    cambiar(
      { ...estado, expediente: x },
      exito(`¡Listo! Moviste: ${nombre.split(" · ")[0]!.toLowerCase()}.`),
    );
  };
  /** El anillo o Q/E: con su rumbo (un coche, un objeto) o lo girado (el terreno). */
  const girarLoSeleccionado = (clave: string, giro: { rumbo?: number; delta: number }) => {
    const x =
      giro.rumbo !== undefined && capacidadesDe(e, clave).girar === "absoluto"
        ? fijarRumbo(e, clave, giro.rumbo)
        : girarSeleccion(e, clave, giro.delta);
    if (x) cambiar({ ...estado, expediente: x }, exito("¡Listo! Lo giraste."));
  };
  /** A o «Alinear con la calle» (ronda 4): al eje de la calle más cercana. */
  const alinearLoSeleccionado = (clave: string): boolean => {
    if (!callesMapa.length) {
      setMensaje({ tipo: "alerta", texto: "No hay calles del mapa cerca para alinearlo." });
      return false;
    }
    const x = alinearConLaCalle(e, clave, (p, r) => rumboAlineado(callesMapa, p, r));
    if (x) cambiar({ ...estado, expediente: x }, exito("¡Listo! Quedó alineado con la calle."));
    return Boolean(x);
  };
  /** F o «Voltear 180°» (ronda 4). */
  const voltearLoSeleccionado = (clave: string): boolean => {
    const x = voltear(e, clave);
    if (x) cambiar({ ...estado, expediente: x }, exito("¡Listo! Lo volteaste."));
    return Boolean(x);
  };
  /** «Quitar» o Supr. Un coche no sale del caso: se quita dónde quedó y se vuelve a preguntar. */
  const quitarLoSeleccionado = (clave: string) => {
    const x = quitarSeleccion(e, clave);
    if (!x) return;
    const { tipo, id } = deClave(clave);
    cambiar(
      { ...estado, expediente: x },
      exito(
        tipo === "coche"
          ? `Quitaste dónde quedó el ${nombres[id] ?? id}. Márcalo otra vez o elige «No sé».`
          : id === "golpe"
            ? "Lo quitaste: Croquis usa el lugar del choque."
            : tipo === "persona" && id.endsWith(":final")
              ? "Borraste dónde quedó: sin eso no hay distancia de proyección."
              : "Lo quitaste.",
      ),
    );
    // Sin su punto final, la persona sigue seleccionada (para marcarlo otra vez).
    setSeleccion(
      tipo === "persona" && id.endsWith(":final")
        ? `persona:${id.slice(0, -":final".length)}`
        : null,
    );
  };
  const accionesDe = (clave: string): AccionSeleccion[] => {
    const { tipo, id } = deClave(clave);
    const hecho = (x: Expediente, texto: string, soltar = false) => {
      cambiar({ ...estado, expediente: x }, exito(texto));
      if (soltar) setSeleccion(null);
    };
    const reabrir = (f: () => void) => () => {
      setSeleccion(null);
      f();
    };
    const nombre = nombreDeSeleccion(clave);
    const quitarlo: AccionSeleccion = {
      id: "quitar",
      texto: "Quitar",
      etiqueta: `Quitar: ${nombre}`,
      peligro: true,
      hacer: () => quitarLoSeleccionado(clave),
    };
    if (tipo === "coche") {
      const fin = poseDe(e, id, "final");
      return [
        ...(fin
          ? [
              {
                id: "girar-izq",
                texto: "Girar −15°",
                etiqueta: `Girar ${nombre} 15° a la izquierda`,
                hacer: () => hecho(girar(e, id, "final", -15), "¡Listo! Lo giraste."),
              },
              {
                id: "girar-der",
                texto: "Girar +15°",
                etiqueta: `Girar ${nombre} 15° a la derecha`,
                hacer: () => hecho(girar(e, id, "final", 15), "¡Listo! Lo giraste."),
              },
            ]
          : []),
        {
          id: "cambiar-direccion",
          texto: "Cambiar por dónde venía",
          hacer: reabrir(() => setEditando({ tipo: "direccion", id })),
        },
        {
          id: "cambiar",
          texto: "Cambiar dónde quedó",
          hacer: reabrir(() => setEditando({ tipo: "final", id })),
        },
        ...(fin ? [quitarlo] : []),
      ];
    }
    if (tipo === "persona" && id.endsWith(":final")) {
      const pid = id.slice(0, -":final".length);
      return [
        {
          id: "ver-persona",
          texto: nombrePersona(e, pid),
          etiqueta: `Seleccionar: ${nombrePersona(e, pid)}`,
          hacer: () => setSeleccion(`persona:${pid}`),
        },
        { ...quitarlo, texto: "Borrar", etiqueta: `Borrar: ${nombre}` },
      ];
    }
    if (tipo === "persona") {
      const per = personasColocadas.find((x) => x.id === id);
      const nombreCorto = nombrePersona(e, id);
      const esperando = marcando === id;
      return [
        {
          id: "girar-izq",
          texto: "Girar −15°",
          etiqueta: `Girar ${nombreCorto} 15° a la izquierda`,
          hacer: () => hecho(girarPersona(e, id, -15), "¡Listo! Lo giraste."),
        },
        {
          id: "girar-der",
          texto: "Girar +15°",
          etiqueta: `Girar ${nombreCorto} 15° a la derecha`,
          hacer: () => hecho(girarPersona(e, id, 15), "¡Listo! Lo giraste."),
        },
        {
          id: "marcar-final",
          testId: "marcar-final-persona",
          texto: esperando
            ? "Toca el mapa…"
            : per?.final
              ? "Marcar otra vez dónde quedó"
              : "Marcar dónde quedó",
          etiqueta: `Marcar dónde quedó: ${nombreCorto}`,
          presionado: esperando,
          hacer: () => setMarcandoFinal(esperando ? null : id),
        },
        ...(per?.final
          ? [
              {
                id: "borrar-final",
                texto: "Borrar dónde quedó",
                etiqueta: `Borrar dónde quedó: ${nombreCorto}`,
                hacer: () => quitarLoSeleccionado(`persona:${id}:final`),
              },
            ]
          : []),
        { ...quitarlo, etiqueta: `Quitar: ${nombreCorto}` },
      ];
    }
    if (tipo === "objeto") {
      return [
        {
          id: "girar-izq",
          texto: "Girar −15°",
          etiqueta: `Girar ${nombre} 15° a la izquierda`,
          hacer: () => hecho(girarObjeto(e, id, -15), "¡Listo! Lo giraste."),
        },
        {
          id: "girar-der",
          texto: "Girar +15°",
          etiqueta: `Girar ${nombre} 15° a la derecha`,
          hacer: () => hecho(girarObjeto(e, id, 15), "¡Listo! Lo giraste."),
        },
        {
          id: "mas-grande",
          texto: "Más grande",
          hacer: () => hecho(cambiarTamano(e, id, 1.25), "¡Listo! Ahora es más grande."),
        },
        {
          id: "mas-chico",
          texto: "Más chico",
          hacer: () => hecho(cambiarTamano(e, id, 0.8), "¡Listo! Ahora es más chico."),
        },
        quitarlo,
      ];
    }
    if (tipo === "terreno") {
      const t = terrenoMarcado.find((x) => x.id === id);
      if (!t) return [];
      const giro: AccionSeleccion[] = [
        {
          id: "girar-izq",
          texto: "Girar −15°",
          etiqueta: `Girar ${nombre} 15° a la izquierda`,
          hacer: () => hecho(girarTerreno(e, id, -15), "¡Listo! Lo giraste."),
        },
        {
          id: "girar-der",
          texto: "Girar +15°",
          etiqueta: `Girar ${nombre} 15° a la derecha`,
          hacer: () => hecho(girarTerreno(e, id, 15), "¡Listo! Lo giraste."),
        },
        {
          id: "mas-grande",
          texto: t.clase === "tope" ? "Más ancho" : "Más grande",
          hacer: () => hecho(escalarTerreno(e, id, 1.25), "¡Listo! Ahora es más grande."),
        },
        {
          id: "mas-chico",
          texto: t.clase === "tope" ? "Menos ancho" : "Más chico",
          hacer: () => hecho(escalarTerreno(e, id, 0.8), "¡Listo! Ahora es más chico."),
        },
      ];
      const quitar = quitarlo;
      const medida = (x: Expediente) => hecho(x, "¡Listo! Cambiaste su medida.");
      if (t.clase === "zona") {
        // Sin fijar, se parte del valor de la tabla (el lugar, en seco).
        const mu = t.friccion ?? friccionDeTabla(t.tipo!, "seco").valor;
        return [
          ...giro,
          {
            id: "friccion-menos",
            texto: "Fricción −0.05",
            hacer: () => medida(cambiarTerreno(e, id, { friccion: mu - 0.05 })),
          },
          {
            id: "friccion-mas",
            texto: "Fricción +0.05",
            hacer: () => medida(cambiarTerreno(e, id, { friccion: mu + 0.05 })),
          },
          ...(t.friccion !== undefined
            ? [
                {
                  id: "friccion-tabla",
                  texto: "Fricción de la tabla",
                  hacer: () => medida(cambiarTerreno(e, id, { friccion: null })),
                },
              ]
            : []),
          quitar,
        ];
      }
      if (t.clase === "ondulacion")
        return [
          ...giro,
          {
            id: "alto-menos",
            texto: "Alto −1 cm",
            hacer: () => medida(cambiarTerreno(e, id, { amplitud_m: t.amplitud_m! - 0.01 })),
          },
          {
            id: "alto-mas",
            texto: "Alto +1 cm",
            hacer: () => medida(cambiarTerreno(e, id, { amplitud_m: t.amplitud_m! + 0.01 })),
          },
          {
            id: "crestas-menos",
            texto: "Crestas más juntas",
            hacer: () =>
              medida(cambiarTerreno(e, id, { longitud_onda_m: t.longitud_onda_m! * 0.8 })),
          },
          {
            id: "crestas-mas",
            texto: "Crestas más separadas",
            hacer: () =>
              medida(cambiarTerreno(e, id, { longitud_onda_m: t.longitud_onda_m! * 1.25 })),
          },
          quitar,
        ];
      return [
        ...giro,
        {
          id: "alto-menos",
          texto: "Alto −1 cm",
          hacer: () => medida(cambiarTerreno(e, id, { alto_m: t.alto_m! - 0.01 })),
        },
        {
          id: "alto-mas",
          texto: "Alto +1 cm",
          hacer: () => medida(cambiarTerreno(e, id, { alto_m: t.alto_m! + 0.01 })),
        },
        {
          id: "largo-menos",
          texto: "Largo −10 cm",
          hacer: () => medida(cambiarTerreno(e, id, { largo_m: t.largo_m! - 0.1 })),
        },
        {
          id: "largo-mas",
          texto: "Largo +10 cm",
          hacer: () => medida(cambiarTerreno(e, id, { largo_m: t.largo_m! + 0.1 })),
        },
        quitar,
      ];
    }
    if (id === "golpe")
      return [
        { id: "cambiar", texto: "Cambiar", hacer: reabrir(() => setEditandoC1("golpe")) },
        quitarlo,
      ];
    const q = paso(id);
    if (q)
      return [
        { id: "cambiar", texto: "Cambiar", hacer: reabrir(() => setEditandoC1("paso")) },
        quitarlo,
      ];
    return [
      { id: "cambiar", texto: "Cambiar", hacer: reabrir(() => setEditandoC1("otros")) },
      quitarlo,
    ];
  };
  /**
   * Con la escena lista, todo lo colocado se toca para seleccionarlo (René, 2026-11-17: también
   * desde la tarjeta «¡La escena está lista!», sin pasar antes por «Cambiar algo»). Mientras se
   * pone un objeto, se mide o se marca el terreno, el toque es para eso.
   */
  const puedeSeleccionar =
    todoListo &&
    !poniendo &&
    !poniendoPersona &&
    !marcando &&
    herramienta !== "medir" &&
    poniendoTerreno === null;
  const seleccionar = (clave: string) => {
    setListaVista(true);
    setSeleccion(clave);
  };

  // El teclado (René, 2026-11-17): Ctrl+Z deshace y Ctrl+Shift+Z (o Ctrl+Y) rehace siempre; con
  // algo seleccionado, las flechas lo mueven (Shift: más), Q y E lo giran, Supr lo quita y Esc lo
  // suelta. Se oye en la captura para que el mapa no se desplace con las mismas flechas.
  const alTeclado = useRef<(ev: KeyboardEvent) => void>(() => undefined);
  useEffect(() => {
    alTeclado.current = (ev) => {
      if (ev.defaultPrevented || enCampoDeTexto(ev.target)) return;
      // Esc primero cancela lo que espera un toque (poner a una persona, marcar dónde quedó).
      if (ev.key === "Escape" && (marcando || poniendoPersona)) {
        setMarcandoFinal(null);
        setPoniendoPersona(null);
        ev.preventDefault();
        ev.stopPropagation();
        return;
      }
      const sel = corrigiendo ? seleccion : null;
      const accion = accionDeTecla(ev, sel !== null);
      if (!accion) return;
      if (accion.tipo === "deshacer") {
        if (!pila.length) return;
        deshacer();
      } else if (accion.tipo === "rehacer") {
        if (!futuro.length) return;
        rehacer();
      } else if (!sel) return;
      else if (accion.tipo === "soltar") setSeleccion(null);
      else if (accion.tipo === "quitar") {
        if (!capacidadesDe(e, sel).quitar) return;
        quitarLoSeleccionado(sel);
      } else if (accion.tipo === "girar") {
        if (!capacidadesDe(e, sel).girar) return;
        girarLoSeleccionado(sel, { delta: accion.grados });
      } else if (accion.tipo === "alinear") {
        if (!alinearLoSeleccionado(sel)) return;
      } else if (accion.tipo === "voltear") {
        if (!voltearLoSeleccionado(sel)) return;
      } else {
        const pos = posicionDe(e, sel);
        if (!pos || !capacidadesDe(e, sel).mover) return;
        moverSeleccion(sel, desplazar(pos.punto, accion.rumbo, accion.metros));
      }
      ev.preventDefault();
      ev.stopPropagation();
    };
  });
  useEffect(() => {
    const escuchar = (ev: KeyboardEvent) => alTeclado.current(ev);
    window.addEventListener("keydown", escuchar, true);
    return () => window.removeEventListener("keydown", escuchar, true);
  }, []);

  /** «Cambiar» en una línea del resumen: regresa solo a esa pregunta. */
  const cambiarLinea = (l: LineaResumen) => {
    setListaVista(true);
    if (l.tipo === "choque") setEditando({ tipo: "choque", id: String(l.orden ?? 1) });
    else if (l.tipo === "vehiculo" && l.vehiculo)
      setEditando({ tipo: "direccion", id: l.vehiculo });
    else if (l.tipo === "golpe") setEditandoC1("golpe");
    else if (l.tipo === "objeto") setEditandoC1("otros");
    else if (l.tipo === "paso") setEditandoC1("paso");
    else if (l.tipo === "lugar" && l.objeto) setSeleccion(`objeto:${l.objeto}`);
    else if (l.tipo === "persona" && l.persona) setSeleccion(`persona:${l.persona}`);
    else if (l.tipo === "terreno") {
      if (l.terreno) setSeleccion(`terreno:${l.terreno}`);
      else setEditandoC1("terreno");
    }
  };
  // C3 (W5): el terreno marcado, para el mapa. Las zonas, con su fricción si el perito la fijó.
  const terrenoMapa: TerrenoMapa[] = terrenoMarcado.map((t) => ({
    id: t.id,
    clase: t.clase,
    tipo: t.tipo,
    nombre: t.nombre,
    puntos: t.puntos,
    centro: t.centro,
  }));
  const objetosMapa = objetosColocados.map((o) => ({
    id: o.id,
    tipo: o.tipo,
    nombre: o.nombre,
    punto: o.punto,
    rumbo: o.rumbo,
    largo: o.largo,
    ancho: o.ancho,
  }));

  // A3: los peatones y los ciclistas, con su distancia de proyección si se marcó dónde quedaron.
  const personasMapa: PersonaMapa[] = personasColocadas.map((per) => {
    const d = distanciaProyeccion(per);
    return {
      id: per.id,
      rol: per.rol,
      nombre: nombrePersona(e, per.id),
      punto: per.punto,
      rumbo: per.rumbo_deg ?? 0,
      final: per.final ?? null,
      proyeccion: d !== null ? `Proyección ${F.metros(d, 1)}` : null,
    };
  });
  /** «En el centro del mapa»: lo que espera un toque, sin tocar (con el teclado). */
  const ponerAlCentro = () => {
    const c = mapa.current?.getCenter();
    if (c) tocar({ lat: c.lat, lon: c.lng });
  };

  // --- Lo que se dibuja en el mapa ---------------------------------------------------------------
  const coches: CocheMapa[] = vehiculos.flatMap((v) => {
    const m = medidasDe(v);
    const base = {
      nombre: nombres[v.id]!,
      color: colores[v.id]!.css,
      clase: v.clase ?? "sedan_mediano",
      largo: m.largo,
      ancho: m.ancho,
    };
    const out: CocheMapa[] = [];
    const fin = poseDe(e, v.id, "final");
    const imp = poseDe(e, v.id, "impacto");
    const enCurso = vehiculoActual === v.id;
    if (fin)
      out.push({
        ...base,
        id: `${v.id}-final`,
        punto: fin.punto,
        rumbo: fin.rumbo,
        activo: enCurso && colocando === v.id,
      });
    else if (imp && (enCurso || !actual))
      out.push({
        ...base,
        id: `${v.id}-impacto`,
        punto: imp.punto,
        rumbo: imp.rumbo,
        tenue: imp.fuente === "supuesto",
      });
    return out;
  });
  const flechasMapa: FlechaMapa[] = flechas.map((f, i) => ({
    en: f.en,
    rumbo: f.rumbo,
    texto: textoFlecha(f),
    propuesta: i === propuestaFlecha,
    color: vehiculoActual ? colores[vehiculoActual]!.css : "#2563EB",
  }));
  const lineas = vehiculos.flatMap((v) => {
    const imp = poseDe(e, v.id, "impacto");
    if (!imp || imp.fuente === "supuesto") return [];
    const c = choqueDe(v.id) ?? imp.punto;
    const fin = poseDe(e, v.id, "final");
    return [
      { puntos: trayectoDeLlegada(c, imp.rumbo), color: colores[v.id]!.css },
      ...(fin ? [{ puntos: [c, fin.punto], color: colores[v.id]!.css }] : []),
    ];
  });
  // A3: de donde golpearon a la persona a donde quedó (la proyección), discontinua como las demás.
  for (const per of personasColocadas)
    if (per.final) lineas.push({ puntos: [per.punto, per.final], color: COLOR_PERSONA[tema] });
  const choques = impactos.flatMap((i) => {
    const p = puntoChoque(i.orden);
    return p ? [{ orden: i.orden, punto: p }] : [];
  });
  const propuestaVisible =
    actual?.tipo === "choque" && actual.orden === 1 && !marcoYo && propuesta && !estado.puntos[1]
      ? { punto: propuesta.punto, texto: "¿Aquí? Toca para marcar el choque" }
      : null;
  const encuadre = useMemo(() => {
    const ps: Punto[] = [];
    for (const c of choques) ps.push(c.punto);
    for (const v of vehiculos) {
      const f = poseDe(e, v.id, "final");
      if (f) ps.push(f.punto);
    }
    if (!ps.length && propuesta) ps.push(propuesta.punto);
    if (!ps.length && lugarBase) ps.push(lugarBase);
    return ps;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- se reencuadra al cambiar de pregunta
  }, [actual?.tipo, vehiculoActual, propuesta?.punto.lat, lugarBase?.lat]);

  // --- La hoja de la pregunta --------------------------------------------------------------------
  const nPasos = pasos.length;
  const indice = actual
    ? pasos.findIndex((p) =>
        actual.tipo === "choque"
          ? p.tipo === "choque" && p.orden === actual.orden
          : actual.tipo === "vehiculo"
            ? p.tipo === "vehiculo" && p.vehiculo === actual.vehiculo
            : p.tipo === actual.tipo,
      )
    : nPasos - 1;

  const cabecera = (
    <div className="flex items-center gap-2" data-testid="escena-paso" data-n={indice + 1}>
      <span className="flex gap-1" aria-hidden="true">
        {pasos.map((_, k) => (
          <span
            key={k}
            className={`h-1.5 rounded-full ${k === indice ? "w-6 bg-texto" : k < indice ? "w-1.5 bg-texto" : "w-1.5 bg-linea"}`}
          />
        ))}
      </span>
      <span className="font-mono text-[0.75rem] text-texto-3">
        Paso {indice + 1} de {nPasos}
      </span>
    </div>
  );

  let hoja: ReactNode = null;
  if (actual?.tipo === "choque") {
    const orden = actual.orden;
    const varios = impactos.length > 1;
    const conPropuesta = orden === 1 && propuesta && !marcoYo;
    hoja = (
      <>
        {cabecera}
        <h2 className="escena-titulo" data-testid="escena-pregunta">
          {varios
            ? `¿Dónde fue el ${["primer", "segundo", "tercer", "cuarto", "quinto"][orden - 1] ?? `${orden}.º`} choque?`
            : "¿Dónde fue el choque?"}
        </h2>
        <p className="t-cuerpo text-texto-2">
          Toca el lugar en el mapa. Puedes moverte arrastrando y acercarte con la rueda del ratón o
          con dos dedos.
        </p>
        {buscandoNarrado && !conPropuesta ? (
          <p className="t-nota" role="status" data-testid="buscando-narrado">
            Buscando en el mapa el lugar que dice la narración…
          </p>
        ) : null}
        {dudaLugar && busquedaNarrada && !buscandoNarrado ? (
          <p className="t-nota text-texto" role="status" data-testid="lugar-dudoso">
            Croquis encontró «{busquedaNarrada.nombre}», pero {dudaLugar}. ¿Dónde fue? Elige una de
            las opciones de abajo, escribe las calles del cruce, pega las coordenadas o toca el
            lugar en el mapa.
          </p>
        ) : null}
        {narradoSinLugar && !buscandoNarrado && !conPropuesta && !estado.puntos[1] ? (
          <p className="t-nota text-texto" role="status" data-testid="narrado-sin-lugar">
            {narradoSinLugar}
          </p>
        ) : null}
        {conPropuesta ? (
          <div
            className="flex flex-col gap-3 rounded-2xl bg-superficie-alta p-4"
            data-testid="escena-propuesta"
          >
            <span className="text-[0.8125rem] font-semibold text-texto-2">
              {propuesta.segun === "narracion" || propuesta.segun === "a_la_altura"
                ? "Croquis lo leyó en la narración"
                : propuesta.segun === "una_calle"
                  ? "La narración dice"
                  : "Croquis propone el cruce más cercano al lugar del caso"}
            </span>
            {propuesta.cita ? (
              <p className="font-serif text-[1.15rem] italic leading-snug">«{propuesta.cita}»</p>
            ) : null}
            {propuesta.segun === "una_calle" ? (
              <p className="t-nota" data-testid="propuesta-una-calle">
                En el mapa está {propuesta.encontrada}, pero no {propuesta.faltante}. Croquis te
                propone su cruce más cercano:{" "}
                <b className="text-texto">{propuesta.calles.slice(0, 2).join(" y ")}</b>.
              </p>
            ) : propuesta.segun === "a_la_altura" ? (
              <p className="t-nota" data-testid="propuesta-a-la-altura">
                {propuesta.calles[0]} y {propuesta.calles[1]} no se cruzan a nivel (un paso a
                desnivel): Croquis propone el choque sobre {propuesta.calles[0]}, a la altura de{" "}
                {propuesta.calles[1]}.
              </p>
            ) : propuesta.segun === "cercania" && propuesta.calles.length ? (
              <p className="font-semibold">{propuesta.calles.slice(0, 2).join(" y ")}</p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="boton-principal escena-boton"
                onClick={() => ponerChoque(1, propuesta.punto, propuesta.calles.slice(0, 2))}
                data-testid="aceptar-choque"
              >
                {propuesta.segun === "narracion" && propuesta.calles.length >= 2
                  ? "Sí, fue en ese cruce"
                  : "Sí, fue ahí"}
              </button>
              <button
                type="button"
                className="boton-secundario escena-boton"
                onClick={() => setMarcoYo(true)}
                data-testid="marco-yo"
              >
                No, lo marco yo
              </button>
            </div>
          </div>
        ) : null}
        {orden === 1 ? (
          <form
            className="flex flex-col gap-2"
            onSubmit={(ev) => {
              ev.preventDefault();
              void buscar();
            }}
          >
            <label className="text-[0.875rem] font-semibold" htmlFor="escena-buscar">
              ¿No aparece el lugar? Búscalo
            </label>
            <div className="flex gap-2">
              <input
                id="escena-buscar"
                className="campo h-12 min-w-0 flex-1"
                placeholder="Calle y colonia, o pega un link de Google Maps"
                value={busqueda}
                onChange={(ev) => setBusqueda(ev.target.value)}
                data-testid="escena-buscar"
              />
              <button type="submit" className="boton-secundario escena-boton">
                Buscar
              </button>
            </div>
            {estadoBusqueda ? (
              <span className="t-nota" role="status">
                {estadoBusqueda}
              </span>
            ) : null}
            {opcionesLugar.length ? (
              <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto">
                {opcionesLugar.map((r) => (
                  <li key={`${r.lat},${r.lon}`}>
                    <button
                      type="button"
                      className="t-nota min-h-11 w-full rounded-control px-2 py-1 text-left hover:bg-superficie-alta"
                      aria-label={etiquetaOpcion(r)}
                      data-testid="opcion-lugar"
                      onClick={() => {
                        mapa.current?.easeTo({ center: [r.lon, r.lat], zoom: 18.5 });
                        onBuscarCalles({ lat: r.lat, lon: r.lon });
                        // El perito eligió el lugar: ya no hay duda y Croquis propone ahí.
                        if (busquedaNarrada) {
                          setBusquedaNarrada(null);
                          setLugarNarrado({ lat: r.lat, lon: r.lon });
                        }
                        setResultados([]);
                        setEstadoBusqueda(null);
                      }}
                    >
                      <span className="block">{r.nombre}</span>
                      {zonaDeOpcion(r) ? (
                        <span className="block text-texto-3">{zonaDeOpcion(r)}</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </form>
        ) : null}
      </>
    );
  } else if (actual?.tipo === "golpe") {
    const choque = puntoChoque(1);
    hoja = (
      <>
        {cabecera}
        <h2 className="escena-titulo" data-testid="escena-pregunta">
          ¿Dónde fue el primer golpe?
        </h2>
        <p className="t-cuerpo text-texto-2">
          Toca en el mapa el punto donde los vehículos se tocaron por primera vez. Croquis lo usa
          como una medición.
        </p>
        <div className="flex flex-col gap-2">
          {choque ? (
            <button
              type="button"
              className="boton-principal escena-boton w-full"
              onClick={() => marcarGolpe(choque)}
              data-testid="golpe-ahi"
            >
              Ahí mismo, donde marqué el choque
            </button>
          ) : null}
          <button
            type="button"
            className="boton-secundario escena-boton w-full"
            onClick={golpeNoSe}
            data-testid="golpe-nose"
          >
            No sé
          </button>
        </div>
      </>
    );
  } else if (actual?.tipo === "otros") {
    const marcados = choquesIntermedios(e);
    const objeto = OBJETOS_C1.find((o) => o.id === otro.objeto) ?? null;
    hoja = (
      <>
        {cabecera}
        <h2 className="escena-titulo" data-testid="escena-pregunta">
          ¿Chocó contra algo más?
        </h2>
        <p className="t-cuerpo text-texto-2">
          Después del primer golpe: un poste, una pared, un árbol, un vehículo estacionado…
        </p>
        {marcados.length ? (
          <ul className="flex flex-col gap-1" data-testid="otros-marcados">
            {marcados.map((c) => (
              <li
                key={c.orden}
                className="flex items-center justify-between gap-2 rounded-control bg-superficie-alta px-3 py-1"
              >
                <span className="text-[0.9375rem]">
                  El {nombres[c.vehiculo]} contra{" "}
                  {OBJETOS_C1.find((o) => o.id === c.objeto)?.con ?? c.objeto}
                </span>
                <button
                  type="button"
                  className="t-nota min-h-11 underline"
                  onClick={() =>
                    cambiar(
                      { ...estado, expediente: quitarChoqueIntermedio(e, c.orden) },
                      exito("Listo, lo quité."),
                    )
                  }
                  data-testid={`otros-quitar-${c.orden}`}
                >
                  Quitar
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {otro.abierto ? (
          <div className="flex flex-col gap-3 rounded-2xl bg-superficie-alta p-4">
            {vehiculos.length > 1 ? (
              <fieldset className="flex flex-col gap-2">
                <legend className="text-[0.875rem] font-semibold">¿Cuál vehículo?</legend>
                <div className="flex flex-wrap gap-2">
                  {vehiculos.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      className={`${vehiculoOtro === v.id ? "boton-principal" : "boton-secundario"} escena-boton`}
                      aria-pressed={vehiculoOtro === v.id}
                      onClick={() => setOtro((o) => ({ ...o, vehiculo: String(v.id) }))}
                      data-testid={`otros-vehiculo-${v.id}`}
                    >
                      {nombres[v.id]}
                    </button>
                  ))}
                </div>
              </fieldset>
            ) : null}
            <fieldset className="flex flex-col gap-2">
              <legend className="text-[0.875rem] font-semibold">¿Contra qué?</legend>
              <div className="flex flex-wrap gap-2">
                {OBJETOS_C1.map((o, k) => (
                  <button
                    key={o.id}
                    type="button"
                    className={`${otro.objeto === o.id ? "boton-principal" : "boton-secundario"} escena-boton`}
                    aria-pressed={otro.objeto === o.id}
                    onClick={() => setOtro((x) => ({ ...x, objeto: o.id }))}
                    data-testid={`otros-objeto-${k}`}
                  >
                    {o.texto}
                  </button>
                ))}
              </div>
            </fieldset>
            <p className="t-nota" role="status" data-testid="otros-toca">
              {vehiculoOtro && objeto
                ? `Ahora toca el mapa donde el ${nombres[vehiculoOtro]} chocó contra ${objeto.con}.`
                : "Elige y después toca el mapa donde fue."}
            </p>
            <button
              type="button"
              className="t-nota min-h-11 self-start underline"
              onClick={() => setOtro({ abierto: false, vehiculo: null, objeto: null })}
              data-testid="otros-cancelar"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="boton-secundario escena-boton"
              onClick={() => {
                setEditandoC1("otros");
                setOtro({ abierto: true, vehiculo: null, objeto: null });
              }}
              data-testid="otros-si"
            >
              {marcados.length ? "Sí, otro más" : "Sí"}
            </button>
            <button
              type="button"
              className="boton-principal escena-boton flex-1"
              onClick={choquesTerminados}
              data-testid="otros-no"
            >
              {marcados.length ? "No, es todo" : "No"}
            </button>
          </div>
        )}
      </>
    );
  } else if (actual?.tipo === "paso") {
    const v = vehiculoPaso;
    const suyos = v ? puntosDePaso(e, v) : [];
    const todos = puntosDePaso(e).length;
    hoja = (
      <>
        {cabecera}
        <h2 className="escena-titulo" data-testid="escena-pregunta">
          ¿Sabes por dónde pasó?
        </h2>
        <p className="t-cuerpo text-texto-2">
          Es opcional. Si sabes por dónde pasó un vehículo (una huella, un testigo, una cámara),
          toca esos puntos en el mapa, en orden.
        </p>
        {vehiculos.length > 1 ? (
          <div className="flex flex-wrap gap-2">
            {vehiculos.map((x) => (
              <button
                key={x.id}
                type="button"
                className={`${v === x.id ? "boton-principal" : "boton-secundario"} escena-boton`}
                aria-pressed={v === x.id}
                onClick={() => {
                  setEditandoC1("paso");
                  setPasoDe(String(x.id));
                }}
                data-testid={`paso-vehiculo-${x.id}`}
              >
                {nombres[x.id]}
              </button>
            ))}
          </div>
        ) : null}
        <p className="t-nota" role="status" data-testid="paso-cuenta">
          {v
            ? suyos.length
              ? `${suyos.length === 1 ? "Un punto" : `${suyos.length} puntos`} del ${nombres[v]}. Toca el mapa para agregar otro.`
              : `Toca el mapa por donde pasó el ${nombres[v]}.`
            : "Elige un vehículo para marcar sus puntos."}
        </p>
        <div className="flex flex-wrap gap-2">
          {v && suyos.length ? (
            <button
              type="button"
              className="boton-secundario escena-boton"
              onClick={() =>
                cambiar(
                  { ...estado, expediente: quitarUltimoPuntoDePaso(e, v) },
                  exito("Listo, quité el último punto."),
                )
              }
              data-testid="paso-quitar"
            >
              Quitar el último
            </button>
          ) : null}
          <button
            type="button"
            className="boton-principal escena-boton flex-1"
            onClick={pasosTerminados}
            data-testid="paso-listo"
          >
            {todos ? "Listo" : "No sé, seguir sin puntos"}
          </button>
        </div>
      </>
    );
  } else if (actual?.tipo === "terreno") {
    hoja = (
      <PreguntaTerreno
        cabecera={cabecera}
        piezas={terrenoMarcado}
        relieve={usaRelieve(e)}
        poniendo={poniendoTerreno}
        otras={otrasSuperficies}
        onOtras={() => setOtrasSuperficies(true)}
        onElegir={(x) => {
          setEditandoC1("terreno");
          setPoniendoTerreno(x);
        }}
        onTodoElLugar={() => {
          const centro = puntoChoque(1) ?? lugarBase;
          if (centro) ponerTerreno(centro, true);
        }}
        onRelieve={(usar) => {
          cambiar(
            { ...estado, expediente: usarRelieve(e, usar) },
            exito(
              usar
                ? "¡Listo! La reconstrucción va a usar el relieve real del lugar."
                : "Listo, sin el relieve real.",
            ),
          );
          setEditandoC1("terreno");
        }}
        onQuitar={(id) => {
          cambiar({ ...estado, expediente: quitarTerreno(e, id) }, exito("Listo, lo quité."));
          setEditandoC1("terreno");
        }}
        onListo={terrenoTerminado}
      />
    );
  } else if (actual?.tipo === "vehiculo" && !actual.direccion) {
    const v = actual.vehiculo;
    const sentido = sentidos[v] ?? null;
    hoja = (
      <>
        {cabecera}
        <div className="flex items-center gap-3">
          <IconoCoche color={colores[v]!.css} clase={vehiculos.find((x) => x.id === v)?.clase} />
          <h2 className="escena-titulo" data-testid="escena-pregunta">
            ¿Por dónde venía el {nombres[v]}?
          </h2>
        </div>
        <p className="t-cuerpo text-texto-2">
          Toca la flecha de la calle por donde llegaba al choque, o el mapa donde venía.
        </p>
        <div
          className="flex flex-col gap-2"
          role="radiogroup"
          aria-label={`Por dónde venía el ${nombres[v]}`}
        >
          {flechas.map((f, i) => (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={i === propuestaFlecha}
              className="escena-opcion"
              onClick={() => elegirFlecha(i)}
              data-testid={`opcion-flecha-${i}`}
              data-propuesta={i === propuestaFlecha ? "si" : "no"}
              data-rumbo={Math.round(f.rumbo)}
            >
              <span className="escena-radio" aria-hidden="true">
                {i === propuestaFlecha ? "✓" : ""}
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="font-semibold">{textoFlecha(f)}</span>
                {i === propuestaFlecha ? (
                  <span className="text-[0.8125rem] text-[var(--eleccion)]">
                    {sentido
                      ? `Croquis lo sugiere: la narración dice «${sentido.cita}».`
                      : "Croquis lo sugiere por las zonas de daño de los dos coches."}
                  </span>
                ) : null}
              </span>
            </button>
          ))}
        </div>
        {!callesMapa.length ? (
          <p className="t-nota">
            Sin las calles del mapa, las flechas van por los puntos cardinales.
          </p>
        ) : null}
        <button
          type="button"
          className="t-nota min-h-11 self-start underline"
          onClick={() => {
            const pose = poseDe(e, v, "impacto");
            if (!pose) return;
            aplicarDireccion(
              v,
              rumboDeLlegada(e, v, pose.rumbo),
              true,
              `Croquis usa la dirección que dan los daños para el ${nombres[v]}.`,
            );
          }}
          data-testid="no-se-direccion"
        >
          No sé por dónde venía
        </button>
      </>
    );
  } else if (actual?.tipo === "vehiculo") {
    const v = actual.vehiculo;
    const op = opcionFinal[v] ?? (finalNarradoDe(v) ? "narracion" : "marcar");
    const imp = poseDe(e, v, "impacto");
    const narrada = posicionesNarradas.find((p) => p.vehiculo === v && p.fase === "final");
    const desde = imp
      ? flechasDeLlegada(callesMapa, choqueDe(v) ?? imp.punto).find(
          (f) => Math.abs(((f.rumbo - rumboDeLlegada(e, v, imp.rumbo) + 540) % 360) - 180) < 30,
        )
      : null;
    const comoNarra = finalNarradoDe(v);
    const opciones: {
      clave: OpcionFinal;
      titulo: string;
      detalle?: string;
    }[] = [
      ...(comoNarra
        ? [
            {
              clave: "narracion" as const,
              titulo: "Como dice la narración",
              detalle: `Croquis lo coloca ${comoNarra.texto}.`,
            },
          ]
        : []),
      {
        clave: "marcar",
        titulo: "Lo marco en el mapa",
        detalle: "Toca el lugar donde se detuvo, o arrastra el coche.",
      },
      { clave: "junto", titulo: "Quedó junto al choque" },
      {
        clave: "nose",
        titulo: "No sé dónde quedó",
        detalle: "Croquis lo calcula y lo anota como supuesto en el dictamen.",
      },
    ];
    const puedeTerminar = op !== "marcar" || Boolean(poseDe(e, v, "final"));
    hoja = (
      <>
        {cabecera}
        <div className="flex items-center gap-3">
          <IconoCoche color={colores[v]!.css} clase={vehiculos.find((x) => x.id === v)?.clase} />
          <span className="text-[1.1rem] font-semibold">El {nombres[v]}</span>
        </div>
        {imp ? (
          <div className="flex items-center gap-2 rounded-xl bg-[var(--exito-fondo)] px-3 py-2 text-[0.9rem]">
            <span
              className="escena-icono-mensaje h-6 w-6 bg-[var(--exito)] text-[0.75rem]"
              aria-hidden="true"
            >
              ✓
            </span>
            <span className="flex-1">
              {estado.direccionesNoSe.includes(v)
                ? "No sabías por dónde venía (supuesto)"
                : desde
                  ? textoFlecha(desde).replace(/^Del/, "Venía del")
                  : "Ya dijiste por dónde venía"}
            </span>
            <button
              type="button"
              className="min-h-11 px-1 text-[0.8125rem] underline"
              onClick={() => setEditando({ tipo: "direccion", id: v })}
              data-testid="cambiar-direccion"
            >
              Cambiar
            </button>
          </div>
        ) : null}
        <h2 className="escena-titulo" data-testid="escena-pregunta">
          ¿Dónde quedó después del choque?
        </h2>
        {narrada ? (
          <p className="t-nota">
            La narración dice: <span className="italic">«{narrada.descripcion}»</span>
          </p>
        ) : null}
        <div
          className="flex flex-col gap-2"
          role="radiogroup"
          aria-label={`Dónde quedó el ${nombres[v]}`}
        >
          {opciones.map((o) => (
            <button
              key={o.clave}
              type="button"
              role="radio"
              aria-checked={op === o.clave}
              className="escena-opcion"
              onClick={() => {
                setOpcionFinal((x) => ({ ...x, [v]: o.clave }));
                if (o.clave === "marcar" && !poseDe(e, v, "final") && imp) {
                  // Arranca un poco delante del choque, alineado a la calle: luego se toca o arrastra.
                  setColocando(v);
                }
              }}
              data-testid={`final-${o.clave}`}
            >
              <span className="escena-radio" aria-hidden="true">
                {op === o.clave ? "✓" : ""}
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="font-semibold">{o.titulo}</span>
                {o.detalle ? (
                  <span className="text-[0.8125rem] text-texto-2">{o.detalle}</span>
                ) : null}
              </span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className="boton-principal escena-boton w-full"
          disabled={!puedeTerminar}
          onClick={() => terminarFinal(v)}
          data-testid="listo-final"
        >
          Listo, así quedó
        </button>
        {op === "marcar" && !poseDe(e, v, "final") ? (
          <p className="t-nota" role="status">
            Toca el mapa donde se detuvo el {nombres[v]}.
          </p>
        ) : null}
      </>
    );
  }

  const visible = alertaAuto ?? mensaje;
  // Los de éxito se van solos a los 6 s (no tapan el mapa); las alertas esperan su respuesta.
  useEffect(() => {
    if (mensaje?.tipo !== "exito") return;
    const t = setTimeout(() => setMensaje((m) => (m === mensaje ? null : m)), 6000);
    return () => clearTimeout(t);
  }, [mensaje]);

  // --- La tarjeta final --------------------------------------------------------------------------
  const resumen = resumenEscena({
    e,
    impactos,
    puntos: Object.fromEntries(choques.map((c) => [c.orden, c.punto])),
    callesChoque: Object.fromEntries(choques.map((c) => [c.orden, callesEn(callesMapa, c.punto)])),
    nombres,
    desconocidos: estado.desconocidos,
    direccionesNoSe: estado.direccionesNoSe,
    juntoAlChoque: estado.juntoAlChoque,
  });
  const resumenCompleto = [...resumen, ...resumenPersonas(e), ...resumenC1({ e, nombres, c1 })];
  const golpeMarcado = primerGolpe(e);
  const marcasC1 = [
    ...(golpeMarcado
      ? [{ id: "golpe", punto: golpeMarcado, tipo: "golpe" as const, texto: "Primer golpe" }]
      : []),
    ...choquesIntermedios(e).map((c) => ({
      id: `objeto-${c.orden}`,
      punto: c.punto,
      tipo: "objeto" as const,
      texto: OBJETOS_C1.find((o) => o.id === c.objeto)?.texto ?? c.objeto,
    })),
    ...puntosDePaso(e).map((q) => ({
      id: `paso-${q.vehiculo}-${q.orden}`,
      punto: q.punto,
      tipo: "paso" as const,
      texto: String(q.orden),
      color: colores[q.vehiculo]?.css,
    })),
  ];

  const medida =
    medicion.length === 2
      ? distanciaM([medicion[0]!.lon, medicion[0]!.lat], [medicion[1]!.lon, medicion[1]!.lat])
      : null;

  // --- La lista (ronda 4, propuesta 1) -----------------------------------------------------------
  const itemsLista: ItemEscena[] = [
    ...listaDeLaEscena({
      expediente: e,
      impactos,
      pasos,
      propuesta: escenaPropuesta,
      conLugar: Boolean(lugarBase || estado.puntos[1]),
      confirmados,
      direccionesNoSe: estado.direccionesNoSe,
      juntoAlChoque: estado.juntoAlChoque,
      desconocidos: estado.desconocidos,
      nombreDe: (id) => nombres[id] ?? id,
    }),
  ];
  /** «Confirmar»: el choque queda como del perito; la dirección, con su rumbo, como dato suyo. */
  const confirmarItem = (i: ItemEscena) => {
    if (i.abre.tipo === "choque") {
      setConfirmados((c) => new Set([...c, i.clave]));
      return;
    }
    if (i.abre.tipo === "direccion") {
      const v = i.abre.vehiculo;
      const pose = poseDe(e, v, "impacto");
      if (!pose) return;
      cambiar(
        {
          ...estado,
          expediente: elegirDireccion(
            e,
            impactos,
            v,
            rumboDeLlegada(e, v, pose.rumbo),
            puntoChoque,
          ),
        },
        exito(`¡Listo! Confirmaste por dónde venía ${nombres[v] ?? v}.`),
      );
    }
  };
  /** «Corregir», «Marcar» o «Contestar»: la pregunta de ese elemento, y al terminar, la lista. */
  const abrirItem = (i: ItemEscena) => {
    setGuiaVista(true);
    if (i.abre.tipo === "choque") setEditando({ tipo: "choque", id: String(i.abre.orden) });
    else if (i.abre.tipo === "direccion") setEditando({ tipo: "direccion", id: i.abre.vehiculo });
    else if (i.abre.tipo === "final") setEditando({ tipo: "final", id: i.abre.vehiculo });
    else if (i.abre.tipo === "c1") setEditandoC1(i.abre.pregunta);
  };

  return (
    <div
      className="absolute inset-0 overflow-hidden"
      data-testid="escena-facil"
      data-listo={todoListo ? "si" : "no"}
    >
      {nuevo ? (
        <div className="pointer-events-none absolute top-4 right-20 left-4 z-20 flex justify-end md:left-[480px] md:justify-start">
          <HerramientasEscena
            haySeleccion={Boolean(seleccion)}
            onGirar={(g) => seleccion && girarLoSeleccionado(seleccion, { delta: g })}
            onAlinear={() => seleccion && alinearLoSeleccionado(seleccion)}
            onVoltear={() => seleccion && voltearLoSeleccionado(seleccion)}
            onDeshacer={deshacer}
            onRehacer={rehacer}
            puedeDeshacer={pila.length > 0}
            puedeRehacer={futuro.length > 0}
            onAcercar={() => mapa.current?.zoomIn()}
            onAlejar={() => mapa.current?.zoomOut()}
            midiendo={herramienta === "medir"}
            onMedir={() => {
              setHerramienta(herramienta === "medir" ? null : "medir");
              setMedicion([]);
            }}
          />
        </div>
      ) : null}
      <MapaFacil
        tema={tema}
        encuadre={encuadre}
        onToque={tocar}
        choques={choques}
        marcas={marcasC1}
        propuesta={propuestaVisible}
        flechas={flechasMapa}
        onFlecha={elegirFlecha}
        coches={coches}
        lineas={lineas}
        medicion={medicion}
        midiendo={herramienta === "medir"}
        onMoverCoche={(id, p) => {
          const v = id.replace(/-final$/, "");
          colocarFinal(v, p);
        }}
        onGirar={(id, g) => {
          const v = id.replace(/-final$/, "");
          cambiar({ ...estado, expediente: girar(e, v, "final", g) }, null);
        }}
        onMapa={(m) => {
          mapa.current = m;
          setMapaListo(m);
        }}
        objetos={objetosMapa}
        terreno={terrenoMapa}
        personas={personasMapa}
        seleccion={corrigiendo ? seleccion : null}
        onSeleccionar={puedeSeleccionar ? seleccionar : undefined}
        onMover={moverSeleccion}
        onGirarSeleccion={girarLoSeleccionado}
        nombreDe={nombreDeSeleccion}
      />

      {/* «Deshacer» y «Rehacer», siempre a la vista (W4), y cómo va el recálculo. En el prototipo
          de la ronda 4 van en su barra de herramientas. */}
      <div
        className={`pointer-events-none absolute top-4 right-20 z-10 flex flex-col items-end gap-2 ${nuevo ? "hidden" : ""}`}
      >
        <div className="flex gap-2">
          <button
            type="button"
            className="escena-zoom pointer-events-auto px-3 text-[0.9rem] font-semibold"
            style={{ width: "auto" }}
            onClick={deshacer}
            disabled={!pila.length}
            aria-label="Deshacer"
            data-testid="deshacer-barra"
          >
            ↶ Deshacer
          </button>
          <button
            type="button"
            className="escena-zoom pointer-events-auto px-3 text-[0.9rem] font-semibold"
            style={{ width: "auto" }}
            onClick={rehacer}
            disabled={!futuro.length}
            aria-label="Rehacer"
            data-testid="rehacer"
          >
            Rehacer ↷
          </button>
        </div>
        {recalculo === "calculando" || recalculo === "al_dia" ? (
          <span
            className="escena-mensaje px-3 py-1 text-[0.85rem]"
            data-tipo={recalculo === "al_dia" ? "exito" : "alerta"}
            role="status"
            data-testid="recalculo"
            data-estado={recalculo}
          >
            {recalculo === "al_dia" ? "Reconstrucción al día" : "Recalculando la reconstrucción…"}
          </span>
        ) : null}
      </div>

      {/* W4: corregir lo colocado y agregar objetos del lugar. */}
      {corrigiendo && !seleccion ? (
        <div className="pointer-events-none absolute top-4 left-4 z-10 md:top-6 md:left-6">
          <PanelCorregir
            poniendo={poniendo}
            onElegir={setPoniendo}
            poniendoPersona={poniendoPersona}
            onElegirPersona={elegirPersona}
            faltaPersona={faltaPersona}
            onCentro={ponerAlCentro}
            enLaEscena={seleccionables(e).map((clave) => ({
              clave,
              nombre: nombreDeSeleccion(clave),
            }))}
            onSeleccionar={seleccionar}
            onTerreno={() => {
              setPoniendo(null);
              setEditandoC1("terreno");
            }}
            onListo={() => {
              setPoniendo(null);
              setListaVista(false);
            }}
          />
        </div>
      ) : null}
      {corrigiendo && seleccion ? (
        <div className="pointer-events-none absolute right-3 bottom-[84px] left-3 z-20 flex flex-col items-center gap-2">
          {marcando ? (
            <div
              className="escena-mensaje pointer-events-auto flex-wrap"
              data-tipo="alerta"
              role="status"
              data-testid="pista-final-persona"
            >
              <span className="min-w-0 flex-1 text-[0.95rem]">
                Toca el mapa donde quedó{" "}
                {articuloPersona(personasColocadas.find((x) => x.id === marcando)?.rol ?? "peaton")}
                .
              </span>
              <button
                type="button"
                className="boton-secundario boton-compacto"
                onClick={ponerAlCentro}
                data-testid="final-al-centro"
              >
                En el centro del mapa
              </button>
              <button
                type="button"
                className="boton-secundario boton-compacto"
                onClick={() => setMarcandoFinal(null)}
                data-testid="cancelar-final-persona"
              >
                Cancelar <kbd className="escena-tecla">Esc</kbd>
              </button>
            </div>
          ) : null}
          <BarraSeleccion
            nombre={nombreDeSeleccion(seleccion)}
            acciones={accionesDe(seleccion)}
            capacidades={capacidadesDe(e, seleccion)}
            onListo={() => setSeleccion(null)}
          />
        </div>
      ) : null}

      {/* El modo de medición (ronda 2, A5): qué tocar, la medida, cómo borrar y cómo terminar. */}
      {herramienta === "medir" ? (
        <div className="pointer-events-none absolute top-4 left-1/2 z-20 flex w-[min(640px,calc(100%-2rem))] -translate-x-1/2 md:top-[72px] justify-center md:left-[calc(50%+210px)] md:w-[min(600px,calc(100%-480px))]">
          <div
            className="escena-medir pointer-events-auto"
            role="status"
            data-testid="medir-banda"
            data-puntos={medicion.length}
          >
            <svg viewBox="0 0 24 24" width={22} height={22} aria-hidden="true" className="shrink-0">
              <path
                d="M3 16.5 16.5 3 21 7.5 7.5 21Z M7 12.5l1.8 1.8 M9.5 10l2.5 2.5 M12 7.5l1.8 1.8 M14.5 5l2.5 2.5"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.6}
                strokeLinejoin="round"
              />
            </svg>
            <span className="min-w-0 flex-1 text-[0.95rem]">
              <b>Midiendo</b> · {textoMedicion(medicion)}
            </span>
            {medicion.length ? (
              <button
                type="button"
                className="boton-secundario boton-compacto"
                onClick={() => setMedicion([])}
                data-testid="medir-borrar"
              >
                Borrar
              </button>
            ) : null}
            <button
              type="button"
              className="boton-principal boton-compacto"
              onClick={() => {
                setHerramienta(null);
                setMedicion([]);
              }}
              data-testid="medir-terminar"
            >
              Terminar <kbd className="escena-tecla">Esc</kbd>
            </button>
          </div>
        </div>
      ) : null}

      {/* El mensaje del momento: éxito, alerta o error; debajo, si la escena cambió después de
          reconstruir, el aviso con «Reconstruir de nuevo» (René, 2026-11-17). */}
      {(visible || recalculo === "vieja") && herramienta !== "medir" ? (
        <div className="pointer-events-none absolute top-4 left-1/2 z-20 flex w-[min(640px,calc(100%-2rem))] -translate-x-1/2 md:top-[72px] flex-col items-center gap-2 md:left-[calc(50%+210px)] md:w-[min(560px,calc(100%-480px))]">
          {visible ? (
            <div
              className="escena-mensaje pointer-events-auto w-full flex-wrap"
              data-tipo={visible.tipo}
              role={visible.tipo === "exito" ? "status" : "alert"}
              data-testid={`mensaje-${visible.tipo}`}
            >
              <span className="escena-icono-mensaje" aria-hidden="true">
                {visible.tipo === "exito" ? "✓" : "!"}
              </span>
              <span className="min-w-0 flex-1 text-[0.95rem]">{visible.texto}</span>
              {visible.deshacer && pila.length ? (
                <button
                  type="button"
                  className="min-h-11 px-2 font-semibold text-[var(--exito)] underline"
                  onClick={deshacer}
                  data-testid="deshacer"
                >
                  Deshacer
                </button>
              ) : null}
              {visible.acciones?.length ? (
                <span className="flex w-full flex-wrap justify-end gap-2">
                  {visible.acciones.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      className={`${a.principal ? "boton-principal" : "boton-secundario"} escena-boton`}
                      onClick={a.hacer}
                      data-testid={a.id}
                    >
                      {a.texto}
                    </button>
                  ))}
                </span>
              ) : null}
              {visible.tipo !== "alerta" ? (
                <button
                  type="button"
                  className="grid h-11 w-11 place-items-center rounded-full text-texto-3"
                  aria-label="Cerrar el mensaje"
                  onClick={() => (visible.clave ? descartar(visible.clave) : setMensaje(null))}
                >
                  ×
                </button>
              ) : null}
            </div>
          ) : null}
          {recalculo === "vieja" && onReconstruir ? (
            <AvisoEscenaCambio
              estado="vieja"
              onReconstruir={onReconstruir}
              error={errorReconstruccion}
              className="pointer-events-auto w-full"
            />
          ) : null}
        </div>
      ) : null}

      {/* La hoja de la pregunta: a la izquierda; en el celular, abajo. */}
      {nuevo && enLista ? (
        <ListaEscena
          items={itemsLista}
          listo={listaLista(itemsLista)}
          onConfirmar={confirmarItem}
          onAbrir={abrirItem}
          onVer={() => onVerReconstruccion?.()}
          guia={!guiaVista}
          onCerrarGuia={() => setGuiaVista(true)}
        />
      ) : null}
      {hoja && !(nuevo && enLista) && !(todoListo && !listaVista) ? (
        <section
          className="escena-hoja absolute right-0 bottom-[84px] left-0 z-10 flex max-h-[46vh] flex-col gap-4 overflow-y-auto rounded-b-none p-5 md:top-6 md:right-auto md:bottom-auto md:left-6 md:max-h-[calc(100%-140px)] md:w-[420px] md:rounded-[22px] md:p-7"
          aria-label="La pregunta"
          data-testid="escena-hoja"
        >
          {hoja}
          <details
            className="t-nota mt-1"
            open={mas}
            onToggle={(ev) => setMas((ev.currentTarget as HTMLDetailsElement).open)}
            data-testid="mas-herramientas"
          >
            <summary className="min-h-11 cursor-pointer content-center font-semibold">
              Más herramientas
            </summary>
            <div className="mt-2 flex flex-col gap-3">
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  className="boton-secundario escena-boton escena-boton-medir self-start"
                  aria-pressed={herramienta === "medir"}
                  onClick={() => {
                    setHerramienta(herramienta === "medir" ? null : "medir");
                    setMedicion([]);
                  }}
                  data-testid="herramienta-medir"
                >
                  {herramienta === "medir" ? "Terminar de medir" : "Medir una distancia"}
                </button>
                {herramienta === "medir" ? (
                  <span>
                    Toca en el mapa los dos extremos de lo que mides (restos, una huella de
                    frenado). La medida se puede usar abajo.
                  </span>
                ) : null}
                {medida !== null ? (
                  <div className="flex flex-wrap items-center gap-2" data-testid="medida">
                    <span className="font-mono font-semibold">{F.metros(medida)}</span>
                    <button
                      type="button"
                      className="boton-secundario escena-boton"
                      onClick={() =>
                        cambiar(
                          { ...estado, expediente: conRestos(e, F.redondea(medida, 2)) },
                          exito(`¡Listo! Los restos miden ${F.metros(medida)}.`),
                        )
                      }
                    >
                      Son los restos
                    </button>
                    {vehiculos.map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        className="boton-secundario escena-boton"
                        onClick={() =>
                          cambiar(
                            {
                              ...estado,
                              expediente: conHuella(e, v.id, F.redondea(medida, 2)),
                            },
                            exito(
                              `¡Listo! La huella de frenado del ${nombres[v.id]} mide ${F.metros(medida)}.`,
                            ),
                          )
                        }
                      >
                        Huella del {nombres[v.id]}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="flex flex-col gap-2">
                <span className="font-semibold">Dónde empezó cada coche (opcional)</span>
                <div className="flex flex-wrap gap-2">
                  {vehiculos.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      className="boton-secundario escena-boton"
                      aria-pressed={
                        typeof herramienta === "object" && herramienta?.inicial === v.id
                      }
                      onClick={() => setHerramienta({ inicial: v.id })}
                    >
                      {poseDe(e, v.id, "inicial")
                        ? `Mover el inicio del ${nombres[v.id]}`
                        : `Marcar el inicio del ${nombres[v.id]}`}
                    </button>
                  ))}
                </div>
                {typeof herramienta === "object" && herramienta ? (
                  <span role="status">
                    Toca el mapa donde empezó el {nombres[herramienta.inicial]}.
                  </span>
                ) : null}
              </div>
              {colocando ? (
                <label className="flex items-center gap-2">
                  Giro exacto del {nombres[colocando]}
                  <input
                    className="campo h-11 w-20 px-2 font-mono"
                    inputMode="decimal"
                    value={String(Math.round(poseDe(e, colocando, "final")?.rumbo ?? 0))}
                    onChange={(ev) => {
                      const r = Number(ev.target.value.replace(",", "."));
                      const pose = poseDe(e, colocando, "final");
                      if (Number.isFinite(r) && pose)
                        onEstado({
                          ...estado,
                          expediente: marcarFinal(e, colocando, pose.punto, r),
                        });
                    }}
                    data-testid="giro-exacto"
                  />
                  ° (0° es el norte)
                </label>
              ) : null}
            </div>
          </details>
        </section>
      ) : null}

      {/* La tarjeta final. */}
      {!nuevo && todoListo && !listaVista ? (
        // Arriba de la barra de avance de abajo: sus botones no quedan tapados (ronda 2, B).
        // El fondo deja pasar el toque: lo colocado se toca en el mapa para corregirlo (René,
        // 2026-11-17).
        <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center bg-[color-mix(in_srgb,var(--fondo)_45%,transparent)] p-4 pb-[104px]">
          <section
            className="escena-hoja pointer-events-auto flex max-h-full w-[min(560px,100%)] flex-col gap-4 overflow-y-auto p-7"
            role="dialog"
            aria-modal="false"
            aria-labelledby="escena-lista-titulo"
            data-testid="escena-lista"
          >
            <span
              className="mx-auto grid h-16 w-16 shrink-0 place-items-center rounded-full bg-[var(--exito)] text-[1.8rem] text-white"
              aria-hidden="true"
            >
              ✓
            </span>
            <h2 id="escena-lista-titulo" className="escena-titulo text-center">
              ¡La escena está lista!
            </h2>
            <p className="t-cuerpo text-center text-texto-2">
              Esto es lo que marcaste. Con esto Croquis ya puede reconstruir el choque. Para
              corregir algo, tócalo en el mapa o usa «Cambiar».
            </p>
            {faltaPersona ? (
              <AvisoFaltaPersona
                rol={faltaPersona}
                onColocar={() => {
                  setListaVista(true);
                  setSeleccion(null);
                  elegirPersona(faltaPersona);
                }}
              />
            ) : null}
            <ul
              className="flex flex-col divide-y divide-[var(--linea-suave)]"
              data-testid="escena-resumen"
            >
              {resumenCompleto.map((l, k) => (
                <li key={k} className="flex gap-3 py-3">
                  {l.persona ? (
                    <IconoPersona
                      rol={personasColocadas.find((x) => x.id === l.persona)?.rol ?? "peaton"}
                      tamano={22}
                    />
                  ) : !l.vehiculo ? (
                    <svg viewBox="-12 -12 24 24" width="22" height="22" aria-hidden="true">
                      <path
                        d="M0 -11 L3 -4 L10 -6 L5 0 L10 6 L3 4 L0 11 L-3 4 L-10 6 L-5 0 L-10 -6 L-3 -4 Z"
                        fill="var(--senal)"
                      />
                    </svg>
                  ) : (
                    <IconoCoche
                      color={colores[l.vehiculo!]!.css}
                      clase={vehiculos.find((x) => x.id === l.vehiculo)?.clase}
                      chico
                    />
                  )}
                  <span className="flex flex-1 flex-col gap-1">
                    <span className="font-semibold">{l.texto}</span>
                    {l.detalle ? <span className="t-nota">{l.detalle}</span> : null}
                    {l.supuesto ? (
                      <>
                        <span className="escena-supuesto self-start">Supuesto</span>
                        <span className="t-nota">{l.supuesto}</span>
                      </>
                    ) : null}
                  </span>
                  <button
                    type="button"
                    className="boton-secundario escena-boton self-start px-3"
                    onClick={() => cambiarLinea(l)}
                    data-testid={`cambiar-linea-${k}`}
                    data-linea={l.tipo}
                  >
                    Cambiar
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="boton-principal boton-continuar flex-1"
                onClick={onVerReconstruccion}
                data-testid="ver-reconstruccion"
              >
                Ver la reconstrucción
                <span className="flecha-continuar" aria-hidden="true">
                  →
                </span>
              </button>
              <button
                type="button"
                className="boton-secundario escena-boton"
                onClick={() => setListaVista(true)}
                data-testid="cambiar-algo"
              >
                Cambiar algo
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {/* El avance, siempre visible abajo. */}
      <nav
        className="escena-avance absolute bottom-3 left-1/2 z-20 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-1 overflow-x-auto p-2"
        aria-label="Avance de la escena"
        data-testid="escena-avance"
        hidden={nuevo}
      >
        {pasos.map((p, k) => {
          const esActual = k === indice && !todoListo;
          const nombre = nombreDelPaso(p);
          return (
            <button
              key={k}
              type="button"
              className="escena-chip"
              aria-current={esActual ? "step" : undefined}
              data-hecho={p.hecho ? "si" : "no"}
              disabled={!p.hecho && !esActual}
              onClick={() => {
                if (!p.hecho) return;
                setListaVista(true);
                if (p.tipo === "choque") setEditando({ tipo: "choque", id: String(p.orden) });
                else if (p.tipo === "vehiculo") setEditando({ tipo: "final", id: p.vehiculo });
                else setEditandoC1(p.tipo);
              }}
              data-testid={`avance-${k}`}
            >
              <span className="escena-chip-numero" aria-hidden="true">
                {p.hecho ? "✓" : k + 1}
              </span>
              <span className="escena-chip-nombre">{nombre}</span>
              <span className="sr-only">{p.hecho ? " (listo)" : esActual ? " (ahora)" : ""}</span>
            </button>
          );
        })}
        <span className="mx-1 h-8 w-px bg-linea" aria-hidden="true" />
        <button
          type="button"
          className="boton-principal escena-boton whitespace-nowrap"
          disabled={!todoListo}
          onClick={onVerReconstruccion}
          data-testid="avance-ver-reconstruccion"
        >
          Ver la reconstrucción →
        </button>
        {/* Con el botón apagado, qué falta (René, 2026-11-21: un botón apagado sin decir por qué). */}
        {!todoListo ? (
          <span className="t-nota whitespace-nowrap px-1" data-testid="avance-falta">
            {pendientes.length
              ? `Para seguir falta: ${pendientes.join(", ").toLowerCase()}.`
              : "Termina lo que estás colocando."}
          </span>
        ) : null}
      </nav>
    </div>
  );
}

/** El coche visto desde arriba, para la hoja y el resumen. */
function IconoCoche({
  color,
  clase,
  chico = false,
}: {
  color: string;
  clase?: string;
  chico?: boolean;
}) {
  const claro = /^#(f|e|d)/i.test(color);
  return (
    <svg
      viewBox="-0.6 -0.6 1.2 1.2"
      width={chico ? 22 : 36}
      height={chico ? 34 : 52}
      preserveAspectRatio="none"
      aria-hidden="true"
      className="shrink-0"
    >
      <path
        d={siluetaClase(clase ?? "sedan_mediano")}
        fill={color}
        stroke={claro ? "#5B616C" : "rgba(11,13,18,.5)"}
        strokeWidth={1.2}
        vectorEffect="non-scaling-stroke"
      />
      <rect x="-0.36" y="-0.27" width="0.72" height="0.13" rx="0.05" fill="rgba(15,23,42,0.55)" />
    </svg>
  );
}

/**
 * La escena al presentar: lo marcado en palabras (el choque y, por vehículo, por dónde venía y dónde
 * quedó), con los supuestos y su explicación. Lo mismo que la tarjeta «¡La escena está lista!».
 */
/**
 * Lo que el perito marcó y lo que quedó como supuesto, en renglones: la tarjeta «¡La escena está
 * lista!», el resumen del acto y el planteamiento de la reconstrucción (ronda 2, A6) dicen lo mismo.
 */
export function lineasDeLaEscena(
  estado: EstadoEscena,
  impactos: readonly ImpactoAColocar[],
  calles: OverpassResponse | null,
): LineaResumen[] {
  const e = estado.expediente;
  const callesMapa = callesDe(calles);
  const nombres = Object.fromEntries(
    e.vehiculos.map((v) => [v.id, nombreVehiculo(v, e.vehiculos)]),
  );
  const puntoDe = (orden: number): Punto | null => {
    if (estado.puntos[orden]) return estado.puntos[orden]!;
    const ps = (impactos.find((i) => i.orden === orden)?.vehiculos ?? []).flatMap(
      (v) => poseDe(e, v, "impacto") ?? [],
    );
    if (!ps.length) return null;
    return {
      lat: ps.reduce((a, p) => a + p.punto.lat, 0) / ps.length,
      lon: ps.reduce((a, p) => a + p.punto.lon, 0) / ps.length,
    };
  };
  const choques = impactos.flatMap((i) => {
    const p = puntoDe(i.orden);
    return p ? [{ orden: i.orden, punto: p }] : [];
  });
  return [
    ...resumenEscena({
      e,
      impactos,
      puntos: Object.fromEntries(choques.map((c) => [c.orden, c.punto])),
      callesChoque: Object.fromEntries(
        choques.map((c) => [c.orden, callesEn(callesMapa, c.punto)]),
      ),
      nombres,
      desconocidos: estado.desconocidos,
      direccionesNoSe: estado.direccionesNoSe,
      juntoAlChoque: estado.juntoAlChoque,
    }),
    ...resumenPersonas(e),
    ...(estado.c1 ? resumenC1({ e, nombres, c1: estado.c1 }) : []),
  ];
}

export function ResumenDeLaEscena({
  estado,
  impactos,
  narracion,
  calles,
}: {
  estado: EstadoEscena;
  impactos: readonly ImpactoAColocar[];
  narracion: string | null;
  calles: OverpassResponse | null;
}) {
  const e = estado.expediente;
  const colores = coloresVehiculos(e.vehiculos, narracion);
  const lineas = lineasDeLaEscena(estado, impactos, calles);
  const falta = pasoActual(pasosEscena(e, impactos, estado)) !== null;
  return (
    <section className="flex flex-col gap-4" data-testid="resumen-escena">
      <h2 className="t-titulo text-[clamp(1.75rem,2.6vw,2.25rem)]">La escena</h2>
      {falta ? (
        <p className="t-nota" data-testid="escena-incompleta">
          Aún falta marcar parte de la escena. Para marcarla, cambia a «Trabajar».
        </p>
      ) : null}
      <ul className="flex flex-col divide-y divide-[var(--linea-suave)]">
        {lineas.map((l, k) => (
          <li key={k} className="flex gap-3 py-3">
            {l.persona ? (
              <IconoPersona
                rol={(e.personas ?? []).find((x) => x.id === l.persona)?.rol ?? "peaton"}
                tamano={22}
              />
            ) : !l.vehiculo ? (
              <svg viewBox="-12 -12 24 24" width="22" height="22" aria-hidden="true">
                <path
                  d="M0 -11 L3 -4 L10 -6 L5 0 L10 6 L3 4 L0 11 L-3 4 L-10 6 L-5 0 L-10 -6 L-3 -4 Z"
                  fill="var(--senal)"
                />
              </svg>
            ) : (
              <IconoCoche
                color={colores[l.vehiculo!]!.css}
                clase={e.vehiculos.find((x) => x.id === l.vehiculo)?.clase}
                chico
              />
            )}
            <span className="flex flex-col gap-1">
              <span className="font-semibold">{l.texto}</span>
              {l.detalle ? <span className="t-nota">{l.detalle}</span> : null}
              {l.supuesto ? (
                <>
                  <span className="escena-supuesto self-start">Supuesto</span>
                  <span className="t-nota">{l.supuesto}</span>
                </>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
