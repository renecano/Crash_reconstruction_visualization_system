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
  deshacer,
  distanciaM,
  ejemploHecho,
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
import { Logotipo } from "@/components/sitio/logo";
import { downloadBytes } from "@/lib/download";
import { nombresVehiculos } from "@/lib/vehiculos-cesvi";
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
  PasoSugerencia,
  PasoVersiones,
  Leyenda,
  Reproductor,
  type EdicionPasos,
} from "./pasos";
import { ProveedorRecorrido } from "./marco";
import { PanelDetalle } from "./piezas";

const PASOS = [
  "El caso",
  "El hecho",
  "El lugar",
  "Las versiones",
  "Los daños",
  "Los números",
  "La sugerencia",
  "El dictamen",
] as const;

/** Los nombres de la barra de pasos, cortos para que quepan en una fila (maquetas). */
const PASOS_CORTOS = [
  "Caso",
  "Hecho",
  "Lugar",
  "Versiones",
  "Daños",
  "Números",
  "Sugerencia",
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
  evidencia: "versión de la evidencia",
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
  const [activa, setActiva] = useState<ClaveVersion>("declarada");
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
    return proponerVersiones({
      impacto,
      rumboVia: rumboHacia(via, p.evidencia.hacia),
      rumboDeclarada: rumboHacia(via, p.declarada.hacia ?? p.evidencia.hacia),
      medidas: MEDIDAS,
      distanciaRestos: p.evidencia.distanciaRestos ?? 0,
      fuenteRestos: p.evidencia.distanciaRestos === null ? "croquis" : "perito",
      reversaM: p.declarada.reversaM ?? REVERSA_INICIAL_M,
    });
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
  const animar = useCallback((desde = 0) => {
    cancelAnimationFrame(id.current);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setAnimacion(null);
      setReproduciendo(false);
      return;
    }
    const inicio = performance.now() - desde * DURACION_ANIMACION_MS;
    const cuadro = (ahora: number) => {
      const t = Math.min(1, (ahora - inicio) / DURACION_ANIMACION_MS);
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
  const [superponer, setSuperponer] = useState(true);
  const version = versiones?.[activa] ?? null;
  const restosM = version ? distanciaM(version.restos.inicio, version.restos.fin) : null;

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
    return {
      seleccion,
      onSeleccion: setSeleccion,
      onMover: (sel, p) => {
        setSeleccion(sel);
        cambiar((vs) => {
          if (!vs) return vs;
          const v = vs[activa];
          const punto: [number, number] = [p[0], p[1]];
          const movida =
            sel.tipo === "pose"
              ? moverPose(v, sel.letra, sel.fase, { punto })
              : sel.tipo === "impacto"
                ? { ...v, impacto: { punto, fuente: "perito" as const } }
                : {
                    ...v,
                    restos: { ...v.restos, [sel.extremo]: punto, fuente: "perito" as const },
                  };
          return { ...vs, [activa]: movida };
        });
      },
    };
  }, [paso, versiones, seleccion, activa, cambiar, moverPunto]);
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
  const fuenteDistancia = distancia.fuente === "perito" ? "medida por el perito" : "del dictamen";
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
  const generarPdf = useCallback(async () => {
    setEstadoPdf("Armando el dictamen…");
    try {
      const { dictamenPdf } = await import("@/lib/dictamen-cesvi");
      const comparacion = resultados?.comparacion;
      const bytes = await dictamenPdf({
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
          return imagen && version ? { imagen, version: version.titulo.toLowerCase() } : null;
        })(),
        criterios,
        zonas,
        sugerencia,
        validacion,
        consideraciones: borrador.trim() ? { texto: borrador.trim(), revisadas: revisado } : null,
      });
      setPdf((anterior) => {
        if (anterior) URL.revokeObjectURL(anterior.url);
        return { url: URL.createObjectURL(new Blob([bytes], { type: "application/pdf" })), bytes };
      });
      setEstadoPdf(null);
    } catch (e) {
      setEstadoPdf(`No se pudo armar el dictamen: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [
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
  ]);

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
              energia_del_dictamen_original: caso.calculos.deformacion_B.reporte.energia.valor,
              velocidad_impacto: resultados?.ebsReporte?.resultado ?? null,
              desplazamiento: resultados?.v3?.resultado ?? null,
            },
            separacion_restos: { metros: distancia.valor, fuente: fuenteDistancia },
            sugerencia: sugerencia.texto,
            razones: sugerencia.razones.map((x) => x.texto),
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
  const desplazamientoKmh = resultados?.v3?.calculo.kmh ?? null;
  const frase = [
    `Siniestro ${caso.id} de ${caso.aseguradora}: alcance entre una ${caso.vehiculos.A.tipo} y una ${caso.vehiculos.B.tipo}; el conductor de A declara una reversa.`,
    "La descripción técnica del perito arma la versión de la evidencia; la declaración, la versión declarada. Croquis pregunta lo que falta.",
    "Tramo Los Mochis–Navojoa de la carretera federal 15. Marca el punto de impacto: las calles salen del mapa, sin esperar.",
    activa === "declarada"
      ? `Versión declarada: ${nombres.A} retrocede ${reversaDibujada} m y ${nombres.B} lo impacta; sin desplazamiento después.`
      : interpretacion.parametros.evidencia.distanciaRestos === null
        ? `Versión de la evidencia: ${nombres.B} alcanza a ${nombres.A}; la descripción técnica aún no da la longitud de los restos.`
        : `Versión de la evidencia: ${nombres.B} alcanza a ${nombres.A} y lo desplaza; los restos cubren ${interpretacion.parametros.evidencia.distanciaRestos} m.`,
    "Los daños se acentúan a un lado (izquierdo en A, derecho en B); una reversa los dejaría al centro.",
    impactoKmh !== null && desplazamientoKmh !== null
      ? `${impactoKmh.toFixed(2)} km/h por los daños y ${desplazamientoKmh.toFixed(2)} km/h por el desplazamiento: ${resultados?.comparacion?.significativa ? "difieren" : "no difieren"} de forma significativa.`
      : "Los números del dictamen, calculados con el método de CESVI.",
    "Croquis sugiere una conclusión con tres razones; el perito acepta, edita o rechaza.",
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
    />,
    <PasoDanos
      key="danos"
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
    <PasoSugerencia
      key="sugerencia"
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

  return (
    <ProveedorRecorrido value={nav}>
      <div className="fixed inset-0 flex flex-col bg-fondo">
        <header className="vidrio barra relative z-30 flex h-16 shrink-0 items-center gap-4 px-4 md:gap-6 md:px-6">
          <Logotipo ancho={112} />
          <nav
            aria-label="Pasos del recorrido"
            className="flex min-w-0 flex-1 items-center justify-center-safe gap-1 overflow-x-auto"
          >
            {PASOS.map((nombre, i) => {
              const actual = paso === i;
              const hecho = i < paso;
              return (
                <button
                  key={nombre}
                  type="button"
                  aria-label={`Paso ${i + 1}: ${nombre}`}
                  aria-current={actual ? "step" : undefined}
                  onClick={() => irA(i)}
                  className={`flex h-9 shrink-0 items-center gap-2 rounded-full text-[0.8125rem] transition-colors ${
                    actual
                      ? "bg-accion pr-3.5 pl-2 font-semibold text-accion-texto"
                      : `px-3 font-medium hover:bg-superficie-alta ${hecho ? "text-texto-2" : "text-texto-3"}`
                  }`}
                  data-testid={`paso-${i + 1}`}
                >
                  <span
                    className={`grid h-5 w-5 place-items-center rounded-full text-[0.6875rem] ${
                      actual
                        ? "bg-fondo text-texto"
                        : hecho
                          ? "bg-superficie-alta text-texto-2"
                          : "border border-linea"
                    }`}
                    aria-hidden="true"
                  >
                    {hecho ? "✓" : i + 1}
                  </span>
                  {PASOS_CORTOS[i]}
                </button>
              );
            })}
          </nav>
          <div className="hidden shrink-0 items-center gap-3 xl:flex">
            <span className="text-[0.8125rem] font-medium text-texto-2">
              {caso.aseguradora} · {caso.modalidad_dictaminada[0]!.toUpperCase()}
              {caso.modalidad_dictaminada.slice(1)} · {caso.lugar.municipio}, {caso.lugar.estado}
            </span>
            <button
              type="button"
              className="boton-secundario boton-compacto h-9 min-h-9"
              onClick={() => irA(PASOS.length - 1)}
            >
              Exportar
            </button>
          </div>
        </header>

        <main
          id="contenido"
          className="relative min-h-0 flex-1 overflow-hidden"
          aria-label={PASOS[paso]}
        >
          <MapaRecorrido
            camara={camara}
            calles={calles}
            version={version}
            superpuesta={paso === 3 && superponer && versiones ? versiones[otra] : null}
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
                    <Reproductor
                      t={animacion ?? 1}
                      reproduciendo={reproduciendo}
                      duracionS={DURACION_ANIMACION_MS / 1000}
                      onReproducir={() =>
                        animar(animacion !== null && animacion < 1 ? animacion : 0)
                      }
                      onPausar={pausar}
                      onT={(t) => {
                        pausar();
                        setAnimacion(t >= 1 ? null : t);
                      }}
                    />
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
                versión de la evidencia, y la declaración del conductor, la versión declarada. Cada
                dato lleva su fuente (perito, conductor, expediente o supuesto) y la frase de donde
                sale; si la frase no está en el texto, el dato se descarta.
              </p>
              <p>
                La lectura usa el vocabulario de los dictámenes de CESVI: un glosario de{" "}
                {Object.values(GLOSARIO.glosario).flat().length} términos, con en cuántos de los{" "}
                {GLOSARIO.dictamenes} dictámenes aparece cada uno (modalidad, zona de contacto,
                acentuación y vértice, dirección de la fuerza, sentido y carril, maniobras, restos y
                huellas, posiciones y vía).
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
                El dictamen no da coordenadas del km {caso.lugar.kilometro} y OpenStreetMap no tiene
                marcas de kilómetro en el tramo: el perito marca el punto.
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
                  {MEDIDAS_PICKUP.ancho} m); el dictamen no las da.
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
                {sugerencia.razones.map((r) => (
                  <li key={r.clave}>
                    {r.texto} <span className="t-nota text-texto-2">({r.evidencia})</span>
                  </li>
                ))}
              </ul>
              <p className="t-nota text-texto-2">{sugerencia.regla}</p>
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
      </div>
    </ProveedorRecorrido>
  );
}
