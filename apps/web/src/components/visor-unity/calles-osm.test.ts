import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { flechasDeVuelta, pasosDeOsm, semaforosDeOsm } from "./calles-osm";

// Una calle de doble sentido de 40 m hacia el este, 3 carriles de ida y 1 de vuelta, 14 m de ancho.
const via = {
  id: 1,
  puntos: [
    { x: 0, y: 0 },
    { x: 40, y: 0 },
  ],
  ancho: 14,
  carriles: 4,
  carrilesIda: 3,
  carrilesVuelta: 1,
  vueltas: ["left", "through", "through;right"],
};

describe("lo que OSM dice de las calles, en el 3D (punto 9)", () => {
  it("el paso peatonal va a lo ancho de su calle y no repite uno declarado", () => {
    const nodo = { tipo: "paso_peatonal" as const, x: 20, y: 0 };
    const [p] = pasosDeOsm([via], [nodo], []);
    expect(p).toMatchObject({ center: { x: 20, y: 0 }, roadHeading: 0, roadWidth: 14 });
    expect(pasosDeOsm([via], [nodo], [p!])).toEqual([]);
  });

  it("el semáforo va en la orilla derecha, fuera de la calzada, de frente al tránsito y apagado", () => {
    const [s] = semaforosDeOsm(
      [via],
      [{ tipo: "semaforo", x: 20, y: 0 }],
      [],
      (p) => Math.abs(p.y) < 7,
    );
    expect(s!.x).toBe(20);
    expect(s!.y).toBeLessThanOrEqual(-7);
    expect(s!.rumbo_deg).toBe(180);
    expect(s!.luces).toEqual([]);
    // Uno declarado a menos de 15 m: no se repite.
    expect(
      semaforosDeOsm([via], [{ tipo: "semaforo", x: 20, y: 0 }], [{ x: 25, y: 3 }], () => false),
    ).toEqual([]);
  });

  it("las flechas de ida quedan en sus carriles, a la derecha de la raya central, antes del final", () => {
    const m = flechasDeVuelta([via]);
    expect(m.indices.length).toBeGreaterThan(0);
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i < m.positions.length; i += 2) {
      xs.push(m.positions[i]!);
      ys.push(m.positions[i + 1]!);
    }
    // Raya central en y = 7 − 3.5 = 3.5: las flechas de ida, abajo de ella.
    expect(Math.max(...ys)).toBeLessThan(3.5);
    expect(Math.min(...ys)).toBeGreaterThan(-7);
    // A unos 10 m del final (x = 40), con 5 m de largo.
    expect(Math.min(...xs)).toBeGreaterThan(26);
    expect(Math.max(...xs)).toBeLessThan(34);
  });
});

describe("en los paquetes de la batería de ciudad", () => {
  const dir = resolve(__dirname, "../../../../../packages/scene-schema/fixtures/caso3d-ciudad");
  const paquetes = readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "indice.json");
  it("llegan semáforos, pasos peatonales y banquetas de OSM, y ningún semáforo queda en la calzada", () => {
    let semaforos = 0;
    for (const f of paquetes) {
      const c = JSON.parse(readFileSync(resolve(dir, f), "utf8")) as {
        escenario: {
          via: { capas: { nombre: string; posiciones: number[]; indices: number[] }[] };
          dispositivos: { id: string; x: number; y: number }[];
        };
      };
      const calzada = c.escenario.via.capas.find((k) => k.nombre === "calzada");
      for (const d of c.escenario.dispositivos.filter((x) => x.id.startsWith("osm-semaforo"))) {
        semaforos++;
        const p = calzada!.posiciones;
        const i = calzada!.indices;
        for (let t = 0; t < i.length; t += 3) {
          const [a, b, q] = [i[t]!, i[t + 1]!, i[t + 2]!].map((k) => ({
            x: p[k * 2]!,
            y: p[k * 2 + 1]!,
          }));
          const s1 = (b!.x - a!.x) * (d.y - a!.y) - (b!.y - a!.y) * (d.x - a!.x);
          const s2 = (q!.x - b!.x) * (d.y - b!.y) - (q!.y - b!.y) * (d.x - b!.x);
          const s3 = (a!.x - q!.x) * (d.y - q!.y) - (a!.y - q!.y) * (d.x - q!.x);
          const dentro = (s1 > 0 && s2 > 0 && s3 > 0) || (s1 < 0 && s2 < 0 && s3 < 0);
          expect(dentro, `${f}: ${d.id} sobre la calzada`).toBe(false);
        }
      }
    }
    expect(semaforos).toBeGreaterThan(20);
  });
});
