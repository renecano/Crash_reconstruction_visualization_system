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
  return { enviados, instancia };
}

function conWebgl2() {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as never);
}

afterEach(() => {
  vi.restoreAllMocks();
  delete (window as unknown as Record<string, unknown>).createUnityInstance;
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
    expect(camaraUnity("detras-veh-b")).toBe("cinematica");
    expect(camaraUnity("cenital")).toBe("cenital");
  });
});
