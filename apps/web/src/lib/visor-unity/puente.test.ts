// @vitest-environment jsdom
import { FUNCION_PUENTE_WEB, VISOR_PUENTE_VERSION } from "@croquis/scene-schema";
import { afterEach, describe, expect, it, vi } from "vitest";
import { camaraUnity } from "./camaras";
import { motivoDe, PuenteUnity, urlsDelBuild, type ManifiestoVisorUnity } from "./puente";

const MANIFIESTO: ManifiestoVisorUnity = {
  huella: "abc",
  base: "https://blob.example/",
  prefijo: "recursos/visor-unity/abc/",
  loader: "l.loader.js",
  data: "d.data",
  framework: "f.framework.js",
  code: "c.wasm",
};

/** Un Unity de mentira: contesta `listo` al arrancar y lo que se le programe a cada mensaje. */
function unityFalso(version: string, contestar: (metodo: string, datos: unknown) => object | null) {
  const enviados: { metodo: string; datos: unknown }[] = [];
  const decir = (m: object) =>
    (window as unknown as Record<string, (t: string) => void>)[FUNCION_PUENTE_WEB]!(
      JSON.stringify(m),
    );
  const instancia = {
    SendMessage: (_: string, metodo: string, valor?: string) => {
      const datos = valor ? JSON.parse(valor) : {};
      enviados.push({ metodo, datos });
      const r = contestar(metodo, datos);
      if (r) setTimeout(() => decir(r), 0);
    },
    Quit: vi.fn(async () => undefined),
  };
  (window as unknown as Record<string, unknown>).createUnityInstance = vi.fn(async () => {
    setTimeout(() => decir({ tipo: "listo", version }), 0);
    return instancia;
  });
  // El cargador ya está «bajado»: el script se da por cargado en cuanto se agrega.
  vi.spyOn(document.head, "appendChild").mockImplementation((n) => {
    setTimeout(() => (n as HTMLScriptElement).onload?.(new Event("load")), 0);
    return n;
  });
  return { enviados, instancia, decir };
}

function conWebgl2() {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as never);
}

afterEach(() => {
  vi.restoreAllMocks();
  delete (window as unknown as Record<string, unknown>).createUnityInstance;
});

/** Unas vueltas del ciclo de eventos (los `setTimeout(0)` del Unity de mentira). */
const vueltas = async (n = 5) => {
  for (let i = 0; i < n; i++) await new Promise((ok) => setTimeout(ok, 0));
};

/**
 * Las carreras del puente (René, 2026-11-20, después de Tollocan): Unity no dice de qué mensaje es un
 * «error», así que la web no puede tener dos esperas a la vez ni mandar, mientras carga, algo que
 * pueda contestar «error».
 */
describe("una respuesta a la vez", () => {
  it("una cámara que no existe, elegida mientras carga, no tumba la carga", async () => {
    conWebgl2();
    const { enviados, decir } = unityFalso(VISOR_PUENTE_VERSION, (metodo, datos) =>
      metodo === "camara" && (datos as { modo: string }).modo === "conductor_V9"
        ? { tipo: "error", codigo: "interno", mensaje: "No hay una cámara «conductor_V9»." }
        : null,
    );
    const p = await PuenteUnity.arrancar(document.createElement("canvas"), () => {}, {
      manifiesto: MANIFIESTO,
    });
    const carga = p.cargar({ version_caso3d: "1" });
    let fallo: unknown = null;
    carga.catch((e: unknown) => (fallo = e));
    await vueltas();
    p.enviar("camara", { modo: "conductor_V9" as never });
    p.enviar("fijarTiempo", { t: 1 });
    p.enviar("fijarTiempo", { t: 2 });
    await vueltas();
    expect(fallo).toBeNull();
    // Mientras carga, esos mensajes esperan; de cada uno va el último, después de «cargado».
    expect(enviados.map((x) => x.metodo)).toEqual(["cargarCaso"]);
    decir({ tipo: "cargado", escena_id: "x" });
    await carga;
    await vueltas();
    expect(enviados.map((x) => [x.metodo, x.datos])).toEqual([
      ["cargarCaso", expect.anything()],
      ["camara", { modo: "conductor_V9" }],
      ["fijarTiempo", { t: 2 }],
    ]);
  });

  it("una foto pedida mientras carga espera a la carga, y su «error» no tumba la carga", async () => {
    conWebgl2();
    const { enviados, decir } = unityFalso(VISOR_PUENTE_VERSION, (metodo) =>
      metodo === "capturar"
        ? { tipo: "error", codigo: "captura_fallo", mensaje: "sin cámara" }
        : null,
    );
    const p = await PuenteUnity.arrancar(document.createElement("canvas"), () => {}, {
      manifiesto: MANIFIESTO,
    });
    const carga = p.cargar({ version_caso3d: "1" });
    let fallo: unknown = null;
    carga.catch((e: unknown) => (fallo = e));
    await vueltas();
    const foto = p.capturar("impacto", 960, 540);
    foto.catch(() => undefined);
    await vueltas();
    expect(fallo).toBeNull();
    expect(enviados.map((x) => x.metodo)).toEqual(["cargarCaso"]);
    decir({ tipo: "cargado", escena_id: "x" });
    await carga;
    await expect(foto).rejects.toThrow(/captura_fallo/);
    expect(enviados.map((x) => x.metodo)).toEqual(["cargarCaso", "capturar"]);
  });

  it("una carga pedida mientras se toma una foto espera a la foto", async () => {
    conWebgl2();
    const { enviados, decir } = unityFalso(VISOR_PUENTE_VERSION, () => null);
    const p = await PuenteUnity.arrancar(document.createElement("canvas"), () => {}, {
      manifiesto: MANIFIESTO,
    });
    const foto = p.capturar("antes", 960, 540);
    await vueltas();
    const carga = p.cargar({ version_caso3d: "1" });
    await vueltas();
    expect(enviados.map((x) => x.metodo)).toEqual(["capturar"]);
    decir({ tipo: "captura", vista: "antes", png: btoa("antes") });
    await foto;
    await vueltas();
    expect(enviados.map((x) => x.metodo)).toEqual(["capturar", "cargarCaso"]);
    decir({ tipo: "cargado", escena_id: "x" });
    await carga;
  });
});

