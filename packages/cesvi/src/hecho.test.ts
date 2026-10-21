import { describe, expect, it } from "vitest";
import { caso } from "./caso";
import { ejemploHecho } from "./ejemplo";
import grabacion from "../../../data/cesvi/grabaciones/hecho-A2010930.json";
import {
  glosarioParaPrompt,
  GLOSARIO,
  ubicarCita,
  validarLectura,
  type LecturaHecho,
} from "./hecho-lectura";
import { leerConReglas } from "./hecho-reglas";
import { completitud, interpretarHecho, NO_SE } from "./hecho";

const c = caso("A2010930");
const ejemplo = ejemploHecho("A2010930")!;
const vehiculos = {
  A: `${c.vehiculos.A.marca} ${c.vehiculos.A.tipo}`,
  B: `${c.vehiculos.B.marca} ${c.vehiculos.B.tipo}`,
};

describe("glosario de CESVI", () => {
  it("sale de los 671 dictámenes y va en el prompt con su frecuencia", () => {
    expect(GLOSARIO.dictamenes).toBe(671);
    const p = glosarioParaPrompt();
    expect(p).toMatch(/Dirección de la fuerza: de adelante hacia atrás \(\d+\)/);
    expect(p).toMatch(/Modalidad: .*alcance \(\d+\)/);
  });
});

describe("ubicar una cita en el texto", () => {
  it("sin distinguir acentos, mayúsculas ni espacios repetidos", () => {
    const t = "El vehículo A  circulaba de Sur a norte.";
    expect(ubicarCita(t, "vehiculo a circulaba")?.texto).toBe("vehículo A  circulaba");
    expect(ubicarCita(t, "de oriente a poniente")).toBeNull();
  });
});

describe("lectura con reglas", () => {
  it("la descripción técnica: sentido, zonas, vértice, fuerza y restos de cada vehículo", () => {
    const l = validarLectura(
      leerConReglas(ejemplo.descripcion, "descripcion", vehiculos),
      ejemplo.descripcion,
    );
    expect(l.descartados).toBe(0);
    expect(l.modalidad?.valor).toBe("alcance");
    expect(l.vehiculos.A.zona_contacto?.valor).toBe("parte posterior");
    expect(l.vehiculos.A.vertice?.valor).toBe("vértice posterior izquierdo");
    expect(l.vehiculos.A.direccion_fuerza?.valor).toBe("de atrás hacia adelante");
    expect(l.vehiculos.B.zona_contacto?.valor).toBe("parte frontal");
    expect(l.vehiculos.B.direccion_fuerza?.valor).toBe("de adelante hacia atrás");
    expect(l.restos[0]?.metros).toBe(15.89);
    expect(l.vehiculos.A.carril).toBeNull();
  });

  it("la declaración: quien declara circula de sur a norte, se detiene y retrocede «unos metros»", () => {
    const t = c.declaracion.texto;
    const l = validarLectura(leerConReglas(t, "declaracion", vehiculos, "A"), t);
    expect(l.vehiculos.A.sentido?.hacia).toBe("norte");
    expect(l.vehiculos.A.maniobras.map((m) => m.tipo)).toEqual([
      "circula",
      "se_detiene",
      "reversa",
    ]);
    expect(l.vehiculos.A.maniobras.find((m) => m.tipo === "reversa")?.metros).toBeNull();
  });
});

describe("validación de la lectura", () => {
  it("descarta datos cuya cita no está en el texto y números que no están en su cita", () => {
    const l = leerConReglas(ejemplo.descripcion, "descripcion", vehiculos);
    l.vehiculos.A.carril = { valor: "carril derecho", cita: "por el carril derecho" };
    l.restos = [{ valor: "restos", cita: "Los restos de ambos vehículos", metros: 20 }];
    const v = validarLectura(l, ejemplo.descripcion);
    expect(v.vehiculos.A.carril).toBeNull();
    expect(v.descartados).toBe(1);
    expect(v.restos[0]?.metros).toBeNull();
  });
});

