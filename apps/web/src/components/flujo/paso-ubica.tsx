"use client";
/**
 * Paso «Ubica» (PLAN §11.4): el croquis sobre el papel del parte. Una guía corta la primera vez
 * (arrastrar, girar, mover dónde quedó), deshacer con botón y con Ctrl+Z, calles reales de
 * OpenStreetMap y el botón principal para ver la reconstrucción.
 */
import { Croquis } from "@croquis/croquis-2d";
import type { EscenaSpec } from "@croquis/scene-schema";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CallesReales } from "@/components/calles-reales";
import { useTextosCroquis } from "@/components/legend";
import { textos } from "@/i18n";
import { useTextos } from "@/i18n/cliente";
import { TEXTOS_FLUJO } from "./textos";

const GUIA_KEY = "croquis:guia-croquis-vista";

const T = textos(
  {
    croquis: "Croquis de tu relato",
    deshacer: "Deshacer",
    finales: "Mostrar dónde quedó cada uno",
    guia: {
      titulo: "Cómo se acomoda",
      arrastrar: "Arrastra un vehículo, una persona o una marca para moverlo.",
      girar: "Gira un vehículo con el asa amarilla que aparece a su lado.",
      final: "La figura tenue es dónde quedó: muévela para marcar la trayectoria.",
      deshacerAtajo: "Ctrl+Z deshace el último cambio.",
      entendido: "Entendido",
    },
  },
  {
    croquis: "Sketch of your narrative",
    deshacer: "Undo",
    finales: "Show where each one ended up",
    guia: {
      titulo: "How to arrange it",
      arrastrar: "Drag a vehicle, a person or a mark to move it.",
      girar: "Rotate a vehicle with the yellow handle next to it.",
      final: "The faint shape is where it ended up: move it to mark the path.",
      deshacerAtajo: "Ctrl+Z undoes the last change.",
      entendido: "Got it",
    },
  },
);

const noopSubscribe = () => () => {};
function guiaVista(): boolean {
  try {
    return localStorage.getItem(GUIA_KEY) === "1";
  } catch {
    return true;
  }
}

export function PasoUbica({
  spec,
  onChange,
  onVer,
}: {
  spec: EscenaSpec;
  onChange: (next: EscenaSpec) => void;
  onVer: () => void;
}) {
  const t = useTextos(T);
  const tf = useTextos(TEXTOS_FLUJO).ubica;
  const [selected, setSelected] = useState<string | undefined>(undefined);
  const [showFinal, setShowFinal] = useState(true);
  // Historial para deshacer: las escenas anteriores a cada cambio (solo en esta visita al paso).
  const historial = useRef<EscenaSpec[]>([]);
  const [puedeDeshacer, setPuedeDeshacer] = useState(false);
  const vistaGuardada = useSyncExternalStore(noopSubscribe, guiaVista, () => true);
  const [guiaCerrada, setGuiaCerrada] = useState(false);
  const mostrarGuia = !vistaGuardada && !guiaCerrada;
  const textosCroquis = useTextosCroquis();

  const cambiar = useCallback(
    (next: EscenaSpec) => {
      historial.current.push(spec);
      setPuedeDeshacer(true);
      onChange(next);
    },
    [spec, onChange],
  );
  const deshacer = useCallback(() => {
    const prev = historial.current.pop();
    if (!prev) return;
    setPuedeDeshacer(historial.current.length > 0);
    onChange(prev);
  }, [onChange]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z") {
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        e.preventDefault();
        deshacer();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deshacer]);

  const cerrarGuia = () => {
    setGuiaCerrada(true);
    try {
      localStorage.setItem(GUIA_KEY, "1");
    } catch {
      // sin almacenamiento la guía vuelve a salir la próxima vez; no pasa nada
    }
  };

  return (
    <div className="grid gap-10 lg:grid-cols-12">
      <div className="flex flex-col gap-4 lg:col-span-8">
        <p className="t-cuerpo text-texto-2">{tf.ayuda}</p>
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            className="boton-secundario min-h-11 px-4"
            data-testid="deshacer"
            disabled={!puedeDeshacer}
            onClick={deshacer}
          >
            {t.deshacer}
          </button>
          <label className="t-interfaz flex items-center gap-2">
            <input type="checkbox" checked={showFinal} onChange={(e) => setShowFinal(e.target.checked)} />
            {t.finales}
          </label>
        </div>
        {mostrarGuia ? (
          <section aria-labelledby="guia-titulo" data-testid="guia-croquis" className="carril flex flex-col gap-2">
            <h3 id="guia-titulo" className="t-interfaz">
              {t.guia.titulo}
            </h3>
            <ol className="t-nota flex list-decimal flex-col gap-1 pl-5">
              <li>{t.guia.arrastrar}</li>
              <li>{t.guia.girar}</li>
              <li>{t.guia.final}</li>
              <li>{t.guia.deshacerAtajo}</li>
            </ol>
            <div>
              <button type="button" className="boton-secundario min-h-11 px-4" onClick={cerrarGuia}>
                {t.guia.entendido}
              </button>
            </div>
          </section>
        ) : null}
        <div className="overflow-hidden rounded-panel" data-tema="papel" data-testid="croquis-flujo">
          <Croquis
            spec={spec}
            onChange={cambiar}
            showFinal={showFinal}
            selectedId={selected}
            onSelect={setSelected}
            textos={textosCroquis}
          />
        </div>
      </div>
      <div className="flex flex-col gap-8 lg:col-span-4">
        <div>
          <button type="button" data-testid="ver-3d" className="boton-principal" onClick={onVer}>
            {tf.ver}
          </button>
        </div>
        <CallesReales spec={spec} onApply={cambiar} />
      </div>
    </div>
  );
}
