// @vitest-environment node
import { describe, expect, it } from "vitest";
import { overpassConRelevo } from "./overpass-relevo";

const INSTANCIAS = [
  { url: "https://a.test/api/interpreter", esperaS: 15 },
  { url: "https://b.test/api/interpreter", esperaS: 15 },
  { url: "https://c.test/api/interpreter", esperaS: 15 },
];
const ok = (n: number) => new Response(JSON.stringify({ elements: [{ type: "node", id: n }] }));

/** Una réplica que no contesta hasta que la cancelan. */
const colgada = (init?: RequestInit) =>
  new Promise<Response>((_, rechazar) =>
    init?.signal?.addEventListener("abort", () => rechazar(new Error("abortada"))),
  );

describe("Overpass con relevo entre réplicas (René, 2026-11-28)", () => {
  it("una réplica colgada no retiene la búsqueda: la siguiente arranca al relevo y gana", async () => {
    const pedidas: string[] = [];
    const t0 = Date.now();
    const d = await overpassConRelevo<{ elements: { id: number }[] }>(
      "q",
      (async (u: RequestInfo | URL, init?: RequestInit) => {
        pedidas.push(String(u));
        return String(u).includes("a.test") ? colgada(init) : ok(2);
      }) as typeof fetch,
      Date.now() + 30_000,
      { instancias: INSTANCIAS, relevoMs: 50, pausa: async () => undefined },
    );
    expect(d?.elements[0]!.id).toBe(2);
    expect(pedidas).toEqual([INSTANCIAS[0]!.url, INSTANCIAS[1]!.url]);
    expect(Date.now() - t0).toBeLessThan(2000);
  });

  it("caídas las tres en la primera vuelta (502, error, sin elements): responde la segunda", async () => {
    let n = 0;
    const d = await overpassConRelevo<{ elements: { id: number }[] }>(
      "q",
      (async () => {
        n++;
        if (n === 1) return new Response("", { status: 502 });
        if (n === 2) throw new Error("red");
        if (n === 3)
          return new Response(JSON.stringify({ remark: "runtime error: timed out", elements: [] }));
        return ok(4);
      }) as typeof fetch,
      Date.now() + 30_000,
      { instancias: INSTANCIAS, relevoMs: 50, pausa: async () => undefined },
    );
    expect(n).toBe(4);
    expect(d?.elements[0]!.id).toBe(4);
  });

  it("si nadie responde dentro del tope: null (el mapa no respondió), nunca una respuesta vacía", async () => {
    const d = await overpassConRelevo(
      "q",
      (async () => new Response("", { status: 504 })) as typeof fetch,
      Date.now() + 30_000,
      { instancias: INSTANCIAS, relevoMs: 50, pausa: async () => undefined },
    );
    expect(d).toBeNull();
  });
});
