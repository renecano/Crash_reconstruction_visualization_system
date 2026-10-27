/**
 * R12b: la pizarra y su coordinador (ADR 0093). Las lecturas son grabadas (sin API): la de E-R1 y
 * una de E-R4 con las conclusiones de CESVI de su narración.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import type { SalidaCorpus } from "./corpus";
import type { Conclusiones } from "./dictamenes-r4";
import { escenaDeNarracion, mensajeEscena } from "./escena-narracion";
import {
  citasRechazadas,
  coordinar,
  delPerito,
  mensajeEnPalabras,
  pizarraDeEscena,
  pizarraNueva,
  type ContextoPizarra,
} from "./pizarra";
import type { Reconstruccion } from "./reconstruccion";

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = resolve(aqui, "../../..");
const grabacion = JSON.parse(
  readFileSync(resolve(raiz, "data/cesvi/grabaciones/escenas/cesvi-e814f085db.json"), "utf8"),
) as { narracion: string; salida: SalidaCorpus };

/** Una línea de un JSONL por su id, sin cargar todo el archivo en objetos. */
function linea<T>(ruta: string, id: string): T {
  const l = readFileSync(resolve(raiz, ruta), "utf8")
    .split("\n")
    .find((x) => x.startsWith(`{"id":"${id}"`));
  return JSON.parse(l!) as T;
}
const ID_R4 = "cesvi-01797b62f0";
const narracionR4 = linea<{ descripcion: string; conclusiones: Conclusiones }>(
  "data/cesvi/corpus/narraciones.jsonl",
  ID_R4,
);
const lecturaR4 = linea<{ salida: SalidaCorpus }>("data/cesvi/r4/lecturas-v2.jsonl", ID_R4).salida;

/** El Lector con respuestas grabadas: la lectura y, si se da, la relectura. */
const grabado = (lectura: SalidaCorpus, relectura: SalidaCorpus | null = null) =>
  vi.fn<ContextoPizarra["leer"]>((_n, rechazadas) =>
    Promise.resolve(rechazadas ? relectura : lectura),
  );

