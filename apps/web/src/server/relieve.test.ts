/**
 * `/api/relieve` (W5): la malla sale con la forma de `caso3d.relieve`, centrada en el punto y con
 * alturas relativas a él, de la mejor fuente que haya. Los mosaicos son sintéticos (un plano
 * inclinado conocido): CI no sale a la red. La lectura real se mide en `eval/js/w5_relieve.ts`.
 */
import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  alturasTerrarium,
  armarRelieve,
  decodificarPng,
  defaultRelieveDeps,
  desnivelM,
  desplazar,
  FUENTE_COPERNICUS,
  FUENTE_INEGI,
  FUENTE_SRTM,
  LICENCIA_COPERNICUS,
  LICENCIA_INEGI,
  nombreMosaico,
  pixelGlobal,
  RelieveError,
  RelieveIn,
  urlMosaico,
  urlTesela,
  ZOOM,
  type Mosaico,
  type RelieveDeps,
  type Tesela,
} from "./relieve";

const C = { lat: 19.3576, lon: -99.0625 };
const K = (Math.PI / 180) * 6_371_008.8;
/** Un plano que sube 5 % hacia el este y baja 2 % hacia el norte, con 2,240 m en el centro. */
const plano = (lat: number, lon: number) =>
  2240 + 0.05 * (lon - C.lon) * K * Math.cos((C.lat * Math.PI) / 180) - 0.02 * (lat - C.lat) * K;

/** (lat, lon) del centro del pixel global (gx, gy) en el zoom de la ruta. */
function latLonDePixel(gx: number, gy: number): [number, number] {
  const n = 2 ** ZOOM * 256;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * gy) / n))) * 180) / Math.PI;
  return [lat, (gx / n) * 360 - 180];
}

/** Un mosaico de los Terrain Tiles con la altura que dé `z(lat, lon)` en el centro de cada pixel. */
function tesela(
  x: number,
  y: number,
  z: (lat: number, lon: number) => number,
  fuente: string,
): Tesela {
  const alturas = new Float32Array(256 * 256);
  for (let j = 0; j < 256; j++)
    for (let i = 0; i < 256; i++) {
      const [lat, lon] = latLonDePixel(x * 256 + i + 0.5, y * 256 + j + 0.5);
      alturas[j * 256 + i] = z(lat, lon);
    }
  return { alturas, fuentes: [fuente] };
}

const ARCOSEG = 1 / 3600;
/** Un mosaico de 1° × 1° como los de GLO-30, con la altura que dé `z(lat, lon)`. */
function mosaico(
  latSur: number,
  lonOeste: number,
  z: (lat: number, lon: number) => number,
): Mosaico {
  // Los pixeles de GLO-30 van centrados en segundos enteros: la esquina queda medio pixel afuera.
  const origen: [number, number] = [lonOeste - ARCOSEG / 2, latSur + 1 + ARCOSEG / 2];
  return {
    origen,
    resolucion: [ARCOSEG, -ARCOSEG],
    ancho: 3600,
    alto: 3600,
    leer([x0, y0, x1, y1]) {
      const out: number[] = [];
      for (let j = y0; j < y1; j++)
        for (let i = x0; i < x1; i++)
          out.push(z(origen[1] - (j + 0.5) * ARCOSEG, origen[0] + (i + 0.5) * ARCOSEG));
      return Promise.resolve(out);
    },
  };
}

function deps(
  o: {
    fuente?: string;
    z?: (lat: number, lon: number) => number;
    pedidas?: string[];
    copernicus?: ((lat: number, lon: number) => number) | "falla" | "sin-mosaico";
  } = {},
): RelieveDeps {
  const d: RelieveDeps = {
    tesela(x, y) {
      o.pedidas?.push(`${x}/${y}`);
      return Promise.resolve(tesela(x, y, o.z ?? plano, o.fuente ?? "mx_lidar/prueba_b.tif"));
    },
  };
  const c = o.copernicus;
  if (c)
    d.abrir = (latSur, lonOeste) => {
      o.pedidas?.push(nombreMosaico(latSur, lonOeste));
      if (c === "falla") return Promise.reject(new RelieveError("no respondió", 502));
      return Promise.resolve(c === "sin-mosaico" ? null : mosaico(latSur, lonOeste, c));
    };
  return d;
}

