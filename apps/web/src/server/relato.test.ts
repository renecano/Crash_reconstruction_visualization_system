// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { loadFixture } from "@croquis/scene-schema";
import { MemoryBudgetStore, MemoryRateLimiter, RECORDINGS } from "@croquis/extraction/server";
import { redact } from "@croquis/extraction";
import { describe, expect, it } from "vitest";
import { POST as extraerPOST } from "@/app/api/relato/extraer/route";
import { POST as responderPOST } from "@/app/api/relato/responder/route";
import {
  clientKeyFrom,
  type Deps,
  extraerEventos,
  type ExtraerEvent,
  InvalidSpecError,
  llmUnavailable,
  responderRelato,
  type Settings,
  settingsFromEnv,
} from "./relato";

const TEXTO =
  "Iba por Paseo Tollocan en mi Aveo gris, como a 50, y la camioneta de enfrente frenó de golpe; " +
  "le pegué por detrás. Estaba lloviendo y el piso mojado.";

function settings(p: Partial<Settings> = {}): Settings {
  return {
    apiKey: "",
    model: "claude-sonnet-5-5",
    budgetUsd: 2,
    rateLimitPerHour: 20,
    onVercel: false,
    hasRedis: false,
    ...p,
  };
}

function deps(p: Partial<Deps> = {}): Deps {
  return {
    settings: settings(),
    budgetStore: new MemoryBudgetStore(),
    limiter: new MemoryRateLimiter(20),
    ...p,
  };
}

async function collect(gen: AsyncGenerator<ExtraerEvent>): Promise<ExtraerEvent[]> {
  const out: ExtraerEvent[] = [];
  for await (const ev of gen) out.push(ev);
  return out;
}

/** Doble del SDK que responde con una salida grabada de Claude (sin llamar a la API). */
function recordedClient(salida: unknown) {
  const body = JSON.stringify(salida);
  const stream = () => {
    const listeners: ((d: string, s: string) => void)[] = [];
    return {
      request_id: "req_prueba",
      on(_e: string, l: (d: string, s: string) => void) {
        listeners.push(l);
        return this;
      },
      finalMessage() {
        listeners.forEach((l) => l("", body.slice(0, 40)));
        return Promise.resolve({
          stop_reason: "end_turn",
          stop_details: null,
          model: "claude-sonnet-5-5",
          content: [{ type: "text", text: body }],
          usage: { input_tokens: 900, output_tokens: 300 },
        });
      },
    };
  };
  return { messages: { stream }, beta: { messages: { stream } } } as never;
}