describe("interpretar el hecho", () => {
  const descripcion = {
    lectura: validarLectura(
      leerConReglas(ejemplo.descripcion, "descripcion", vehiculos),
      ejemplo.descripcion,
    ),
    leidoPor: "reglas" as const,
  };
  const declaracion = {
    lectura: validarLectura(
      leerConReglas(c.declaracion.texto, "declaracion", vehiculos, "A"),
      c.declaracion.texto,
    ),
    leidoPor: "reglas" as const,
  };
  const base = { expediente: vehiculos, declarante: "A" as const, descripcion, declaracion };

  it("la descripción arma la evidencia (perito) y la declaración arma la declarada (conductor)", () => {
    const i = interpretarHecho({ ...base, respuestas: {} });
    expect(i.evidencia.every((d) => d.fuente === "perito")).toBe(true);
    expect(i.declarada.every((d) => d.fuente === "conductor")).toBe(true);
    expect(i.expediente.every((d) => d.fuente === "expediente")).toBe(true);
    expect(i.parametros.evidencia).toEqual({ hacia: "norte", distanciaRestos: 15.89 });
    expect(i.parametros.declarada.hacia).toBe("norte");
    expect(i.parametros.declarada.reversaM).toBeNull();
  });

  it("pregunta en lenguaje técnico lo que falta: carril de A y metros de reversa", () => {
    const i = interpretarHecho({ ...base, respuestas: {} });
    expect(i.preguntas.map((p) => p.texto)).toEqual(
      expect.arrayContaining([
        "¿Carril de A al momento del impacto?",
        "¿Cuántos metros de reversa?",
      ]),
    );
  });

  it("lo que contesta el perito entra como dato del perito y mueve la versión", () => {
    const i = interpretarHecho({ ...base, respuestas: { carril_a: "derecho", reversa: 4 } });
    expect(i.preguntas.find((p) => p.clave === "carril_a")?.respuesta).toBe("derecho");
    expect(i.preguntas.find((p) => p.clave === "reversa")?.respuesta).toBe(4);
    expect(i.evidencia.find((d) => d.clave === "carril_a")).toMatchObject({
      valor: "carril derecho",
      fuente: "perito",
    });
    expect(i.parametros.declarada.reversaM).toBe(4);
  });

  it("sin descripción técnica no hay versión de la evidencia ni preguntas sobre ella", () => {
    const i = interpretarHecho({ ...base, descripcion: null, respuestas: {} });
    expect(i.evidencia).toEqual([]);
    expect(i.preguntas.every((p) => p.version === "declarada")).toBe(true);
  });
});

describe("la lectura grabada de Claude (CI no llama a la API)", () => {
  const L = grabacion.lecturas as unknown as Record<
    "descripcion" | "declaracion",
    { texto: string; lectura: LecturaHecho; metodo: string }
  >;
  const leer = (t: "descripcion" | "declaracion") => ({
    lectura: validarLectura(L[t].lectura, L[t].texto),
    leidoPor: "ia" as const,
  });

  it("se grabó con Claude, sobre la descripción de ejemplo y la declaración del caso", () => {
    expect(L.descripcion.metodo).toBe("claude");
    expect(L.descripcion.texto).toBe(ejemplo.descripcion);
    expect(L.declaracion.texto).toBe(c.declaracion.texto);
  });

  it("toda cita está en su texto y los metros salen de la cita", () => {
    expect(leer("descripcion").lectura.descartados).toBe(0);
    expect(leer("declaracion").lectura.descartados).toBe(0);
  });

  it("arma las dos versiones y pregunta el carril de A y los metros de reversa", () => {
    const i = interpretarHecho({
      expediente: vehiculos,
      declarante: "A",
      descripcion: leer("descripcion"),
      declaracion: leer("declaracion"),
      respuestas: {},
    });
    expect(i.parametros.evidencia).toEqual({ hacia: "norte", distanciaRestos: 15.89 });
    expect(i.parametros.declarada).toMatchObject({ hacia: "norte", reversaM: null });
    expect(i.evidencia.find((d) => d.clave === "vertice_a")?.valor).toMatch(/posterior izquierdo/);
    expect(i.declarada.some((d) => d.valor === "reversa")).toBe(true);
    expect(i.preguntas.map((p) => p.texto)).toEqual(
      expect.arrayContaining([
        "¿Carril de A al momento del impacto?",
        "¿Cuántos metros de reversa?",
      ]),
    );
    expect(i.preguntas.every((p) => p.version === "evidencia" || p.clave === "reversa")).toBe(true);
  });
});

