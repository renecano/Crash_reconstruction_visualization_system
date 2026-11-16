import { describe, expect, it } from "vitest";
import { capaDeProgramas, type ListaProgramas } from "./programas";

const VS = 35633;
const FS = 35632;

/** Un contexto WebGL falso: registra lo que se compila y enlaza, y con qué programa se llama a cada método. */
function glFalso() {
  let n = 0;
  const llamadas: string[] = [];
  const tipos = new Map<object, number>();
  const gl = {
    COMPILE_STATUS: 35713,
    SHADER_TYPE: 35663,
    getExtension: () => null,
    createProgram: () => ({ id: `p${++n}` }),
    createShader: (t: number) => {
      const s = { id: `s${++n}` };
      tipos.set(s, t);
      return s;
    },
    shaderSource: () => undefined,
    compileShader: (s: { id: string }) => void llamadas.push(`compila ${s.id}`),
    getShaderParameter: (s: object, p: number) => (p === 35663 ? tipos.get(s) : "estado-real"),
    getShaderInfoLog: () => "registro-real",
    attachShader: () => undefined,
    bindAttribLocation: () => undefined,
    linkProgram: (p: { id: string }) => void llamadas.push(`enlaza ${p.id}`),
    useProgram: (p: { id: string }) => void llamadas.push(`usa ${p.id}`),
    getUniformLocation: (p: { id: string }, nombre: string) => `${p.id}:${nombre}`,
  } as Record<string, unknown>;
  for (const m of [
    "getActiveUniform",
    "getActiveAttrib",
    "getAttribLocation",
    "getProgramParameter",
    "getProgramInfoLog",
    "getUniformBlockIndex",
    "uniformBlockBinding",
    "getActiveUniformBlockParameter",
    "getActiveUniformBlockName",
    "getActiveUniforms",
    "getUniformIndices",
    "getUniform",
    "validateProgram",
    "getFragDataLocation",
    "getAttachedShaders",
    "getTransformFeedbackVarying",
    "transformFeedbackVaryings",
    "deleteProgram",
  ])
    gl[m] = (p: { id: string }) => p.id;
  return { gl: gl as unknown as WebGL2RenderingContext, llamadas };
}

const LISTA: ListaProgramas = {
  version: 1,
  code: "x.wasm",
  fuentes: ["vs-a", "fs-a", "fs-b"],
  programas: [
    {
      sh: [
        [VS, 0],
        [FS, 1],
      ],
      attrs: [[0, "in_POSITION0"]],
    },
  ],
};

/** Lo que hace Unity para un programa: dos shaders, un atributo, enlazar y preguntar. */
function comoUnity(gl: WebGL2RenderingContext, vs: string, fs: string) {
  const p = gl.createProgram()!;
  const a = gl.createShader(VS)!;
  const b = gl.createShader(FS)!;
  gl.shaderSource(a, vs);
  gl.compileShader(a);
  const compilo = gl.getShaderParameter(a, gl.COMPILE_STATUS);
  gl.shaderSource(b, fs);
  gl.compileShader(b);
  gl.attachShader(p, a);
  gl.attachShader(p, b);
  gl.bindAttribLocation(p, 0, "in_POSITION0");
  gl.linkProgram(p);
  return { p, a, b, compilo };
}

describe("shaders adelantados (ADR 0119)", () => {
  it("compila de antemano y le da a Unity el programa con sus mismas fuentes", () => {
    const { gl, llamadas } = glFalso();
    const capa = capaDeProgramas(gl, (f) => f());
    capa.agregar(LISTA);
    expect(capa.estado.adelantados).toBe(1);
    const antes = llamadas.length;
    const { p, compilo } = comoUnity(gl, "vs-a", "fs-a");
    // Unity no compila ni enlaza nada: recibe el adelantado y no espera.
    expect(llamadas.slice(antes)).toEqual([]);
    expect(compilo).toBe(true);
    expect(capa.estado.entregados).toBe(1);
    // Todo lo que Unity hace con su programa va al adelantado.
    gl.useProgram(p);
    expect(llamadas.at(-1)).toBe("usa p1");
    expect(gl.getUniformLocation(p, "_Color")).toBe("p1:_Color");
    expect(gl.getProgramParameter(p, 35714)).toBe("p1");
  });

  it("con otras fuentes sigue el camino de siempre y compila lo que se había saltado", () => {
    const { gl, llamadas } = glFalso();
    const capa = capaDeProgramas(gl, (f) => f());
    capa.agregar(LISTA);
    const antes = llamadas.length;
    // El vértice coincide con uno adelantado; el fragmento no: el programa no coincide.
    const { p, a, b } = comoUnity(gl, "vs-a", "fs-b");
    const ids = [a, b, p].map((x) => (x as unknown as { id: string }).id);
    expect(llamadas.slice(antes)).toEqual([
      `compila ${ids[1]}`,
      `compila ${ids[0]}`,
      `enlaza ${ids[2]}`,
    ]);
    expect(capa.estado.propios).toBe(1);
    expect(gl.getShaderParameter(a, gl.COMPILE_STATUS)).toBe("estado-real");
  });

  it("entrega cada programa adelantado una sola vez: dos de Unity no comparten uniformes", () => {
    const { gl } = glFalso();
    const capa = capaDeProgramas(gl, (f) => f());
    capa.agregar(LISTA);
    const uno = comoUnity(gl, "vs-a", "fs-a");
    const otro = comoUnity(gl, "vs-a", "fs-a");
    expect(capa.estado).toMatchObject({ entregados: 1, propios: 1 });
    expect(gl.getUniformLocation(uno.p, "u")).not.toBe(gl.getUniformLocation(otro.p, "u"));
  });

  it("sin la lista, Unity compila y enlaza como siempre", () => {
    const { gl, llamadas } = glFalso();
    const capa = capaDeProgramas(gl, (f) => f());
    comoUnity(gl, "vs-a", "fs-a");
    expect(llamadas.filter((l) => l.startsWith("compila")).length).toBe(2);
    expect(llamadas.filter((l) => l.startsWith("enlaza")).length).toBe(1);
    expect(capa.estado.propios).toBe(1);
  });
});
