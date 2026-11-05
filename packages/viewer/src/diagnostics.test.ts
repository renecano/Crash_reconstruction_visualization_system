import { DataTexture, FloatType, Group, Mesh, MeshStandardMaterial, PlaneGeometry } from "three";
import { describe, expect, it } from "vitest";
import {
  bytesDeTextura,
  estimarMemoria,
  getDiagnostico,
  marcar,
  memoriaPantallaMB,
  registrarError,
  registrarPerdida,
  registrarTareaLarga,
  reiniciarDiagnostico,
  subscribeDiagnostico,
  texturasDe,
  updateDiagnostico,
} from "./diagnostics";

describe("diagnóstico del visor (René, 2026-11-04)", () => {
  it("bytes de una textura: RGBA de 8 bits con mipmaps, y de 32 bits sin ellos", () => {
    const t = new DataTexture(new Uint8Array(4 * 256 * 128), 256, 128);
    t.generateMipmaps = true;
    expect(bytesDeTextura(t)).toBe(Math.round(256 * 128 * 4 * (4 / 3)));
    const f = new DataTexture(new Float32Array(4 * 64 * 64), 64, 64);
    f.type = FloatType;
    f.generateMipmaps = false;
    expect(bytesDeTextura(f)).toBe(64 * 64 * 16);
  });

  it("cuenta cada textura una sola vez aunque la compartan materiales", () => {
    const t = new DataTexture(new Uint8Array(4 * 16 * 16), 16, 16);
    const a = new MeshStandardMaterial({ map: t });
    const b = new MeshStandardMaterial({ map: t, roughnessMap: t });
    const g = new Group();
    g.add(new Mesh(new PlaneGeometry(), a), new Mesh(new PlaneGeometry(), [a, b]));
    expect(texturasDe(g).size).toBe(1);
    const m = estimarMemoria(
      g,
      {
        ancho: 100,
        alto: 100,
        dpr: 1,
        msaaSamples: 0,
        pasosPost: 0,
        shadowMapSize: 0,
        spotShadowMapSize: 0,
        spotShadows: 0,
      },
      { info: { memory: { textures: 3, geometries: 2 } } },
    );
    expect(m.texturas).toBe(1);
    expect(m.texturasRenderer).toBe(3);
    expect(m.totalMB).toBeCloseTo(m.texturasMB + m.pantallaMB + m.sombrasMB, 1);
  });

  it("la memoria de pantalla crece con el dpr, el MSAA y los pasos de postproceso", () => {
    const base = {
      ancho: 1920,
      alto: 1080,
      dpr: 1,
      msaaSamples: 0,
      pasosPost: 0,
      shadowMapSize: 1024,
      spotShadowMapSize: 0,
      spotShadows: 0,
    };
    const media = memoriaPantallaMB(base);
    const ultra = memoriaPantallaMB({
      ...base,
      dpr: 2,
      msaaSamples: 4,
      pasosPost: 11,
      shadowMapSize: 4096,
      spotShadowMapSize: 2048,
      spotShadows: 4,
    });
    expect(media.sombrasMB).toBeCloseTo(4, 1);
    expect(ultra.pantallaMB).toBeGreaterThan(10 * media.pantallaMB);
    expect(ultra.sombrasMB).toBeCloseTo(64 + 64, 0);
  });

  it("el almacén avisa a los suscriptores y guarda el último error y la pérdida", () => {
    reiniciarDiagnostico();
    let avisos = 0;
    const off = subscribeDiagnostico(() => {
      avisos += 1;
    });
    updateDiagnostico({ calidad: "alta", fps: 60 });
    registrarError("dibujo", new Error("boom"));
    registrarPerdida({ api: "WebGPU", message: "device lost", reason: "unknown" });
    off();
    updateDiagnostico({ fps: 30 });
    const d = getDiagnostico();
    expect(avisos).toBe(3);
    expect(d.calidad).toBe("alta");
    expect(d.ultimoError?.mensaje).toBe("boom");
    expect(d.ultimoError?.origen).toBe("dibujo");
    expect(d.perdida?.motivo).toBe("unknown");
    expect(d.perdidas).toBe(1);
    expect(d.fps).toBe(30);
    reiniciarDiagnostico({ perdidas: d.perdidas });
    expect(getDiagnostico().perdidas).toBe(1);
    expect(getDiagnostico().ultimoError).toBeNull();
  });
});

describe("tareas largas y marcas (René, 2026-11-04)", () => {
  it("atribuye una tarea larga a la última marca reciente, y sin marca lo dice", () => {
    reiniciarDiagnostico();
    const t0 = performance.now();
    marcar("cambio de cámara → conductor");
    const conMarca = registrarTareaLarga(180, t0 + 100);
    expect(conMarca.causa).toBe("cambio de cámara → conductor");
    const tarde = registrarTareaLarga(120, t0 + 60_000);
    expect(tarde.causa).toMatch(/sin marca/);
    const antes = registrarTareaLarga(120, t0 - 500);
    expect(antes.causa).toMatch(/sin marca/);
    expect(getDiagnostico().tareasLargas.map((x) => x.duracion)).toEqual([180, 120, 120]);
  });

  it("una marca puesta dentro de la tarea (p. ej. al armar el grafo) es su causa", () => {
    reiniciarDiagnostico();
    const t0 = performance.now();
    marcar("armando el grafo");
    // La tarea empezó 200 ms antes de la marca y duró 450 ms: la marca cae dentro.
    expect(registrarTareaLarga(450, t0 - 200).causa).toBe("armando el grafo");
  });

  it("conserva solo las últimas doce tareas largas", () => {
    reiniciarDiagnostico();
    for (let i = 0; i < 20; i++) registrarTareaLarga(100 + i, i);
    const d = getDiagnostico();
    expect(d.tareasLargas).toHaveLength(12);
    expect(d.tareasLargas[0]?.duracion).toBe(108);
  });
});
