import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { escenaDeNarracion, problemasExpediente, type SalidaCorpus } from "@croquis/cesvi";
import { describe, expect, it } from "vitest";
import { casoParaGuardar, huellaDelCaso } from "./caso-guardado";
import {
  abrirGuardado,
  borrarGuardado,
  casoDeReporte,
  casosGuardados,
  guardarCaso,
  idNuevo,
  RUTAS,
  type Almacen,
} from "./casos";
import { PAGINA } from "./reproduccion-dictamenes";

const aqui = dirname(fileURLToPath(import.meta.url));
const grabada = JSON.parse(
  readFileSync(
    resolve(aqui, "../../../../data/cesvi/grabaciones/escenas/cesvi-e814f085db.json"),
    "utf8",
  ),
) as { narracion: string; salida: SalidaCorpus };
const escena = escenaDeNarracion(grabada.salida, grabada.narracion);

const memoria = (): Almacen & { datos: Map<string, string> } => {
  const datos = new Map<string, string>();
  return {
    datos,
    getItem: (k) => datos.get(k) ?? null,
    setItem: (k, v) => void datos.set(k, v),
    removeItem: (k) => void datos.delete(k),
  };
};

describe("los casos de /cesvi como una sola aplicación (ADR 0079)", () => {
  it("las rutas de cada caso", () => {
    expect(RUTAS.axa).toBe("/cesvi/casos/a2010930");
    expect(RUTAS.reporte("cesvi-abc")).toBe("/cesvi/casos/reporte/cesvi-abc");
  });

  it("un reporte de la reproducción abre con su escena, lo que concluyó CESVI y la comparación medida", () => {
    const c = casoDeReporte(PAGINA.casos[0]!);
    expect(c.origen).toBe("reporte");
    expect(c.reporte!.conclusiones).toBe(PAGINA.casos[0]!.conclusiones);
    expect(c.comparacion).toBe(PAGINA.casos[0]!.comparacion);
    expect(c.escena!.problemas).toEqual([]);
  });

  it("los reportes sin impacto en la narración lo toman de las zonas que concluyó CESVI (V2)", () => {
    const sin = PAGINA.casos.filter((c) => !(c.expediente.impactos ?? []).length);
    // Con dos vehículos en las zonas de CESVI que también están en la lectura de Croquis.
    const dos = sin.filter((c) => {
      const ids = new Set(c.expediente.vehiculos.map((v) => v.id as string));
      return (
        new Set(c.conclusiones.zonas_contacto.map((z) => z.vehiculo).filter((v) => ids.has(v)))
          .size >= 2
      );
    });
    expect(dos.length).toBeGreaterThan(50);
    for (const r of dos) {
      const e = casoDeReporte(r).escena!.expediente;
      expect(e.impactos?.[0]?.fuente).toBe("dictamen_importado");
      expect(problemasExpediente(e)).toEqual([]);
    }
    // El expediente de la evaluación no cambia: la comparación sigue siendo la medida.
    expect(dos[0]!.expediente.impactos ?? []).toEqual([]);
  });

  it("guarda en este equipo, lista del más reciente, abre con su validación y su reporte, y borra", () => {
    const a = memoria();
    const validacion = {
      perito: "Perito de prueba",
      conclusion: "Conclusión.",
      fecha: "2026-10-23T15:00:00.000Z",
      huella: huellaDelCaso(escena.expediente, grabada.narracion),
    };
    const reporte = { nombre: "Reporte X", conclusiones: PAGINA.casos[0]!.conclusiones };
    const archivo = (titulo: string, iso: string, v: typeof validacion | null) =>
      casoParaGuardar({
        narracion: grabada.narracion,
        escena,
        expediente: escena.expediente,
        validacion: v,
        titulo,
        reporte,
        ahora: new Date(iso),
      });
    guardarCaso(a, "uno", archivo("Primero", "2026-10-22T10:00:00.000Z", null));
    guardarCaso(a, "dos", archivo("Segundo", "2026-10-23T10:00:00.000Z", validacion));
    expect(casosGuardados(a).map((c) => [c.id, c.titulo, c.validado, c.conReporte])).toEqual([
      ["dos", "Segundo", true, true],
      ["uno", "Primero", false, true],
    ]);
    const abierto = abrirGuardado(a, "dos")!;
    expect(abierto.titulo).toBe("Segundo");
    expect(abierto.validacion).toEqual(validacion);
    expect(abierto.reporte).toEqual(reporte);
    expect(abierto.escena!.expediente).toEqual(escena.expediente);
    // Guardar otra vez el mismo caso lo reemplaza.
    guardarCaso(a, "uno", archivo("Primero bis", "2026-10-24T10:00:00.000Z", null));
    expect(casosGuardados(a).map((c) => c.titulo)).toEqual(["Primero bis", "Segundo"]);
    borrarGuardado(a, "dos");
    expect(casosGuardados(a).map((c) => c.id)).toEqual(["uno"]);
    expect(abrirGuardado(a, "dos")).toBeNull();
  });

  it("un almacén vacío o dañado no rompe la lista", () => {
    const a = memoria();
    expect(casosGuardados(a)).toEqual([]);
    a.setItem("croquis:casos:v1", "{no es json");
    expect(casosGuardados(a)).toEqual([]);
    a.setItem("croquis:caso:x", "{");
    expect(abrirGuardado(a, "x")).toBeNull();
  });

  it("los identificadores nuevos no llevan datos del caso", () => {
    expect(idNuevo(0, 0)).toBe("00000");
    expect(idNuevo(1_700_000_000_000, 0.5)).toMatch(/^[0-9a-z]+$/);
  });
});
