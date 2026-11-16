/**
 * Los shaders de Unity, compilados de antemano (René, 2026-11-16: el 3D no puede trabar la página;
 * ADR 0119).
 *
 * Unity WebGL compila cada shader y pregunta su estado en el acto (`getShaderParameter`,
 * `getProgramParameter`). La compilación ocurre en el proceso de la GPU, pero esa pregunta bloquea el
 * hilo principal hasta que termina: hasta 6.6 s en la laptop con la primera visita y 3 s con la
 * segunda (perfil de CPU, `docs/adr/0119-armado-por-partes-y-shaders-adelantados.md`).
 *
 * Esta capa se pone sobre el contexto WebGL de Unity en cuanto Unity lo crea. Manda a compilar, sin
 * preguntar el estado, los programas que el build usa (grabados por `tools/unity/grabar-programas.mjs`)
 * y, cuando Unity pide uno con exactamente las mismas fuentes y atributos, le da el ya compilado. Lo
 * que no coincide sigue el camino de siempre: Unity nunca dibuja con un programa distinto del que
 * pidió. Cada programa adelantado se entrega una sola vez, para que dos programas de Unity no
 * compartan uniformes.
 */

/** La lista que publica `tools/unity/grabar-programas.mjs` (comprimida con gzip). */
export interface ListaProgramas {
  version: 1;
  /** El `.wasm` del build en que se grabó: con otro build no se usa. */
  code: string;
  fuentes: string[];
  /** En el orden en que Unity los pidió por primera vez. `sh`: [tipo de shader, índice de la fuente]. */
  programas: { sh: [number, number][]; attrs: [number, string][] }[];
}

export interface EstadoProgramas {
  /** Programas que ya se mandaron a compilar. */
  adelantados: number;
  /** Programas de Unity que recibieron uno adelantado. */
  entregados: number;
  /** Programas de Unity que siguieron el camino de siempre. */
  propios: number;
}

/** Cuántos ms puede ocupar cada tanda de envíos a compilar antes de soltar el hilo. */
const TANDA_MS = 4;

const METODOS_CON_PROGRAMA = [
  "useProgram",
  "getUniformLocation",
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
] as const;

function clave(sh: [number, string][], attrs: [number, string][]): string {
  return `${sh.map(([t, s]) => `${t}\u0001${s}`).join("\u0002")}\u0003${attrs
    .map(([i, n]) => `${i}=${n}`)
    .join(",")}`;
}

type Gl = WebGL2RenderingContext;
type Metodo = (...a: unknown[]) => unknown;

/**
 * Pone la capa sobre `gl` (el contexto de Unity). Los programas se agregan con `agregar` cuando llega
 * la lista; lo que Unity enlace antes sigue el camino de siempre.
 */
