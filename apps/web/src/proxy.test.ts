// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { proxy } from "./proxy";

const pedir = (auth?: string) =>
  new NextRequest("http://localhost/cesvi", auth ? { headers: { authorization: auth } } : {});
const basic = (u: string, c: string) => `Basic ${btoa(`${u}:${c}`)}`;

describe("protección de /cesvi", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("con clave: pide credenciales y solo deja pasar las correctas", () => {
    vi.stubEnv("CROQUIS_CESVI_USUARIO", "perito");
    vi.stubEnv("CROQUIS_CESVI_CLAVE", "s3creta");
    const sin = proxy(pedir());
    expect(sin.status).toBe(401);
    expect(sin.headers.get("www-authenticate")).toMatch(/^Basic /);
    expect(proxy(pedir(basic("perito", "otra"))).status).toBe(401);
    expect(proxy(pedir(basic("otro", "s3creta"))).status).toBe(401);
    expect(proxy(pedir(basic("perito", "s3creta"))).status).toBe(200);
  });

  it("sin clave en Vercel no abre (falla cerrada)", () => {
    vi.stubEnv("CROQUIS_CESVI_CLAVE", "");
    vi.stubEnv("VERCEL", "1");
    expect(proxy(pedir()).status).toBe(503);
  });

  it("sin clave fuera de Vercel (desarrollo y pruebas) abre", () => {
    vi.stubEnv("CROQUIS_CESVI_CLAVE", "");
    vi.stubEnv("VERCEL", "");
    expect(proxy(pedir()).status).toBe(200);
  });
});
