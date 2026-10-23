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
import {
  comparar,
  conHuella,
  criteriosVacios,
  conPosicion,
  conRestos,
  escenaDeNarracion,
  medidasDe,
  posesDeImpacto,
  verificacionCesvi,
  type EscenaNarrada,
  type Expediente,
  type SalidaCorpus,
} from "@croquis/cesvi";
import type { OverpassResponse } from "@croquis/croquis-2d";
import type { ViewerExportApi } from "@croquis/viewer";
import type { Map as MapaMl } from "maplibre-gl";
import { useEffect, useMemo, useState } from "react";
import type { Hipotesis } from "@/components/visor/hypothesis-panel";
import {
  casoParaGuardar,
  leerCasoGuardado,
  type ReporteCesvi,
  type ValidacionPerito,
} from "@/lib/caso-guardado";
import { guardarCaso, idNuevo, type CasoExpediente } from "@/lib/casos";
import { avisarCambio } from "@/lib/casos-navegador";
import type { DatosDictamenCaso } from "@/lib/dictamen-caso";
import { callesCerca } from "@/lib/calles-del-mapa";
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
import { useTema, type Modo } from "@/lib/preferencias-cesvi";
import ejemplo from "../../../../../../data/cesvi/grabaciones/escenas/cesvi-e814f085db.json";
import { Calculos, type DistanciaRestos } from "../calculos";
import { Criterios } from "../correspondencia";
import { Expediente as ExpedienteCesvi } from "../expediente";
import { ComparacionDeclaracion } from "../comparacion-declaracion";
import { DictamenCaso } from "../dictamen-caso";
import { CargaReporte } from "../importar-dictamen";
import { BarraRecorrido, PASOS, PASOS_CORTOS } from "../recorrido/barra";
import { Reproduccion } from "../reproduccion";
import {
  PasoCaso,
  PasoContraReporte,
  PasoDanos,
  PasoHecho,
  PasoLugar,
  PasoNumeros,
  type ItemLugar,
} from "./pasos";
import { MapaEscena, type HerramientaMapa, type HuellaMapa } from "./piezas";
import {
  PanelReconstruccion,
  useReconstruccion,
  Visor3dCaso,
  type PosicionMovil,
} from "./reconstruccion";

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