export function capaDeProgramas(
  gl: Gl,
  programar: (f: () => void) => void = (f) => setTimeout(f, 0),
) {
  const estado: EstadoProgramas = { adelantados: 0, entregados: 0, propios: 0 };
  gl.getExtension("KHR_parallel_shader_compile");
  const o = {
    shaderSource: gl.shaderSource.bind(gl),
    compileShader: gl.compileShader.bind(gl),
    getShaderParameter: gl.getShaderParameter.bind(gl),
    getShaderInfoLog: gl.getShaderInfoLog.bind(gl),
    attachShader: gl.attachShader.bind(gl),
    bindAttribLocation: gl.bindAttribLocation.bind(gl),
    linkProgram: gl.linkProgram.bind(gl),
  };
  const listos = new Map<string, WebGLProgram[]>();
  const fuentesAdelantadas = new Set<string>();
  const fuente = new WeakMap<WebGLShader, string>();
  const saltados = new WeakSet<WebGLShader>();
  const adjuntos = new WeakMap<WebGLProgram, WebGLShader[]>();
  const atributos = new WeakMap<WebGLProgram, [number, string][]>();
  const real = new WeakMap<WebGLProgram, WebGLProgram>();

  const g = gl as unknown as Record<string, Metodo>;
  g.shaderSource = (s, t) => {
    fuente.set(s as WebGLShader, t as string);
    return o.shaderSource(s as WebGLShader, t as string);
  };
  // Un shader cuya fuente ya se mandó a compilar no se compila otra vez: si su programa coincide, se
  // usa el adelantado; si no, se compila al enlazar.
  g.compileShader = (s) => {
    const sh = s as WebGLShader;
    if (fuentesAdelantadas.has(fuente.get(sh) ?? "")) {
      saltados.add(sh);
      return;
    }
    return o.compileShader(sh);
  };
  g.getShaderParameter = (s, n) => {
    const sh = s as WebGLShader;
    if (saltados.has(sh) && n === gl.COMPILE_STATUS) return true;
    return o.getShaderParameter(sh, n as number);
  };
  g.getShaderInfoLog = (s) =>
    saltados.has(s as WebGLShader) ? "" : o.getShaderInfoLog(s as WebGLShader);
  g.attachShader = (p, s) => {
    adjuntos.set(p as WebGLProgram, [...(adjuntos.get(p as WebGLProgram) ?? []), s as WebGLShader]);
    return o.attachShader(p as WebGLProgram, s as WebGLShader);
  };
  g.bindAttribLocation = (p, i, n) => {
    const pr = p as WebGLProgram;
    atributos.set(pr, [...(atributos.get(pr) ?? []), [i as number, n as string]]);
    return o.bindAttribLocation(pr, i as number, n as string);
  };
  g.linkProgram = (p) => {
    const pr = p as WebGLProgram;
    const shaders = adjuntos.get(pr) ?? [];
    const k = clave(
      shaders.map((s) => [o.getShaderParameter(s, gl.SHADER_TYPE) as number, fuente.get(s) ?? ""]),
      atributos.get(pr) ?? [],
    );
    const adelantado = listos.get(k)?.shift();
    if (adelantado) {
      real.set(pr, adelantado);
      estado.entregados++;
      return;
    }
    for (const s of shaders)
      if (saltados.has(s)) {
        saltados.delete(s);
        o.compileShader(s);
      }
    estado.propios++;
    return o.linkProgram(pr);
  };
  for (const nombre of METODOS_CON_PROGRAMA) {
    const f = g[nombre]!.bind(gl) as Metodo;
    g[nombre] = (p, ...resto) => f(real.get(p as WebGLProgram) ?? p, ...resto);
  }

  const agregar = (lista: ListaProgramas) => {
    // Se cuentan desde ya: Unity puede pedir uno mientras sigue la tanda.
    for (const p of lista.programas)
      for (const [, i] of p.sh) fuentesAdelantadas.add(lista.fuentes[i]!);
    let i = 0;
    const tanda = () => {
      const fin = performance.now() + TANDA_MS;
      for (; i < lista.programas.length && performance.now() < fin; i++) {
        const { sh, attrs } = lista.programas[i]!;
        const p = gl.createProgram();
        if (!p) return;
        for (const [tipo, f] of sh) {
          const s = gl.createShader(tipo);
          if (!s) return;
          o.shaderSource(s, lista.fuentes[f]!);
          o.compileShader(s);
          o.attachShader(p, s);
        }
        for (const [j, n] of attrs) o.bindAttribLocation(p, j, n);
        o.linkProgram(p);
        const kk = clave(
          sh.map(([tipo, f]) => [tipo, lista.fuentes[f]!]),
          attrs,
        );
        listos.set(kk, [...(listos.get(kk) ?? []), p]);
        estado.adelantados++;
      }
      if (i < lista.programas.length) programar(tanda);
    };
    tanda();
  };
  return { agregar, estado };
}

/** Baja y descomprime la lista; sin ella (o en un navegador sin `DecompressionStream`), null. */
export async function bajarProgramas(url: string, code: string): Promise<ListaProgramas | null> {
  try {
    if (typeof DecompressionStream === "undefined") return null;
    const r = await fetch(url);
    if (!r.ok || !r.body) return null;
    const texto = await new Response(r.body.pipeThrough(new DecompressionStream("gzip"))).text();
    const lista = JSON.parse(texto) as ListaProgramas;
    return lista.version === 1 && lista.code === code ? lista : null;
  } catch {
    return null;
  }
}

/**
 * Pone la capa en el lienzo de Unity antes de que Unity cree su contexto (el cargador crea antes otro,
 * de prueba, en un lienzo aparte: ese no se toca) y baja la lista en paralelo.
 */
export function adelantarProgramas(lienzo: HTMLCanvasElement, url: string | null, code: string) {
  if (!url) return null;
  const lista = bajarProgramas(url, code);
  const original = lienzo.getContext.bind(lienzo) as (t: string, ...r: unknown[]) => unknown;
  let capa: ReturnType<typeof capaDeProgramas> | null = null;
  (lienzo as unknown as { getContext: typeof original }).getContext = (tipo, ...resto) => {
    const c = original(tipo, ...resto);
    if (tipo === "webgl2" && c && !capa) {
      capa = capaDeProgramas(c as Gl);
      const puesta = capa;
      void lista.then((l) => l && puesta.agregar(l));
    }
    return c;
  };
  return {
    get estado() {
      return capa?.estado ?? null;
    },
  };
}
