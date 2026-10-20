"use client";
/**
 * Paso «Simula» (PLAN §11.4): la reconstrucción de la escena propia en 3D, con las cámaras, la
 * traza de telemetría, las hipótesis y las exportaciones del visor. Los controles viven aquí (no
 * en la URL) para que la dirección del flujo siga siendo `/cuenta?paso=simula`.
 */
import type { EscenaSpec } from "@croquis/scene-schema";
import { useState } from "react";
import { useTextos } from "@/i18n/cliente";
import {
  CONTROLES_INICIALES,
  type ControlesVisor,
  VisorEscena,
} from "@/components/visor/visor-app";
import { TEXTOS_FLUJO } from "./textos";

export function PasoSimula({ spec, onVolver }: { spec: EscenaSpec; onVolver: () => void }) {
  const t = useTextos(TEXTOS_FLUJO).simula;
  const [controles, setControles] = useState<ControlesVisor>(CONTROLES_INICIALES);
  return (
    <div className="flex flex-col gap-6">
      <div>
        <button
          type="button"
          className="boton-secundario"
          data-testid="volver-croquis"
          onClick={onVolver}
        >
          {t.volver}
        </button>
      </div>
      <VisorEscena
        spec={spec}
        escena="propia"
        controles={controles}
        onControl={(k, v) =>
          setControles((c) => {
            if (k === "completa") return { ...c, completa: v !== null };
            if (k === "camara") return { ...c, camara: v ?? "libre" };
            if (k === "calidad")
              return { ...c, calidad: (v ?? "auto") as ControlesVisor["calidad"] };
            return { ...c, renderer: (v ?? "auto") as ControlesVisor["renderer"] };
          })
        }
      />
    </div>
  );
}