describe("llenar a mano, «No sé» y completitud (ADR 0057)", () => {
  const L = grabacion.lecturas as unknown as Record<
    "descripcion" | "declaracion",
    { texto: string; lectura: LecturaHecho }
  >;
  const leer = (t: "descripcion" | "declaracion") => ({
    lectura: validarLectura(L[t].lectura, L[t].texto),
    leidoPor: "ia" as const,
  });
  const base = { expediente: vehiculos, declarante: "A" as const };

  it("sin ninguna lectura (Claude falló), lo que llena el perito arma las dos versiones", () => {
    const i = interpretarHecho({
      ...base,
      descripcion: null,
      declaracion: null,
      respuestas: {
        modalidad: "alcance",
        sentido_a: "norte",
        zona_contacto_a: "parte posterior",
        restos: 15.89,
        maniobra_declarada: "reversa",
        reversa: 3,
      },
    });
    expect(i.parametros.evidencia).toEqual({ hacia: "norte", distanciaRestos: 15.89 });
    expect(i.parametros.declarada).toMatchObject({ reversaM: 3, maniobraA: "reversa" });
    expect(i.evidencia.every((d) => d.fuente === "perito" && d.leidoPor === "perito")).toBe(true);
    expect(i.preguntas.find((p) => p.clave === "carril_a")?.respuesta).toBeNull();
  });

  it("lo que llena el perito gana a lo leído", () => {
    const i = interpretarHecho({
      ...base,
      descripcion: leer("descripcion"),
      declaracion: null,
      respuestas: { zona_contacto_a: "lado izquierdo" },
    });
    const z = i.evidencia.filter((d) => d.clave === "zona_contacto_a");
    expect(z).toHaveLength(1);
    expect(z[0]).toMatchObject({ valor: "lado izquierdo", fuente: "perito" });
  });

  it("«No sé» deja el dato como supuesto y cierra la pregunta; cada pregunta dice por qué importa", () => {
    const i = interpretarHecho({
      ...base,
      descripcion: leer("descripcion"),
      declaracion: leer("declaracion"),
      respuestas: { carril_a: NO_SE },
    });
    const carril = i.preguntas.find((p) => p.clave === "carril_a")!;
    expect(carril.respuesta).toBe(NO_SE);
    expect(carril.porQue).toMatch(/tabla de datos del dictamen/);
    expect(i.evidencia.find((d) => d.clave === "carril_a")).toMatchObject({ fuente: "supuesto" });
    expect(i.preguntas.find((p) => p.clave === "reversa")!.porQue).toMatch(/versión declarada/);
  });

  it("completitud: 7 de 9 con las lecturas grabadas; 9 de 9 al contestar carril y reversa", () => {
    const antes = completitud(
      interpretarHecho({
        ...base,
        descripcion: leer("descripcion"),
        declaracion: leer("declaracion"),
        respuestas: {},
      }),
    );
    expect([antes.presentes, antes.total]).toEqual([7, 9]);
    expect(antes.faltan.map((f) => f.clave)).toEqual(["carril_a", "reversa"]);
    const despues = completitud(
      interpretarHecho({
        ...base,
        descripcion: leer("descripcion"),
        declaracion: leer("declaracion"),
        respuestas: { carril_a: "derecho", reversa: 4 },
      }),
    );
    expect([despues.presentes, despues.total]).toEqual([9, 9]);
  });
});
