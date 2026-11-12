/**
 * Bajar el visor Unity de fondo mientras el perito trabaja el caso (U6): el build (unos 40 MB
 * comprimidos, ADR 0116), los cuerpos de las personas y los modelos de los vehículos del caso. Así,
 * al abrir el 3D todo sale de la caché del navegador en vez de bajarse en ese momento (en la red de
 * la laptop de desarrollo eran unos 46 s, `docs/progress/U.md`).
 *
 * El build se guarda como `Blob` y Unity arranca con esas copias (`archivosPrecargados`): si la
 * descarga sigue en curso cuando el perito abre el 3D, Unity la espera en vez de pedir los mismos
 * 40 MB otra vez (el navegador no junta dos descargas en curso de la misma dirección; así la carga
 * tardaba 84 s en vez de 46). Los modelos y los cuerpos se leen hasta el final para que queden en la
 * caché HTTP y se sueltan. No baja nada con «Ahorrar datos», en un navegador automatizado (las e2e,
 * salvo que pidan Unity) ni con el visor ligero pedido.
 */
import { MODEL_FOR_CLASS } from "@croquis/viewer";
import recursos from "../../../recursos.json";
import { RUTA_MANIFIESTO, urlsDelBuild, type ManifiestoVisorUnity } from "./puente";

/** Los mismos modelos que baja Unity (`CargadorModelos`, versión «alta»). */
const BASE_VEHICULOS = `${recursos.base}/recursos/modelos/vehiculos/${recursos.carpetas["modelos/vehiculos"]}/`;
const CUERPOS = ["adulto", "mayor", "nino"].map((v) => `/modelos/personas/${v}.glb`);

const pedidos = new Set<string>();
let manifiestoVehiculos: Promise<
  Record<string, { archivos: { alta: { archivo: string } } }>
> | null = null;

function sePuede(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as { __croquisVisorUnity?: boolean };
  if (navigator.webdriver && !w.__croquisVisorUnity) return false;
  const conexion = (navigator as unknown as { connection?: { saveData?: boolean } }).connection;
  if (conexion?.saveData) return false;
  return new URLSearchParams(location.search).get("visor") !== "ligero";
}

/** Baja una dirección una sola vez por página, de fondo, sin guardarla en memoria. */
async function bajar(url: string): Promise<void> {
  if (pedidos.has(url)) return;
  pedidos.add(url);
  try {
    const r = await fetch(url, { priority: "low" } as RequestInit);
    const lector = r.body?.getReader();
    if (!lector) return;
    for (;;) {
      const { done } = await lector.read();
      if (done) break;
    }
  } catch {
    // Si falla, Unity la baja cuando la necesite.
    pedidos.delete(url);
  }
}

/** Las copias del build: una descarga por dirección, que esperan todos los que la piden. */
const copias = new Map<string, Promise<Blob>>();

function copia(url: string, tipo: string): Promise<Blob> {
  let c = copias.get(url);
  if (!c) {
    c = fetch(url, { priority: "low" } as RequestInit).then(async (r) => {
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      // Con el tipo, el .wasm se puede compilar mientras se lee (instantiateStreaming).
      return new Blob([await r.arrayBuffer()], { type: tipo });
    });
    c.catch(() => copias.delete(url));
    copias.set(url, c);
  }
  return c;
}

/** El build de Unity y los cuerpos: en cuanto se abre un caso. */
export async function precargarVisorUnity(): Promise<void> {
  if (!sePuede()) return;
  try {
    const r = await fetch(RUTA_MANIFIESTO, { cache: "no-store" });
    if (!r.ok) return;
    const u = urlsDelBuild((await r.json()) as ManifiestoVisorUnity);
    // Primero lo chico; el .wasm y el .data, uno tras otro, para no competir con lo que pide la página.
    await Promise.all([bajar(u.loader), ...CUERPOS.map(bajar)]);
    await copia(u.frameworkUrl, "text/javascript");
    await copia(u.codeUrl, "application/wasm");
    await copia(u.dataUrl, "application/octet-stream");
  } catch {
    /* sin red: Unity lo baja al abrir el 3D */
  }
}

/**
 * Si el build ya se empezó a bajar de fondo, las direcciones locales (`blob:`) de esas copias, cuando
 * terminen; si no, null y Unity lo baja como siempre.
 */
export async function archivosPrecargados(u: {
  dataUrl: string;
  frameworkUrl: string;
  codeUrl: string;
}): Promise<{ dataUrl: string; frameworkUrl: string; codeUrl: string } | null> {
  if (!copias.has(u.dataUrl) && !copias.has(u.codeUrl)) return null;
  try {
    const [data, framework, code] = await Promise.all([
      copia(u.dataUrl, "application/octet-stream"),
      copia(u.frameworkUrl, "text/javascript"),
      copia(u.codeUrl, "application/wasm"),
    ]);
    return {
      dataUrl: URL.createObjectURL(data),
      frameworkUrl: URL.createObjectURL(framework),
      codeUrl: URL.createObjectURL(code),
    };
  } catch {
    return null;
  }
}

/** Los modelos de los vehículos del caso, en cuanto se sabe su clase. */
export async function precargarModelos(clases: readonly (string | undefined)[]): Promise<void> {
  if (!sePuede()) return;
  const modelos = [...new Set(clases.map((c) => (c ? MODEL_FOR_CLASS[c] : undefined)))].filter(
    (c): c is NonNullable<typeof c> => Boolean(c),
  );
  if (!modelos.length) return;
  try {
    manifiestoVehiculos ??= fetch(`${BASE_VEHICULOS}vehiculos.json`)
      .then(
        (r) =>
          r.json() as Promise<{
            clases: Record<string, { archivos: { alta: { archivo: string } } }>;
          }>,
      )
      .then((m) => m.clases);
    const clases = await manifiestoVehiculos;
    await Promise.all(
      modelos.map((m) => {
        const archivo = clases[m]?.archivos.alta.archivo;
        return archivo ? bajar(BASE_VEHICULOS + archivo) : undefined;
      }),
    );
  } catch {
    manifiestoVehiculos = null;
  }
}
