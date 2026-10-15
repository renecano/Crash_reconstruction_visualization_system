import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BudgetExceededError, LLMError, promptFingerprint, systemPrompt } from "../claude-output";
import { sha256Hex } from "../hash";
import { budgetUsd, FileBudgetStore, MemoryBudgetStore, RedisBudgetStore, today } from "./budget";
import { callClaude, extract, type ClientLike } from "./claude";
import { MemoryRateLimiter } from "./rate-limit";
import { loadRecording, RECORDINGS, recordingPath, saveRecording } from "./recordings";

const OUTPUT = {
  vehiculos: [{ narrador: true }],
  personas: [],
  hechos: [{ campo: "evento.tipo", vehiculo: -1, persona: -1, valor: "derrape", cita: "derrapé" }],
  dispositivos: [],
  preguntas: [],
};

interface Call {
  api: "messages" | "beta";
  params: Record<string, unknown>;
}

function fakeClient(opts: { stop?: string; model?: string } = {}): {
  client: ClientLike;
  calls: Call[];
} {
  const calls: Call[] = [];
  const body = JSON.stringify(OUTPUT);
  const make = (api: Call["api"]) => ({
    stream: (params: Record<string, unknown>) => {
      calls.push({ api, params });
      const listeners: ((d: string, s: string) => void)[] = [];
      return {
        request_id: "req_prueba",
        on(_event: string, l: (d: string, s: string) => void) {
          listeners.push(l);
          return this;
        },
        finalMessage() {
          for (let i = 10; i <= body.length; i += 10)
            listeners.forEach((l) => l("", body.slice(0, i)));
          return Promise.resolve({
            stop_reason: opts.stop ?? "end_turn",
            stop_details: null,
            model: opts.model ?? (params.model as string),
            content: [{ type: "text", text: body }],
            usage: {
              input_tokens: 1000,
              output_tokens: 200,
              cache_creation_input_tokens: 0,
              cache_read_input_tokens: 3000,
            },
          });
        },
      };
    },
  });
  return {
    client: {
      messages: make("messages"),
      beta: { messages: make("beta") },
    } as unknown as ClientLike,
    calls,
  };
}

describe("llamada a Claude (doble del SDK)", () => {
  it("Sonnet usa el respaldo del servidor, salida estructurada y el prompt cacheado", async () => {
    const { client, calls } = fakeClient();
    const progress: number[] = [];
    const rec = await callClaude(client, "derrapé", "claude-sonnet-5-5", "medium", (n) =>
      progress.push(n),
    );
    expect(calls[0]!.api).toBe("beta");
    expect(calls[0]!.params.fallbacks).toBe("default");
    expect(calls[0]!.params.betas).toEqual(["server-side-fallback-2026-07-01"]);
    const oc = calls[0]!.params.output_config as { format: { type: string } };
    expect(oc.format.type).toBe("json_schema");
    const system = calls[0]!.params.system as { cache_control: unknown }[];
    expect(system[0]!.cache_control).toEqual({ type: "ephemeral" });
    expect(rec.salida).toEqual(OUTPUT);
    expect(rec.huella_prompt).toBe(promptFingerprint());
    expect(rec.texto_sha256).toBe(sha256Hex("derrapé"));
    // 1000 × $2 + 200 × $10 + 3000 × $0.2, por millón.
    expect(rec.costo_usd).toBeCloseTo(0.0046, 10);
    expect(rec.request_id).toBe("req_prueba");
    expect(progress.length).toBeGreaterThan(0);
  });

  it("Haiku usa la API estable; rechazo y truncado son errores", async () => {
    const { client, calls } = fakeClient();
    await callClaude(client, "x", "claude-haiku-5-5");
    expect(calls[0]!.api).toBe("messages");
    await expect(callClaude(fakeClient({ stop: "refusal" }).client, "x")).rejects.toThrow(LLMError);
    await expect(callClaude(fakeClient({ stop: "max_tokens" }).client, "x")).rejects.toThrow(
      /max_tokens/,
    );
    await expect(callClaude(client, "x", "otro-modelo")).rejects.toThrow(/no soportado/);
  });

  it("si el respaldo sirve con otro modelo con precio, se cobra con ese", async () => {
    const rec = await callClaude(fakeClient({ model: "claude-opus-5-5" }).client, "x");
    expect(rec.modelo_respuesta).toBe("claude-opus-5-5");
    expect(rec.costo_estimado_con).toBe("claude-opus-5-5");
  });
});

