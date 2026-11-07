import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { armarCaso3d, caso3dErrors, erroresDeRelieve, type Relieve } from "./caso3d";
import { FIXTURE_NAMES, loadFixture } from "./fixtures";
import { type Resultado } from "./generated/resultado.zod";
import { loadResultado } from "./resultado";
import { NOMBRES_A_UNITY, NOMBRES_DE_UNITY, VISOR_PUENTE_VERSION } from "./visor-puente";

const RAIZ = join(__dirname, "..");
const relieve: Relieve = {
  id: "malla-prueba",
  origen: { lat: 19.3, lon: -99.1, x: -10, y: -10 },
  resolucion_m: 10,
  ancho: 3,
  alto: 2,
  alturas_m: [0, 0.5, 1, 0, 0.5, 1],
  fuente: "malla sintética de prueba",
  licencia: "no aplica",
  resolucion_nativa_m: 30,
};

describe("el paquete caso-3d", () => {
  it("lleva la escena y el resultado tal cual, y cumple su esquema", async () => {
    const escena = loadFixture("alcance");
    const resultado = await loadResultado("alcance");
    const p = armarCaso3d(escena, resultado);
    expect(p.escena).toBe(escena);
    expect(p.resultado).toBe(resultado);
    expect(p.relieve).toBeUndefined();
    expect(caso3dErrors(p)).toEqual([]);
  });

  it("lleva el relieve cuando lo hay, y sus convenciones declaradas", async () => {
    const p = armarCaso3d(loadFixture("alcance"), await loadResultado("alcance"), relieve);
    expect(p.relieve).toBe(relieve);
    expect(p.convenciones.unity).toBe("posicion_x_z_y_yaw_90_menos_rumbo_grados");
    expect(caso3dErrors(p)).toEqual([]);
  });

  it("no mezcla una escena con el resultado de otra", () => {
    const otra = { escena_id: "otra" } as unknown as Resultado;
    expect(() => armarCaso3d(loadFixture("alcance"), otra)).toThrow(/El resultado es de/);
  });

  it("una malla con otro número de alturas no pasa", async () => {
    const mala = { ...relieve, alturas_m: [0, 1, 2] };
    expect(erroresDeRelieve(mala)[0]).toContain("deben ser 6");
    await expect(
      (async () => armarCaso3d(loadFixture("alcance"), await loadResultado("alcance"), mala))(),
    ).rejects.toThrow(/deben ser 6/);
  });

  it("si la escena pide una malla, tiene que llegar esa", async () => {
    const base = loadFixture("alcance");
    const pide = {
      ...base,
      lugar: {
        ...base.lugar,
        terreno: {
          relieve: {
            fuente: "dem" as const,
            malla_id: "malla-prueba",
            procedencia: { fuente: "mapa" as const, confianza: 0.7 },
          },
        },
      },
    };
    const r = await loadResultado("alcance");
    expect(() => armarCaso3d(pide, r)).toThrow(/no llegó ningún relieve/);
    expect(() => armarCaso3d(pide, r, { ...relieve, id: "otra" })).toThrow(/el relieve es «otra»/);
    expect(caso3dErrors(armarCaso3d(pide, r, relieve))).toEqual([]);
  });

  it("el esquema rechaza un paquete sin escena o con campos de más", async () => {
    const p = armarCaso3d(loadFixture("alcance"), await loadResultado("alcance"));
    const { escena: _e, ...sinEscena } = p;
    void _e;
    expect(caso3dErrors(sinEscena).join()).toContain("escena");
    expect(caso3dErrors({ ...p, extra: 1 }).join()).toContain("additional");
  });

  it("hay un paquete por cada caso versionado y todos cumplen el esquema", () => {
    const dir = join(RAIZ, "fixtures/caso3d");
    const archivos = readdirSync(dir).filter((f) => f.endsWith(".json"));
    for (const n of FIXTURE_NAMES) expect(archivos).toContain(`${n}.json`);
    expect(archivos.length).toBeGreaterThanOrEqual(16);
    for (const f of archivos) {
      const d = JSON.parse(readFileSync(join(dir, f), "utf8")) as unknown;
      expect(caso3dErrors(d), f).toEqual([]);
    }
  });
});

describe("el puente con Unity", () => {
  const doc = readFileSync(join(RAIZ, "visor-puente.md"), "utf8");
  const seccion = (titulo: string, sig: string) =>
    doc.slice(doc.indexOf(titulo), sig ? doc.indexOf(sig) : undefined);
  const mensajes = (t: string) => [...t.matchAll(/^\| `(\w+)`/gm)].map((m) => m[1]);

  it("el documento y los tipos nombran los mismos mensajes", () => {
    const aUnity = seccion("## De la web a Unity", "## De Unity a la web");
    const deUnity = seccion("## De Unity a la web", "## Reglas");
    expect(mensajes(aUnity)).toEqual([...NOMBRES_A_UNITY]);
    expect(mensajes(deUnity)).toEqual([...NOMBRES_DE_UNITY]);
  });

  it("el documento dice la versión de los tipos", () => {
    expect(doc).toContain(`**Versión ${VISOR_PUENTE_VERSION}.**`);
  });
});
