"use client";
/**
 * `/cesvi`: el recorrido del perito (docs/cesvi/PROTOTIPO.md, «Recorrido del perito»; ADR 0052).
 * Ocho pantallas, una por paso, con avance por botón y por teclado (← →), una barra de pasos arriba,
 * el mapa o el dibujo a casi toda la pantalla, una frase por paso y lo demás en «Ver detalle».
 * Reúsa lo de los hitos 1 a 3: el módulo de cálculo, las versiones, la sugerencia, el borrador y el
 * PDF.
 */
import {
  callesCerca,
  distanciaM,
  interpretarDeclaracion,
  moverPose,
  proponerVersiones,
  reproducir,
  rumboHaciaElNorte,
  sugerir,
  tramoDelCaso,
  zonasDeDanos,
  criteriosVacios,
  FASES,
  type Calle,
  type CasoCesvi,
  type ClaveVersion,
  type ExtraccionRelato,
  type Fase,
  type LonLat,
  type RespuestasPerito,
  type Validacion,
  type VersionCroquis,
  type Zona,
} from "@croquis/cesvi";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Logotipo } from "@/components/sitio/logo";
import { downloadBytes } from "@/lib/download";
import { extraer } from "@/lib/relato-api";
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
  PasoLugar,
  PasoNarracion,
  PasoNumeros,
  PasoSugerencia,
  PasoVersiones,
} from "./pasos";
import { PanelDetalle } from "./piezas";

const PASOS = [
  "El caso",
  "La narración",
  "El lugar",
  "Las versiones",
  "Los daños",
  "Los números",
  "La sugerencia",
  "El dictamen",
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

/** Lo elegido en el mapa, en palabras: «A · Silverado · posición final · versión declarada». */
function describirSeleccion(
  s: Seleccion,
  nombres: Record<"A" | "B", string>,
  version: ClaveVersion,
): { texto: string; letra: "A" | "B" | null } {
  const que =
    s.tipo === "pose"
      ? `${nombres[s.letra]} · ${NOMBRE_FASE[s.fase]}`
      : s.tipo === "impacto"
        ? "Punto de impacto (✕)"
        : `Zona de restos · ${s.extremo === "inicio" ? "inicio (R1)" : "fin (R2)"}`;
  return {
    texto: `${que} · ${NOMBRE_VERSION[version]}`,
    letra: s.tipo === "pose" ? s.letra : null,
  };
}

const enCampo = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));