describe("los mosaicos", () => {
  it("los Terrain Tiles se piden por su x/y en el zoom 14", () => {
    const [gx, gy] = pixelGlobal(20.9674, -89.6237);
    // El mosaico del centro de Mérida, el mismo que se verificó a mano (14/4113/7215).
    expect([Math.floor(gx / 256), Math.floor(gy / 256)]).toEqual([4113, 7215]);
    expect(urlTesela(4113, 7215)).toBe(
      "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/14/4113/7215.png",
    );
  });

  it("el de Copernicus GLO-30 se nombra por su esquina suroeste, como en el bucket abierto", () => {
    expect(nombreMosaico(19, -100)).toBe("Copernicus_DSM_COG_10_N19_00_W100_00_DEM");
    expect(nombreMosaico(-3, 7)).toBe("Copernicus_DSM_COG_10_S03_00_E007_00_DEM");
    expect(urlMosaico(19, -100)).toBe(
      "https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N19_00_W100_00_DEM/Copernicus_DSM_COG_10_N19_00_W100_00_DEM.tif",
    );
  });
});

describe("la malla de relieve", () => {
  it("donde el INEGI tiene LiDAR sale de ahí: cada 10 m, centrada y relativa al punto", async () => {
    const pedidas: string[] = [];
    const r = await armarRelieve(
      RelieveIn.parse({ ...C, lado_m: 600 }),
      deps({ pedidas, copernicus: plano }),
    );
    // Con LiDAR no se toca Copernicus.
    expect(pedidas.every((p) => /^\d+\/\d+$/.test(p))).toBe(true);
    expect([r.ancho, r.alto, r.resolucion_m, r.resolucion_nativa_m]).toEqual([61, 61, 10, 5]);
    expect(r.alturas_m).toHaveLength(61 * 61);
    expect(r.origen).toMatchObject({ x: -300, y: -300 });
    // El centro es el nodo (30, 30) y ahí vale 0.
    expect(r.alturas_m[30 * 61 + 30]).toBe(0);
    // Filas de sur a norte y columnas de oeste a este: 5 % al este, −2 % al norte.
    expect(r.alturas_m[30 * 61 + 60]).toBeCloseTo(0.05 * 300, 1);
    expect(r.alturas_m[30 * 61 + 0]).toBeCloseTo(-0.05 * 300, 1);
    expect(r.alturas_m[60 * 61 + 30]).toBeCloseTo(-0.02 * 300, 1);
    expect(r.alturas_m[0]).toBeCloseTo(-0.05 * 300 + 0.02 * 300, 1);
    expect(desnivelM(r)).toBeCloseTo(2 * (0.05 * 300 + 0.02 * 300), 0);
    expect(r.fuente).toBe(FUENTE_INEGI);
    expect(r.licencia).toBe(LICENCIA_INEGI);
    expect(r.id).toMatch(/^inegi-[0-9_-]+$/);
    // El contrato del paquete caso-3d: fuente de hasta 120 caracteres y licencia de hasta 400.
    expect(r.fuente.length).toBeLessThanOrEqual(120);
    expect(r.licencia.length).toBeLessThanOrEqual(400);
  });

  it("la esquina suroeste de la malla queda donde dice `origen`", async () => {
    const r = await armarRelieve(RelieveIn.parse(C), deps());
    const [lat, lon] = desplazar(C.lat, C.lon, r.origen.x, r.origen.y);
    expect(r.origen.lat).toBeCloseTo(lat, 5);
    expect(r.origen.lon).toBeCloseTo(lon, 5);
  });

  it("junta los mosaicos vecinos cuando el punto está en la orilla de uno", async () => {
    // El punto de la esquina entre cuatro mosaicos.
    const [lat, lon] = latLonDePixel(3656 * 256, 7296 * 256);
    const pedidas: string[] = [];
    const r = await armarRelieve(
      RelieveIn.parse({ lat, lon, lado_m: 600 }),
      deps({
        pedidas,
        z: (la, lo) => 100 + 0.03 * (lo - lon) * K * Math.cos((la * Math.PI) / 180),
      }),
    );
    expect(new Set(pedidas)).toEqual(new Set(["3655/7295", "3656/7295", "3655/7296", "3656/7296"]));
    expect(r.alturas_m[30 * 61 + 60]).toBeCloseTo(9, 1);
    expect(r.alturas_m[30 * 61 + 0]).toBeCloseTo(-9, 1);
  });

  it("donde no hay LiDAR sale de Copernicus GLO-30, cada 30 m", async () => {
    const pedidas: string[] = [];
    const r = await armarRelieve(
      RelieveIn.parse(C),
      deps({ fuente: "srtm/N19W100.tif", pedidas, copernicus: plano }),
    );
    expect(pedidas).toContain("Copernicus_DSM_COG_10_N19_00_W100_00_DEM");
    expect([r.ancho, r.alto, r.resolucion_m, r.resolucion_nativa_m]).toEqual([21, 21, 30, 30]);
    expect(r.alturas_m[10 * 21 + 10]).toBe(0);
    expect(r.alturas_m[10 * 21 + 20]).toBeCloseTo(0.05 * 300, 1);
    expect(r.alturas_m[20 * 21 + 10]).toBeCloseTo(-0.02 * 300, 1);
    expect(r.fuente).toBe(FUENTE_COPERNICUS);
    expect(r.licencia).toBe(LICENCIA_COPERNICUS);
    expect(r.licencia.length).toBeLessThanOrEqual(400);
  });

  it("si Copernicus no responde o no tiene el lugar, queda el SRTM de los mosaicos", async () => {
    for (const copernicus of ["falla", "sin-mosaico", undefined] as const) {
      const r = await armarRelieve(
        RelieveIn.parse(C),
        deps({ fuente: "srtm/N19W100.tif", copernicus }),
      );
      expect(r.fuente).toBe(FUENTE_SRTM);
      expect([r.resolucion_m, r.resolucion_nativa_m]).toEqual([10, 30]);
      expect(r.id).toMatch(/^srtm-/);
    }
  });

  it("si Copernicus tarda más de lo que se le espera, no detiene la respuesta", async () => {
    const d = deps({ fuente: "srtm/N19W100.tif" });
    d.abrir = () => new Promise(() => undefined);
    d.esperaCopernicusMs = 30;
    expect((await armarRelieve(RelieveIn.parse(C), d)).fuente).toBe(FUENTE_SRTM);
  });

  it("una malla con LiDAR y SRTM lo dice y declara la resolución más gruesa", async () => {
    const d: RelieveDeps = {
      tesela: (x, y) =>
        Promise.resolve(tesela(x, y, plano, x % 2 ? "mx_lidar/a_b.tif" : "srtm/N19W100.tif")),
    };
    const [lat, lon] = latLonDePixel(3656 * 256, 7296 * 256);
    const r = await armarRelieve(RelieveIn.parse({ lat, lon }), d);
    expect(r.fuente).toMatch(/INEGI.*SRTM/);
    expect(r.resolucion_nativa_m).toBe(30);
    expect(r.fuente.length).toBeLessThanOrEqual(120);
    expect(r.licencia.length).toBeLessThanOrEqual(400);
  });

  it("sin mosaicos (mar o zona no publicada) responde 404 con un mensaje claro", async () => {
    const sin: RelieveDeps = { tesela: () => Promise.resolve(null) };
    await expect(armarRelieve(RelieveIn.parse(C), sin)).rejects.toMatchObject({
      status: 404,
      message: "No hay modelo de elevación abierto para ese lugar.",
    });
    await expect(armarRelieve(RelieveIn.parse(C), sin)).rejects.toBeInstanceOf(RelieveError);
  });

  it("no acepta coordenadas fuera de rango ni mallas enormes", () => {
    expect(RelieveIn.safeParse({ lat: 95, lon: 0 }).success).toBe(false);
    expect(RelieveIn.safeParse({ lat: 19, lon: -99, lado_m: 50_000 }).success).toBe(false);
    expect(RelieveIn.parse({ lat: "19.3", lon: "-99.1" })).toMatchObject({ lado_m: 600 });
  });
});

