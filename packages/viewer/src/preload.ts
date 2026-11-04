import {
  DECODERS_BASE_URL,
  VEHICLE_MODEL_BASE_URL,
  modelClassesFor,
  type VehicleModelManifest,
} from "./vehicle-models";

/**
 * Carga el trozo de `three/webgpu` (≈1.5 MB) antes de abrir el 3D (p. ej. al entrar al caso), para
 * que crear el renderer no lo espere (René, 2026-11-04: ver algo en ≤ 5 s). Es el mismo módulo que
 * importa el visor: el empaquetador lo pone en un trozo compartido.
 */
export const preloadRenderer = (): Promise<unknown> => import("three/webgpu");

/**
 * Baja a la caché del navegador los archivos de los modelos de las clases pedidas (manifiesto y
 * GLB de la variante) y los decodificadores (Draco, Basis), antes de que el visor los pida. El
 * visor los parsea después; esto solo ahorra la red.
 */
export async function prefetchVehicleModels(
  clases: readonly string[],
  variant: "alta" | "ligero",
  opts: { baseUrl?: string; decodersUrl?: string; fetchFn?: typeof fetch } = {},
): Promise<void> {
  const fetchFn = opts.fetchFn ?? fetch;
  const baseUrl = opts.baseUrl ?? VEHICLE_MODEL_BASE_URL;
  const decoders = opts.decodersUrl ?? DECODERS_BASE_URL;
  const tibio = (url: string) => fetchFn(url, { priority: "low" }).catch(() => undefined);
  const res = await fetchFn(`${baseUrl}vehiculos.json`).catch(() => null);
  const manifest = res && res.ok ? ((await res.json()) as VehicleModelManifest) : null;
  const archivos = modelClassesFor(clases)
    .map((c) => manifest?.clases[c]?.archivos[variant]?.archivo)
    .filter((a): a is string => typeof a === "string");
  await Promise.all([
    ...archivos.map((a) => tibio(`${baseUrl}${a}`)),
    tibio(`${decoders}draco/draco_decoder.wasm`),
    tibio(`${decoders}draco/draco_wasm_wrapper.js`),
    tibio(`${decoders}basis/basis_transcoder.wasm`),
    tibio(`${decoders}basis/basis_transcoder.js`),
  ]);
}
