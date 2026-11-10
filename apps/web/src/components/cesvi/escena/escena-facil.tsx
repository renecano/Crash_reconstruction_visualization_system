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
  agregarObjeto,
  agregarOndulacion,
  agregarTope,
  agregarZona,
  cambiarTamano,
  cambiarTerreno,
  conHuella,
  conPosicion,
  conRestos,
  distanciaM,
  empalmesDeObjetos,
  escalarTerreno,
  friccionDeTabla,
  girarObjeto,
  girarTerreno,
  medidasDe,
  moverObjeto,
  moverTerreno,
  nombreSuperficie,
  objetosDe,
  piezasTerreno,
  posicionesEncimadas,
  quitarObjeto,
  quitarTerreno,
  TIPOS_OBJETO,
  usarRelieve,
  usaRelieve,
  type Expediente,
  type PosicionDescrita,
  type TipoObjeto,
} from "@croquis/cesvi";
import type { OverpassResponse } from "@croquis/croquis-2d";
import type { Map as MapaMl } from "maplibre-gl";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ajustarACalle,
  callesDe,
  cruceNarrado,
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
  type LineaResumen,
  type Punto,
} from "@/lib/escena-facil";
import { siluetaClase } from "@/lib/colocar";
import { interpretarLugar } from "@/lib/lugar-texto";
import {
  agregarChoqueIntermedio,
  agregarPuntoDePaso,
  choquesIntermedios,
  articuloObjeto,
  marcarPrimerGolpe,
  moverChoqueIntermedio,
  moverPuntoDePaso,
  OBJETOS_C1,
  primerGolpe,
  puntosDePaso,
  quitarChoqueIntermedio,
  quitarPrimerGolpe,
  quitarPuntoDePaso,
  quitarUltimoPuntoDePaso,
  resumenC1,
  type RespuestasC1,
} from "@/lib/escena-facil";
import { BarraSeleccion, PanelCorregir, type AccionSeleccion } from "./correccion";
import {
  MapaFacil,
  trayectoDeLlegada,
  type CocheMapa,
  type FlechaMapa,
  type TerrenoMapa,
} from "./mapa-facil";
import { medidasDePieza, PreguntaTerreno, type PoniendoTerreno } from "./terreno";