describe("modos y tope de gasto", () => {
  it("replay lee la grabación existente y valida texto y huella", () => {
    const key = readdirSync(join(RECORDINGS, "claude-sonnet-5-5"))[0]!.replace(/\.json$/, "");
    expect(() => loadRecording("claude-sonnet-5-5", key, "otro texto")).toThrow(/otro texto/);
    expect(() => loadRecording("claude-sonnet-5-5", "no-existe", "x")).toThrow(/Sin respuesta/);
    expect(() => recordingPath("claude-sonnet-5-5", "../fuera")).toThrow(/inválida/);
  });

  it("record graba, cobra y la grabación se reproduce", async () => {
    const root = mkdtempSync(join(tmpdir(), "croquis-rec-"));
    const store = new MemoryBudgetStore();
    const { client } = fakeClient();
    const rec = await extract("derrapé", "caso-1", "claude-haiku-5-5", {
      mode: "record",
      client,
      root,
      budget: 1,
      budgetStore: store,
    });
    expect(await store.spentToday()).toBeCloseTo(rec.costo_usd, 10);
    const again = await extract("derrapé", "caso-1", "claude-haiku-5-5", {
      mode: "replay",
      root,
      budgetStore: store,
    });
    expect(again.salida).toEqual(rec.salida);
  });

  it("cada versión del prompt graba y reproduce en su carpeta", async () => {
    const root = mkdtempSync(join(tmpdir(), "croquis-rec-"));
    const store = new MemoryBudgetStore();
    const { client, calls } = fakeClient();
    const rec = await extract("derrapé", "caso-2", "claude-haiku-5-5", {
      mode: "record",
      client,
      root,
      budget: 1,
      budgetStore: store,
      prompt: "extraccion_v2",
    });
    const system = calls[0]!.params.system as { text: string }[];
    expect(system[0]!.text).toBe(systemPrompt("extraccion_v2"));
    expect(system[0]!.text).toContain("- aveo → sedan_compacto");
    expect(rec.prompt).toBe("extraccion_v2");
    expect(rec.huella_prompt).toBe(promptFingerprint("extraccion_v2"));
    expect(recordingPath("claude-haiku-5-5", "caso-2", root, "extraccion_v2")).toBe(
      join(root, "extraccion_v2", "claude-haiku-5-5", "caso-2.json"),
    );
    // Una grabación de v2 no vale como de v1 (otra carpeta y otra huella).
    expect(() => loadRecording("claude-haiku-5-5", "caso-2", "derrapé", root)).toThrow(
      /Sin respuesta/,
    );
    const again = loadRecording("claude-haiku-5-5", "caso-2", "derrapé", root, "extraccion_v2");
    expect(again.salida).toEqual(rec.salida);
    expect(() => systemPrompt("extraccion_v9")).toThrow(/desconocida/);
  });

  it("sin tope o con el tope gastado no llama a la API", async () => {
    const { client, calls } = fakeClient();
    const store = new MemoryBudgetStore();
    const run = (budget: number) =>
      extract("x", "k", "claude-haiku-5-5", { mode: "live", client, budget, budgetStore: store });
    await expect(run(0)).rejects.toThrow(BudgetExceededError);
    await store.charge(0.5);
    await expect(run(0.5)).rejects.toThrow(BudgetExceededError);
    expect(calls).toHaveLength(0);
    await run(1);
    expect(calls).toHaveLength(1);
    expect(budgetUsd({ CROQUIS_LLM_DAILY_BUDGET_USD: "8" })).toBe(8);
    expect(budgetUsd({})).toBe(0);
  });
});

describe("libros de gasto y límite de peticiones", () => {
  it("el libro en archivo usa el formato de la referencia Python", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "croquis-gasto-")), "gasto.json");
    const store = new FileBudgetStore(path);
    await store.charge(0.1);
    await store.charge(0.2);
    expect(await store.spentToday()).toBeCloseTo(0.3, 10);
    expect(JSON.parse(readFileSync(path, "utf-8"))).toEqual({ [today()]: 0.3 });
  });

  it("el libro en Redis suma por día y caduca", async () => {
    const data = new Map<string, number>();
    const expires: string[] = [];
    const redis = {
      get: (k: string) => Promise.resolve(data.get(k) ?? null),
      incrbyfloat: (k: string, v: number) => {
        data.set(k, (data.get(k) ?? 0) + v);
        return Promise.resolve(data.get(k)!);
      },
      expire: (k: string) => {
        expires.push(k);
        return Promise.resolve(1 as const);
      },
    };
    const store = new RedisBudgetStore(redis as never);
    await store.charge(0.25);
    await store.charge(0.25);
    expect(await store.spentToday()).toBeCloseTo(0.5, 10);
    expect(expires[0]).toBe(`croquis:gasto:${today()}`);
  });

  it("la ventana en memoria limita por cliente y hora", async () => {
    let t = 0;
    const rl = new MemoryRateLimiter(2, () => t);
    expect(await rl.allow("a")).toBe(true);
    expect(await rl.allow("a")).toBe(true);
    expect(await rl.allow("a")).toBe(false);
    expect(await rl.allow("b")).toBe(true);
    t = 3_600_001;
    expect(await rl.allow("a")).toBe(true);
  });

  it("guardar y leer una grabación existente conserva su contenido", () => {
    const key = readdirSync(join(RECORDINGS, "claude-haiku-5-5"))[0]!.replace(/\.json$/, "");
    const original = JSON.parse(
      readFileSync(join(RECORDINGS, "claude-haiku-5-5", `${key}.json`), "utf-8"),
    ) as Parameters<typeof saveRecording>[0];
    const root = mkdtempSync(join(tmpdir(), "croquis-copia-"));
    const path = saveRecording(original, key, root);
    expect(JSON.parse(readFileSync(path, "utf-8"))).toEqual(original);
  });
});
