import { describe, expect, it } from "vitest";
import {
  clampToCeiling,
  GIVE_UP_AFTER,
  lowerLevel,
  onLoss,
  RECOVERY_INICIAL,
  RECOVERY_WINDOW_MS,
  retry,
} from "./recovery";

describe("recuperación del 3D (René, 2026-11-04)", () => {
  it("la primera pérdida solo recrea el visor, con la misma calidad", () => {
    const { state, action } = onLoss(RECOVERY_INICIAL, 1000, "ultra");
    expect(action).toEqual({ tipo: "recrear", techo: null });
    expect(state.perdidas).toEqual([1000]);
  });

  it("si se repite dentro de la ventana, baja un nivel y lo deja de techo", () => {
    const a = onLoss(RECOVERY_INICIAL, 1000, "ultra");
    const b = onLoss(a.state, 5000, "ultra");
    expect(b.action).toEqual({ tipo: "bajar", calidad: "alta", techo: "alta" });
    expect(b.state.techo).toBe("alta");
    // El modo automático ya no sube de ahí.
    expect(clampToCeiling("ultra", b.state.techo)).toBe("alta");
    expect(clampToCeiling("media", b.state.techo)).toBe("media");
    // Una tercera baja otro nivel (el techo baja con ella).
    const c = onLoss(b.state, 9000, "alta");
    expect(c.action).toEqual({ tipo: "bajar", calidad: "media", techo: "media" });
  });

  it("una pérdida vieja no cuenta: fuera de la ventana vuelve a recrear sin bajar", () => {
    const a = onLoss(RECOVERY_INICIAL, 1000, "alta");
    const b = onLoss(a.state, 1000 + RECOVERY_WINDOW_MS + 1, "alta");
    expect(b.action.tipo).toBe("recrear");
    expect(b.state.perdidas).toEqual([1000 + RECOVERY_WINDOW_MS + 1]);
  });

  it("en baja no hay a dónde bajar: recrea; y a la cuarta seguida se rinde", () => {
    let s = RECOVERY_INICIAL;
    const acciones: string[] = [];
    for (let k = 0; k < GIVE_UP_AFTER; k++) {
      const r = onLoss(s, 1000 * (k + 1), "baja");
      s = r.state;
      acciones.push(r.action.tipo);
    }
    expect(acciones).toEqual(["recrear", "recrear", "recrear", "rendirse"]);
    // «Reintentar» olvida las pérdidas y conserva el techo.
    const conTecho = { ...s, techo: "media" as const };
    expect(retry(conTecho)).toEqual({ perdidas: [], techo: "media" });
  });

  it("bajar un nivel", () => {
    expect(lowerLevel("ultra")).toBe("alta");
    expect(lowerLevel("media")).toBe("baja");
    expect(lowerLevel("baja")).toBe("baja");
  });
});
