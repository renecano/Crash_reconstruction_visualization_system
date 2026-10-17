/**
 * Modo de energía de Windows durante las mediciones (ADR 0026, regla de autonomía de CLAUDE.md:
 * cambio reversible que se restaura solo y queda registrado en el resultado).
 *
 * En el modo «Equilibrado» la GPU integrada cambia de frecuencia por su cuenta y la misma escena
 * dio 54 o 63 fps entre corridas. E6 activa «Mejor rendimiento» al empezar y restaura el modo que
 * había al terminar, también si falla o se interrumpe.
 *
 * Usa la API de Windows (`powrprof.dll`: `PowerGetEffectiveOverlayScheme` y
 * `PowerSetActiveOverlayScheme`) desde PowerShell. En otros sistemas no hace nada.
 */
import { execFileSync } from "node:child_process";

export const OVERLAY = {
  mejor_rendimiento: "ded574b5-45a0-4f42-8737-46345c09c238",
  equilibrado: "00000000-0000-0000-0000-000000000000",
  mejor_eficiencia: "961cc777-2547-4f9d-8174-7d86181b8a7a",
};

const NAMES = Object.fromEntries(Object.entries(OVERLAY).map(([k, v]) => [v, k]));

const PRELUDE =
  '$sig = \'[DllImport("powrprof.dll")] public static extern uint PowerSetActiveOverlayScheme(Guid g); ' +
  '[DllImport("powrprof.dll")] public static extern uint PowerGetEffectiveOverlayScheme(out Guid g);\'; ' +
  "Add-Type -MemberDefinition $sig -Name PowerOverlay -Namespace Croquis; ";

function ps(command) {
  return execFileSync("powershell", ["-NoProfile", "-Command", PRELUDE + command], {
    encoding: "utf8",
  }).trim();
}

/** Modo efectivo actual (GUID y nombre), o null fuera de Windows o si la API no responde. */
export function currentOverlay() {
  if (process.platform !== "win32") return null;
  try {
    const guid = ps(
      "$g = [Guid]::Empty; [void][Croquis.PowerOverlay]::PowerGetEffectiveOverlayScheme([ref]$g); $g.ToString()",
    );
    return { guid, nombre: NAMES[guid] ?? "otro" };
  } catch {
    return null;
  }
}

function setOverlay(guid) {
  const code = ps(`[Croquis.PowerOverlay]::PowerSetActiveOverlayScheme([Guid]'${guid}')`);
  if (code !== "0") throw new Error(`PowerSetActiveOverlayScheme devolvió ${code}`);
}

/**
 * Activa «Mejor rendimiento» y devuelve el registro y una función que restaura el modo anterior
 * (idempotente). Si no se puede cambiar, lo registra y la medición sigue en el modo que había.
 */
export function useBestPerformance() {
  const before = currentOverlay();
  if (!before) return { registro: { cambiado: false, motivo: "no disponible" }, restore: () => {} };
  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    try {
      setOverlay(before.guid);
    } catch (err) {
      console.error(`No se pudo restaurar el modo de energía ${before.nombre}: ${String(err)}`);
    }
  };
  try {
    setOverlay(OVERLAY.mejor_rendimiento);
  } catch (err) {
    return {
      registro: { cambiado: false, antes: before, motivo: String(err).slice(0, 200) },
      restore,
    };
  }
  for (const sig of ["SIGINT", "SIGTERM"]) {
    process.once(sig, () => {
      restore();
      process.exit(130);
    });
  }
  process.once("exit", restore);
  return {
    registro: { cambiado: true, antes: before, durante: currentOverlay() },
    restore,
  };
}
