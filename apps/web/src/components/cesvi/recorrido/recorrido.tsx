"use client";
/**
 * `/cesvi`: el recorrido del perito (docs/cesvi/PROTOTIPO.md, «Recorrido del perito»; ADR 0052,
 * 0054 y 0055).
 * Ocho pantallas, una por paso, con avance por botón y por teclado (← →), una barra de pasos arriba,
 * el mapa o el dibujo a casi toda la pantalla, una frase por paso y lo demás en «Ver detalle».
 * Reúsa lo de los hitos 1 a 3: el módulo de cálculo, las versiones, la sugerencia, el borrador y el
 * PDF.
 */
import {
  callesCerca,
  compararVersiones,
  croquisContraDictamen,
  completitud as completitudHecho,
  eventosDeLinea,
  zonasEsperadasDeclarada,
  deshacer,
  distanciaM,
  ejemploHecho,
  esUbicacionIlustrativa,
  giroEntreVias,
  GLOSARIO,
  historial,
  interpretarHecho,
  moverPose,
  proponerVersiones,
  registrar,
  rehacer,
  reproducir,
  rumboHaciaElNorte,
  trasladarVersion,
  ubicacionIlustrativa,
  validarLectura,
  sugerir,
  tramoDelCaso,
  zonasDeDanos,
  criteriosVacios,
  FASES,
  type Calle,
  type CasoCesvi,
  type ClaveVersion,
  type Fase,
  type Hacia,
  type Historial,
  type LecturaHecho,
  type LecturaValidada,
  type LonLat,
  type ParametrosHecho,
  type RespuestasHecho,
  type TipoTexto,
  type Validacion,
  type VersionCroquis,
  type Zona,
} from "@croquis/cesvi";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { downloadBytes } from "@/lib/download";
import { COLOR_VEHICULO, nombresVehiculos } from "@/lib/vehiculos-cesvi";
import type { DatosDictamen, IncluirDictamen } from "@/lib/dictamen-cesvi";
import { croquisEsquema, dictamenDocx, huellaEntradas } from "@/lib/exportar-cesvi";
import { useTema, type Modo } from "@/lib/preferencias-cesvi";
import { Calculos, type DistanciaRestos, type ResultadosCalculo } from "../calculos";
import { Criterios } from "../correspondencia";
import { Expediente } from "../expediente";
import { MEDIDAS_PICKUP, NOMBRE_FASE, RADIO_OSM_M, REVERSA_INICIAL_M, viasDe } from "../mapa-comun";
import { MapaRecorrido, type Camara, type EdicionMapa, type Seleccion } from "./mapa-recorrido";
import {
  PasoCaso,
  PasoDanos,
  PasoDictamen,
  PasoHecho,
  PasoLugar,
  PasoNumeros,
  PasoContraDictamen,
  PasoVersiones,
  BarraEdicion,
  Leyenda,
  Reproductor,
  type EdicionPasos,
  type Velocidad,
} from "./pasos";
import { BarraRecorrido } from "./barra";
import { PanelManual } from "./manual";
import { ProveedorRecorrido } from "./marco";
import {
  Herramientas,
  PanelObjeto,
  InterruptorComparar,
  PestanasVista,
  TablaCambios,
  type Herramienta,
  type VistaTrabajo,
} from "./trabajo";
import { PanelDetalle } from "./piezas";
import { Reconstruccion3dRecorrido } from "./reconstruccion-3d";

const PASOS = [
  "El caso",
  "El hecho",
  "El lugar",
  "La reconstrucción",
  "Los daños",
  "Los números",
  "Croquis contra el reporte de CESVI",
  "El dictamen",
] as const;

/** Los nombres de la barra de pasos, cortos para que quepan en una fila (maquetas). */
const PASOS_CORTOS = [
  "Caso",
  "Hecho",
  "Lugar",
  "Reconstrucción",
  "Daños",
  "Números",
  "Contra el reporte",
  "Dictamen",
] as const;

const DURACION_ANIMACION_MS = 4500;
const MEDIDAS = { A: MEDIDAS_PICKUP, B: MEDIDAS_PICKUP };
const VISTA_MEXICO: Camara = { tipo: "vista", centro: [-102.5, 23.6], zoom: 4 };

const FUENTE_CALLE: Record<Calle["fuente"], string> = {
  tramo: "tramo precargado de OpenStreetMap",
  mosaicos: "mosaicos del mapa, de OpenStreetMap",
  overpass: "OpenStreetMap vía Overpass",
};
const NOMBRE_VERSION: Record<ClaveVersion, string> = {
  declarada: "versión declarada",
  evidencia: "reconstrucción de Croquis",
};

/** Lo elegido en el mapa, en palabras: «B · Tacoma · posición inicial» y su versión. */
function describirSeleccion(
  s: Seleccion,
  nombres: Record<"A" | "B", string>,
  version: ClaveVersion,
): { titulo: string; detalle: string; letra: "A" | "B" | null } {
  const titulo =
    s.tipo === "pose"
      ? `${nombres[s.letra]} · ${NOMBRE_FASE[s.fase]}`
      : s.tipo === "impacto"
        ? "Punto de impacto (✕)"
        : `Zona de restos · ${s.extremo === "inicio" ? "inicio (R1)" : "fin (R2)"}`;
  const v = NOMBRE_VERSION[version];
  return {
    titulo,
    detalle: `${v[0]!.toUpperCase()}${v.slice(1)} · arrastra el punto para moverlo`,
    letra: s.tipo === "pose" ? s.letra : null,
  };
}

type Versiones = Record<ClaveVersion, VersionCroquis>;

/** Una lectura validada, con el texto tal como se leyó (si el perito lo cambia, se vuelve a leer). */
interface LecturaGuardada {
  lectura: LecturaValidada;
  leidoPor: "ia" | "reglas";
  texto: string;
}

/**
 * El rumbo con que circula un vehículo que va «hacia» un punto cardinal por una vía de rumbo `via`
 * (cualquiera de sus dos sentidos): el sentido de la vía más cercano a ese punto. Sin dato, hacia
 * el norte (supuesto).
 */
function rumboHacia(via: number, hacia: Hacia | null): number {
  const meta = { norte: 0, oriente: 90, sur: 180, poniente: 270 }[hacia ?? "norte"];
  const dif = (r: number) => Math.abs(((r - meta + 540) % 360) - 180);
  const otra = (via + 180) % 360;
  return dif(via) <= dif(otra) ? via : otra;
}

/** Los parámetros de las dos versiones desde los del hecho, el punto y el rumbo de la vía. */
function parametrosDeVersiones(p: ParametrosHecho, impacto: LonLat, via: number) {
  return {
    impacto,
    rumboVia: rumboHacia(via, p.evidencia.hacia),
    rumboDeclarada: rumboHacia(via, p.declarada.hacia ?? p.evidencia.hacia),
    medidas: MEDIDAS,
    distanciaRestos: p.evidencia.distanciaRestos ?? 0,
    fuenteRestos: (p.evidencia.distanciaRestos === null ? "croquis" : "perito") as
      "croquis" | "perito",
    reversaM: p.declarada.reversaM ?? REVERSA_INICIAL_M,
  };
}

const ESTADO_IA = {
  espera: "IA en espera",
  entendiendo: "IA entendiendo…",
  lista: "IA lista",
  reglas: "Sin IA: reglas",
  error: "IA con error",
} as const;

/** Qué incluir en el dictamen por omisión (igual que en `lib/dictamen-cesvi.ts`). */
const INCLUIR_POR_OMISION: IncluirDictamen = {
  croquisAmbas: true,
  calculos: true,
  tablaDatos: true,
  notasInternas: false,
};

const enCampo = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));