describe("extracción (servidor)", () => {
  it("sin llave usa las reglas y explica por qué", async () => {
    const evs = await collect(extraerEventos({ texto: TEXTO, metodo: "auto" }, "1.1.1.1", deps()));
    const res = evs.find((e) => e.tipo === "resultado");
    expect(res?.tipo).toBe("resultado");
    if (res?.tipo !== "resultado") return;
    expect(res.datos.metodo).toBe("reglas");
    expect(res.datos.verificador.degradados).toBe(0);
    expect(res.datos.glosario.some((t) => t.id === "alcance" || t.texto.length > 0)).toBe(true);
    expect(res.datos.preguntas.length).toBeLessThanOrEqual(3);
    const forced = await collect(
      extraerEventos({ texto: TEXTO, metodo: "claude" }, "1.1.1.1", deps()),
    );
    const r2 = forced.find((e) => e.tipo === "resultado");
    expect(r2?.tipo === "resultado" && r2.datos.motivo).toMatch(/no está configurado/);
  });

  it("con Claude (respuesta grabada) da la spec del pipeline y cobra el gasto", async () => {
    const dir = join(RECORDINGS, "claude-sonnet-5-5");
    const file = readdirSync(dir).find((f) => f.startsWith("rmx-d0"))!;
    const rec = JSON.parse(readFileSync(join(dir, file), "utf-8")) as { salida: unknown };
    const store = new MemoryBudgetStore();
    const d = deps({
      settings: settings({ apiKey: "sk-prueba" }),
      budgetStore: store,
      client: recordedClient(rec.salida),
    });
    const evs = await collect(extraerEventos({ texto: TEXTO, metodo: "auto" }, "1.1.1.1", d));
    expect(evs[0]).toEqual({ tipo: "inicio", metodo: "claude" });
    const res = evs.find((e) => e.tipo === "resultado");
    expect(res?.tipo === "resultado" && res.datos.metodo).toBe("claude");
    expect(await store.spentToday()).toBeGreaterThan(0);
  });

  it("respeta el límite por cliente y el tope gastado", async () => {
    const limiter = new MemoryRateLimiter(0);
    const d = deps({ settings: settings({ apiKey: "sk-prueba" }), limiter });
    const evs = await collect(extraerEventos({ texto: TEXTO, metodo: "auto" }, "1.1.1.1", d));
    const res = evs.find((e) => e.tipo === "resultado");
    expect(res?.tipo === "resultado" && res.datos.motivo).toMatch(/Límite de peticiones/);
    const store = new MemoryBudgetStore();
    await store.charge(5);
    const d2 = deps({
      settings: settings({ apiKey: "sk-prueba", budgetUsd: 2 }),
      budgetStore: store,
    });
    const evs2 = await collect(extraerEventos({ texto: TEXTO, metodo: "auto" }, "1.1.1.1", d2));
    const r2 = evs2.find((e) => e.tipo === "resultado");
    expect(r2?.tipo === "resultado" && r2.datos.motivo).toMatch(/Tope de gasto/);
  });

  it("en Vercel sin Upstash no gasta en Claude (no hay dónde llevar el tope)", () => {
    expect(llmUnavailable(settings({ apiKey: "sk", onVercel: true }))).toMatch(/Upstash/);
    expect(llmUnavailable(settings({ apiKey: "sk", onVercel: true, hasRedis: true }))).toBeNull();
    expect(llmUnavailable(settings({ apiKey: "sk" }))).toBeNull();
    const s = settingsFromEnv({
      VERCEL: "1",
      ANTHROPIC_API_KEY: "sk",
    } as unknown as NodeJS.ProcessEnv);
    expect(s.onVercel).toBe(true);
    expect(s.hasRedis).toBe(false);
  });

  it("vuelve a redactar en el servidor lo que el navegador dejó pasar", async () => {
    const evs = await collect(
      extraerEventos(
        { texto: "Me llamo Ana Pérez y choqué con un poste", metodo: "reglas" },
        "x",
        deps(),
      ),
    );
    const res = evs.find((e) => e.tipo === "resultado");
    expect(res?.tipo === "resultado" && res.datos.texto).not.toMatch(/Ana Pérez/);
    expect(res?.tipo === "resultado" && res.datos.redacciones_servidor).toBeGreaterThan(0);
  });

  it("el cliente del límite es la primera IP reenviada", () => {
    expect(clientKeyFrom(new Headers({ "x-forwarded-for": "10.0.0.1, 10.0.0.2" }))).toBe(
      "10.0.0.1",
    );
    expect(clientKeyFrom(new Headers())).toBe("anon");
  });
});

describe("respuestas (servidor)", () => {
  it("aplica la respuesta como dato de la persona y propone otra ronda", () => {
    const spec = loadFixture("alcance") as unknown as Record<string, unknown>;
    const out = responderRelato({
      spec,
      texto: String((spec.meta as Record<string, unknown>).relato),
      respuestas: { estado_superficie: "mojado" },
      contestadas: [],
    });
    expect(out.aplicadas).toEqual(["estado_superficie"]);
    expect(
      (out.spec.lugar as Record<string, Record<string, unknown>>).estado_superficie,
    ).toMatchObject({
      valor: "mojado",
      fuente: "usuario",
    });
    expect(out.preguntas.every((q) => q.id !== "estado_superficie")).toBe(true);
  });

  it("rechaza una escena que no cumple el contrato", () => {
    expect(() =>
      responderRelato({ spec: { x: 1 }, texto: null, respuestas: {}, contestadas: [] }),
    ).toThrow(InvalidSpecError);
  });
});

describe("Route Handlers", () => {
  it("POST /api/relato/extraer responde NDJSON con el resultado", async () => {
    const res = await extraerPOST(
      new Request("http://localhost/api/relato/extraer", {
        method: "POST",
        body: JSON.stringify({ texto: redact(TEXTO).text, metodo: "reglas" }),
      }),
    );
    expect(res.headers.get("content-type")).toMatch(/ndjson/);
    const lines = (await res.text())
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l) as ExtraerEvent);
    expect(lines.at(-1)?.tipo).toBe("resultado");
  });

  it("valida el cuerpo", async () => {
    const bad = await extraerPOST(
      new Request("http://localhost/api/relato/extraer", {
        method: "POST",
        body: JSON.stringify({ texto: "" }),
      }),
    );
    expect(bad.status).toBe(422);
    const notJson = await responderPOST(
      new Request("http://localhost/api/relato/responder", { method: "POST", body: "{" }),
    );
    expect(notJson.status).toBe(400);
    const invalid = await responderPOST(
      new Request("http://localhost/api/relato/responder", {
        method: "POST",
        body: JSON.stringify({ spec: { x: 1 } }),
      }),
    );
    expect(invalid.status).toBe(422);
  });
});