// ---- El PNG de un mosaico ------------------------------------------------------------------------

function crc32(b: Uint8Array): number {
  let c = ~0;
  for (const v of b) {
    c ^= v;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function bloque(tipo: string, datos: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + datos.length);
  const v = new DataView(out.buffer);
  v.setUint32(0, datos.length);
  out.set(
    [...tipo].map((ch) => ch.charCodeAt(0)),
    4,
  );
  out.set(datos, 8);
  v.setUint32(8 + datos.length, crc32(out.subarray(4, 8 + datos.length)));
  return out;
}

/** Un PNG RGB o RGBA de 8 bits; cada fila usa el filtro `filtros[y % filtros.length]`. */
function png(
  ancho: number,
  alto: number,
  canales: 3 | 4,
  px: Uint8Array,
  filtros: number[],
): Uint8Array {
  const fila = ancho * canales;
  const crudo = new Uint8Array((fila + 1) * alto);
  for (let y = 0; y < alto; y++) {
    const f = filtros[y % filtros.length]!;
    crudo[y * (fila + 1)] = f;
    for (let x = 0; x < fila; x++) {
      const a = x >= canales ? px[y * fila + x - canales]! : 0;
      const b = y > 0 ? px[(y - 1) * fila + x]! : 0;
      const c = y > 0 && x >= canales ? px[(y - 1) * fila + x - canales]! : 0;
      const pa = Math.abs(b - c);
      const pb = Math.abs(a - c);
      const pc = Math.abs(a + b - 2 * c);
      const pred = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][f]!;
      crudo[y * (fila + 1) + 1 + x] = (px[y * fila + x]! - pred) & 255;
    }
  }
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, ancho);
  v.setUint32(4, alto);
  ihdr.set([8, canales === 3 ? 2 : 6, 0, 0, 0], 8);
  const comprimido = new Uint8Array(deflateSync(crudo));
  // El IDAT partido en dos, como llega a veces.
  const mitad = Math.floor(comprimido.length / 2);
  const partes = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloque("IHDR", ihdr),
    bloque("IDAT", comprimido.subarray(0, mitad)),
    bloque("IDAT", comprimido.subarray(mitad)),
    bloque("IEND", new Uint8Array()),
  ];
  const out = new Uint8Array(partes.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of partes) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Un mosaico «terrarium» con la altura `z(i, j)` de cada pixel. */
