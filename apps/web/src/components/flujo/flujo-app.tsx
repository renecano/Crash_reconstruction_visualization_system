"use client";
/**
 * El flujo guiado (PLAN §11.4): Cuenta → ¿Qué falta? → Ubica → Simula, con un solo botón
 * principal por paso y la posibilidad de volver a cualquier paso alcanzado sin perder nada.
 *
 * - **Estado:** vive en `sessionStorage` (solo esta pestaña); el paso, en la URL (`?paso=`), así
 *   que el botón de atrás del navegador regresa al paso anterior.
 * - **E9:** los cinco eventos se registran en los mismos momentos que antes (relato enviado,
 *   preguntas respondidas, croquis abierto, corrección en el croquis y reconstrucción visible).
 */
import type { EscenaSpec } from "@croquis/scene-schema";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useIdioma, useTextos } from "@/i18n/cliente";
import { registrarE9 } from "@/lib/e9";
import { useEnLinea } from "@/lib/en-linea";
import { guardarEscenaPropia } from "@/lib/escena-propia";
import { ApiError, extraer, responder, type Pregunta, type Progreso } from "@/lib/relato-api";
import { redact } from "@croquis/extraction";
import { type Ejemplo, PasoCuenta } from "./paso-cuenta";
import { type Lectura, PasoFalta } from "./paso-falta";
import { PasoSimula } from "./paso-simula";
import { PasoUbica } from "./paso-ubica";
import { PASOS, PasosDelFlujo, type Paso } from "./pasos";
import { ProgresoLectura } from "./progreso-lectura";
import { TEXTOS_FLUJO } from "./textos";

export const FLUJO_KEY = "croquis:flujo";

interface Estado {
  texto: string;
  lectura: Lectura | null;
  spec: EscenaSpec | null;
  preguntas: Pregunta[];
  contestadas: string[];
}

const VACIO: Estado = { texto: "", lectura: null, spec: null, preguntas: [], contestadas: [] };

function leerEstado(): Estado | null {
  try {
    const raw = sessionStorage.getItem(FLUJO_KEY);
    return raw ? ({ ...VACIO, ...(JSON.parse(raw) as Partial<Estado>) } as Estado) : null;
  } catch {
    return null;
  }
}

function esPaso(x: string | null): x is Paso {
  return x !== null && (PASOS as readonly string[]).includes(x);
}