export function RecorridoCaso({ inicial }: { inicial: CasoExpediente }) {
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
  const [noSe, setNoSe] = useState<Set<string>>(new Set());
  // El paso del lugar (V2): la herramienta del mapa, el elemento elegido de la lista guiada, el
  // punto y el rumbo de cada impacto (para su flecha), lo que se deshace y lo último medido.
  const [herramientaMapa, setHerramientaMapa] = useState<HerramientaMapa>("colocar");
  const [elegido, setElegido] = useState<ItemLugar | null>(null);
  const [puntosImpacto, setPuntosImpacto] = useState<Record<number, { lat: number; lon: number }>>(
    {},
  );
  const [rumbosImpacto, setRumbosImpacto] = useState<Record<number, number>>({});
  const [historial, setHistorial] = useState<Expediente[]>([]);
  const [calles, setCalles] = useState<OverpassResponse | null>(null);
  const [medida, setMedida] = useState<number | null>(null);
  const [mapa, setMapa] = useState<MapaMl | null>(null);
  const [moviles, setMoviles] = useState<PosicionMovil[]>([]);
  const [vista, setVista] = useState<"mapa" | "3d">("mapa");
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
  const r = rec.r;

  // Un caso con reporte se lee del reporte: su narración no se edita ni va al dictamen.
  const editable = reporte === null;
  const narracion = editable ? texto.trim() || null : null;
  const pasos = PASOS.filter((_, i) => i !== 6 || reporte !== null);
  const cortos = PASOS_CORTOS.filter((_, i) => i !== 6 || reporte !== null);
  const clave = (i: number) => PASOS.indexOf(pasos[i]!);
  const actual = clave(paso);
  const irA = (i: number) => setPaso(Math.max(0, Math.min(pasos.length - 1, i)));

  const evidencia = expediente?.versiones?.find((v) => v.tipo === "evidencia");
  const posiciones = useMemo(() => evidencia?.posiciones ?? [], [evidencia]);
  const verificacion = useMemo(
    () => (expediente ? verificacionCesvi(expediente) : []),
    [expediente],
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
  const preguntas = (leida?.preguntas ?? []).filter((p) => {
    if (noSe.has(p.clave) || !expediente) return false;
    if (p.clave === "impacto-propuesto")
      return expediente.impactos?.some((i) => i.fuente === "supuesto");
    if (p.clave.startsWith("masa-"))
      return !expediente.vehiculos.find((v) => v.id === p.vehiculo)?.masa;
    if (p.clave === "restos") return !expediente.evidencias?.restos?.longitud;
    if (p.clave.startsWith("final-"))
      return !posiciones.some((x) => x.vehiculo === p.vehiculo && x.fase === "final");
    return true;
  });

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

  const leer = async () => {
    setEstado("Leyendo la narración…");
    try {
      const res = await fetch("/api/cesvi/escena", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto }),
      });
      const d = (await res.json()) as { metodo?: string; motivo?: string; salida?: SalidaCorpus };
      if (d.metodo !== "claude" || !d.salida) {
        setEstado(`No se pudo leer con Claude (${d.motivo ?? "sin respuesta"}).`);
        return;
      }
      abrirEscena(escenaDeNarracion(d.salida, texto));
      setEstado(null);
    } catch {
      setEstado("No se pudo leer la narración.");
    }
  };

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
        ...expediente.vehiculos.map((v): ItemLugar => ({ tipo: "final", vehiculo: v.id })),
      ]
    : [];
  const opcionales: ItemLugar[] = expediente
    ? expediente.vehiculos.map((v): ItemLugar => ({ tipo: "inicial", vehiculo: v.id }))
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
  const origenCalles = puntoDe(1);
  const claveCalles = origenCalles
    ? `${origenCalles.lon.toFixed(3)},${origenCalles.lat.toFixed(3)}`
    : null;
  useEffect(() => {
    if (!claveCalles) return;
    const [lon, lat] = claveCalles.split(",").map(Number) as [number, number];
    let vivo = true;
    void callesCerca([lon, lat]).then((c) => {
      if (vivo) setCalles(c);
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
  const nombreItem = (i: ItemLugar) => {
    if (i.tipo === "impacto")
      return impactos.length > 1 ? `Punto del impacto ${i.orden}` : "Punto de impacto";
    const v = expediente?.vehiculos.find((x) => x.id === i.vehiculo);
    const marca = v?.marca?.valor ? ` · ${v.marca.valor}` : "";
    return `${i.vehiculo}${marca} · ${i.tipo === "final" ? "dónde quedó" : "dónde venía"}`;
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
      r = conPosicion(r, { vehiculo: p.vehiculo, fase: "impacto", punto: p.punto, rumbo: p.rumbo });
    }
    return r;
  };
  const colocar = (punto: { lat: number; lon: number }) => {
    // Se coloca en el paso del lugar y al trabajar; al presentar el mapa solo se mira.
    if (modo !== "trabajar" || actual !== 2 || !expediente || !activo) return;
    setHistorial((h) => [...h, expediente]);
    if (activo.tipo === "impacto") {
      const r = rumboDeItem(activo) ?? 0;
      setPuntosImpacto((m) => ({ ...m, [activo.orden]: punto }));
      // Si el mapa está lejos (a nivel de colonia o más), se acerca al punto para ver los vehículos.
      if (mapa && mapa.getZoom() < 17) mapa.easeTo({ center: [punto.lon, punto.lat], zoom: 19 });
      setRumbosImpacto((m) => ({ ...m, [activo.orden]: r }));
      cambiarExpediente(conImpacto(expediente, activo.orden, punto, r));
    } else {
      const r = rumboDeItem(activo) ?? poseDe(activo.vehiculo, "impacto")?.rumbo ?? 0;
      cambiarExpediente(
        conPosicion(expediente, { vehiculo: activo.vehiculo, fase: activo.tipo, punto, rumbo: r }),
      );
    }
    // Se queda activo para girar su flecha; «Listo» pasa al siguiente.
    setElegido(activo);
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
            color: colorDeVehiculo(p.vehiculo),
          },
        ];
      })
    : [];
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
        <button type="button" className="boton-principal" onClick={() => irA(1)}>
          Narrar el hecho
        </button>
        <label className="boton-secundario cursor-pointer">
          Abrir un archivo de caso
          <input
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void abrirArchivo(f);
              e.target.value = "";
            }}
            data-testid="abrir-caso"
          />
        </label>
      </div>
    ) : null;

  const sinEscena = (
    <p className="t-nota" data-testid="sin-escena">
      {inicial.origen === "importado"
        ? "Primero carga el reporte en el paso «El caso»."
        : "Primero narra el hecho y léelo en el paso «El hecho»."}
    </p>
  );

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
    if (actual === 1)
      return (
        <PasoHecho
          narracion={texto}
          editable={editable}
          onNarracion={setTexto}
          onLeer={() => void leer()}
          onEjemplo={() => setTexto(ejemplo.narracion)}
          estado={estado}
          escena={leida}
          preguntas={preguntas}
          onExpediente={cambiarExpediente}
          onNoSe={(c) => setNoSe((s) => new Set([...s, c]))}
        />
      );
    if (!expediente || !leida) return sinEscena;
    if (actual === 2)
      return (
        <PasoLugar
          expediente={expediente}
          escena={leida}
          requeridos={requeridos}
          opcionales={opcionales}
          colocado={colocado}
          activo={activo}
          onActivo={setElegido}
          rumboActivo={activo ? rumboDeItem(activo) : null}
          onRumbo={girar}
          onListo={() => setElegido(null)}
          nombreItem={nombreItem}
          colorItem={colorItem}
          medida={medida}
          onUsarMedida={(destino) => {
            if (medida === null) return;
            setHistorial((h) => [...h, expediente]);
            cambiarExpediente(
              destino === "restos"
                ? conRestos(expediente, Number(medida.toFixed(2)))
                : conHuella(expediente, destino.vehiculo, Number(medida.toFixed(2))),
            );
          }}
        />
      );
    if (actual === 3)
      return (
        <div className="flex flex-col gap-5">
          <PanelReconstruccion
            rec={rec}
            ver3d={vista === "3d"}
            onVer3d={(v) => {
              if (!v) setMoviles([]);
              setVista(v ? "3d" : "mapa");
            }}
          />
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
        </div>
      );
    if (actual === 4)
      return (
        <div className="flex flex-col gap-8">
          <PasoDanos expediente={expediente} r={r} />
          {inicial.ejemplo ? (
            <section className="flex flex-col gap-4" data-testid="criterios-axa">
              <h3 className="t-subtitulo">Correspondencia de los daños (método de CESVI)</h3>
              {(["A", "B"] as const).map((l) => (
                <Criterios
                  key={l}
                  letra={l}
                  valores={criterios[l]}
                  onCambio={(clave, v) =>
                    setCriterios((c) => ({ ...c, [l]: { ...c[l], [clave]: v } }))
                  }
                />
              ))}
            </section>
          ) : null}
        </div>
      );
    if (actual === 5)
      return (
        <div className="flex flex-col gap-8">
          <PasoNumeros r={r} verificacion={verificacion} />
          {inicial.ejemplo ? (
            <Calculos caso={inicial.ejemplo} distancia={distancia} onDistancia={setDistancia} />
          ) : null}
        </div>
      );
    if (actual === 6 && reporte && comparacionReporte)
      return (
        <div className="flex flex-col gap-8">
          <PasoContraReporte reporte={reporte} comparacion={comparacionReporte} />
          {inicial.ejemplo ? <Reproduccion caso={inicial.ejemplo} /> : null}
        </div>
      );
    return (
      <div className="flex flex-col gap-5">
        <h2 className="t-subtitulo">El dictamen</h2>
        {r ? (
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
          />
        ) : (
          <p className="t-nota">Reconstruye en «La reconstrucción» para armar el dictamen.</p>
        )}
        <div className="solo-trabajar flex flex-col gap-3 border-t border-linea-suave pt-4">
          <h3 className="t-interfaz font-semibold">El caso</h3>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="boton-secundario"
              onClick={guardarEnEquipo}
              data-testid="guardar-en-equipo"
            >
              Guardar en este equipo
            </button>
            <button
              type="button"
              className="boton-secundario"
              onClick={() => {
                const a = archivoCaso();
                if (!a) return;
                downloadBytes(
                  new TextEncoder().encode(
                    `${JSON.stringify(a, null, 2)}\n`,
                  ) as Uint8Array<ArrayBuffer>,
                  "caso-croquis.json",
                  "application/json",
                );
              }}
              data-testid="guardar-caso"
            >
              Descargar el archivo del caso
            </button>
          </div>
          {avisoGuardado ? (
            <p role="status" className="t-nota" data-testid="aviso-guardado">
              {avisoGuardado}
            </p>
          ) : null}
        </div>
      </div>
    );
  })();

  const verMapa = vista === "mapa" || !r;
  // Lo obligatorio de cada paso (V2): «Siguiente» dice qué falta y los pasos futuros esperan.
  const claves = pasos.map((n) => CLAVES_PASOS[PASOS.indexOf(n)]!);
  const estadoPasos = {
    esperaReporte: inicial.origen === "importado" && !leida,
    expediente,
    reconstruido: r !== null && !rec.vieja,
  };
  const falta = faltaEnPaso(claves[paso]!, estadoPasos);
  const abierto = (i: number) => pasoAbierto(claves, i, estadoPasos);
  const siguienteNombre = pasos[paso + 1];
  // El mapa es el contenido en el lugar y la reconstrucción; en los demás pasos, una tarjeta.
  const grande = actual === 2 || actual === 3;
  const lugar = expediente?.caso.lugar;
  const lugarTexto = [lugar?.descripcion?.valor, lugar?.municipio?.valor, lugar?.estado?.valor]
    .filter(Boolean)
    .join(", ");
  const textoSiguiente = siguienteNombre
    ? `Siguiente: ${siguienteNombre.charAt(0).toLowerCase()}${siguienteNombre.slice(1)} →`
    : "";
  return (
    <div
      className="fixed inset-0 flex flex-col bg-fondo text-texto"
      data-tema={tema}
      data-modo={modo}
      data-testid="recorrido-caso"
      data-origen={inicial.origen}
    >
      <BarraRecorrido
        pasos={pasos}
        pasosCortos={cortos}
        paso={paso}
        irA={(i) => {
          if (i <= paso || abierto(i)) irA(i);
        }}
        abierto={abierto}
        modo={modo}
        onModo={setModo}
        tema={tema}
        resumen={titulo}
        onExportar={() => {
          if (!abierto(pasos.length - 1)) return;
          setModo("presentar");
          irA(pasos.length - 1);
        }}
      />
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-4 md:p-7 lg:flex-row lg:overflow-hidden">
        <main
          className={`flex min-h-0 min-w-0 flex-col gap-5 lg:overflow-y-auto ${grande ? "lg:w-[440px] lg:shrink-0" : "lg:flex-1"}`}
          aria-label={pasos[paso]}
          data-testid="panel-paso"
          data-paso={actual + 1}
        >
          <p className="t-rotulo">
            Paso {paso + 1} de {pasos.length} · {pasos[paso]}
          </p>
          {cuerpo}
          <div className="mt-auto flex flex-col gap-2 pt-4">
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
                data-testid="anterior"
              >
                ← Anterior
              </button>
              {siguienteNombre ? (
                <button
                  type="button"
                  className="boton-principal"
                  onClick={() => irA(paso + 1)}
                  disabled={falta.length > 0}
                  data-testid="siguiente"
                >
                  {textoSiguiente}
                </button>
              ) : null}
            </div>
          </div>
        </main>
        <section
          className={
            expandido
              ? "fixed inset-0 z-40 bg-fondo"
              : `relative min-h-[50vh] overflow-hidden rounded-panel border border-linea-suave ${grande ? "lg:flex-1" : "lg:h-[460px] lg:w-[420px] lg:shrink-0 lg:self-start"}`
          }
          aria-label="Mapa"
          data-testid="escenario"
          data-expandido={expandido ? "si" : "no"}
        >
          <div className={`absolute inset-0 ${verMapa ? "" : "invisible"}`}>
            <MapaEscena
              tema={tema}
              onMapa={setMapa}
              posiciones={posiciones}
              moviles={moviles}
              impactos={rec.impactos}
              onClic={colocar}
              inicio={lugar?.coordenadas ?? null}
              lugarTexto={lugarTexto}
              herramienta={actual === 2 && modo === "trabajar" ? herramientaMapa : "mover"}
              pedirLugar={actual === 2 || expandido}
              huellas={huellas}
              flecha={flecha}
              onFlecha={girar}
              onMedida={setMedida}
              onDeshacer={actual === 2 && modo === "trabajar" ? deshacer : undefined}
            />
          </div>
          {r ? (
            <div
              className={`absolute inset-0 bg-fondo ${verMapa ? "pointer-events-none invisible" : ""}`}
            >
              <Visor3dCaso
                r={r}
                declarada={declarada}
                onExportApi={setExportApi}
                onPosiciones={setMoviles}
                calles={calles}
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
              className={`absolute z-10 flex flex-col gap-2 ${expandido ? "top-5 left-1/2 -translate-x-1/2 items-center" : "top-3 left-3 items-start"}`}
            >
              <div className="segmentado" role="tablist" aria-label="Herramienta del mapa">
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
                <p className="vidrio t-nota rounded-control px-3 py-1.5">
                  En «Colocar» el mapa no se mueve. Mantén Espacio para moverlo.
                </p>
              ) : herramientaMapa === "medir" ? (
                <p className="vidrio t-nota rounded-control px-3 py-1.5">
                  Toca los dos extremos de lo que mides.
                </p>
              ) : null}
            </div>
          ) : null}
          <div className="absolute top-3 right-3 z-10 flex gap-2">
            {r ? (
              <div className="segmentado" role="tablist" aria-label="Vista">
                {(["mapa", "3d"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    role="tab"
                    aria-selected={vista === v}
                    className="px-3"
                    onClick={() => {
                      if (v === "mapa") setMoviles([]);
                      setVista(v);
                    }}
                    data-testid={`vista-${v}`}
                  >
                    {v === "mapa" ? "Mapa" : "3D"}
                  </button>
                ))}
              </div>
            ) : null}
            <button
              type="button"
              className="vidrio rounded-full px-4 py-2 text-[0.8125rem] font-medium"
              onClick={() => setExpandido(!expandido)}
              data-testid={expandido ? "contraer-mapa" : "expandir-mapa"}
            >
              {expandido ? "⤡ Contraer · Esc" : "⤢ Expandir"}
            </button>
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
                  </button>
                </div>
              ) : null}
            </>
          ) : (
            <p className="vidrio pointer-events-none absolute right-3 bottom-3 z-10 px-2 py-1 text-[0.6875rem] text-texto-2">
              Reconstrucción de apoyo · el dictamen es del perito.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
