/**
 * Entrada del horneado para E8 (la empaqueta `e8_determinism.mjs` con esbuild y la corre en cada
 * navegador). Hace lo mismo que el visor al cargar una escena, sin GPU: arma el grafo de escena y
 * hornea con Rapier los restos, las volcaduras y los ragdolls calibrados (con los cuerpos de
 * MakeHuman). Devuelve el SHA-256 de los cuadros horneados.
 */
import { loadFixture, loadResultado } from "../packages/scene-schema/src/index.ts";
import { loadBodies } from "../packages/viewer/src/body-assets.ts";
import { attachDebris } from "../packages/viewer/src/debris-scene.ts";
import { environmentFor } from "../packages/viewer/src/environment.ts";
import { attachPeople, variantsFor } from "../packages/viewer/src/people-scene.ts";
import { QUALITY_PROFILES } from "../packages/viewer/src/quality.ts";
import { attachRollovers } from "../packages/viewer/src/rollover-scene.ts";
import { buildSceneGraph } from "../packages/viewer/src/scene-graph.ts";

async function sha(arrays) {
  const total = arrays.reduce((n, a) => n + a.byteLength, 0);
  const bytes = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) {
    bytes.set(new Uint8Array(a.buffer, a.byteOffset, a.byteLength), off);
    off += a.byteLength;
  }
  const d = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Hornea la escena canónica `name` como el visor (calidad `quality`). */
export async function hornear(name, bodiesUrl, quality = "media") {
  const spec = loadFixture(name);
  const resultado = await loadResultado(name);
  const env = environmentFor({
    fechaHora: spec.entorno.fecha_hora?.valor,
    iluminacion: spec.entorno.iluminacion?.valor,
    clima: spec.entorno.clima?.valor,
    alumbrado: spec.entorno.alumbrado_publico?.valor,
    lat: spec.lugar.ubicacion_real?.lat,
    lon: spec.lugar.ubicacion_real?.lon,
  });
  const graph = buildSceneGraph(spec, resultado, { quality: QUALITY_PROFILES[quality], env });
  try {
    const restos = await attachDebris(spec, resultado, graph);
    const volcaduras = await attachRollovers(resultado, graph);
    const templates = await loadBodies(variantsFor(spec), bodiesUrl);
    const personas = await attachPeople(spec, resultado, graph, templates);
    return {
      restos: { piezas: restos.bake.bodies.length, sha256: await sha([restos.bake.frames]) },
      volcaduras: await Promise.all(
        volcaduras.map(async (b) => ({ vehiculo: b.vehicleId, sha256: await sha([b.frames]) })),
      ),
      ragdolls: await Promise.all(
        personas.ragdolls.map(async (r) => ({
          persona: r.personId,
          k: r.k,
          distancia: r.distance,
          sha256: await sha([r.frames]),
        })),
      ),
    };
  } finally {
    graph.dispose();
  }
}
