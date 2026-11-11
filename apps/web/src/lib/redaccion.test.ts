/**
 * Las rutas de `/api/cesvi` mandan a Claude el texto sin datos personales (PLAN §10), con el mismo
 * `redact()` de `/api/relato`. Un doble del cliente de Anthropic guarda cada petición y la corta.
 */
import { LLMError } from "@croquis/extraction";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { redactarValores, textoParaClaude } from "./redaccion";
import { POST as consideraciones } from "@/app/api/cesvi/consideraciones/route";
import { POST as declaracion } from "@/app/api/cesvi/declaracion/route";
import { POST as escena } from "@/app/api/cesvi/escena/route";
import { POST as hecho } from "@/app/api/cesvi/hecho/route";
import { POST as importar } from "@/app/api/cesvi/importar/route";

const RUTAS = { consideraciones, declaracion, escena, hecho, importar };

const pedidos: string[] = [];
const corta = () => ({
  finalMessage: () => Promise.reject(new LLMError("doble de prueba")),
});
const cliente = {
  messages: {
    stream: (p: unknown) => {
      pedidos.push(JSON.stringify(p));
      return corta();
    },
  },
  beta: {
    messages: {
      stream: (p: unknown) => {
        pedidos.push(JSON.stringify(p));
        return corta();
      },
    },
  },
};

vi.mock("@/server/relato", () => ({
  clientKeyFrom: () => "prueba",
  llmUnavailable: () => null,
  defaultDeps: () => ({
    settings: { model: "claude-haiku-5-5", budgetUsd: 5 },
    budgetStore: { spentToday: () => Promise.resolve(0), charge: () => Promise.resolve() },
    limiter: { allow: () => Promise.resolve(true) },
    client: cliente,
  }),
}));

const NOMBRE = "Rodolfo Martínez";
const PLACA = "MXA-123-B";
const RELATO =
  `El conductor ${NOMBRE}, del sedán blanco con placas ${PLACA}, circulaba hacia el norte por ` +
  "la avenida a unos 60 km/h cuando la camioneta gris se le atravesó en el cruce y lo impactó en " +
  "su costado derecho; el sedán quedó sobre el camellón.";

async function post(ruta: keyof typeof RUTAS, cuerpo: unknown): Promise<Response> {
  return RUTAS[ruta](
    new Request(`http://localhost/api/cesvi/${ruta}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(cuerpo),
    }),
  );
}

/** Lo que llegó a la API (cada petición): el relato, pero sin el nombre ni la placa. */
function revisarPedido() {
  expect(pedidos.length).toBeGreaterThan(0);
  for (const p of pedidos) {
    expect(p).not.toContain("Rodolfo");
    expect(p).not.toContain("Martínez");
    expect(p).not.toContain("MXA");
    expect(p).toContain("[NOMBRE]");
    expect(p).toContain("[PLACA]");
    expect(p).toContain("60 km/h");
  }
}

describe("redactar antes de mandar a Claude", () => {
  beforeEach(() => {
    pedidos.length = 0;
  });

  it("quita nombre, placa, teléfono, VIN, folio, póliza y siniestro, y redactar dos veces da lo mismo", () => {
    const t =
      `${RELATO} Tel. 722 123 4567, VIN 3N1CN7AD5HL800123, folio 2024-00123, ` +
      "póliza número 7712345678, siniestro: 04-123456-7.";
    const r = textoParaClaude(t);
    for (const dato of [
      NOMBRE,
      PLACA,
      "722 123 4567",
      "3N1CN7AD5HL800123",
      "2024-00123",
      "7712345678",
      "04-123456-7",
    ]) {
      expect(r).not.toContain(dato);
    }
    for (const m of [
      "[NOMBRE]",
      "[PLACA]",
      "[TELEFONO]",
      "[VIN]",
      "[FOLIO]",
      "[POLIZA]",
      "[SINIESTRO]",
    ]) {
      expect(r).toContain(m);
    }
    expect(textoParaClaude(r)).toBe(r);
    // Lo que no es un dato personal se queda, también la palabra «siniestro» sin número.
    expect(textoParaClaude("Reporté el siniestro a la aseguradora; iba a 60 km/h.")).toBe(
      "Reporté el siniestro a la aseguradora; iba a 60 km/h.",
    );
  });

  it("redacta los textos de un objeto a cualquier profundidad", () => {
    expect(redactarValores({ a: [`placas ${PLACA}`], b: { c: 3, d: `con ${NOMBRE}` } })).toEqual({
      a: ["placas [PLACA]"],
      b: { c: 3, d: "con [NOMBRE]" },
    });
  });

  it("/escena: la narración llega a la API sin nombre ni placa, también en la relectura", async () => {
    await post("escena", { texto: RELATO, rechazadas: [`placas ${PLACA}`] });
    revisarPedido();
  });

  it("/hecho: la descripción y los vehículos llegan sin nombre ni placa", async () => {
    await post("hecho", {
      tipo: "descripcion",
      texto: RELATO,
      vehiculos: { A: `sedán blanco placas ${PLACA}`, B: "camioneta gris" },
    });
    revisarPedido();
  });

  it("/declaracion: la declaración y la descripción de los vehículos llegan sin nombre ni placa", async () => {
    await post("declaracion", {
      texto: RELATO,
      declarante: "V1",
      vehiculos: [
        { id: "V1", descripcion: `sedán blanco, placas ${PLACA}` },
        { id: "V2", descripcion: "camioneta gris" },
      ],
    });
    revisarPedido();
  });

  it("/importar: el reporte llega a la API sin nombre ni placa", async () => {
    await post("importar", { texto: `${RELATO}\n\n${RELATO}` });
    revisarPedido();
  });

  it("/consideraciones: los hechos llegan sin nombre ni placa, con su número de caso", async () => {
    await post("consideraciones", { hechos: { caso: "A2010930", descripcion: RELATO } });
    revisarPedido();
    expect(pedidos[0]).toContain("A2010930");
  });
});
