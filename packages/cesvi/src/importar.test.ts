import { describe, expect, it } from "vitest";
import type { FilaCorpus } from "./corpus";
import { importarDictamen, resumenTexto } from "./importar";
import type { SalidaNarracion } from "./narracion";

const TEXTO = `DICTAMEN TÉCNICO DEL HECHO DE TRÁNSITO EN SU MODALIDAD DE ALCANCE.
Intervienen el vehículo A, marca Nissan, tipo Tsuru, y el vehículo B, marca Chevrolet, tipo Aveo.
El vehículo A presenta daños en su parte frontal, con una masa de 1050 kg.
Se concluye que la modalidad del hecho es un alcance.`;

const fila = (
  f: Partial<FilaCorpus> & Pick<FilaCorpus, "seccion" | "campo" | "valor">,
): FilaCorpus => ({
  n: 1,
  vehiculo: "ninguno",
  cita: "",
  ...f,
});

const CORPUS = {
  datos: [
    fila({
      seccion: "vehiculo",
      vehiculo: "V1",
      campo: "modelo",
      valor: "Tsuru",
      cita: "vehículo A, marca Nissan, tipo Tsuru",
    }),
    fila({
      seccion: "vehiculo",
      n: 2,
      vehiculo: "V2",
      campo: "modelo",
      valor: "Aveo",
      cita: "vehículo B, marca Chevrolet, tipo Aveo",
    }),
    fila({
      seccion: "vehiculo",
      vehiculo: "V1",
      campo: "masa",
      valor: "1050 kg",
      cita: "con una masa de 1050 kg",
    }),
    // Una cita que no está en el texto: el dato se descarta y se cuenta.
    fila({
      seccion: "vehiculo",
      vehiculo: "V1",
      campo: "anio",
      valor: "1999",
      cita: "modelo 1999",
    }),
  ],
};

const NARRACION: SalidaNarracion = {
  descripcion:
    "Intervienen el vehículo A (Tsuru) y el vehículo B (Aveo). El vehículo A presenta daños en su parte frontal.",
  conclusiones: {
    modalidad: "alcance",
    modalidad_cita: "la modalidad del hecho es un alcance",
    zonas_contacto: [],
    secuencia: [],
    velocidades: [],
    posiciones_finales: [],
  },
};

describe("dictamen importado (R5)", () => {
  it("arma el expediente con las citas revisadas y la narración con lo que concluyó CESVI", () => {
    const d = importarDictamen(TEXTO, CORPUS, NARRACION, "dictamen.md");
    expect(d.expediente.vehiculos.map((v) => v.id)).toEqual(["V1", "V2"]);
    expect(d.expediente.vehiculos[0]).toMatchObject({
      modelo: { valor: "Tsuru", fuente: "dictamen_importado" },
      masa: { valor: 1050, unidad: "kg", fuente: "dictamen_importado" },
    });
    expect(d.expediente.vehiculos[0]!.anio).toBeUndefined();
    expect(d.conteos.citas_fuera).toBe(1);
    expect(d.narracion.conclusiones.modalidad).toBe("alcance");
    expect(d.narracion.descripcion).toContain("vehículo A (Tsuru)");
  });

  it("dice cuánto texto se va a leer", () => {
    expect(resumenTexto("  uno dos\ntres ")).toEqual({ caracteres: 12, palabras: 3 });
    expect(resumenTexto("")).toEqual({ caracteres: 0, palabras: 0 });
  });
});
