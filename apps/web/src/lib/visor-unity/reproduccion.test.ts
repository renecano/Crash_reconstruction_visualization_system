import { describe, expect, it } from "vitest";
import {
  alFinal,
  ESTADO_INICIAL,
  etiquetaVelocidad,
  reproducir,
  VELOCIDADES,
} from "./reproduccion";

const I = { inicio: -3, fin: 6 };

/** Auditoría del 2026-11-15, I3: el perito puede pausar, repetir e ir a un instante en el 3D. */
describe("la reproducción del 3D de Unity", () => {
  it("pausar y reproducir mandan su mensaje", () => {
    const a = reproducir(ESTADO_INICIAL, { tipo: "alternar" }, I);
    expect(a.estado.pausado).toBe(true);
    expect(a.ordenes).toEqual([{ mensaje: "pausar", datos: {} }]);
    const b = reproducir(a.estado, { tipo: "alternar" }, I);
    expect(b.estado.pausado).toBe(false);
    expect(b.ordenes).toEqual([{ mensaje: "reproducir", datos: {} }]);
  });

  it("al final, reproducir empieza de nuevo", () => {
    const alFinal = { ...ESTADO_INICIAL, t: 6, pausado: true };
    const r = reproducir(alFinal, { tipo: "alternar" }, I);
    expect(r.estado).toMatchObject({ t: -3, pausado: false });
    expect(r.ordenes).toEqual([
      { mensaje: "fijarTiempo", datos: { t: -3 } },
      { mensaje: "reproducir", datos: {} },
    ]);
  });

  it("mover el deslizador pausa y lleva a ese instante, dentro del Resultado", () => {
    const r = reproducir(ESTADO_INICIAL, { tipo: "ir", t: 1.25 }, I);
    expect(r.estado).toMatchObject({ t: 1.25, pausado: true });
    expect(r.ordenes).toEqual([
      { mensaje: "pausar", datos: {} },
      { mensaje: "fijarTiempo", datos: { t: 1.25 } },
    ]);
    expect(reproducir(ESTADO_INICIAL, { tipo: "ir", t: 99 }, I).estado.t).toBe(6);
    expect(reproducir(ESTADO_INICIAL, { tipo: "ir", t: -99 }, I).estado.t).toBe(-3);
  });

  it("«Ir al impacto» pausa en t = 0 y encuadra el impacto; «Ver todo» solo encuadra", () => {
    const r = reproducir({ ...ESTADO_INICIAL, t: 4 }, { tipo: "impacto" }, I);
    expect(r.estado).toMatchObject({ t: 0, pausado: true });
    expect(r.ordenes).toEqual([
      { mensaje: "pausar", datos: {} },
      { mensaje: "fijarTiempo", datos: { t: 0 } },
      { mensaje: "encuadrar", datos: { zona: "impacto" } },
    ]);
    const t = reproducir(ESTADO_INICIAL, { tipo: "todo" }, I);
    expect(t.estado).toEqual(ESTADO_INICIAL);
    expect(t.ordenes).toEqual([{ mensaje: "encuadrar", datos: { zona: "todo" } }]);
  });

  it("la velocidad es ¼×, ½× o 1×", () => {
    expect(VELOCIDADES.map(etiquetaVelocidad)).toEqual(["¼×", "½×", "1×"]);
    const r = reproducir(ESTADO_INICIAL, { tipo: "velocidad", x: 0.25 }, I);
    expect(r.estado.velocidad).toBe(0.25);
    expect(r.ordenes).toEqual([{ mensaje: "velocidad", datos: { x: 0.25 } }]);
  });

  it("repetir vuelve al inicio y reproduce; el aviso de Unity solo mueve el deslizador", () => {
    const r = reproducir({ ...ESTADO_INICIAL, t: 5, pausado: true }, { tipo: "repetir" }, I);
    expect(r.estado).toMatchObject({ t: -3, pausado: false });
    expect(r.ordenes.map((o) => o.mensaje)).toEqual(["fijarTiempo", "reproducir"]);
    const u = reproducir(ESTADO_INICIAL, { tipo: "tiempo", t: 2.5 }, I);
    expect(u.estado.t).toBe(2.5);
    expect(u.ordenes).toEqual([]);
  });
  it("al llegar al final queda en pausa, aunque el último aviso de Unity llegue unas décimas antes (René, 2026-11-27)", () => {
    const i = { inicio: -3, fin: 4 };
    const corriendo = { ...ESTADO_INICIAL, t: 3.5, pausado: false };
    const casi = reproducir(corriendo, { tipo: "tiempo", t: 3.85 }, i).estado;
    expect(casi).toMatchObject({ t: 4, pausado: true });
    expect(alFinal(casi.t, i)).toBe(true);
    // A media reproducción, el aviso solo mueve el instante.
    expect(reproducir(corriendo, { tipo: "tiempo", t: 1 }, i).estado).toMatchObject({
      t: 1,
      pausado: false,
    });
    // Y «Repetir» (el mismo botón) vuelve a empezar.
    const r = reproducir(casi, { tipo: "alternar" }, i);
    expect(r.estado).toMatchObject({ t: -3, pausado: false });
    expect(r.ordenes.map((o) => o.mensaje)).toEqual(["fijarTiempo", "reproducir"]);
  });
});