describe("puente con Unity", () => {
  it("arma las direcciones del build con la huella del manifiesto", () => {
    expect(urlsDelBuild(MANIFIESTO)).toEqual({
      loader: "https://blob.example/recursos/visor-unity/abc/Build/l.loader.js",
      dataUrl: "https://blob.example/recursos/visor-unity/abc/Build/d.data",
      frameworkUrl: "https://blob.example/recursos/visor-unity/abc/Build/f.framework.js",
      codeUrl: "https://blob.example/recursos/visor-unity/abc/Build/c.wasm",
      // Los cielos, uno por AssetBundle junto al build (U6).
      streamingAssetsUrl: "https://blob.example/recursos/visor-unity/abc/StreamingAssets",
    });
  });

  it("sin WebGL 2 pide el respaldo sin bajar nada", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const e = await PuenteUnity.arrancar(document.createElement("canvas"), () => {}, {
      manifiesto: MANIFIESTO,
    }).catch((x: unknown) => x);
    expect(motivoDe(e)).toBe("sin_webgl2");
  });

  it("con otra versión del puente cierra Unity y pide el respaldo", async () => {
    conWebgl2();
    const { instancia } = unityFalso("0.9.0", () => null);
    const e = await PuenteUnity.arrancar(document.createElement("canvas"), () => {}, {
      manifiesto: MANIFIESTO,
    }).catch((x: unknown) => x);
    expect(motivoDe(e)).toBe("version_puente");
    expect(instancia.Quit).toHaveBeenCalled();
  });

  it("al cargar, devuelve lo que el 3D omitió (y nada si el build no lo dice)", async () => {
    conWebgl2();
    let omitidos: string[] | undefined = ["un edificio: NullReferenceException (…) (3)"];
    unityFalso(VISOR_PUENTE_VERSION, (metodo) =>
      metodo === "cargarCaso"
        ? { tipo: "cargado", escena_id: "x", ...(omitidos ? { omitidos } : {}) }
        : null,
    );
    const p = await PuenteUnity.arrancar(document.createElement("canvas"), () => {}, {
      manifiesto: MANIFIESTO,
    });
    expect(await p.cargar({ version_caso3d: "1" })).toEqual([
      "un edificio: NullReferenceException (…) (3)",
    ]);
    omitidos = undefined;
    expect(await p.cargar({ version_caso3d: "1" })).toEqual([]);
  });

  it("carga un caso, toma las fotos una por una y devuelve PNG", async () => {
    conWebgl2();
    const { enviados } = unityFalso(VISOR_PUENTE_VERSION, (metodo, datos) => {
      if (metodo === "cargarCaso") return { tipo: "cargado", escena_id: "x" };
      if (metodo === "capturar") {
        const vista = (datos as { vista: string }).vista;
        return { tipo: "captura", vista, png: btoa(vista) };
      }
      return null;
    });
    const p = await PuenteUnity.arrancar(document.createElement("canvas"), () => {}, {
      manifiesto: MANIFIESTO,
    });
    await p.cargar({ version_caso3d: "1" });
    const fotos = await Promise.all([
      p.capturar("antes", 960, 540),
      p.capturar("impacto", 960, 540),
      p.capturar("reposo", 960, 540),
    ]);
    expect(fotos).toEqual([
      `data:image/png;base64,${btoa("antes")}`,
      `data:image/png;base64,${btoa("impacto")}`,
      `data:image/png;base64,${btoa("reposo")}`,
    ]);
    expect(enviados.map((x) => x.metodo)).toEqual([
      "cargarCaso",
      "capturar",
      "capturar",
      "capturar",
    ]);
    expect(enviados[1]!.datos).toEqual({ vista: "antes", ancho: 960, alto: 540 });
  });

  it("una foto que falla no detiene las siguientes", async () => {
    conWebgl2();
    unityFalso(VISOR_PUENTE_VERSION, (metodo, datos) => {
      const vista = (datos as { vista?: string }).vista;
      if (metodo !== "capturar") return null;
      return vista === "impacto"
        ? { tipo: "error", codigo: "captura_fallo", mensaje: "sin caso" }
        : { tipo: "captura", vista, png: "QQ==" };
    });
    const p = await PuenteUnity.arrancar(document.createElement("canvas"), () => {}, {
      manifiesto: MANIFIESTO,
    });
    const [a, b] = await Promise.allSettled([
      p.capturar("impacto", 10, 10),
      p.capturar("reposo", 10, 10),
    ]);
    expect(a.status).toBe("rejected");
    expect(b).toEqual({ status: "fulfilled", value: "data:image/png;base64,QQ==" });
  });
});

describe("cámaras de las pestañas en Unity", () => {
  it("traduce los nombres de three.js a los del puente", () => {
    expect(camaraUnity(null)).toBe("cinematica");
    expect(camaraUnity("libre")).toBe("orbita");
    expect(camaraUnity("conductor-veh-a")).toBe("conductor:veh-a");
    // «Detrás de B» lo sigue de verdad (René, 2026-11-16, A6).
    expect(camaraUnity("detras-veh-b")).toBe("cerca:veh-b:180:8:2.6");
    expect(camaraUnity("cenital")).toBe("cenital");
  });
});