/** Más lejos que esto del choque, un punto de C1 se confirma con una alerta (m). */
const GOLPE_LEJOS_M = 30;
const C1_LEJOS_M = 150;

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
  descripcionLugar = null,
  zona,
  onBuscarCalles,
  onVerReconstruccion,
  onNota,
  recalculo = null,
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
  /** Cómo describe el lugar el caso («crucero de la calle Azucena esquina con Av. Reforma…»). */
  descripcionLugar?: string | null;
  zona: { municipio?: string; estado?: string };
  /** Pide las calles alrededor de un punto (el lugar buscado). */
  onBuscarCalles: (p: Punto) => void;
  onVerReconstruccion: () => void;
  /** Lo que decide la persona y conviene anotar en la bitácora («No sé dónde quedó…»). */
  onNota: (texto: string) => void;
  /** W4: si ya hay una reconstrucción, se recalcula sola al corregir; aquí se ve cómo va. */
  recalculo?: "calculando" | "al_dia" | null;
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
  const [opcionFinal, setOpcionFinal] = useState<Record<string, "marcar" | "junto" | "nose">>({});
  const [marcoYo, setMarcoYo] = useState(false);
  const [mensaje, setMensaje] = useState<Mensaje | null>(null);
  const [descartadas, setDescartadas] = useState<readonly string[]>([]);
  const [listaVista, setListaVista] = useState(false);
  const [mas, setMas] = useState(false);
  const [herramienta, setHerramienta] = useState<"medir" | { inicial: string } | null>(null);
  const [medicion, setMedicion] = useState<Punto[]>([]);
  const [busqueda, setBusqueda] = useState(descripcionLugar ?? "");
  const [resultados, setResultados] = useState<{ nombre: string; lat: number; lon: number }[]>([]);
  const [estadoBusqueda, setEstadoBusqueda] = useState<string | null>(null);
  const mapa = useRef<MapaMl | null>(null);
  const [pila, setPila] = useState<readonly EstadoEscena[]>([]);
  // W4: «Rehacer», lo seleccionado para corregir y el objeto que se va a poner con el siguiente toque.
  const [futuro, setFuturo] = useState<readonly EstadoEscena[]>([]);
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [poniendo, setPoniendo] = useState<TipoObjeto | null>(null);
  const objetosColocados = useMemo(() => objetosDe(e), [e]);
  // C3 (W5): lo que se va a poner en el terreno con el siguiente toque, y lo ya marcado.
  const [poniendoTerreno, setPoniendoTerreno] = useState<PoniendoTerreno | null>(null);
  const [otrasSuperficies, setOtrasSuperficies] = useState(false);
  const terrenoMarcado = useMemo(() => piezasTerreno(e), [e]);

  // El paso en curso: el que se edita, el coche que se coloca o el primero sin terminar.
  const actual = useMemo(() => {
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
  }, [editando, editandoC1, colocando, pasos]);
  const todoListo =
    pasoActual(pasos) === null && colocando === null && editando === null && editandoC1 === null;
  /** W4: con la escena lista y la tarjeta cerrada, lo colocado se toca para corregirlo. */
  const corrigiendo = todoListo && listaVista;

  /** Un cambio con su «Deshacer». */
  const cambiar = (siguiente: EstadoEscena, m?: Mensaje | null) => {
    setPila((x) => [...x.slice(-30), estado]);
    setFuturo([]);
    onEstado(siguiente);
    if (m !== undefined) setMensaje(m);
  };
  const deshacer = () => {
    const previo = pila.at(-1);
    if (!previo) return;
    setPila((x) => x.slice(0, -1));
    setFuturo((x) => [...x.slice(-30), estado]);
    onEstado(previo);
    setColocando(null);
    setEditando(null);
    setSeleccion(null);
    if (!corrigiendo) setListaVista(false);
    setMensaje(null);
  };
  const rehacer = () => {
    const siguiente = futuro.at(-1);
    if (!siguiente) return;
    setFuturo((x) => x.slice(0, -1));
    setPila((x) => [...x.slice(-30), estado]);
    onEstado(siguiente);
    setSeleccion(null);
    setMensaje(null);
  };
  const exito = (texto: string): Mensaje => ({ tipo: "exito", texto, deshacer: true });

  // Sin coordenadas en el caso, Croquis busca el lugar que dice la narración (la descripción del
  // lugar, el cruce o la primera calle, con el municipio) y propone con las calles de ahí.
  const [lugarNarrado, setLugarNarrado] = useState<Punto | null>(null);
  const [buscandoNarrado, setBuscandoNarrado] = useState(false);
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
    const consultas = [
      descripcionLugar,
      cruce ? `${cruce.calles[0]} y ${cruce.calles[1]}` : null,
      cruce?.calles[0] ?? null,
    ].filter((x): x is string => Boolean(x?.trim()));
    if (!consultas.length) return;
    yaBuscado.current = true;
    const buscarEn = async () => {
      setBuscandoNarrado(true);
      for (const q of consultas) {
        const params = new URLSearchParams({ q });
        if (zona.municipio) params.set("municipio", zona.municipio);
        if (zona.estado) params.set("estado", zona.estado);
        try {
          const r = await fetch(`/api/lugar?${params.toString()}`);
          const d = (await r.json().catch(() => null)) as {
            resultados?: { lat: number; lon: number }[];
          } | null;
          const p = r.ok ? d?.resultados?.[0] : undefined;
          if (p && montada.current) {
            setLugarNarrado({ lat: p.lat, lon: p.lon });
            onBuscarCalles({ lat: p.lat, lon: p.lon });
            break;
          }
        } catch {
          break;
        }
      }
      if (montada.current) setBuscandoNarrado(false);
    };
    void buscarEn();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- una vez, al abrir la escena
  }, []);
  const lugarBase = lugar ?? lugarNarrado;

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
    if (callesFallaron && !descartadas.includes("sin-calles"))
      return {
        tipo: "error",
        clave: "sin-calles",
        texto:
          "No llegaron las calles del mapa. Revisa tu conexión; mientras, marca el choque tocando el mapa y elige la dirección por los puntos cardinales.",
      };
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
    // Las zonas van a lo largo de la calle; el tope, atravesado.
    const rumbo = callesMapa.length ? rumboAlineado(callesMapa, p, 0) : 0;
    let siguiente: Expediente;
    let texto: string;
    if (que.clase === "zona") {
      siguiente = agregarZona(e, que.tipo, p, rumbo, todo).expediente;
      const nombre = nombreSuperficie(que.tipo).toLowerCase();
      texto = todo
        ? `¡Listo! Todo el lugar es de ${nombre}.`
        : `¡Listo! Marcaste una zona de ${nombre}. Agrega otra cosa o termina con «Listo».`;
    } else if (que.clase === "ondulacion") {
      siguiente = agregarOndulacion(e, p, rumbo).expediente;
      texto = "¡Listo! Marcaste la zona ondulada. Sus medidas son un supuesto hasta que las midas.";
    } else {
      siguiente = agregarTope(e, p, rumbo, que.norma).expediente;
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

  // --- W4: corregir después ----------------------------------------------------------------------
  const deClave = (clave: string) => {
    const i = clave.indexOf(":");
    return { tipo: clave.slice(0, i), id: clave.slice(i + 1) };
  };
  const paso = (id: string) => /^paso-(.+)-(\d+)$/.exec(id);
  const nombreDeSeleccion = (clave: string): string => {
    const { tipo, id } = deClave(clave);
    if (tipo === "coche") return `El ${nombres[id] ?? id}`;
    if (tipo === "objeto") return objetosColocados.find((o) => o.id === id)?.nombre ?? "Objeto";
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
  /** Al soltar lo seleccionado en otro lugar: se guarda y se dice. */
  const moverSeleccion = (clave: string, p: Punto) => {
    const { tipo, id } = deClave(clave);
    const nombre = nombreDeSeleccion(clave);
    let x: Expediente = e;
    if (tipo === "coche") {
      const fin = poseDe(e, id, "final");
      if (!fin) return;
      x = marcarFinal(e, id, p, fin.rumbo);
    } else if (tipo === "objeto") x = moverObjeto(e, id, p);
    else if (tipo === "terreno") x = moverTerreno(e, id, p);
    else if (id === "golpe") x = marcarPrimerGolpe(e, impactos, p);
    else if (paso(id)) x = moverPuntoDePaso(e, paso(id)![1]!, Number(paso(id)![2]), p);
    else x = moverChoqueIntermedio(e, Number(id.replace("objeto-", "")), p);
    cambiar(
      { ...estado, expediente: x },
      exito(`¡Listo! Moviste: ${nombre.split(" · ")[0]!.toLowerCase()}.`),
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
    if (tipo === "coche") {
      const fin = poseDe(e, id, "final");
      return [
        ...(fin
          ? [
              {
                id: "girar-izq",
                texto: "Girar −15°",
                hacer: () => hecho(girar(e, id, "final", -15), "¡Listo! Lo giraste."),
              },
              {
                id: "girar-der",
                texto: "Girar +15°",
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
      ];
    }
    if (tipo === "objeto") {
      return [
        {
          id: "girar-izq",
          texto: "Girar −15°",
          hacer: () => hecho(girarObjeto(e, id, -15), "¡Listo! Lo giraste."),
        },
        {
          id: "girar-der",
          texto: "Girar +15°",
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
        {
          id: "quitar",
          texto: "Quitar",
          peligro: true,
          hacer: () => hecho(quitarObjeto(e, id), "Lo quitaste.", true),
        },
      ];
    }
    if (tipo === "terreno") {
      const t = terrenoMarcado.find((x) => x.id === id);
      if (!t) return [];
      const giro: AccionSeleccion[] = [
        {
          id: "girar-izq",
          texto: "Girar −15°",
          hacer: () => hecho(girarTerreno(e, id, -15), "¡Listo! Lo giraste."),
        },
        {
          id: "girar-der",
          texto: "Girar +15°",
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
      const quitar: AccionSeleccion = {
        id: "quitar",
        texto: "Quitar",
        peligro: true,
        hacer: () => hecho(quitarTerreno(e, id), "Lo quitaste.", true),
      };
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
        {
          id: "quitar",
          texto: "Quitar",
          peligro: true,
          hacer: () =>
            hecho(quitarPrimerGolpe(e), "Lo quitaste: Croquis usa el lugar del choque.", true),
        },
      ];
    const q = paso(id);
    if (q)
      return [
        { id: "cambiar", texto: "Cambiar", hacer: reabrir(() => setEditandoC1("paso")) },
        {
          id: "quitar",
          texto: "Quitar",
          peligro: true,
          hacer: () => hecho(quitarPuntoDePaso(e, q[1]!, Number(q[2])), "Lo quitaste.", true),
        },
      ];
    const orden = Number(id.replace("objeto-", ""));
    return [
      { id: "cambiar", texto: "Cambiar", hacer: reabrir(() => setEditandoC1("otros")) },
      {
        id: "quitar",
        texto: "Quitar",
        peligro: true,
        hacer: () => hecho(quitarChoqueIntermedio(e, orden), "Lo quitaste.", true),
      },
    ];
  };
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
        {conPropuesta ? (
          <div
            className="flex flex-col gap-3 rounded-2xl bg-superficie-alta p-4"
            data-testid="escena-propuesta"
          >
            <span className="text-[0.8125rem] font-semibold text-texto-2">
              {propuesta.segun === "narracion"
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
  const resumenCompleto = [...resumen, ...resumenC1({ e, nombres, c1 })];
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
        marcas={marcasC1}
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
        objetos={objetosMapa}
        terreno={terrenoMapa}
        seleccion={corrigiendo ? seleccion : null}
        onSeleccionar={corrigiendo && !poniendo ? (k) => setSeleccion(k) : undefined}
        onMover={moverSeleccion}
      />

      {/* «Deshacer» y «Rehacer», siempre a la vista (W4), y cómo va el recálculo. */}
      <div className="pointer-events-none absolute top-4 right-20 z-10 flex flex-col items-end gap-2">
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
        {recalculo ? (
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
        <div className="pointer-events-none absolute right-3 bottom-[84px] left-3 z-20 flex justify-center">
          <BarraSeleccion
            nombre={nombreDeSeleccion(seleccion)}
            acciones={accionesDe(seleccion)}
            onListo={() => setSeleccion(null)}
          />
        </div>
      ) : null}

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
              className="mx-auto grid h-16 w-16 shrink-0 place-items-center rounded-full bg-[var(--exito)] text-[1.8rem] text-white"
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
              {resumenCompleto.map((l, k) => (
                <li key={k} className="flex gap-3 py-3">
                  {!l.vehiculo ? (
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
      >
        {pasos.map((p, k) => {
          const esActual = k === indice && !todoListo;
          const nombre =
            p.tipo === "choque"
              ? impactos.length > 1
                ? `Choque ${p.orden}`
                : "El choque"
              : p.tipo === "vehiculo"
                ? nombres[p.vehiculo]!
                : p.tipo === "golpe"
                  ? "Primer golpe"
                  : p.tipo === "otros"
                    ? "Otros choques"
                    : p.tipo === "paso"
                      ? "Por dónde pasó"
                      : "Terreno";
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

/**
 * La escena al presentar: lo marcado en palabras (el choque y, por vehículo, por dónde venía y dónde
 * quedó), con los supuestos y su explicación. Lo mismo que la tarjeta «¡La escena está lista!».
 */
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
  const callesMapa = callesDe(calles);
  const nombres = Object.fromEntries(
    e.vehiculos.map((v) => [v.id, nombreVehiculo(v, e.vehiculos)]),
  );
  const colores = coloresVehiculos(e.vehiculos, narracion);
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
  const lineas = [
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
    ...(estado.c1 ? resumenC1({ e, nombres, c1: estado.c1 }) : []),
  ];
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
            {!l.vehiculo ? (
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