export function FlujoApp({
  ejemplos,
  fetcher,
}: {
  ejemplos: readonly Ejemplo[];
  fetcher?: typeof fetch;
}) {
  const { ruta } = useIdioma();
  const t = useTextos(TEXTOS_FLUJO);
  // El paso pedido en la URL (`?paso=`). Se lee al montar y con «atrás»/«adelante»: así el primer
  // paso viene en el HTML del servidor (useSearchParams obligaría a dibujarlo solo en el navegador).
  const [pedido, setPedido] = useState<string | null>(null);
  const enLinea = useEnLinea();
  const [estado, setEstado] = useState<Estado>(VACIO);
  const [restaurado, setRestaurado] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [progreso, setProgreso] = useState<Progreso | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Restaura lo de esta pestaña al montar (sessionStorage no existe en el servidor).
  useEffect(() => {
    const s = leerEstado();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza con sessionStorage al montar
    if (s) setEstado(s);
    setPedido(new URLSearchParams(window.location.search).get("paso"));
    setRestaurado(true);
    const alVolver = () => setPedido(new URLSearchParams(window.location.search).get("paso"));
    window.addEventListener("popstate", alVolver);
    return () => window.removeEventListener("popstate", alVolver);
  }, []);
  useEffect(() => {
    if (!restaurado) return;
    try {
      sessionStorage.setItem(FLUJO_KEY, JSON.stringify(estado));
    } catch {
      // Sin almacenamiento el flujo sigue funcionando; solo no sobrevive a recargar.
    }
  }, [estado, restaurado]);

  const alcanzado: Paso = estado.spec ? "simula" : "cuenta";
  const paso: Paso =
    esPaso(pedido) && PASOS.indexOf(pedido) <= PASOS.indexOf(alcanzado) ? pedido : "cuenta";

  const ir = useCallback(
    (p: Paso) => {
      // pushState se integra al router de Next (sincroniza la URL sin recargar).
      window.history.pushState(
        null,
        "",
        p === "cuenta" ? ruta("/cuenta") : `${ruta("/cuenta")}?paso=${p}`,
      );
      setPedido(p);
      window.scrollTo({ top: 0 });
    },
    [ruta],
  );

  const fail = (e: unknown) =>
    setError(e instanceof ApiError || e instanceof Error ? e.message : String(e));

  const leer = async () => {
    registrarE9("relato_enviado");
    setOcupado(true);
    setError(null);
    try {
      const red = redact(estado.texto);
      const r = await extraer(red.text, "auto", fetcher, setProgreso);
      setEstado((s) => ({
        ...s,
        lectura: {
          texto: r.texto,
          metodo: r.metodo,
          motivo: r.motivo,
          verificador: r.verificador,
          glosario: r.glosario,
        },
        spec: r.spec,
        preguntas: r.preguntas,
        contestadas: [],
      }));
      ir("falta");
    } catch (e) {
      fail(e);
    } finally {
      setOcupado(false);
      setProgreso(null);
    }
  };

  const contestar = async (respuestas: Record<string, string>, omitidas: string[]) => {
    if (!estado.spec || !estado.lectura) return;
    setOcupado(true);
    setError(null);
    const ya = [...estado.contestadas, ...omitidas, ...Object.keys(respuestas)];
    try {
      const r = await responder(estado.spec, estado.lectura.texto, respuestas, ya, fetcher);
      setEstado((s) => ({ ...s, spec: r.spec, preguntas: r.preguntas, contestadas: ya }));
      registrarE9("preguntas_respondidas");
    } catch (e) {
      fail(e);
    } finally {
      setOcupado(false);
    }
  };

  const ubicar = () => {
    registrarE9("croquis_abierto");
    ir("ubica");
  };

  const simular = () => {
    if (!estado.spec) return;
    // La escena propia también se abre en /visor?escena=propia (herramienta avanzada).
    if (!guardarEscenaPropia(estado.spec)) {
      setError(t.errores.guardar);
      return;
    }
    ir("simula");
  };

  const editarSpec = useCallback((next: EscenaSpec) => {
    registrarE9("correccion_croquis");
    setEstado((s) => ({ ...s, spec: next }));
  }, []);

  const titulo = useMemo(() => t.pasos[paso], [t, paso]);

  return (
    <div className="flex flex-col gap-10" data-testid="flujo" data-paso={paso}>
      <PasosDelFlujo actual={paso} alcanzado={alcanzado} onIr={ir} />
      <h2 className="sr-only" aria-live="polite">
        {titulo}
      </h2>
      {error ? (
        <p role="alert" data-testid="error" className="t-interfaz border-l-2 border-texto pl-4">
          {error}
        </p>
      ) : null}
      {paso === "cuenta" ? (
        ocupado ? (
          <ProgresoLectura progreso={progreso} />
        ) : (
          <PasoCuenta
            texto={estado.texto}
            onTexto={(texto) => setEstado((s) => ({ ...s, texto }))}
            ejemplos={ejemplos}
            ocupado={ocupado}
            enLinea={enLinea}
            onLeer={() => void leer()}
          />
        )
      ) : null}
      {paso === "falta" && estado.spec && estado.lectura ? (
        <PasoFalta
          lectura={estado.lectura}
          spec={estado.spec}
          preguntas={estado.preguntas}
          ocupado={ocupado}
          onResponder={(r, o) => void contestar(r, o)}
          onSeguir={ubicar}
        />
      ) : null}
      {paso === "ubica" && estado.spec ? (
        <PasoUbica spec={estado.spec} onChange={editarSpec} onVer={simular} />
      ) : null}
      {paso === "simula" && estado.spec ? (
        <PasoSimula spec={estado.spec} onVolver={() => ir("ubica")} />
      ) : null}
    </div>
  );
}
