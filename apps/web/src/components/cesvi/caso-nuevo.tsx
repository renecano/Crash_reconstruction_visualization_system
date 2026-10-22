"use client";
/**
 * «Caso nuevo» (R1, ADR 0061): el perito narra el hecho, Croquis lo lee a escena del contrato 2.0.0
 * (N vehículos, M impactos, evidencias), pregunta solo lo que más cambia la reconstrucción y el
 * perito coloca cada vehículo en el mapa. Lo que marca el perito lleva fuente «perito»; lo que
 * supone Croquis, «supuesto», hasta que el perito lo confirma. El caso de AXA sigue en `/cesvi`.
 */
import {
  confirmarImpacto,
  conMasa,
  conPosicion,
  conRestos,
  escenaDeNarracion,
  problemasExpediente,
  type EscenaNarrada,
  type Expediente,
  type PreguntaEscena,
  type SalidaCorpus,
} from "@croquis/cesvi";
import type { Map as MapaMl, Marker } from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";
import { downloadBytes } from "@/lib/download";
import ejemplo from "../../../../../data/cesvi/grabaciones/escenas/cesvi-e814f085db.json";
import { ESTILO_MAPA_CLARO, marcador } from "./mapa-comun";

type Id = Expediente["vehiculos"][number]["id"];
type Fase = "impacto" | "final";

const NOMBRE_FASE: Record<Fase, string> = { impacto: "en el impacto", final: "posición final" };
const CARA: Record<string, string> = {
  frontal: "frontal",
  posterior: "posterior",
  lateral_izquierdo: "lateral izquierdo",
  lateral_derecho: "lateral derecho",
  techo: "techo",
  inferior: "inferior",
};