export function Recorrido({ caso, reproduccion }: { caso: CasoCesvi; reproduccion: ReactNode }) {
  const [paso, setPaso] = useState(0);
  const [detalle, setDetalle] = useState(false);

  // Paso 2: la declaración, lo que entiende la IA y lo que dice el perito.
  const [extraccion, setExtraccion] = useState<ExtraccionRelato | null>(null);
  const [estadoIa, setEstadoIa] = useState<string | null>(null);
  const [notas, setNotas] = useState("");
  const [respuestas, setRespuestas] = useState<RespuestasPerito>({});
  const expediente = {
    textoA: `${caso.vehiculos.A.marca} ${caso.vehiculos.A.tipo}`,
    textoB: `${caso.vehiculos.B.marca} ${caso.vehiculos.B.tipo}`,
  };
  const interpretacion = useMemo(
    () => interpretarDeclaracion(caso.declaracion.texto, expediente, extraccion, notas, respuestas),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- el expediente sale del caso
    [caso, extraccion, notas, respuestas],
  );
  const leido = useRef(false);
  const leerConIa = useCallback(async () => {
    setEstadoIa("Leyendo la declaración…");
    try {
      const r = await extraer(caso.declaracion.texto, "auto");
      setExtraccion(r as unknown as ExtraccionRelato);
      setEstadoIa(
        r.metodo === "claude"
          ? "Leída con IA (Claude). La IA no produce números finales."
          : `Leída con reglas${r.motivo ? `: ${r.motivo}` : "."}`,
      );
    } catch (e) {
      setEstadoIa(
        `No se pudo leer con IA (${e instanceof Error ? e.message : String(e)}); se usan las reglas.`,
      );
    }
  }, [caso]);

  // Pasos 3 y 4: el lugar, las calles y las dos versiones.
  const nombres = useMemo(() => nombresVehiculos(caso), [caso]);
  // El tramo del caso, precargado de OSM (ADR 0053): la demo no depende de un servidor externo.
  const tramo = useMemo(() => tramoDelCaso(caso.id), [caso]);
  const [calles, setCalles] = useState<Calle[]>([]);
  const [avisoLugar, setAvisoLugar] = useState<string | null>(null);
  const [viaCercana, setViaCercana] = useState<Calle | null>(null);
  const [msCalles, setMsCalles] = useState<number | null>(null);
  const [versiones, setVersiones] = useState<Record<ClaveVersion, VersionCroquis> | null>(null);
  const [activa, setActiva] = useState<ClaveVersion>("declarada");
  const [animacion, setAnimacion] = useState<number | null>(null);
  const [seleccion, setSeleccion] = useState<Seleccion>({
    tipo: "pose",
    letra: "A",
    fase: "final",
  });
  const reversaDibujada = interpretacion.dinamica.reversaM ?? REVERSA_INICIAL_M;
  const consultaMosaicos = useRef<(p: LonLat, radioM: number) => Calle[]>(() => []);
  const alConsultarCalles = useCallback((f: (p: LonLat, radioM: number) => Calle[]) => {
    consultaMosaicos.current = f;
  }, []);
  const marcaActual = useRef(0);

  // Marcar el impacto no espera a la red: las calles salen del tramo precargado y de los mosaicos
  // que el mapa ya cargó, y con ellas se dibujan las versiones. Overpass corre detrás y solo
  // enriquece (carriles, ancho, nombre) cuando llega.
  const fijarImpacto = useCallback(
    (p: LonLat) => {
      const t0 = performance.now();
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
      const haciaElSur = interpretacion.dinamica.sentido?.hacia === "sur";
      const rumboA = (rumboHaciaElNorte(cercana?.rumbo ?? 0) + (haciaElSur ? 180 : 0)) % 360;
      setVersiones(
        proponerVersiones({
          impacto: p,
          rumboVia: rumboA,
          medidas: MEDIDAS,
          distanciaRestos: caso.evidencia.restos.distancia_m.valor,
          reversaM: reversaDibujada,
        }),
      );
      // Cuánto tarda del clic a ver las calles (meta: menos de 1 s), tras el siguiente cuadro.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (marca === marcaActual.current) setMsCalles(performance.now() - t0);
        }),
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
    },
    [caso, tramo, interpretacion.dinamica.sentido, reversaDibujada],
  );

  // La versión declarada sigue a los metros de reversa que fija el perito.
  const cambiarReversa = (m: number | null) => {
    setRespuestas((r) => ({ ...r, reversaM: m }));
    const metros = m ?? REVERSA_INICIAL_M;
    setVersiones((vs) => {
      if (!vs) return vs;
      const a = vs.declarada.vehiculos.A.impacto;
      const movida = moverPose(vs.declarada, "A", "inicial", {
        punto: proponerVersiones({
          impacto: vs.declarada.impacto.punto,
          rumboVia: a.rumbo,
          medidas: MEDIDAS,
          distanciaRestos: 0,
          reversaM: metros,
        }).declarada.vehiculos.A.inicial.punto,
      });
      return {
        ...vs,
        declarada: {
          ...movida,
          supuestos: movida.supuestos.map((s) =>
            s.startsWith("La declaración dice")
              ? `La declaración dice «unos metros»: la reversa se dibuja con ${metros} m${m === null ? ", que el perito ajusta" : " (perito)"}.`
              : s,
          ),
        },
      };
    });
  };

  // La animación de la versión a la vista (paso 4).
  const id = useRef(0);
  const animar = useCallback(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setAnimacion(null);
      return;
    }
    const inicio = performance.now();
    const cuadro = (ahora: number) => {
      const t = Math.min(1, (ahora - inicio) / DURACION_ANIMACION_MS);
      setAnimacion(t < 1 ? t : null);
      if (t < 1) id.current = requestAnimationFrame(cuadro);
    };
    cancelAnimationFrame(id.current);
    id.current = requestAnimationFrame(cuadro);
  }, []);
  useEffect(() => () => cancelAnimationFrame(id.current), []);
  const version = versiones?.[activa] ?? null;
  const restosM = version ? distanciaM(version.restos.inicio, version.restos.fin) : null;

  const edicion: EdicionMapa | null = useMemo(
    () =>
      paso === 3 && versiones
        ? {
            seleccion,
            onSeleccion: setSeleccion,
            onMover: (sel, p) => {
              setSeleccion(sel);
              setVersiones((vs) => {
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
          }
        : null,
    [paso, versiones, seleccion, activa],
  );

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
            declaracion: caso.declaracion.texto,
            lo_que_entiende_croquis: interpretacion.datos.map(
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
  const irA = useCallback(
    (n: number) => {
      const destino = Math.max(0, Math.min(PASOS.length - 1, n));
      pasoActual.current = destino;
      setPaso(destino);
      // La animación corre al entrar al paso 4 (y al cambiar de versión); fuera de él se detiene.
      if (destino === 3) animar();
      else cancelAnimationFrame(id.current);
      if (destino === 1 && !leido.current) {
        leido.current = true;
        void leerConIa();
      }
      if (destino === 7) void generarPdf();
    },
    [leerConIa, generarPdf, animar],
  );

  // Teclado: ← y → cambian de paso (salvo mientras se escribe en un campo).
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (enCampo(e.target) || detalle) return;
      if (e.key === "ArrowRight") irA(pasoActual.current + 1);
      if (e.key === "ArrowLeft") irA(pasoActual.current - 1);
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [detalle, irA]);

  const impactoKmh = resultados?.ebsReporte?.calculo.kmh ?? null;
  const desplazamientoKmh = resultados?.v3?.calculo.kmh ?? null;
  const frase = [
    `Siniestro ${caso.id} de ${caso.aseguradora}: alcance entre una ${caso.vehiculos.A.tipo} y una ${caso.vehiculos.B.tipo}; el conductor de A declara una reversa.`,
    "Croquis lee la declaración: subraya cada frase, la convierte en datos y pregunta lo que falta.",
    `El lugar: km ${caso.lugar.kilometro}, tramo Los Mochis–Navojoa. Marca el punto de impacto sobre la carretera federal 15.`,
    activa === "declarada"
      ? `Versión declarada: A retrocede ${reversaDibujada} m y B lo impacta; sin desplazamiento después.`
      : `Versión de la evidencia: B alcanza a A y la desplaza; los restos cubren ${caso.evidencia.restos.distancia_m.valor} m.`,
    "Los daños se acentúan a un lado (izquierdo en A, derecho en B); una reversa los dejaría al centro.",
    impactoKmh !== null && desplazamientoKmh !== null
      ? `${impactoKmh.toFixed(2)} km/h por los daños y ${desplazamientoKmh.toFixed(2)} km/h por el desplazamiento: ${resultados?.comparacion?.significativa ? "difieren" : "no difieren"} de forma significativa.`
      : "Los números del dictamen, calculados con el método de CESVI.",
    "Croquis sugiere una conclusión con tres razones; el perito acepta, edita o rechaza.",
    "El dictamen con la estructura de CESVI: revísalo, fírmalo y descárgalo.",
  ][paso]!;

  const tituloDetalle = paso === 5 ? "Ver cálculo" : "Ver detalle";
  const escena = [
    <PasoCaso key="caso" caso={caso} nombres={nombres} />,
    <PasoNarracion
      key="narracion"
      declaracion={caso.declaracion.texto}
      interpretacion={interpretacion}
      notas={notas}
      onNotas={setNotas}
      estado={estadoIa}
      onLeer={() => void leerConIa()}
      reversaM={respuestas.reversaM ?? null}
      onReversaM={cambiarReversa}
      onImpacta={(v) => setRespuestas((r) => ({ ...r, impacta: v }))}
    />,
    <PasoLugar
      key="lugar"
      marcado={versiones !== null}
      aviso={avisoLugar}
      msCalles={msCalles}
      onCoordenadas={(lat, lon) => fijarImpacto([lon, lat])}
    />,
    <PasoVersiones
      key="versiones"
      activa={activa}
      onActiva={(k) => {
        setActiva(k);
        animar();
      }}
      restosM={restosM}
      restosDictamen={caso.evidencia.restos.distancia_m.valor}
      nombres={nombres}
      seleccion={
        animacion === null && versiones ? describirSeleccion(seleccion, nombres, activa) : null
      }
      animando={animacion !== null}
      onRepetir={animar}
      onUsarRestos={() => {
        if (restosM === null) return;
        setDistancia({ valor: restosM.toFixed(2), fuente: "perito" });
        irA(5);
      }}
    />,
    <PasoDanos
      key="danos"
      nombres={nombres}
      zonas={zonas}
      onZonas={(l, z) => setZonas((zs) => ({ ...zs, [l]: z }))}
    />,
    <PasoNumeros
      key="numeros"
      impactoKmh={impactoKmh}
      desplazamientoKmh={desplazamientoKmh}
      nombres={nombres}
      comparacion={resultados?.comparacion ?? null}
    />,
    <PasoSugerencia
      key="sugerencia"
      sugerencia={sugerencia}
      pasoDeRazon={{ velocidades: 5, desplazamiento: 3, ubicacion_danos: 4 }}
      onIrA={irA}
      validacion={validacion}
      onValidar={setValidacion}
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
      validado={validacion !== null}
    />,
  ][paso];
  const sobreMapa = paso === 2 || paso === 3;
  // La pose que edita el panel: la elegida en el mapa (si se eligió el impacto o los restos, la
  // posición final de A).
  const poseElegida =
    seleccion.tipo === "pose" ? seleccion : ({ tipo: "pose", letra: "A", fase: "final" } as const);

  return (
    <div className="fixed inset-0 flex flex-col bg-fondo">
      <header className="flex flex-wrap items-center gap-4 border-b border-linea px-4 py-3 md:px-8">
        <Logotipo ancho={120} />
        <nav aria-label="Pasos del recorrido" className="flex flex-1 gap-1 overflow-x-auto">
          {PASOS.map((nombre, i) => (
            <button
              key={nombre}
              type="button"
              aria-current={paso === i ? "step" : undefined}
              onClick={() => irA(i)}
              className={`t-nota flex min-h-11 shrink-0 flex-col justify-end border-t-2 px-2 pt-1 text-left transition-colors ${
                paso === i
                  ? "border-accion text-texto"
                  : i < paso
                    ? "border-texto-3 text-texto-2"
                    : "border-linea text-texto-3"
              }`}
              data-testid={`paso-${i + 1}`}
            >
              <span className="cifras">{i + 1}</span>
              {nombre}
            </button>
          ))}
        </nav>
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
          medidas={MEDIDAS}
          nombres={nombres}
          animacion={paso === 3 ? animacion : null}
          edicion={edicion}
          onClic={(p) => {
            if (paso === 2 && !versiones) fijarImpacto(p);
          }}
          onCaptura={alCapturar}
          onConsultaCalles={alConsultarCalles}
          atenuado={!sobreMapa}
        />
        <div
          key={paso}
          className={`aparecer absolute inset-0 ${sobreMapa ? "pointer-events-none" : "bg-fondo/80"}`}
        >
          <div className="h-full">{escena}</div>
        </div>
      </main>

      <footer className="flex flex-wrap items-center gap-4 border-t border-linea px-4 py-3 md:px-8">
        <p className="t-interfaz min-w-0 flex-1" aria-live="polite" data-testid="frase">
          {frase}
        </p>
        <button
          type="button"
          className="boton-secundario min-h-11 px-4"
          onClick={() => setDetalle(true)}
          data-testid="ver-detalle"
        >
          {tituloDetalle}
        </button>
        <button
          type="button"
          className="boton-secundario min-h-11 px-4"
          onClick={() => irA(paso - 1)}
          disabled={paso === 0}
          aria-label="Paso anterior"
        >
          ←
        </button>
        <button
          type="button"
          className="boton-principal"
          onClick={() => irA(paso + 1)}
          disabled={paso === PASOS.length - 1}
          data-testid="siguiente"
        >
          Siguiente →
        </button>
      </footer>

      <PanelDetalle
        titulo={`${PASOS[paso]}: ${tituloDetalle.toLowerCase()}`}
        abierto={detalle}
        onCerrar={() => setDetalle(false)}
      >
        {paso === 0 ? <Expediente caso={caso} /> : null}
        {paso === 1 ? (
          <section className="flex flex-col gap-3">
            <h3 className="t-subtitulo">El orden de los hechos según la declaración</h3>
            <ol className="t-cuerpo flex list-decimal flex-col gap-1 pl-5">
              {interpretacion.hechos.map((h) => (
                <li key={h.orden}>
                  {h.texto}: «{h.frase.texto}»
                </li>
              ))}
            </ol>
            <p className="t-nota text-texto-2">
              La lectura usa la extracción de «Cuenta qué pasó» (
              {extraccion
                ? extraccion.metodo === "claude"
                  ? "con Claude"
                  : "con reglas"
                : "todavía sin leer"}
              ) y detectores para declaraciones de dictamen. La IA no produce números finales.
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
                    setVersiones((vs) =>
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
              En el mapa: toca o arrastra cualquier marca (posición inicial, impacto o final de cada
              vehículo, ✕ punto de impacto, R1 y R2 zona de restos).
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
  );
}