describe("la pizarra y el coordinador (R12b)", () => {
  it("la escena es la misma que sin pizarra, y la bitácora dice quién hizo qué", async () => {
    const p = await coordinar(pizarraNueva(grabacion.narracion), {
      leer: grabado(grabacion.salida),
    });
    expect(p.escena).toEqual(escenaDeNarracion(grabacion.salida, grabacion.narracion));
    expect(p.preguntas).toEqual(p.escena!.preguntas);
    expect(p.bitacora.map((m) => m.de)).toEqual([
      "lector",
      "verificador_citas",
      "validador",
      "preguntador",
      "verificador_cesvi",
    ]);
    // Sin solver en el contexto, el Físico espera; sin conclusiones, el Comparador también.
    expect(p.reconstruccion).toBeNull();
    expect(mensajeEnPalabras(p.bitacora[0]!)).toMatch(
      /^1 · Lector IA \(escribe\): Lectura: \d+ filas/,
    );
  });

  it("el mismo caso con las mismas respuestas da la misma bitácora", async () => {
    const a = await coordinar(
      pizarraNueva(narracionR4.descripcion, { conclusiones: narracionR4.conclusiones }),
      {
        leer: grabado(lecturaR4),
      },
    );
    const b = await coordinar(
      pizarraNueva(narracionR4.descripcion, { conclusiones: narracionR4.conclusiones }),
      {
        leer: grabado(lecturaR4),
      },
    );
    expect(a.bitacora).toEqual(b.bitacora);
    expect(a.comparacion).toEqual(b.comparacion);
    expect(a.bitacora.some((m) => m.de === "comparador")).toBe(true);
  });

  it("el Verificador rechaza una cita que no está y pide releer; sin relectura sigue con lo verificado", async () => {
    const inventada = "el vehículo circulaba a exceso de velocidad por la lateral";
    const conCitaFalsa: SalidaCorpus = {
      datos: [
        ...grabacion.salida.datos,
        {
          seccion: "restos",
          n: 9,
          vehiculo: "ninguno",
          campo: "longitud",
          valor: "12 m",
          cita: inventada,
        },
      ],
    };
    expect(citasRechazadas(conCitaFalsa, grabacion.narracion)).toContain(inventada);
    const leer = grabado(conCitaFalsa, null);
    const p = await coordinar(pizarraNueva(grabacion.narracion), { leer });
    expect(leer).toHaveBeenCalledTimes(2);
    expect(leer.mock.calls[1]![1]).toContain(inventada);
    const rechazo = p.bitacora.find((m) => m.tipo === "rechaza")!;
    expect(rechazo).toMatchObject({ de: "verificador_citas", para: "lector" });
    expect(p.bitacora.find((m) => m.de === "lector" && m.tipo === "avisa")?.texto).toBe(
      "No hay relectura: se sigue con los datos ya verificados.",
    );
    // El dato sin cita no entra: la escena es la de la lectura sin él.
    expect(p.escena!.expediente).toEqual(
      escenaDeNarracion(conCitaFalsa, grabacion.narracion).expediente,
    );
    expect(p.relecturas).toBe(1);
  });

  it("con una relectura que rechaza menos, se usa la relectura", async () => {
    const conCitaFalsa: SalidaCorpus = {
      datos: [
        ...grabacion.salida.datos,
        {
          seccion: "restos",
          n: 9,
          vehiculo: "ninguno",
          campo: "longitud",
          valor: "12 m",
          cita: "una cita que no está",
        },
      ],
    };
    const p = await coordinar(pizarraNueva(grabacion.narracion), {
      leer: grabado(conCitaFalsa, grabacion.salida),
    });
    expect(p.lecturas).toHaveLength(2);
    expect(p.bitacora.map((m) => m.texto)).toContain(
      "La relectura tiene menos datos rechazados: se usa la relectura.",
    );
    expect(p.escena).toEqual(escenaDeNarracion(grabacion.salida, grabacion.narracion));
  });

  it("cuando la física no cuadra, el Físico le pide evidencia al Preguntador", async () => {
    const leida = await coordinar(pizarraNueva(grabacion.narracion), {
      leer: grabado(grabacion.salida),
    });
    const sid = "veh-a";
    const reconstruccion = {
      ids: { [sid]: "V1" },
      velocidades: [
        { vehiculo: "V1", previa: { mejor: 52.4, p10: 48.1, p90: 57.9 }, impacto: null },
      ],
      resultado: { consistencia: [{ codigo: "velocidad_vs_evidencia", datos: { vehiculo: sid } }] },
    } as unknown as Reconstruccion;
    const reconstruir = vi.fn(() => Promise.resolve(reconstruccion));
    const p = await coordinar(delPerito(leida, "Pide reconstruir.", { pideReconstruir: true }), {
      leer: grabado(grabacion.salida),
      reconstruir,
    });
    expect(reconstruir).toHaveBeenCalledTimes(1);
    const nuevos = p.bitacora.slice(leida.bitacora.length);
    expect(nuevos.map((m) => [m.de, m.para, m.tipo])).toEqual([
      ["perito", "pizarra", "escribe"],
      ["fisico", "pizarra", "escribe"],
      ["fisico", "preguntador", "pide"],
      ["preguntador", "fisico", "escribe"],
    ]);
    expect(nuevos[1]!.texto).toBe("Reconstrucción: V1 a 52.40 km/h (48.10–57.90).");
    expect(p.preguntas.at(-1)).toMatchObject({ clave: "huella-V1", control: { tipo: "numero" } });
    // Volver a coordinar sin cambios no repite nada: espera al perito.
    const otra = await coordinar(p, { leer: grabado(grabacion.salida), reconstruir });
    expect(otra.bitacora).toEqual(p.bitacora);
  });

  it("la primera lectura usa el mensaje de siempre; la relectura dice qué citas no estaban", () => {
    expect(mensajeEscena("Texto.")).toBe("Narración del perito:\n\nTexto.");
    const relectura = mensajeEscena("Texto.", ["una cita"]);
    expect(relectura.startsWith("Narración del perito:\n\nTexto.\n\n")).toBe(true);
    expect(relectura).toContain("- «una cita»");
  });

  it("un caso que abre con su escena ya leída no vuelve a leer: el Físico actúa directo", async () => {
    const escena = escenaDeNarracion(grabacion.salida, grabacion.narracion);
    const leer = grabado(grabacion.salida);
    const reconstruccion = {
      ids: { "veh-a": "V1" },
      velocidades: [],
      resultado: { consistencia: [] },
    } as unknown as Reconstruccion;
    const p = await coordinar(
      delPerito(
        pizarraDeEscena(grabacion.narracion, escena, { origen: "caso de ejemplo" }),
        "Pide reconstruir.",
        {
          pideReconstruir: true,
        },
      ),
      { leer, reconstruir: () => Promise.resolve(reconstruccion) },
    );
    expect(leer).not.toHaveBeenCalled();
    // Sin velocidades fijadas, el Físico pide las posiciones finales; el Preguntador ya las tenía.
    expect(p.bitacora.map((m) => [m.de, m.tipo])).toEqual([
      ["perito", "escribe"],
      ["perito", "escribe"],
      ["fisico", "escribe"],
      ["fisico", "pide"],
      ["preguntador", "escribe"],
      ["verificador_cesvi", "escribe"],
    ]);
  });

  it("un caso guardado sigue su bitácora: se escribe después de ella, con la numeración que sigue", () => {
    const escena = escenaDeNarracion(grabacion.salida, grabacion.narracion);
    const guardada = [
      {
        n: 4,
        de: "lector" as const,
        para: "pizarra" as const,
        tipo: "escribe" as const,
        texto: "Lectura.",
      },
      {
        n: 9,
        de: "fisico" as const,
        para: "pizarra" as const,
        tipo: "escribe" as const,
        texto: "Reconstrucción.",
      },
    ];
    const p = pizarraDeEscena(grabacion.narracion, escena, {
      origen: "guardado",
      bitacora: guardada,
    });
    expect(p.bitacora.map((m) => [m.n, m.de, m.texto])).toEqual([
      [1, "lector", "Lectura."],
      [2, "fisico", "Reconstrucción."],
      [3, "perito", "Abre el caso (guardado) con su escena ya leída."],
    ]);
  });

  it("el Redactor escribe cuando el perito pide el dictamen", async () => {
    const leida = await coordinar(pizarraNueva(grabacion.narracion), {
      leer: grabado(grabacion.salida),
    });
    const p = await coordinar(delPerito(leida, "Pide el dictamen.", { pideDictamen: true }), {
      leer: grabado(grabacion.salida),
    });
    expect(p.dictamen).toBe(true);
    expect(p.bitacora.at(-1)).toMatchObject({ de: "redactor", tipo: "escribe" });
  });
});