function Fuente({ f }: { f?: string }) {
  if (!f) return null;
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[0.6875rem] font-medium ${f === "supuesto" ? "bg-[var(--falta-fondo)] text-senal-texto" : "bg-superficie-alta text-texto-2"}`}
    >
      {f}
    </span>
  );
}

/** El mapa donde el perito coloca a cada vehículo: un clic pone lo elegido en la herramienta. */
function MapaEscena({
  posiciones,
  onClic,
}: {
  posiciones: { vehiculo: Id; fase: string; punto: { lat: number; lon: number } }[];
  onClic: (p: { lat: number; lon: number }) => void;
}) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapaMl | null>(null);
  const marcas = useRef<Marker[]>([]);
  const [listo, setListo] = useState(false);
  const clic = useRef(onClic);
  useEffect(() => {
    clic.current = onClic;
  }, [onClic]);
  useEffect(() => {
    let vivo = true;
    let instancia: MapaMl | null = null;
    void import("maplibre-gl").then(({ Map, getVersion, setWorkerUrl }) => {
      if (!vivo || !contenedor.current) return;
      setWorkerUrl(`/maplibre/worker-${getVersion()}.mjs`);
      instancia = new Map({
        container: contenedor.current,
        style: ESTILO_MAPA_CLARO,
        center: [-99.13, 19.43],
        zoom: 11,
        attributionControl: false,
      });
      instancia.on("click", (e) => clic.current({ lat: e.lngLat.lat, lon: e.lngLat.lng }));
      instancia.on("load", () => {
        if (!vivo) return;
        mapa.current = instancia;
        setListo(true);
      });
    });
    return () => {
      vivo = false;
      instancia?.remove();
      mapa.current = null;
    };
  }, []);
  useEffect(() => {
    const m = mapa.current;
    if (!m || !listo) return;
    void import("maplibre-gl").then(({ Marker }) => {
      for (const x of marcas.current) x.remove();
      marcas.current = posiciones.map((p) =>
        new Marker({
          element: marcador(
            `${p.vehiculo} · ${p.fase === "final" ? "final" : "impacto"}`,
            "punto-mapa",
          ),
        })
          .setLngLat([p.punto.lon, p.punto.lat])
          .addTo(m),
      );
    });
  }, [posiciones, listo]);
  return (
    <div className="relative h-[420px] overflow-hidden rounded-panel border border-linea-suave">
      <div ref={contenedor} className="absolute inset-0" data-testid="mapa-escena" />
      <p className="vidrio pointer-events-none absolute right-3 bottom-3 px-2 py-1 text-[0.6875rem] text-texto-3">
        © OpenStreetMap · OpenFreeMap · OpenMapTiles
      </p>
    </div>
  );
}

function Pregunta({
  p,
  expediente,
  onCambio,
  onNoSe,
}: {
  p: PreguntaEscena;
  expediente: Expediente;
  onCambio: (e: Expediente) => void;
  onNoSe: () => void;
}) {
  const [valor, setValor] = useState("");
  const numero = Number(valor.replace(",", "."));
  const aplicar = () => {
    if (!(numero > 0)) return;
    if (p.clave.startsWith("masa-") && p.vehiculo)
      onCambio(conMasa(expediente, p.vehiculo, numero));
    if (p.clave === "restos") onCambio(conRestos(expediente, numero));
  };
  const numerica = p.clave.startsWith("masa-") || p.clave === "restos";
  return (
    <li className="hundido flex flex-col gap-2 p-4" data-testid={`pregunta-${p.clave}`}>
      <p className="t-interfaz font-medium">{p.texto}</p>
      <p className="t-nota">{p.porQue}</p>
      <div className="flex flex-wrap items-center gap-2">
        {p.clave === "impacto-propuesto" && p.impacto ? (
          <button
            type="button"
            className="boton-principal boton-compacto"
            onClick={() => onCambio(confirmarImpacto(expediente, p.impacto!))}
            data-testid="confirmar-impacto"
          >
            Sí, confirmar
          </button>
        ) : null}
        {numerica ? (
          <>
            <input
              className="campo h-10 w-32"
              inputMode="decimal"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              aria-label={p.clave === "restos" ? "Longitud en metros" : "Masa en kilogramos"}
              data-testid={`valor-${p.clave}`}
            />
            <span className="t-nota">{p.clave === "restos" ? "m" : "kg"}</span>
            <button type="button" className="boton-secundario boton-compacto" onClick={aplicar}>
              Usar
            </button>
          </>
        ) : null}
        <button
          type="button"
          className="boton-secundario boton-compacto text-texto-2"
          onClick={onNoSe}
          data-testid={`no-se-${p.clave}`}
        >
          No sé
        </button>
      </div>
    </li>
  );
}

export function CasoNuevo() {
  const [texto, setTexto] = useState("");
  const [estado, setEstado] = useState<string | null>(null);
  const [leida, setLeida] = useState<EscenaNarrada | null>(null);
  const [expediente, setExpediente] = useState<Expediente | null>(null);
  const [noSe, setNoSe] = useState<Set<string>>(new Set());
  const [herramienta, setHerramienta] = useState<{ vehiculo: Id; fase: Fase } | null>(null);
  const [rumbo, setRumbo] = useState("");

  const leer = async () => {
    setEstado("Leyendo la narración…");
    try {
      const r = await fetch("/api/cesvi/escena", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto }),
      });
      const d = (await r.json()) as { metodo?: string; motivo?: string; salida?: SalidaCorpus };
      if (d.metodo !== "claude" || !d.salida) {
        setEstado(`No se pudo leer con Claude (${d.motivo ?? "sin respuesta"}).`);
        return;
      }
      const e = escenaDeNarracion(d.salida, texto);
      setLeida(e);
      setExpediente(e.expediente);
      setNoSe(new Set());
      const primero = e.expediente.vehiculos[0];
      setHerramienta(primero ? { vehiculo: primero.id, fase: "final" } : null);
      setEstado(null);
    } catch {
      setEstado("No se pudo leer la narración.");
    }
  };

  const evidencia = expediente?.versiones?.find((v) => v.tipo === "evidencia");
  const posiciones = useMemo(() => evidencia?.posiciones ?? [], [evidencia]);
  const problemas = expediente ? problemasExpediente(expediente) : [];
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
  const rumboNum = Number(rumbo.replace(",", "."));
  const colocar = (punto: { lat: number; lon: number }) => {
    if (!expediente || !herramienta || rumbo.trim() === "" || !Number.isFinite(rumboNum)) return;
    setExpediente(conPosicion(expediente, { ...herramienta, punto, rumbo: rumboNum }));
  };

  return (
    <main
      className="min-h-screen bg-fondo px-4 py-10 text-texto md:px-8"
      data-tema="claro"
      data-testid="caso-nuevo"
    >
      <div className="mx-auto flex max-w-[1200px] flex-col gap-8">
        <header className="flex flex-col gap-3">
          <p className="t-rotulo">Caso nuevo · reconstrucción de apoyo</p>
          <h1 className="t-titulo">Narra el hecho</h1>
          <p className="t-cuerpo max-w-[70ch] text-texto-2">
            Escribe la narración técnica como en un dictamen: lugar, vehículos, daños, restos,
            huellas y posiciones. Croquis la ordena en la escena y pregunta solo lo que más cambia
            la reconstrucción. La IA no produce números: los que no están en tu texto se descartan.
          </p>
        </header>

        <section className="tarjeta flex flex-col gap-3 p-6">
          <textarea
            className="campo min-h-48"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            aria-label="Narración técnica del perito"
            data-testid="narracion"
          />
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="boton-principal"
              onClick={() => void leer()}
              disabled={texto.trim().length < 20}
              data-testid="leer-narracion"
            >
              Leer la narración
            </button>
            <button
              type="button"
              className="boton-secundario"
              onClick={() => setTexto(ejemplo.narracion)}
              data-testid="ejemplo-narracion"
            >
              Usar una narración de ejemplo
            </button>
            {estado ? (
              <span role="status" className="t-nota">
                {estado}
              </span>
            ) : null}
          </div>
        </section>

        {expediente && leida ? (
          <>
            <section className="grid gap-6 lg:grid-cols-2" data-testid="escena">
              <div className="tarjeta flex flex-col gap-4 p-6">
                <h2 className="t-subtitulo">
                  {expediente.vehiculos.length} vehículo
                  {expediente.vehiculos.length === 1 ? "" : "s"} ·{" "}
                  {expediente.impactos?.length ?? 0} impacto
                  {(expediente.impactos?.length ?? 0) === 1 ? "" : "s"}
                </h2>
                <ul className="flex flex-col gap-3" data-testid="vehiculos">
                  {expediente.vehiculos.map((v) => (
                    <li key={v.id} className="flex flex-col gap-1">
                      <span className="t-interfaz font-semibold">
                        {v.id} ·{" "}
                        {[v.marca?.valor, v.modelo?.valor, v.anio].filter(Boolean).join(" ") ||
                          "sin datos"}
                      </span>
                      <span className="t-nota">
                        Daños:{" "}
                        {(expediente.danos ?? [])
                          .filter((d) => d.vehiculo === v.id)
                          .map((d) => CARA[d.zona.cara] ?? d.zona.cara)
                          .filter((x, i, xs) => xs.indexOf(x) === i)
                          .join(", ") || "no narrados"}
                        {" · "}masa:{" "}
                        {v.masa ? (
                          <>
                            {v.masa.valor} {v.masa.unidad} <Fuente f={v.masa.fuente} />
                          </>
                        ) : (
                          "falta"
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
                <ul className="flex flex-col gap-2" data-testid="impactos">
                  {(expediente.impactos ?? []).map((i) => (
                    <li key={i.orden} className="t-interfaz flex flex-wrap items-center gap-2">
                      Impacto {i.orden}: {(i.vehiculos ?? []).join(" y ")}
                      {i.objeto_fijo ? ` contra ${i.objeto_fijo}` : ""}
                      {i.zonas?.length
                        ? ` (${i.zonas.map((z) => `${z.vehiculo} ${CARA[z.zona.cara] ?? z.zona.cara}`).join(", ")})`
                        : ""}
                      <Fuente f={i.fuente} />
                    </li>
                  ))}
                </ul>
                {leida.posiciones.length ? (
                  <ul className="t-nota flex flex-col gap-1">
                    {leida.posiciones.map((p, k) => (
                      <li key={k}>
                        {p.vehiculo}, {p.fase}: {p.descripcion}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <p className="t-nota" data-testid="validez">
                  {problemas.length
                    ? `La escena tiene ${problemas.length} problema${problemas.length === 1 ? "" : "s"}: ${problemas.join("; ")}`
                    : "La escena es válida contra el contrato."}
                </p>
              </div>
              <div className="tarjeta flex flex-col gap-4 p-6">
                <h2 className="t-subtitulo">Lo que más cambia la reconstrucción</h2>
                {preguntas.length ? (
                  <ol className="flex flex-col gap-3">
                    {preguntas.map((p) => (
                      <Pregunta
                        key={p.clave}
                        p={p}
                        expediente={expediente}
                        onCambio={setExpediente}
                        onNoSe={() => setNoSe((s) => new Set([...s, p.clave]))}
                      />
                    ))}
                  </ol>
                ) : (
                  <p className="t-nota" data-testid="sin-preguntas">
                    No falta nada que pregunte Croquis.
                  </p>
                )}
              </div>
            </section>

            <section className="tarjeta flex flex-col gap-4 p-6">
              <div className="flex flex-wrap items-end gap-4">
                <h2 className="t-subtitulo">Coloca a cada vehículo en el mapa</h2>
                <label className="t-nota flex flex-col gap-1">
                  Vehículo y fase
                  <select
                    className="campo h-10"
                    value={herramienta ? `${herramienta.vehiculo}:${herramienta.fase}` : ""}
                    onChange={(e) => {
                      const [vehiculo, fase] = e.target.value.split(":") as [Id, Fase];
                      setHerramienta({ vehiculo, fase });
                    }}
                    data-testid="herramienta-escena"
                  >
                    {expediente.vehiculos.flatMap((v) =>
                      (["impacto", "final"] as const).map((f) => (
                        <option key={`${v.id}:${f}`} value={`${v.id}:${f}`}>
                          {v.id} · {NOMBRE_FASE[f]}
                        </option>
                      )),
                    )}
                  </select>
                </label>
                <label className="t-nota flex flex-col gap-1">
                  Rumbo del frente (°)
                  <input
                    className="campo h-10 w-28"
                    inputMode="decimal"
                    value={rumbo}
                    onChange={(e) => setRumbo(e.target.value)}
                    data-testid="rumbo-escena"
                  />
                </label>
                <p className="t-nota">
                  {rumbo.trim() === ""
                    ? "Escribe el rumbo y toca el mapa."
                    : "Toca el mapa para colocar."}
                </p>
              </div>
              <MapaEscena posiciones={posiciones} onClic={colocar} />
              <p className="t-nota" data-testid="colocados">
                {posiciones.length} posición{posiciones.length === 1 ? "" : "es"} colocada
                {posiciones.length === 1 ? "" : "s"} por el perito.
              </p>
              <button
                type="button"
                className="boton-secundario self-start"
                onClick={() =>
                  downloadBytes(
                    new TextEncoder().encode(
                      `${JSON.stringify({ expediente, posiciones_descritas: leida.posiciones }, null, 2)}\n`,
                    ) as Uint8Array<ArrayBuffer>,
                    "escena.json",
                    "application/json",
                  )
                }
                data-testid="descargar-escena"
              >
                Descargar la escena (JSON)
              </button>
            </section>
          </>
        ) : null}
        <p className="t-nota text-texto-3">Reconstrucción de apoyo · el dictamen es del perito.</p>
      </div>
    </main>
  );
}
