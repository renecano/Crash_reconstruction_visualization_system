"use client";
/**
 * La escena, rehecha desde cero (René, 2026-11-05, tras la prueba con personas T4): que la entienda
 * un niño. Una pregunta a la vez, en palabras de todos los días; Croquis propone primero a partir de
 * la narración y la persona confirma con un toque. Referencia: `docs/cesvi/rediseno/escena-facil/`.
 *
 * Guarda lo mismo de antes en el expediente (posiciones, rumbos y la bandera de supuesto): el
 * solver no cambia. La lógica sin interfaz está en `lib/escena-facil.ts`.
 */
import {
  conHuella,
  conPosicion,
  conRestos,
  distanciaM,
  medidasDe,
  posicionesEncimadas,
  type Expediente,
  type PosicionDescrita,
} from "@croquis/cesvi";
import type { OverpassResponse } from "@croquis/croquis-2d";
import type { Map as MapaMl } from "maplibre-gl";
import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  ajustarACalle,
  callesDe,
  callesEn,
  choqueLejosDeCalles,
  coloresVehiculos,
  contraNarracion,
  elegirDireccion,
  flechaPropuesta,
  flechasDeLlegada,
  fueraDeLaCalle,
  girar,
  marcarChoque,
  marcarFinal,
  nombresDe,
  nombreVehiculo,
  pasoActual,
  pasosEscena,
  poseDe,
  ponerEnLaCalle,
  proponerChoque,
  quedoJuntoAlChoque,
  resumenEscena,
  rumboAlineado,
  sentidoNarrado,
  sinFinal,
  textoChoqueListo,
  textoFlecha,
  textoSentido,
  type ImpactoAColocar,
  type Punto,
} from "@/lib/escena-facil";
import { siluetaClase } from "@/lib/colocar";
import { interpretarLugar } from "@/lib/lugar-texto";
import { MapaFacil, trayectoDeLlegada, type CocheMapa, type FlechaMapa } from "./mapa-facil";

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
}

type Mensaje = {
  tipo: "exito" | "alerta" | "error";
  texto: string;
  /** Una clave para no repetir una alerta que la persona ya descartó. */
  clave?: string;
  acciones?: { texto: string; hacer: () => void; principal?: boolean; id: string }[];
  deshacer?: boolean;
};

