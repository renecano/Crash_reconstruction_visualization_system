import { describe, expect, it } from "vitest";
import { limiteDe, limitadorDe, rechazoDePedido } from "./pedido";

const pedido = (headers: Record<string, string>) =>
  new Request("https://croquis.example/api/cesvi/escena", { method: "POST", headers, body: "{}" });

/** Auditoría del 2026-11-15, I1: las rutas que gastan API revisan de dónde viene la petición. */
describe("la revisión de una petición que gasta API", () => {
  it("pasa la del propio sitio y la de un cliente que no es navegador", () => {
    expect(
      rechazoDePedido(
        pedido({
          "content-type": "application/json",
          host: "croquis.example",
          origin: "https://croquis.example",
          "sec-fetch-site": "same-origin",
        }),
      ),
    ).toBeNull();
    expect(
      rechazoDePedido(pedido({ "content-type": "application/json; charset=utf-8" })),
    ).toBeNull();
  });

  it("rechaza lo que no es JSON (415) y lo que viene de otro sitio (403)", () => {
    expect(rechazoDePedido(pedido({ "content-type": "text/plain" }))?.status).toBe(415);
    expect(
      rechazoDePedido(
        pedido({
          "content-type": "application/json",
          host: "croquis.example",
          origin: "https://otra.example",
        }),
      )?.status,
    ).toBe(403);
    expect(
      rechazoDePedido(
        pedido({ "content-type": "application/json", "sec-fetch-site": "cross-site" }),
      )?.status,
    ).toBe(403);
  });

  it("detrás del proxy de Vercel compara con el host público", () => {
    expect(
      rechazoDePedido(
        pedido({
          "content-type": "application/json",
          host: "interno:3000",
          "x-forwarded-host": "croquis.example",
          origin: "https://croquis.example",
        }),
      ),
    ).toBeNull();
  });

  it("cada ruta tiene su límite por hora; importar, la mitad", () => {
    expect(limiteDe("escena", 20)).toBe(20);
    expect(limiteDe("importar", 20)).toBe(10);
    expect(limiteDe("importar", 1)).toBe(1);
    const compartido = { allow: () => Promise.resolve(true) };
    const propio = { allow: () => Promise.resolve(false) };
    expect(limitadorDe({ limiter: compartido }, "escena")).toBe(compartido);
    expect(limitadorDe({ limiter: compartido, porRuta: { escena: propio } }, "escena")).toBe(
      propio,
    );
  });
});