function terrarium(z: (i: number, j: number) => number, canales: 3 | 4 = 3): Uint8Array {
  const px = new Uint8Array(256 * 256 * canales);
  for (let j = 0; j < 256; j++)
    for (let i = 0; i < 256; i++) {
      const v = z(i, j) + 32768;
      const p = (j * 256 + i) * canales;
      px[p] = Math.floor(v / 256);
      px[p + 1] = Math.floor(v) % 256;
      px[p + 2] = Math.floor((v - Math.floor(v)) * 256);
      if (canales === 4) px[p + 3] = 255;
    }
  return png(256, 256, canales, px, [0, 1, 2, 3, 4]);
}

describe("el PNG de un mosaico", () => {
  it("se decodifica con los cinco filtros, en RGB y en RGBA", () => {
    const px = new Uint8Array(7 * 6 * 3).map((_, k) => (k * 37 + (k % 5) * 91) & 255);
    for (const filtros of [[0], [1], [2], [3], [4], [4, 3, 2, 1, 0]]) {
      const d = decodificarPng(png(7, 6, 3, px, filtros));
      expect([d.ancho, d.alto, d.canales]).toEqual([7, 6, 3]);
      expect([...d.datos]).toEqual([...px]);
    }
    const rgba = new Uint8Array(5 * 4 * 4).map((_, k) => (k * 53) & 255);
    expect([...decodificarPng(png(5, 4, 4, rgba, [4, 1])).datos]).toEqual([...rgba]);
  });

  it("rechaza lo que no es un PNG de ese tipo", () => {
    expect(() => decodificarPng(new Uint8Array(40))).toThrow("No es un PNG.");
    const otro = png(4, 4, 3, new Uint8Array(48), [0]);
    otro[24] = 16; // 16 bits por canal
    expect(() => decodificarPng(otro)).toThrow("PNG de un tipo que no se esperaba.");
  });

  it("las alturas «terrarium» salen al 1/256 de metro, también bajo el nivel del mar", () => {
    const z = (i: number, j: number) => -12.5 + i * 9.25 + j * 0.0625;
    const a = alturasTerrarium(terrarium(z));
    for (const [i, j] of [
      [0, 0],
      [255, 0],
      [17, 200],
      [255, 255],
    ] as const)
      expect(a[j * 256 + i]).toBeCloseTo(z(i, j), 2);
    expect(alturasTerrarium(terrarium(z, 4))[200 * 256 + 17]).toBeCloseTo(z(17, 200), 2);
  });

  it("la lectura real toma las fuentes del encabezado del mosaico", async () => {
    const urls: string[] = [];
    const pedir = ((url: string) => {
      urls.push(url);
      if (url.includes("/7215.png"))
        return Promise.resolve(
          new Response(terrarium(() => 9.75) as unknown as BodyInit, {
            headers: {
              "x-amz-meta-x-imagery-sources":
                "mx_lidar/702825010164_b.tif, mx_lidar/702825010165_b.tif",
            },
          }),
        );
      return Promise.resolve(new Response(null, { status: 404 }));
    }) as unknown as typeof fetch;
    const d = defaultRelieveDeps(pedir);
    const t = await d.tesela(4113, 7215);
    expect(t!.fuentes).toEqual(["mx_lidar/702825010164_b.tif", "mx_lidar/702825010165_b.tif"]);
    expect(t!.alturas[0]).toBeCloseTo(9.75, 2);
    // El mismo mosaico no se vuelve a pedir; uno que no existe da null.
    await d.tesela(4113, 7215);
    expect(await d.tesela(1, 1)).toBeNull();
    expect(urls).toEqual([urlTesela(4113, 7215), urlTesela(1, 1)]);
  });
});