export function Recorrido({ caso, reproduccion }: { caso: CasoCesvi; reproduccion: ReactNode }) {
  const [paso, setPaso] = useState(0);
  const [detalle, setDetalle] = useState(false);

  // Paso 2: el hecho (ADR 0055). La descripción técnica del perito arma la versión de la
  // evidencia; la versión declarada del conductor, la declarada. Cada una se lee por separado.
  const nombres = useMemo(() => nombresVehiculos(caso), [caso]);
  const vehiculosExpediente = useMemo(
    () => ({
      A: `${caso.vehiculos.A.marca} ${caso.vehiculos.A.tipo}`,
      B: `${caso.vehiculos.B.marca} ${caso.vehiculos.B.tipo}`,
    }),
    [caso],
  );
  const declarante: "A" | "B" = caso.declaracion.conductor === "B" ? "B" : "A";
  const ejemplo = useMemo(() => ejemploHecho(caso.id), [caso]);
  const ilustrativa = useMemo(() => ubicacionIlustrativa(caso.id), [caso]);
  const [textos, setTextos] = useState<Record<TipoTexto, string>>({
    descripcion: "",
    declaracion: caso.declaracion.texto,
  });
  const [lecturas, setLecturas] = useState<Record<TipoTexto, LecturaGuardada | null>>({
    descripcion: null,
    declaracion: null,
  });
  const [estados, setEstados] = useState<Record<TipoTexto, string | null>>({
    descripcion: null,
    declaracion: null,
  });
  const [respuestas, setRespuestas] = useState<RespuestasHecho>({});
  const textosRef = useRef(textos);
  // Lo último de cada estado para los manejadores asíncronos (leer, responder, mover).
  const lecturasRef = useRef(lecturas);
  const respuestasRef = useRef(respuestas);
  const interpretar = useCallback(
    (l: Record<TipoTexto, LecturaGuardada | null>, r: RespuestasHecho) =>
      interpretarHecho({
        expediente: vehiculosExpediente,
        declarante,
        descripcion: l.descripcion,
        declaracion: l.declaracion,
        respuestas: r,
      }),
    [vehiculosExpediente, declarante],
  );
  const interpretacion = useMemo(
    () => interpretar(lecturas, respuestas),
    [interpretar, lecturas, respuestas],
  );

  // Pasos 3 y 4: el lugar, las calles y las dos versiones, con deshacer y rehacer.
  // El tramo del caso, precargado de OSM (ADR 0053): la demo no depende de un servidor externo.
  const tramo = useMemo(() => tramoDelCaso(caso.id), [caso]);
  const [calles, setCalles] = useState<Calle[]>([]);
  const [avisoLugar, setAvisoLugar] = useState<string | null>(null);
  const [viaCercana, setViaCercana] = useState<Calle | null>(null);
  const [msCalles, setMsCalles] = useState<number | null>(null);
  const [hist, setHist] = useState(() => historial<Versiones | null>(null));
  const histRef = useRef(hist);
  const versiones = hist.presente;
  const [reubicando, setReubicando] = useState(false);
  // Lo principal es la reconstrucción de Croquis (la versión de la evidencia); la declaración
  // del conductor es una capa opcional, apagada al inicio (plan v2, R7).
  const [activa, setActiva] = useState<ClaveVersion>("evidencia");
  const [comparar, setComparar] = useState(false);
  const [animacion, setAnimacion] = useState<number | null>(null);
  const [seleccion, setSeleccion] = useState<Seleccion>({
    tipo: "pose",
    letra: "A",
    fase: "final",
  });
  const reversaDibujada = interpretacion.parametros.declarada.reversaM ?? REVERSA_INICIAL_M;
  const consultaMosaicos = useRef<(p: LonLat, radioM: number) => Calle[]>(() => []);
  const alConsultarCalles = useCallback((f: (p: LonLat, radioM: number) => Calle[]) => {
    consultaMosaicos.current = f;
  }, []);
  const marcaActual = useRef(0);
  // Con qué parámetros del hecho se armó cada versión: si cambian, se vuelve a armar esa.
  const firmas = useRef<Record<ClaveVersion, string>>({ evidencia: "", declarada: "" });

  /**
   * Las calles alrededor del punto, sin esperar a la red: el tramo precargado y los mosaicos que
   * el mapa ya cargó. Overpass corre detrás y solo enriquece (carriles, ancho, nombre). Devuelve el
   * rumbo de la vía más cercana, hacia el norte.
   */
  const callesEn = useCallback(
    (p: LonLat): number => {
      const marca = ++marcaActual.current;
      const delTramo = callesCerca(tramo, p, RADIO_OSM_M);
      const deMosaicos = callesCerca(consultaMosaicos.current(p, RADIO_OSM_M), p, RADIO_OSM_M);
      const cercana = delTramo.cercana ?? deMosaicos.cercana;
      setCalles([...delTramo.calles, ...deMosaicos.calles]);
      setViaCercana(cercana?.calle ?? null);
      setAvisoLugar(
        cercana
          ? null
          : `No hay calles a ${RADIO_OSM_M} m en el tramo ni en el mapa: se usa el rumbo norte.`,
      );
      void fetch(`/api/osm?lat=${p[1]}&lon=${p[0]}&radio=${RADIO_OSM_M}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((d: unknown) => {
          if (marca !== marcaActual.current) return;
          const osm = callesCerca(viasDe(d), p, RADIO_OSM_M);
          if (!osm.calles.length) return;
          // Las calles completas de OSM reemplazan a las del tramo y los mosaicos; las versiones
          // no se mueven (el perito pudo haberlas editado ya).
          setCalles(osm.calles);
          setViaCercana((v) => osm.cercana?.calle ?? v);
        })
        .catch(() => {
          // Sin Overpass no se pierde nada: ya están las calles del tramo y de los mosaicos.
        });
      return rumboHaciaElNorte(cercana?.rumbo ?? 0);
    },
    [tramo],
  );

  /** El rumbo de la vía en un punto (sin tocar las calles a la vista). */
  const rumboViaEn = useCallback(
    (p: LonLat): number => {
      const c =
        callesCerca(tramo, p, RADIO_OSM_M).cercana ??
        callesCerca(consultaMosaicos.current(p, RADIO_OSM_M), p, RADIO_OSM_M).cercana;
      return rumboHaciaElNorte(c?.rumbo ?? 0);
    },
    [tramo],
  );

  /** Las dos versiones desde cero, con los parámetros del hecho. */
  const construir = useCallback((p: ParametrosHecho, impacto: LonLat, via: number): Versiones => {
    firmas.current = {
      evidencia: JSON.stringify(p.evidencia),
      declarada: JSON.stringify(p.declarada),
    };
    return proponerVersiones(parametrosDeVersiones(p, impacto, via));
  }, []);

  /** Aplica un estado del historial; si el punto cambió, trae las calles del punto nuevo. */
  const aplicar = useCallback(
    (sig: Historial<Versiones | null>) => {
      const antes = histRef.current.presente?.evidencia.impacto.punto ?? null;
      histRef.current = sig;
      setHist(sig);
      const despues = sig.presente?.evidencia.impacto.punto ?? null;
      if (!despues) {
        marcaActual.current++;
        setCalles([]);
        setViaCercana(null);
        setMsCalles(null);
      } else if (!antes || antes[0] !== despues[0] || antes[1] !== despues[1]) {
        callesEn(despues);
      }
    },
    [callesEn],
  );
  const cambiar = useCallback(
    (f: (vs: Versiones | null) => Versiones | null) =>
      aplicar(registrar(histRef.current, f(histRef.current.presente))),
    [aplicar],
  );
  const deshacerCambio = useCallback(() => aplicar(deshacer(histRef.current)), [aplicar]);
  const rehacerCambio = useCallback(() => aplicar(rehacer(histRef.current)), [aplicar]);

  // Marcar el impacto no espera a la red (ADR 0053): con las calles del tramo y de los mosaicos
  // se dibujan las versiones al instante.
  const fijarImpacto = useCallback(
    (p: LonLat) => {
      const t0 = performance.now();
      const via = callesEn(p);
      const marca = marcaActual.current;
      const vs = construir(
        interpretar(lecturasRef.current, respuestasRef.current).parametros,
        p,
        via,
      );
      const sig = registrar(histRef.current, vs);
      histRef.current = sig;
      setHist(sig);
      // Cuánto tarda del clic a ver las calles (meta: menos de 1 s), tras el siguiente cuadro.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (marca === marcaActual.current) setMsCalles(performance.now() - t0);
        }),
      );
    },
    [callesEn, construir, interpretar],
  );

  /**
   * «Cambiar ubicación»: el punto se mueve y los vehículos con él (sus posiciones son relativas al
   * punto), girando lo que gire la vía del lugar nuevo. Las calles se traen por la vía rápida.
   */
  const moverPunto = useCallback(
    (p: LonLat) => {
      const actual = histRef.current.presente;
      if (!actual) return fijarImpacto(p);
      const giro = giroEntreVias(rumboViaEn(actual.evidencia.impacto.punto), rumboViaEn(p));
      cambiar((vs) =>
        vs
          ? {
              declarada: trasladarVersion(vs.declarada, p, giro),
              evidencia: trasladarVersion(vs.evidencia, p, giro),
            }
          : vs,
      );
    },
    [cambiar, fijarImpacto, rumboViaEn],
  );
  const quitarPunto = useCallback(() => {
    setReubicando(false);
    cambiar(() => null);
  }, [cambiar]);
  const restablecer = useCallback(() => {
    const actual = histRef.current.presente;
    if (!actual) return;
    const p = actual.evidencia.impacto.punto;
    cambiar(() =>
      construir(
        interpretar(lecturasRef.current, respuestasRef.current).parametros,
        p,
        rumboViaEn(p),
      ),
    );
  }, [cambiar, construir, interpretar, rumboViaEn]);

  /**
   * Si cambian los parámetros del hecho (una lectura nueva, una respuesta del perito), se vuelve a
   * armar solo la versión cuyos parámetros cambiaron; la otra conserva lo que movió el perito.
   */
  const rearmar = useCallback(
    (l: Record<TipoTexto, LecturaGuardada | null>, r: RespuestasHecho) => {
      const actual = histRef.current.presente;
      if (!actual) return;
      const p = interpretar(l, r).parametros;
      const cambio = (["evidencia", "declarada"] as const).filter(
        (k) => JSON.stringify(p[k]) !== firmas.current[k],
      );
      if (!cambio.length) return;
      const viejas = { ...firmas.current };
      const nuevas = construir(
        p,
        actual.evidencia.impacto.punto,
        rumboViaEn(actual.evidencia.impacto.punto),
      );
      firmas.current = {
        evidencia: cambio.includes("evidencia") ? firmas.current.evidencia : viejas.evidencia,
        declarada: cambio.includes("declarada") ? firmas.current.declarada : viejas.declarada,
      };
      cambiar((vs) =>
        vs
          ? {
              evidencia: cambio.includes("evidencia") ? nuevas.evidencia : vs.evidencia,
              declarada: cambio.includes("declarada") ? nuevas.declarada : vs.declarada,
            }
          : vs,
      );
    },
    [cambiar, construir, interpretar, rumboViaEn],
  );

  const leer = useCallback(
    async (tipo: TipoTexto, texto: string) => {
      setEstados((e) => ({
        ...e,
        [tipo]: tipo === "descripcion" ? "Leyendo la descripción…" : "Leyendo la declaración…",
      }));
      try {
        const r = await fetch("/api/cesvi/hecho", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tipo, texto, vehiculos: vehiculosExpediente, declarante }),
        });
        const d = (await r.json()) as {
          metodo?: "claude" | "reglas";
          motivo?: string;
          lectura?: LecturaHecho;
          error?: string;
        };
        if (!r.ok || !d.lectura) throw new Error(d.error ?? `HTTP ${r.status}`);
        const lectura = validarLectura(d.lectura, texto);
        const guardada: LecturaGuardada = {
          lectura,
          leidoPor: d.metodo === "claude" ? "ia" : "reglas",
          texto,
        };
        const nuevas = { ...lecturasRef.current, [tipo]: guardada };
        lecturasRef.current = nuevas;
        setLecturas(nuevas);
        const descartados = lectura.descartados
          ? ` Se descartaron ${lectura.descartados} datos sin frase en el texto.`
          : "";
        setEstados((e) => ({
          ...e,
          [tipo]:
            d.metodo === "claude"
              ? `Leída con IA (Claude), con el glosario de CESVI. No produce números.${descartados}`
              : `Leída con las reglas del glosario de CESVI${d.motivo ? ` (${d.motivo})` : ""}.`,
        }));
        rearmar(nuevas, respuestasRef.current);
      } catch (e) {
        setEstados((s) => ({
          ...s,
          [tipo]: `No se pudo leer: ${e instanceof Error ? e.message : String(e)}.`,
        }));
      }
    },
    [vehiculosExpediente, declarante, rearmar],
  );
  const responder = useCallback(
    (clave: string, v: string | number | null) => {
      const nuevas = { ...respuestasRef.current, [clave]: v };
      respuestasRef.current = nuevas;
      setRespuestas(nuevas);
      rearmar(lecturasRef.current, nuevas);
    },
    [rearmar],
  );

  // La animación de la versión a la vista (paso 4): se reproduce desde un momento, se pausa y
  // se fija con la línea de tiempo. `animacion` null es la versión completa (y editable).
  const id = useRef(0);
  const [reproduciendo, setReproduciendo] = useState(false);
  // Velocidad de la animación (ADR 0057): 1× dura DURACION_ANIMACION_MS; 0.25× y 0.1×, más.
  const [velocidad, setVelocidad] = useState<Velocidad>(1);
  const velocidadRef = useRef<Velocidad>(1);
  const tRef = useRef(0);
  const animar = useCallback((desde = 0) => {
    cancelAnimationFrame(id.current);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setAnimacion(null);
      setReproduciendo(false);
      return;
    }
    const duracion = DURACION_ANIMACION_MS / velocidadRef.current;
    const inicio = performance.now() - desde * duracion;
    const cuadro = (ahora: number) => {
      const t = Math.min(1, (ahora - inicio) / duracion);
      tRef.current = t;
      setAnimacion(t < 1 ? t : null);
      if (t < 1) id.current = requestAnimationFrame(cuadro);
      else setReproduciendo(false);
    };
    setReproduciendo(true);
    id.current = requestAnimationFrame(cuadro);
  }, []);
  const pausar = useCallback(() => {
    cancelAnimationFrame(id.current);
    setReproduciendo(false);
  }, []);
  useEffect(() => () => cancelAnimationFrame(id.current), []);
  const cambiarVelocidad = (v: Velocidad) => {
    velocidadRef.current = v;
    setVelocidad(v);
    if (reproduciendo) animar(tRef.current);
  };
  const [superponer, setSuperponer] = useState(true);
  // R9: la reconstrucción del solver en 3D, a pantalla completa, desde el paso 4.
  const [ver3d, setVer3d] = useState(false);
  const version = versiones?.[activa] ?? null;
  const restosM = version ? distanciaM(version.restos.inicio, version.restos.fin) : null;

  /** Mover algo de una versión (el objeto elegido) a un punto. */
  const moverEn = useCallback(
    (clave: ClaveVersion, sel: Seleccion, p: LonLat) =>
      cambiar((vs) => {
        if (!vs) return vs;
        const v = vs[clave];
        const punto: [number, number] = [p[0], p[1]];
        const movida =
          sel.tipo === "pose"
            ? moverPose(v, sel.letra, sel.fase, { punto })
            : sel.tipo === "impacto"
              ? { ...v, impacto: { punto, fuente: "perito" as const } }
              : { ...v, restos: { ...v.restos, [sel.extremo]: punto, fuente: "perito" as const } };
        return { ...vs, [clave]: movida };
      }),
    [cambiar],
  );
  const edicionPara = useCallback(
    (clave: ClaveVersion): EdicionMapa => ({
      seleccion,
      onSeleccion: (sel) => {
        setSeleccion(sel);
        if (clave === "evidencia" || comparar) setActiva(clave);
      },
      onMover: (sel, p) => {
        setSeleccion(sel);
        setActiva(clave);
        moverEn(clave, sel, p);
      },
    }),
    [seleccion, moverEn, comparar],
  );
  const edicion: EdicionMapa | null = useMemo(() => {
    if (!versiones) return null;
    // Paso 3: solo el punto de impacto, que se arrastra y lleva todo con él.
    if (paso === 2) {
      return {
        soloImpacto: true,
        seleccion: { tipo: "impacto" },
        onSeleccion: () => setReubicando(true),
        onMover: (_sel, p) => moverPunto(p),
      };
    }
    if (paso !== 3) return null;
    return edicionPara(activa);
  }, [paso, versiones, activa, moverPunto, edicionPara]);
  const edicionPasos: EdicionPasos = {
    puedeDeshacer: hist.pasado.length > 0,
    puedeRehacer: hist.futuro.length > 0,
    onDeshacer: deshacerCambio,
    onRehacer: rehacerCambio,
    onRestablecer: restablecer,
  };

  const camara: Camara | null = useMemo(() => {
    if (paso < 2) return VISTA_MEXICO;
    if (paso === 2 || paso === 3) {
      if (versiones) {
        const puntos = (["declarada", "evidencia"] as const).flatMap((k) => [
          ...(["A", "B"] as const).flatMap((l) =>
            FASES.map((f) => versiones[k].vehiculos[l][f].punto),
          ),
          versiones[k].restos.fin,
        ]);
        return { tipo: "encuadre", puntos, zoomMax: 20.5 };
      }
      if (tramo.length)
        return { tipo: "encuadre", puntos: tramo.flatMap((c) => c.puntos), zoomMax: 11 };
    }
    return null;
  }, [paso, versiones, tramo]);

  // Modo Presentar / Trabajar y tema (ADR 0057): los mismos datos en los dos modos.
  const [modo, setModo] = useState<Modo>("presentar");
  const tema = useTema(modo);
  const [manualAbierto, setManualAbierto] = useState(false);
  const [herramienta, setHerramienta] = useState<Herramienta | null>(null);
  const [vista, setVista] = useState<VistaTrabajo>("evidencia");
  const [medicion, setMedicion] = useState<LonLat[]>([]);
  const estadoIA = Object.values(estados).some((e) => e?.startsWith("Leyendo"))
    ? "entendiendo"
    : Object.values(estados).some((e) => e?.startsWith("No se pudo"))
      ? "error"
      : [lecturas.descripcion, lecturas.declaracion].some((l) => l?.leidoPor === "reglas")
        ? "reglas"
        : [lecturas.descripcion, lecturas.declaracion].some((l) => l?.leidoPor === "ia")
          ? "lista"
          : "espera";
  const completitud = useMemo(() => completitudHecho(interpretacion), [interpretacion]);

  /** Restablecer la posición del objeto elegido: la que propone Croquis con los datos del hecho. */
  const restablecerObjeto = useCallback(() => {
    const actual = histRef.current.presente;
    if (!actual) return;
    const punto = actual.evidencia.impacto.punto;
    const propuestas = proponerVersiones(
      parametrosDeVersiones(
        interpretar(lecturasRef.current, respuestasRef.current).parametros,
        punto,
        rumboViaEn(punto),
      ),
    );
    const s = seleccion;
    cambiar((vs) => {
      if (!vs) return vs;
      const v = vs[activa];
      const p = propuestas[activa];
      const nueva =
        s.tipo === "pose"
          ? {
              ...v,
              vehiculos: {
                ...v.vehiculos,
                [s.letra]: { ...v.vehiculos[s.letra], [s.fase]: p.vehiculos[s.letra][s.fase] },
              },
            }
          : s.tipo === "restos"
            ? { ...v, restos: { ...v.restos, [s.extremo]: p.restos[s.extremo] } }
            : v;
      return { ...vs, [activa]: nueva };
    });
  }, [seleccion, activa, cambiar, interpretar, rumboViaEn]);

  const elegirHerramienta = (h: Herramienta) => {
    setHerramienta(h);
    if (h === "medir") {
      setMedicion([]);
      return;
    }
    setSeleccion((s) =>
      h === "impacto"
        ? { tipo: "impacto" }
        : h === "restos"
          ? {
              tipo: "restos",
              extremo: s.tipo === "restos" && s.extremo === "fin" ? "inicio" : "fin",
            }
          : {
              tipo: "pose",
              letra: h,
              fase: s.tipo === "pose" && s.letra === h && s.fase === "final" ? "inicial" : "final",
            },
    );
  };
  /** Un clic en el mapa del modo Trabajar: coloca lo que diga la herramienta. */
  const clicTrabajo = (clave: ClaveVersion, p: LonLat) => {
    if (!histRef.current.presente) return fijarImpacto(p);
    if (herramienta === "medir") {
      setMedicion((m) => (m.length >= 2 ? [p] : [...m, p]));
      return;
    }
    if (herramienta === "impacto") return moverPunto(p);
    if (herramienta) {
      setActiva(clave);
      moverEn(clave, seleccion, p);
    }
  };
  const cambiarComparar = (v: boolean) => {
    setComparar(v);
    if (!v) {
      setActiva("evidencia");
      setVista("evidencia");
    }
  };
  const cambiarVista = (v: VistaTrabajo) => {
    setVista(v);
    if (v === "declarada") setActiva("declarada");
    if (v === "evidencia" || v === "superponer") setActiva("evidencia");
  };

  // Pasos 5 a 8: daños, números, sugerencia y dictamen.
  const [zonas, setZonas] = useState<Record<"A" | "B", Zona[]>>(() => ({
    A: zonasDeDanos(caso.vehiculos.A.danos),
    B: zonasDeDanos(caso.vehiculos.B.danos),
  }));
  const [criterios, setCriterios] = useState({ A: criteriosVacios(), B: criteriosVacios() });
  const [distancia, setDistancia] = useState<DistanciaRestos>({
    valor: String(caso.calculos.desplazamiento.D_m.valor),
    fuente: "dictamen",
  });
  const [resultados, setResultados] = useState<ResultadosCalculo | null>(null);
  const distanciaNum = Number(distancia.valor.replace(",", "."));
  const fuenteDistancia =
    distancia.fuente === "perito" ? "medida por el perito" : "del reporte de CESVI";
  const sugerencia = useMemo(
    () =>
      sugerir({
        comparacion: resultados?.comparacion ?? null,
        distanciaRestos: Number.isFinite(distanciaNum) ? distanciaNum : null,
        fuenteDistancia,
        zonasA: zonas.A,
        zonasB: zonas.B,
      }),
    [resultados, distanciaNum, fuenteDistancia, zonas],
  );
  const [validacion, setValidacion] = useState<Validacion | null>(null);
  const [borrador, setBorrador] = useState("");
  const [revisado, setRevisado] = useState(false);
  const [estadoBorrador, setEstadoBorrador] = useState<string | null>(null);

  const captura = useRef<() => string | null>(() => null);
  const alCapturar = useCallback((f: () => string | null) => {
    captura.current = f;
  }, []);
  const [pdf, setPdf] = useState<{ url: string; bytes: Uint8Array<ArrayBuffer> } | null>(null);
  const [estadoPdf, setEstadoPdf] = useState<string | null>(null);
  // Trazabilidad (ADR 0057): método, huella de las entradas, sugerencia y quién validó.
  const huella = useMemo(
    () =>
      huellaEntradas({
        caso: caso.id,
        textos,
        respuestas,
        versiones,
        zonas,
        criterios,
        distancia: distancia.valor,
      }),
    [caso, textos, respuestas, versiones, zonas, criterios, distancia],
  );
  const trazabilidad = {
    metodo: "CESVI · McHenry 4 medidas",
    huella,
    comparacion: validacion
      ? {
          aceptada: "aceptada por el perito",
          editada: "editada por el perito",
          rechazada: "rechazada por el perito",
        }[validacion.decision]
      : "sin validar",
    valido: validacion
      ? `${validacion.perito} · ${new Date(validacion.fecha).toLocaleString("es-MX", { dateStyle: "long", timeStyle: "short" })}`
      : "pendiente",
  };
  const [incluir, setIncluir] = useState<IncluirDictamen>(INCLUIR_POR_OMISION);
  const [notasInternas, setNotasInternas] = useState("");
  /** Lo que lleva el dictamen (PDF y Word): los mismos datos. */
  const datosDictamen = (opciones: IncluirDictamen): DatosDictamen => {
    const comparacion = resultados?.comparacion;
    const papel = {
      fondo: "#FFFFFF",
      calle: "#C9CDD4",
      texto: "#15181D",
      A: COLOR_VEHICULO.A,
      B: COLOR_VEHICULO.B,
      senal: "#D9431A",
    };
    return {
      caso,
      calculos: {
        mcHenry: resultados?.mcHenry ?? null,
        ebsReporte: resultados?.ebsReporte ?? null,
        ebsDatos: resultados?.ebsDatos ?? null,
        v3: resultados?.v3 ?? null,
        comparacionTexto: comparacion
          ? `Las velocidades difieren ${comparacion.diferenciaPct.toFixed(2)} %: ${comparacion.significativa ? "sí" : "no"} es una diferencia significativa con el umbral de ${comparacion.umbralPct} % que fijó el perito.`
          : null,
      },
      distanciaRestos: Number.isFinite(distanciaNum)
        ? { valor: distanciaNum, fuente: fuenteDistancia }
        : null,
      reproduccion: reproducir(caso).filas,
      croquis: (() => {
        const imagen = versiones ? captura.current() : null;
        if (!imagen || !version) return null;
        const [lon, lat] = version.impacto.punto;
        return {
          imagen,
          version: version.titulo.toLowerCase(),
          punto: { lat, lon, ilustrativo: esUbicacionIlustrativa(caso.id, [lon, lat]) },
        };
      })(),
      criterios,
      zonas,
      sugerencia,
      contraDictamen: contra,
      compararDeclaracion: comparar,
      validacion,
      consideraciones: borrador.trim() ? { texto: borrador.trim(), revisadas: revisado } : null,
      incluir: opciones,
      croquisVersiones: versiones
        ? {
            declarada: croquisEsquema(
              versiones.declarada,
              calles,
              MEDIDAS,
              nombres,
              papel,
              "Versión declarada",
            ),
            evidencia: croquisEsquema(
              versiones.evidencia,
              calles,
              MEDIDAS,
              nombres,
              papel,
              "Reconstrucción de Croquis",
            ),
          }
        : undefined,
      datosHecho: [...interpretacion.evidencia, ...interpretacion.declarada].map((d) => ({
        etiqueta: d.etiqueta,
        valor: d.valor,
        fuente: d.fuente,
        version: interpretacion.declarada.includes(d) ? "declarada" : "evidencia",
      })),
      notasInternas,
      trazabilidad,
    };
  };
  const generarPdf = useCallback(
    async (opciones?: IncluirDictamen) => {
      setEstadoPdf("Armando el dictamen…");
      try {
        const { dictamenPdf } = await import("@/lib/dictamen-cesvi");
        const bytes = await dictamenPdf(datosDictamen(opciones ?? incluir));
        setPdf((anterior) => {
          if (anterior) URL.revokeObjectURL(anterior.url);
          return {
            url: URL.createObjectURL(new Blob([bytes], { type: "application/pdf" })),
            bytes,
          };
        });
        setEstadoPdf(null);
      } catch (e) {
        setEstadoPdf(`No se pudo armar el dictamen: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- datosDictamen lee el estado vigente
    [
      incluir,
      notasInternas,
      calles,
      interpretacion,
      nombres,
      trazabilidad,
      caso,
      resultados,
      distanciaNum,
      fuenteDistancia,
      versiones,
      version,
      criterios,
      zonas,
      sugerencia,
      validacion,
      borrador,
      revisado,
    ],
  );

  const pedirBorrador = async () => {
    setEstadoBorrador("Redactando con Claude…");
    try {
      const r = await fetch("/api/cesvi/consideraciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hechos: {
            caso: caso.id,
            modalidad_dictaminada: caso.modalidad_dictaminada,
            declaracion: textos.declaracion,
            descripcion_tecnica_del_perito: textos.descripcion || null,
            lo_que_entiende_croquis: [...interpretacion.evidencia, ...interpretacion.declarada].map(
              (d) => `${d.etiqueta}: ${d.valor} (${d.fuente})`,
            ),
            calculos: {
              energia: resultados?.mcHenry?.resultado ?? null,
              energia_del_reporte_de_cesvi: caso.calculos.deformacion_B.reporte.energia.valor,
              velocidad_impacto: resultados?.ebsReporte?.resultado ?? null,
              desplazamiento: resultados?.v3?.resultado ?? null,
            },
            separacion_restos: { metros: distancia.valor, fuente: fuenteDistancia },
            comparacion_con_el_reporte_de_cesvi: {
              resumen: contra.resumen,
              puntos: contra.filas.map((f) => ({
                punto: f.concepto,
                cesvi: f.cesvi,
                croquis: f.croquis,
                diferencia_pct: f.diferenciaPct === null ? null : f.diferenciaPct.toFixed(2),
              })),
            },
            indicadores_declaracion: comparar ? sugerencia.razones.map((x) => x.texto) : null,
            conclusion_validada: validacion?.conclusion ?? null,
          },
        }),
      });
      const d = (await r.json()) as {
        texto?: string;
        numerosNoReconocidos?: string[];
        error?: string;
      };
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      setBorrador(d.texto ?? "");
      setRevisado(false);
      setEstadoBorrador(
        d.numerosNoReconocidos?.length
          ? `Revisa estas cifras, no vienen de los cálculos: ${d.numerosNoReconocidos.join(", ")}.`
          : null,
      );
    } catch (e) {
      setEstadoBorrador(`No se pudo redactar: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  // Cambiar de paso, y lo que hace cada paso al entrar: leer la declaración (una vez) y armar el
  // dictamen. Todos los cambios de paso pasan por aquí (botones, barra, teclado y enlaces).
  const pasoActual = useRef(0);
  const declaracionLeida = useRef(false);
  const irA = useCallback(
    (n: number) => {
      const destino = Math.max(0, Math.min(PASOS.length - 1, n));
      pasoActual.current = destino;
      setPaso(destino);
      // La animación corre al entrar al paso 4 (y al cambiar de versión); fuera de él se detiene.
      if (destino === 3) animar();
      else pausar();
      // Al entrar al hecho se lee la declaración (una vez); la descripción la escribe el perito.
      if (destino === 1 && !declaracionLeida.current) {
        declaracionLeida.current = true;
        void leer("declaracion", textosRef.current.declaracion);
      }
      if (destino !== 2) setReubicando(false);
      if (destino === 7) void generarPdf();
    },
    [leer, generarPdf, animar, pausar],
  );

  // Teclado: ← y → cambian de paso (salvo mientras se escribe en un campo).
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (enCampo(e.target) || detalle) return;
      // Deshacer y rehacer en los pasos 3 y 4: Ctrl+Z, Ctrl+Shift+Z y Ctrl+Y.
      if ((e.ctrlKey || e.metaKey) && (pasoActual.current === 2 || pasoActual.current === 3)) {
        const k = e.key.toLowerCase();
        if (k === "z" || k === "y") {
          e.preventDefault();
          if (k === "y" || e.shiftKey) rehacerCambio();
          else deshacerCambio();
        }
        return;
      }
      if (e.key === "ArrowRight") irA(pasoActual.current + 1);
      if (e.key === "ArrowLeft") irA(pasoActual.current - 1);
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [detalle, irA, deshacerCambio, rehacerCambio]);

  const impactoKmh = resultados?.ebsReporte?.calculo.kmh ?? null;
  const restosDeVersiones = versiones
    ? {
        declarada: distanciaM(versiones.declarada.restos.inicio, versiones.declarada.restos.fin),
        evidencia: distanciaM(versiones.evidencia.restos.inicio, versiones.evidencia.restos.fin),
      }
    : null;
  const esperadas = zonasEsperadasDeclarada(interpretacion.parametros.declarada.maniobraA);
  const comparacionVersiones = compararVersiones({
    restos: restosDeVersiones,
    zonas,
    esperadas,
    velocidades:
      impactoKmh !== null && resultados?.v3
        ? { deformacion: impactoKmh, desplazamiento: resultados.v3.calculo.kmh }
        : null,
    velocidadDeclarada: null,
  });
  const eventos = version ? eventosDeLinea(version) : [];
  const filaEnergia = reproducir(caso).filas.find((f) => f.clave === "energia");
  const puntoIlustrativo =
    versiones !== null && esUbicacionIlustrativa(caso.id, versiones.evidencia.impacto.punto);
  const antesDeFirmar = [
    ...(filaEnergia && Math.abs(filaEnergia.diferenciaPct) >= 0.005
      ? [
          {
            texto: `La energía del reporte de CESVI difiere ${Math.abs(filaEnergia.diferenciaPct).toFixed(2)} % de la calculada con los datos impresos.`,
            paso: 5,
          },
        ]
      : []),
    ...(completitud.faltan.length
      ? [
          {
            texto: `Faltan ${completitud.faltan.length} datos del hecho: ${completitud.faltan.map((f) => f.etiqueta).join(", ")}.`,
            paso: 1,
          },
        ]
      : []),
    ...(puntoIlustrativo
      ? [{ texto: "El punto de impacto es la ubicación ilustrativa, no el lugar real.", paso: 2 }]
      : []),
    ...(!validacion
      ? [{ texto: "El perito no ha validado la comparación con el reporte de CESVI.", paso: 6 }]
      : []),
  ];
  const descargarWord = async () => {
    const { dictamenContenido, LEYENDA_DICTAMEN } = await import("@/lib/dictamen-cesvi");
    const bytes = await dictamenDocx(dictamenContenido(datosDictamen(incluir)), LEYENDA_DICTAMEN);
    downloadBytes(
      bytes as Uint8Array<ArrayBuffer>,
      `dictamen-${caso.id}${validacion ? "" : "-borrador"}.docx`,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
  };
  const descargarPng = () => {
    if (!version) return;
    const url = croquisEsquema(
      version,
      calles,
      MEDIDAS,
      nombres,
      {
        fondo: "#FFFFFF",
        calle: "#C9CDD4",
        texto: "#15181D",
        A: COLOR_VEHICULO.A,
        B: COLOR_VEHICULO.B,
        senal: "#D9431A",
      },
      `${version.titulo} · ${caso.id}`,
      1600,
      1000,
    );
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = `croquis-${caso.id}-${version.clave}.png`;
    a.click();
  };
  const descargarJson = () => {
    const datos = {
      caso: caso.id,
      generado: new Date().toISOString(),
      huella_entradas: huella,
      textos,
      respuestas,
      datos_hecho: { evidencia: interpretacion.evidencia, declarada: interpretacion.declarada },
      versiones,
      zonas,
      criterios,
      distancia_restos: distancia,
      calculos: resultados
        ? { impacto_kmh: impactoKmh, desplazamiento_kmh: resultados.v3?.calculo.kmh ?? null }
        : null,
      que_cambia: comparacionVersiones,
      sugerencia,
      validacion,
    };
    downloadBytes(
      new TextEncoder().encode(`${JSON.stringify(datos, null, 2)}\n`) as Uint8Array<ArrayBuffer>,
      `caso-${caso.id}.json`,
      "application/json",
    );
  };
  const desplazamientoKmh = resultados?.v3?.calculo.kmh ?? null;
  // Paso 7: lo que concluyó CESVI contra lo que obtuvo Croquis (plan v2 §1).
  const contra = croquisContraDictamen(caso, {
    modalidad: interpretacion.evidencia.find((d) => d.clave === "modalidad")?.valor ?? null,
    deformacionKmh: resultados?.ebsDatos?.calculo.kmh ?? null,
    restosKmh: desplazamientoKmh,
    restosM: restosDeVersiones?.evidencia ?? null,
  });
  const frase = [
    `Siniestro ${caso.id} de ${caso.aseguradora}: alcance entre una ${caso.vehiculos.A.tipo} y una ${caso.vehiculos.B.tipo}; Croquis lo reconstruye y lo compara con lo que concluyó CESVI.`,
    "Con la descripción técnica del perito, Croquis arma la reconstrucción y pregunta lo que falta. La declaración del conductor es opcional: sirve para comparar.",
    "Tramo Los Mochis–Navojoa de la carretera federal 15. Marca el punto de impacto: las calles salen del mapa, sin esperar.",
    comparar && activa === "declarada"
      ? `Versión declarada, para comparar: ${nombres.A} retrocede ${reversaDibujada} m y ${nombres.B} lo impacta; sin desplazamiento después.`
      : interpretacion.parametros.evidencia.distanciaRestos === null
        ? `Reconstrucción de Croquis: ${nombres.B} alcanza a ${nombres.A}; la descripción técnica aún no da la longitud de los restos.`
        : `Reconstrucción de Croquis: ${nombres.B} alcanza a ${nombres.A} y lo desplaza; los restos cubren ${interpretacion.parametros.evidencia.distanciaRestos} m.`,
    "Los daños se acentúan a un lado: izquierdo en A, derecho en B. Así los observó el reporte de CESVI.",
    impactoKmh !== null && desplazamientoKmh !== null
      ? `${impactoKmh.toFixed(2)} km/h por los daños y ${desplazamientoKmh.toFixed(2)} km/h por el desplazamiento: ${resultados?.comparacion?.significativa ? "difieren" : "no difieren"} de forma significativa.`
      : "Los números del reporte, calculados con el método de CESVI.",
    "Lo que concluyó CESVI contra lo que obtuvo Croquis, punto por punto. El perito concluye.",
    "El dictamen con la estructura de CESVI: revísalo, fírmalo y descárgalo.",
  ][paso]!;

  const tituloDetalle = paso === 5 ? "Ver cálculo" : "Ver detalle";
  const restosDe = versiones
    ? {
        declarada: distanciaM(versiones.declarada.restos.inicio, versiones.declarada.restos.fin),
        evidencia: distanciaM(versiones.evidencia.restos.inicio, versiones.evidencia.restos.fin),
      }
    : null;
  const via = viaCercana
    ? `Vía más cercana: ${viaCercana.nombre ?? viaCercana.tipo} (${FUENTE_CALLE[viaCercana.fuente]}).`
    : null;
  const escena = [
    <PasoCaso key="caso" caso={caso} nombres={nombres} frase={frase} />,
    <PasoHecho
      key="hecho"
      completitud={completitud}
      textos={textos}
      onTexto={(tipo, t) => {
        const nuevos = { ...textosRef.current, [tipo]: t };
        textosRef.current = nuevos;
        setTextos(nuevos);
      }}
      leidos={{
        descripcion: lecturas.descripcion?.texto ?? null,
        declaracion: lecturas.declaracion?.texto ?? null,
      }}
      interpretacion={interpretacion}
      estados={estados}
      onLeer={(tipo) => void leer(tipo, textosRef.current[tipo])}
      onEjemplo={
        ejemplo
          ? () => {
              const nuevos = { ...textosRef.current, descripcion: ejemplo.descripcion };
              textosRef.current = nuevos;
              setTextos(nuevos);
            }
          : null
      }
      onResponder={responder}
      declarante={nombres[declarante]}
      frase={frase}
    />,
    <PasoLugar
      key="lugar"
      kilometro={caso.lugar.kilometro}
      frase={frase}
      punto={versiones?.evidencia.impacto.punto ?? null}
      reubicando={reubicando}
      onReubicar={setReubicando}
      onQuitar={quitarPunto}
      aviso={avisoLugar}
      msCalles={msCalles}
      via={via}
      onCoordenadas={(lat, lon) => (versiones ? moverPunto([lon, lat]) : fijarImpacto([lon, lat]))}
      edicion={edicionPasos}
      ilustrativa={
        ilustrativa
          ? {
              lat: ilustrativa.lat,
              lon: ilustrativa.lon,
              via: `carretera federal 15 (${ilustrativa.via.ref}), arroyo hacia el norte`,
            }
          : null
      }
      puntoIlustrativo={
        versiones !== null && esUbicacionIlustrativa(caso.id, versiones.evidencia.impacto.punto)
      }
    />,
    <PasoVersiones
      key="versiones"
      activa={activa}
      onActiva={(k) => {
        setActiva(k);
        animar();
      }}
      restos={restosDe}
      restosDictamen={caso.evidencia.restos.distancia_m.valor}
      superponer={superponer}
      onSuperponer={setSuperponer}
      comparar={comparar}
      onComparar={(v) => {
        cambiarComparar(v);
        animar();
      }}
      seleccion={
        animacion === null && versiones ? describirSeleccion(seleccion, nombres, activa) : null
      }
      frase={frase}
      onUsarRestos={() => {
        if (restosM === null) return;
        setDistancia({ valor: restosM.toFixed(2), fuente: "perito" });
        irA(5);
      }}
      edicion={edicionPasos}
      onVer3d={versiones ? () => setVer3d(true) : undefined}
    />,
    <PasoDanos
      key="danos"
      esperadas={esperadas}
      nombres={nombres}
      zonas={zonas}
      onZonas={(l, z) => setZonas((zs) => ({ ...zs, [l]: z }))}
      frase={frase}
    />,
    <PasoNumeros
      key="numeros"
      impactoKmh={impactoKmh}
      desplazamientoKmh={desplazamientoKmh}
      distanciaM={Number.isFinite(distanciaNum) ? distanciaNum : null}
      coeficiente={caso.calculos.desplazamiento.a.valor}
      nombres={nombres}
      comparacion={resultados?.comparacion ?? null}
      filas={reproducir(caso).filas}
      frase={frase}
    />,
    <PasoContraDictamen
      key="contra-dictamen"
      contra={contra}
      cambios={comparacionVersiones}
      sugerencia={sugerencia}
      pasoDeRazon={{ velocidades: 5, desplazamiento: 3, ubicacion_danos: 4 }}
      validacion={validacion}
      onValidar={setValidacion}
      nombres={nombres}
      zonas={zonas}
      impactoKmh={impactoKmh}
      desplazamientoKmh={desplazamientoKmh}
      restosEvidencia={Number.isFinite(distanciaNum) ? distanciaNum : null}
    />,
    <PasoDictamen
      key="dictamen"
      url={pdf?.url ?? null}
      estado={estadoPdf}
      onGenerar={() => void generarPdf()}
      onDescargar={() =>
        pdf &&
        downloadBytes(
          pdf.bytes,
          `dictamen-${caso.id}${validacion ? "" : "-borrador"}.pdf`,
          "application/pdf",
        )
      }
      validacion={validacion}
      frase={frase}
      onWord={() => void descargarWord()}
      onPng={descargarPng}
      onJson={descargarJson}
      incluir={incluir}
      onIncluir={(i) => {
        setIncluir(i);
        void generarPdf(i);
      }}
      trazabilidad={trazabilidad}
      antesDeFirmar={antesDeFirmar}
      notas={notasInternas}
      onNotas={setNotasInternas}
      hayCroquis={version !== null}
    />,
  ][paso];
  const sobreMapa = paso === 2 || paso === 3;
  // La pose que edita el panel: la elegida en el mapa (si se eligió el impacto o los restos, la
  // posición final de A).
  const poseElegida =
    seleccion.tipo === "pose" ? seleccion : ({ tipo: "pose", letra: "A", fase: "final" } as const);
  const nav = useMemo(
    () => ({
      paso,
      total: PASOS.length,
      irA,
      abrirDetalle: () => setDetalle(true),
      tituloDetalle,
    }),
    [paso, irA, tituloDetalle],
  );
  const otra: ClaveVersion = activa === "declarada" ? "evidencia" : "declarada";
  const resumenCaso = `${caso.aseguradora} · ${caso.modalidad_dictaminada[0]!.toUpperCase()}${caso.modalidad_dictaminada.slice(1)} · ${caso.lugar.municipio}, ${caso.lugar.estado}`;
  const cambiarModo = (m: Modo) => {
    setModo(m);
    // Trabajar es para colocar (pasos 3 y 4): se entra a las versiones.
    if (m === "trabajar" && paso !== 2 && paso !== 3) irA(3);
  };
  const camaraTrabajo: Camara | null = useMemo(() => {
    if (versiones) {
      const puntos = (["declarada", "evidencia"] as const).flatMap((k) => [
        ...(["A", "B"] as const).flatMap((l) =>
          FASES.map((f) => versiones[k].vehiculos[l][f].punto),
        ),
        versiones[k].restos.fin,
      ]);
      return { tipo: "encuadre", puntos, zoomMax: 20.5 };
    }
    return tramo.length
      ? { tipo: "encuadre", puntos: tramo.flatMap((c) => c.puntos), zoomMax: 11 }
      : null;
  }, [versiones, tramo]);
  const reproductor = (
    <Reproductor
      t={animacion ?? 1}
      reproduciendo={reproduciendo}
      eventos={eventos}
      velocidad={velocidad}
      onVelocidad={cambiarVelocidad}
      onReproducir={() => animar(animacion !== null && animacion < 1 ? animacion : 0)}
      onPausar={pausar}
      onT={(t) => {
        pausar();
        setAnimacion(t >= 1 ? null : t);
      }}
      ancho={modo === "trabajar" ? "w-full" : "w-[680px]"}
    />
  );

  return (
    <ProveedorRecorrido value={nav}>
      <div
        className="fixed inset-0 flex flex-col bg-fondo text-texto"
        data-tema={tema}
        data-modo={modo}
        data-testid="recorrido"
      >
        <BarraRecorrido
          pasos={PASOS}
          pasosCortos={PASOS_CORTOS}
          paso={paso}
          irA={irA}
          modo={modo}
          onModo={cambiarModo}
          tema={tema}
          resumen={resumenCaso}
          onExportar={() => {
            setModo("presentar");
            irA(PASOS.length - 1);
          }}
          acciones={
            <>
              <span
                className="hidden shrink-0 items-center gap-2 text-[0.8125rem] text-texto-2 md:flex"
                role="status"
                data-testid="estado-ia"
                data-estado={estadoIA}
              >
                <span
                  className={`h-2 w-2 rounded-full ${estadoIA === "lista" ? "bg-[var(--ok)]" : estadoIA === "error" ? "bg-senal" : estadoIA === "entendiendo" ? "animate-pulse bg-texto-2" : "bg-texto-3"}`}
                  aria-hidden="true"
                />
                {ESTADO_IA[estadoIA]}
              </span>
              <button
                type="button"
                className="boton-secundario boton-compacto h-9 min-h-9 shrink-0"
                onClick={() => setManualAbierto(true)}
                data-testid="llenar-a-mano"
              >
                Llenar a mano
              </button>
              {modo === "trabajar" ? (
                <button
                  type="button"
                  className="boton-secundario boton-compacto h-9 min-h-9 shrink-0"
                  onClick={deshacerCambio}
                  disabled={hist.pasado.length === 0}
                >
                  ↶ Deshacer
                </button>
              ) : null}
            </>
          }
        />

        {modo === "presentar" ? (
          <main
            id="contenido"
            className="relative min-h-0 flex-1 overflow-hidden"
            aria-label={PASOS[paso]}
          >
            <MapaRecorrido
              camara={camara}
              calles={calles}
              version={version}
              superpuesta={
                paso === 3 && comparar && superponer && versiones ? versiones[otra] : null
              }
              medidas={MEDIDAS}
              nombres={nombres}
              animacion={paso === 3 ? animacion : null}
              edicion={edicion}
              onClic={(p) => {
                if (paso !== 2) return;
                if (!versiones) fijarImpacto(p);
                else if (reubicando) moverPunto(p);
              }}
              onCaptura={alCapturar}
              onConsultaCalles={alConsultarCalles}
              atenuado={!sobreMapa}
              tema={tema}
            />
            <div
              key={paso}
              className={`aparecer absolute inset-0 ${sobreMapa ? "pointer-events-none" : ""}`}
            >
              {sobreMapa ? (
                <div className="relative h-full">
                  <div className="absolute inset-y-4 left-4 flex sm:inset-y-6 sm:left-6">
                    {escena}
                  </div>
                  {paso === 3 ? (
                    <div className="absolute top-6 right-6">
                      <Leyenda nombres={nombres} />
                    </div>
                  ) : null}
                  {paso === 3 && versiones ? (
                    <div className="absolute inset-x-4 bottom-4 flex justify-center sm:bottom-6 lg:left-[408px] 2xl:left-0">
                      {reproductor}
                    </div>
                  ) : null}
                  <p className="pointer-events-auto absolute right-6 bottom-6 hidden w-[300px] text-right text-[0.6875rem] leading-relaxed text-texto-3 2xl:block">
                    Reconstrucción de apoyo · el dictamen es del perito
                    <br />
                    Calles © OpenStreetMap (ODbL) · mosaicos © OpenFreeMap, OpenMapTiles
                  </p>
                  <p className="pointer-events-auto absolute top-1.5 right-6 text-[0.6875rem] text-texto-3 2xl:hidden">
                    Reconstrucción de apoyo · © OpenStreetMap, OpenFreeMap, OpenMapTiles
                  </p>
                </div>
              ) : (
                escena
              )}
            </div>
          </main>
        ) : (
          <main
            id="contenido"
            className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto p-4 lg:grid-cols-[260px_minmax(0,1fr)_320px] lg:overflow-hidden"
            aria-label="Trabajar: colocación en el croquis"
            data-testid="espacio-trabajo"
          >
            <aside className="min-h-0 overflow-y-auto">
              <Herramientas
                activa={herramienta}
                onHerramienta={elegirHerramienta}
                completitud={completitud}
                onVerHecho={() => {
                  setModo("presentar");
                  irA(1);
                }}
              />
            </aside>
            <section className="flex min-h-[60vh] min-w-0 flex-col gap-3 lg:min-h-0">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  {comparar ? <PestanasVista vista={vista} onVista={cambiarVista} /> : null}
                  <InterruptorComparar comparar={comparar} onComparar={cambiarComparar} />
                </div>
                <p className="t-nota">
                  {herramienta === "medir"
                    ? "Toca dos puntos para medir."
                    : versiones
                      ? "Elige una herramienta y toca el mapa, o arrastra vehículos y marcadores."
                      : "Elige «Punto de impacto» y toca la carretera para empezar."}
                </p>
              </div>
              <div
                className={`relative min-h-0 flex-1 overflow-hidden rounded-panel border border-linea-suave ${vista === "lado" ? "grid grid-cols-2 grid-rows-[minmax(0,1fr)] gap-px bg-linea" : ""}`}
              >
                {(vista === "lado" ? (["declarada", "evidencia"] as const) : [activa]).map(
                  (clave) => (
                    <div
                      key={clave}
                      className={vista === "lado" ? "relative min-h-0" : "absolute inset-0"}
                    >
                      <MapaRecorrido
                        camara={camaraTrabajo}
                        calles={calles}
                        version={versiones ? versiones[clave] : null}
                        superpuesta={
                          vista === "superponer" && versiones ? versiones.declarada : null
                        }
                        medidas={MEDIDAS}
                        nombres={nombres}
                        animacion={animacion}
                        edicion={versiones && animacion === null ? edicionPara(clave) : null}
                        onClic={(p) => clicTrabajo(clave, p)}
                        onCaptura={
                          vista === "lado" && clave === "declarada" ? undefined : alCapturar
                        }
                        onConsultaCalles={alConsultarCalles}
                        atenuado={false}
                        tema={tema}
                        medicion={medicion}
                        relleno={{ top: 48, bottom: 48, left: 48, right: 48 }}
                        testid={vista === "lado" ? `mapa-trabajo-${clave}` : "mapa-trabajo"}
                      />
                      {vista === "lado" ? (
                        <span className="vidrio pointer-events-none absolute top-3 left-3 px-3 py-1 text-xs font-medium">
                          {clave === "declarada"
                            ? "Versión declarada"
                            : "Reconstrucción de Croquis"}
                        </span>
                      ) : null}
                    </div>
                  ),
                )}
                {!versiones && ilustrativa ? (
                  <div className="vidrio absolute bottom-4 left-4 flex max-w-sm flex-col gap-2 p-4">
                    <p className="t-nota">
                      Km {caso.lugar.kilometro}: el reporte de CESVI no da coordenadas. Ubicación
                      ilustrativa sobre la carretera federal 15 (no es el lugar real).
                    </p>
                    <button
                      type="button"
                      className="boton-principal boton-compacto self-start"
                      onClick={() => fijarImpacto([ilustrativa.lon, ilustrativa.lat])}
                      data-testid="usar-ilustrativa-trabajo"
                    >
                      Usar esta ubicación
                    </button>
                  </div>
                ) : null}
              </div>
              {versiones ? reproductor : null}
            </section>
            <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto">
              {versiones && version ? (
                <PanelObjeto
                  version={version}
                  clave={activa}
                  seleccion={seleccion}
                  nombres={nombres}
                  onPunto={(p) => moverEn(activa, seleccion, p)}
                  onRumbo={(r) =>
                    seleccion.tipo === "pose" &&
                    cambiar((vs) =>
                      vs
                        ? {
                            ...vs,
                            [activa]: moverPose(vs[activa], seleccion.letra, seleccion.fase, {
                              rumbo: r,
                            }),
                          }
                        : vs,
                    )
                  }
                  onRestablecer={restablecerObjeto}
                />
              ) : null}
              <BarraEdicion e={edicionPasos} restablecer={versiones !== null} />
              {comparar ? <TablaCambios c={comparacionVersiones} /> : null}
            </aside>
          </main>
        )}
        {modo === "trabajar" ? (
          <footer className="flex shrink-0 justify-between gap-4 px-6 pb-3 font-mono text-[0.6875rem] text-texto-3">
            <span>Reconstrucción de apoyo · el dictamen es del perito</span>
            <span data-testid="huella">Método CESVI · huella de entradas {huella}</span>
          </footer>
        ) : null}

        <PanelManual
          abierto={manualAbierto}
          onCerrar={() => setManualAbierto(false)}
          respuestas={respuestas}
          onResponder={responder}
        />
        <PanelDetalle
          titulo={`${PASOS[paso]}: ${tituloDetalle.toLowerCase()}`}
          abierto={detalle}
          onCerrar={() => setDetalle(false)}
        >
          {paso === 0 ? <Expediente caso={caso} /> : null}
          {paso === 1 ? (
            <section className="t-cuerpo flex flex-col gap-4">
              <p>
                Croquis lee cada texto por separado: la descripción técnica del perito arma la
                reconstrucción de Croquis; la declaración del conductor, si se pega, arma la versión
                declarada, que solo sirve para comparar. Cada dato lleva su fuente (perito,
                conductor, expediente o supuesto) y la frase de donde sale; si la frase no está en
                el texto, el dato se descarta.
              </p>
              <p>
                La lectura usa el vocabulario de los reportes de CESVI: un glosario de{" "}
                {Object.values(GLOSARIO.glosario).flat().length} términos, con en cuántos de los{" "}
                {GLOSARIO.dictamenes} reportes de CESVI aparece cada uno (modalidad, zona de
                contacto, acentuación y vértice, dirección de la fuerza, sentido y carril,
                maniobras, restos y huellas, posiciones y vía).
              </p>
              <p className="t-nota">
                Con Claude si hay llave y tope de gasto; si no, con reglas sobre el mismo glosario.
                La IA no produce números: los metros solo cuentan si están escritos en la frase.
              </p>
            </section>
          ) : null}
          {paso === 2 ? (
            <section className="t-cuerpo flex flex-col gap-3">
              <p>{caso.lugar.descripcion}</p>
              <p>
                {caso.lugar.arroyos.length} arroyos de {caso.lugar.ancho_arroyo_m.valor} m.{" "}
                {caso.lugar.separacion.valor} {caso.lugar.carpeta.valor}
              </p>
              {viaCercana ? (
                <p data-testid="via-cercana">
                  Vía más cercana: {viaCercana.nombre ?? viaCercana.tipo}
                  {viaCercana.carriles ? `, ${viaCercana.carriles} carriles` : ""}
                  {viaCercana.anchoM ? `, ${viaCercana.anchoM} m de ancho` : ""} (
                  {FUENTE_CALLE[viaCercana.fuente]}).
                </p>
              ) : null}
              <p className="t-nota text-texto-2">
                El reporte de CESVI no da coordenadas del km {caso.lugar.kilometro} y OpenStreetMap
                no tiene marcas de kilómetro en el tramo: el perito marca el punto.
              </p>
            </section>
          ) : null}
          {paso === 3 && version ? (
            <section className="flex flex-col gap-4">
              <p className="t-cuerpo">{version.descripcion}</p>
              <div className="flex flex-wrap gap-3">
                <label className="t-nota flex flex-col gap-1 text-texto-2">
                  Vehículo
                  <select
                    className="campo w-40"
                    value={poseElegida.letra}
                    onChange={(e) =>
                      setSeleccion({ ...poseElegida, letra: e.target.value as "A" | "B" })
                    }
                  >
                    <option value="A">{nombres.A}</option>
                    <option value="B">{nombres.B}</option>
                  </select>
                </label>
                <label className="t-nota flex flex-col gap-1 text-texto-2">
                  Fase
                  <select
                    className="campo w-44"
                    value={poseElegida.fase}
                    onChange={(e) => setSeleccion({ ...poseElegida, fase: e.target.value as Fase })}
                  >
                    {FASES.map((f) => (
                      <option key={f} value={f}>
                        {NOMBRE_FASE[f]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="t-nota flex flex-col gap-1 text-texto-2">
                  Rumbo (°)
                  <input
                    type="number"
                    className="campo cifras w-24"
                    value={Math.round(version.vehiculos[poseElegida.letra][poseElegida.fase].rumbo)}
                    onChange={(e) =>
                      cambiar((vs) =>
                        vs
                          ? {
                              ...vs,
                              [activa]: moverPose(vs[activa], poseElegida.letra, poseElegida.fase, {
                                rumbo: Number(e.target.value) || 0,
                              }),
                            }
                          : vs,
                      )
                    }
                  />
                </label>
              </div>
              <p className="t-nota text-texto-2">
                En el mapa: toca o arrastra cualquier marca (posición inicial, impacto o final de
                cada vehículo, ✕ punto de impacto, R1 y R2 zona de restos).
              </p>
              <table className="t-interfaz w-full border-collapse text-left">
                <thead>
                  <tr className="t-nota border-b border-linea">
                    <th className="py-1 font-normal">Vehículo</th>
                    <th className="py-1 font-normal">Fase</th>
                    <th className="py-1 font-normal">Fuente</th>
                  </tr>
                </thead>
                <tbody>
                  {(["A", "B"] as const).flatMap((l) =>
                    FASES.map((f) => (
                      <tr key={`${l}-${f}`} className="border-b border-linea">
                        <td className={`py-1 ${l === "A" ? "text-vehiculo-a" : "text-vehiculo-b"}`}>
                          {nombres[l]}
                        </td>
                        <td className="py-1">{NOMBRE_FASE[f]}</td>
                        <td className="py-1">{version.vehiculos[l][f].fuente}</td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
              <ul className="t-nota flex flex-col gap-1 text-texto-2">
                {version.supuestos.map((s) => (
                  <li key={s}>Supuesto: {s}</li>
                ))}
                <li>
                  Medidas de los vehículos: las típicas de la clase pickup ({MEDIDAS_PICKUP.largo} ×{" "}
                  {MEDIDAS_PICKUP.ancho} m); el reporte de CESVI no las da.
                </li>
              </ul>
            </section>
          ) : null}
          {paso === 4 ? (
            <section className="grid gap-8 md:grid-cols-2">
              {(["A", "B"] as const).map((l) => (
                <Criterios
                  key={l}
                  letra={l}
                  valores={criterios[l]}
                  onCambio={(clave, v) =>
                    setCriterios((cs) => ({ ...cs, [l]: { ...cs[l], [clave]: v } }))
                  }
                />
              ))}
            </section>
          ) : null}
          {/* Los cálculos se quedan montados: los usan los pasos 6 a 8 aunque el panel esté cerrado. */}
          <div hidden={paso !== 5} className="flex flex-col gap-12">
            <Calculos
              caso={caso}
              distancia={distancia}
              onDistancia={setDistancia}
              onResultados={setResultados}
            />
            {reproduccion}
          </div>
          {paso === 6 ? (
            <section className="flex flex-col gap-3">
              <ul className="t-cuerpo flex flex-col gap-3">
                {contra.filas.map((f) => (
                  <li key={f.clave}>
                    {f.concepto}: <span className="t-nota text-texto-2">{f.fuente}.</span>
                  </li>
                ))}
              </ul>
              <p className="t-nota text-texto-2">
                Cada diferencia va con su valor y su porcentaje, sin ajustes. El perito concluye.
              </p>
            </section>
          ) : null}
          {paso === 7 ? (
            <section className="flex flex-col gap-3">
              <h3 className="t-subtitulo">Consideraciones (borrador con Claude)</h3>
              <p className="t-nota text-texto-2">
                Claude redacta con los números que ya calculó Croquis; no calcula nada. El perito
                revisa y corrige.
              </p>
              <button
                type="button"
                className="boton-secundario min-h-11 self-start px-4"
                onClick={() => void pedirBorrador()}
                data-testid="pedir-borrador"
              >
                {borrador ? "Volver a redactar" : "Redactar el borrador"}
              </button>
              {estadoBorrador ? (
                <p role="status" className="t-interfaz" data-testid="estado-borrador">
                  {estadoBorrador}
                </p>
              ) : null}
              {borrador ? (
                <>
                  <textarea
                    className="campo min-h-64"
                    value={borrador}
                    onChange={(e) => setBorrador(e.target.value)}
                    aria-label="Borrador de las consideraciones"
                    data-testid="texto-borrador"
                  />
                  <label className="t-interfaz flex min-h-11 items-center gap-3">
                    <input
                      type="checkbox"
                      checked={revisado}
                      onChange={(e) => setRevisado(e.target.checked)}
                      className="h-5 w-5 accent-[var(--accion)]"
                    />
                    Revisé y corregí el borrador
                  </label>
                  <button
                    type="button"
                    className="boton-principal self-start"
                    onClick={() => void generarPdf()}
                  >
                    Pasarlo al dictamen
                  </button>
                </>
              ) : null}
            </section>
          ) : null}
        </PanelDetalle>
        {ver3d && versiones ? (
          <Reconstruccion3dRecorrido
            caso={caso}
            evidencia={versiones.evidencia}
            nombres={nombres}
            tema={tema}
            onCerrar={() => setVer3d(false)}
          />
        ) : null}
      </div>
    </ProveedorRecorrido>
  );
}