export function EscenaFacil({
  tema,
  estado,
  onEstado,
  impactos,
  narracion,
  posicionesNarradas,
  calles,
  callesFallaron,
  lugar,
  zona,
  onBuscarCalles,
  onVerReconstruccion,
  onNota,
}: {
  tema: "claro" | "oscuro";
  estado: EstadoEscena;
  onEstado: (e: EstadoEscena) => void;
  impactos: readonly ImpactoAColocar[];
  narracion: string | null;
  /** Lo que la narración dice de cada posición (para citarlo junto a la pregunta). */
  posicionesNarradas: readonly PosicionDescrita[];
  calles: OverpassResponse | null;
  /** No llegaron las calles del mapa (sin red o el servicio no respondió). */
  callesFallaron: boolean;
  lugar: Punto | null;
  zona: { municipio?: string; estado?: string };
  /** Pide las calles alrededor de un punto (el lugar buscado). */
  onBuscarCalles: (p: Punto) => void;
  onVerReconstruccion: () => void;
  /** Lo que decide la persona y conviene anotar en la bitácora («No sé dónde quedó…»). */
  onNota: (texto: string) => void;
}) {
  const e = estado.expediente;
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
        vehiculos.map((v) => [
          v.id,
          narracion ? sentidoNarrado(narracion, nombresDe(v, vehiculos)) : null,
        ]),
      ),
    [vehiculos, narracion],
  );
  const pasos = pasosEscena(e, impactos, estado);
  // Mientras coloca dónde quedó un coche, ese paso sigue abierto hasta «Listo, así quedó».
  const [colocando, setColocando] = useState<string | null>(null);
  const [editando, setEditando] = useState<{
    tipo: "choque" | "direccion" | "final";
    id: string;
  } | null>(null);
  const [opcionFinal, setOpcionFinal] = useState<Record<string, "marcar" | "junto" | "nose">>({});
  const [marcoYo, setMarcoYo] = useState(false);
  const [mensaje, setMensaje] = useState<Mensaje | null>(null);
  const [descartadas, setDescartadas] = useState<readonly string[]>([]);
  const [listaVista, setListaVista] = useState(false);
  const [mas, setMas] = useState(false);
  const [herramienta, setHerramienta] = useState<"medir" | { inicial: string } | null>(null);
  const [medicion, setMedicion] = useState<Punto[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState<{ nombre: string; lat: number; lon: number }[]>([]);
  const [estadoBusqueda, setEstadoBusqueda] = useState<string | null>(null);
  const mapa = useRef<MapaMl | null>(null);
  const [pila, setPila] = useState<readonly EstadoEscena[]>([]);

  // El paso en curso: el que se edita, el coche que se coloca o el primero sin terminar.
  const actual = useMemo(() => {
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
  }, [editando, colocando, pasos]);
  const todoListo = pasoActual(pasos) === null && colocando === null && editando === null;

  /** Un cambio con su «Deshacer». */
  const cambiar = (siguiente: EstadoEscena, m?: Mensaje | null) => {
    setPila((x) => [...x.slice(-30), estado]);
    onEstado(siguiente);
    if (m !== undefined) setMensaje(m);
  };
  const deshacer = () => {
    const previo = pila.at(-1);
    if (!previo) return;
    setPila((x) => x.slice(0, -1));
    onEstado(previo);
    setColocando(null);
    setEditando(null);
    setListaVista(false);
    setMensaje(null);
  };
  const exito = (texto: string): Mensaje => ({ tipo: "exito", texto, deshacer: true });

  // Lo que Croquis propone para el primer choque.
  const propuesta = useMemo(
    () => proponerChoque(callesMapa, narracion, lugar),
    [callesMapa, narracion, lugar],
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
    const sentido = primero ? sentidos[primero] : null;
    const previa = primero ? poseDe(e, primero, "impacto") : null;
    const rumbo =
      sentido?.rumbo ?? previa?.rumbo ?? (callesMapa.length ? rumboAlineado(callesMapa, p, 0) : 0);
    const siguiente: EstadoEscena = {
      ...estado,
      expediente: marcarChoque(e, impactos, orden, p, rumbo),
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
      mapa.current.easeTo({ center: [p.lon, p.lat], zoom: 19.6 });
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
        poseDe(e, vehiculoActual, "impacto")?.rumbo ?? null,
      )
    : -1;

  const aplicarDireccion = (v: string, rumbo: number, noSe: boolean, texto: string) => {
    const c = choqueDe(v);
    if (!c) return;
    const siguiente: EstadoEscena = {
      ...estado,
      expediente: elegirDireccion(e, impactos, v, rumbo, c, noSe),
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
  const elegirFlecha = (i: number) => {
    const v = vehiculoActual;
    const f = flechas[i];
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
    const imp = poseDe(e, v, "impacto");
    const rumbo = callesMapa.length
      ? rumboAlineado(callesMapa, p, poseDe(e, v, "final")?.rumbo ?? imp?.rumbo ?? 0)
      : (poseDe(e, v, "final")?.rumbo ?? imp?.rumbo ?? 0);
    cambiar(
      {
        ...estado,
        expediente: marcarFinal(e, v, p, rumbo),
        desconocidos: estado.desconocidos.filter((x) => x !== v),
        juntoAlChoque: estado.juntoAlChoque.filter((x) => x !== v),
      },
      null,
    );
    setColocando(v);
  };
  const terminarFinal = (v: string) => {
    const op = opcionFinal[v] ?? "marcar";
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
    if (callesFallaron && !descartadas.includes("sin-calles"))
      return {
        tipo: "error",
        clave: "sin-calles",
        texto:
          "No llegaron las calles del mapa. Revisa tu conexión; mientras, marca el choque tocando el mapa y elige la dirección por los puntos cardinales.",
      };
    return null;
  })();

  // Un toque en el mapa, según la pregunta en curso.
  const tocar = (p: Punto) => {
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
    if (actual?.tipo === "choque") {
      const a = ajustarACalle(callesMapa, p);
      const punto = a?.punto ?? p;
      ponerChoque(actual.orden, punto, callesEn(callesMapa, punto));
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
        resultados?: { nombre: string; lat: number; lon: number }[];
        error?: string;
      } | null;
      if (!r.ok || !d?.resultados) {
        setEstadoBusqueda(d?.error ?? "No se pudo buscar. Mueve el mapa hasta el lugar.");
        return;
      }
      if (d.resultados.length === 1) ir(d.resultados[0]!);
      else {
        setResultados(d.resultados);
        setEstadoBusqueda(d.resultados.length ? null : "No se encontró. Prueba con otra calle.");
      }
    } catch {
      setEstadoBusqueda("Sin conexión: no se puede buscar. Mueve el mapa hasta el lugar.");
    }
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
    if (!ps.length && lugar) ps.push(lugar);
    return ps;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- se reencuadra al cambiar de pregunta
  }, [actual?.tipo, vehiculoActual, propuesta?.punto.lat, lugar?.lat]);

  // --- La hoja de la pregunta --------------------------------------------------------------------
  const nPasos = pasos.length;
  const indice = actual
    ? pasos.findIndex((p) =>
        actual.tipo === "choque"
          ? p.tipo === "choque" && p.orden === actual.orden
          : p.tipo === "vehiculo" && p.vehiculo === actual.vehiculo,
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
        {conPropuesta ? (
          <div
            className="flex flex-col gap-3 rounded-2xl bg-superficie-alta p-4"
            data-testid="escena-propuesta"
          >
            <span className="text-[0.8125rem] font-semibold text-texto-2">
              {propuesta.segun === "narracion"
                ? "Croquis lo leyó en la narración"
                : "Croquis propone el cruce más cercano al lugar del caso"}
            </span>
            {propuesta.cita ? (
              <p className="font-serif text-[1.15rem] italic leading-snug">«{propuesta.cita}»</p>
            ) : propuesta.calles.length ? (
              <p className="font-semibold">{propuesta.calles.slice(0, 2).join(" y ")}</p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="boton-principal escena-boton"
                onClick={() => ponerChoque(1, propuesta.punto, propuesta.calles.slice(0, 2))}
                data-testid="aceptar-choque"
              >
                {propuesta.calles.length >= 2 ? "Sí, fue en ese cruce" : "Sí, fue ahí"}
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
            {resultados.length ? (
              <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto">
                {resultados.map((r) => (
                  <li key={`${r.lat},${r.lon}`}>
                    <button
                      type="button"
                      className="t-nota min-h-11 w-full rounded-control px-2 text-left hover:bg-superficie-alta"
                      onClick={() => {
                        mapa.current?.easeTo({ center: [r.lon, r.lat], zoom: 18.5 });
                        onBuscarCalles({ lat: r.lat, lon: r.lon });
                        setResultados([]);
                      }}
                    >
                      {r.nombre}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </form>
        ) : null}
      </>
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
          Toca la flecha de la calle por donde llegaba al choque.
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
              pose.rumbo,
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
    const op = opcionFinal[v] ?? "marcar";
    const imp = poseDe(e, v, "impacto");
    const narrada = posicionesNarradas.find((p) => p.vehiculo === v && p.fase === "final");
    const desde = imp
      ? flechasDeLlegada(callesMapa, choqueDe(v) ?? imp.punto).find(
          (f) => Math.abs(((f.rumbo - imp.rumbo + 540) % 360) - 180) < 30,
        )
      : null;
    const opciones: { clave: "marcar" | "junto" | "nose"; titulo: string; detalle?: string }[] = [
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

  const medida =
    medicion.length === 2
      ? distanciaM([medicion[0]!.lon, medicion[0]!.lat], [medicion[1]!.lon, medicion[1]!.lat])
      : null;

  return (
    <div
      className="absolute inset-0 overflow-hidden"
      data-testid="escena-facil"
      data-listo={todoListo ? "si" : "no"}
    >
      <MapaFacil
        tema={tema}
        encuadre={encuadre}
        onToque={tocar}
        choques={choques}
        propuesta={propuestaVisible}
        flechas={flechasMapa}
        onFlecha={elegirFlecha}
        coches={coches}
        lineas={lineas}
        medicion={medicion}
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
        }}
      />

      {/* El mensaje del momento: éxito, alerta o error. */}
      {visible ? (
        <div className="pointer-events-none absolute top-4 left-1/2 z-20 flex w-[min(640px,calc(100%-2rem))] -translate-x-1/2 flex-col items-center gap-2 md:left-[calc(50%+210px)] md:w-[min(560px,calc(100%-480px))]">
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
        </div>
      ) : null}

      {/* La hoja de la pregunta: a la izquierda; en el celular, abajo. */}
      {hoja && !(todoListo && !listaVista) ? (
        <section
          className="escena-hoja absolute right-0 bottom-[84px] left-0 z-10 flex max-h-[58vh] flex-col gap-4 overflow-y-auto rounded-b-none p-5 md:top-6 md:right-auto md:bottom-auto md:left-6 md:max-h-[calc(100%-140px)] md:w-[420px] md:rounded-[22px] md:p-7"
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
                  className="boton-secundario escena-boton self-start"
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
                    Toca los dos extremos de lo que mides (restos, una huella de frenado).
                  </span>
                ) : null}
                {medida !== null ? (
                  <div className="flex flex-wrap items-center gap-2" data-testid="medida">
                    <span className="font-mono font-semibold">{medida.toFixed(2)} m</span>
                    <button
                      type="button"
                      className="boton-secundario escena-boton"
                      onClick={() =>
                        cambiar(
                          { ...estado, expediente: conRestos(e, Number(medida.toFixed(2))) },
                          exito(`¡Listo! Los restos miden ${medida.toFixed(2)} m.`),
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
                              expediente: conHuella(e, v.id, Number(medida.toFixed(2))),
                            },
                            exito(
                              `¡Listo! La huella de frenado del ${nombres[v.id]} mide ${medida.toFixed(2)} m.`,
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
      {todoListo && !listaVista ? (
        <div className="absolute inset-0 z-20 grid place-items-center bg-[color-mix(in_srgb,var(--fondo)_45%,transparent)] p-4">
          <section
            className="escena-hoja flex max-h-[calc(100%-120px)] w-[min(560px,100%)] flex-col gap-4 overflow-y-auto p-7"
            role="dialog"
            aria-modal="false"
            aria-labelledby="escena-lista-titulo"
            data-testid="escena-lista"
          >
            <span
              className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[var(--exito)] text-[1.8rem] text-white"
              aria-hidden="true"
            >
              ✓
            </span>
            <h2 id="escena-lista-titulo" className="escena-titulo text-center">
              ¡La escena está lista!
            </h2>
            <p className="t-cuerpo text-center text-texto-2">
              Esto es lo que marcaste. Con esto Croquis ya puede reconstruir el choque.
            </p>
            <ul
              className="flex flex-col divide-y divide-[var(--linea-suave)]"
              data-testid="escena-resumen"
            >
              {resumen.map((l, k) => (
                <li key={k} className="flex gap-3 py-3">
                  {l.tipo === "choque" ? (
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
      >
        {pasos.map((p, k) => {
          const esActual = k === indice && !todoListo;
          const nombre =
            p.tipo === "choque"
              ? impactos.length > 1
                ? `Choque ${p.orden}`
                : "El choque"
              : nombres[p.vehiculo]!;
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
                setEditando(
                  p.tipo === "choque"
                    ? { tipo: "choque", id: String(p.orden) }
                    : { tipo: "final", id: p.vehiculo },
                );
              }}
              data-testid={`avance-${k}`}
            >
              <span className="escena-chip-numero" aria-hidden="true">
                {p.hecho ? "✓" : k + 1}
              </span>
              {nombre}
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
