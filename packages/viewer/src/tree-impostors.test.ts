import { loadFixture, loadResultado } from "@croquis/scene-schema";
import { DataTexture, InstancedMesh, RGBAFormat } from "three";
import { describe, expect, it } from "vitest";
import { QUALITY_PROFILES } from "./quality";
import { buildSceneGraph } from "./scene-graph";
import {
  buildPalms,
  crossedCards,
  crownCard,
  palmCrown,
  TREE_SPECIES,
  type TreeImpostor,
  type TreeImpostors,
} from "./tree-impostors";

function textura(): DataTexture {
  const t = new DataTexture(new Uint8Array([90, 120, 60, 255]), 1, 1, RGBAFormat);
  t.needsUpdate = true;
  return t;
}

/** Un juego de impostores de prueba (texturas de 1 px): las medidas de las tres especies. */
function impostores(): TreeImpostors {
  const out: TreeImpostors = {};
  for (const especie of TREE_SPECIES) {
    const tree: TreeImpostor = {
      especie,
      altoM: 10,
      aspecto: especie === "jacaranda" ? 1.25 : 0.95,
      copaDesde: 0.3,
      frente: { diff: textura(), nor: textura() },
      planta: { diff: textura(), nor: textura() },
      archivos: {
        frente_diff: `${especie}_frente_diff.webp`,
        frente_nor: `${especie}_frente_nor.webp`,
        planta_diff: `${especie}_planta_diff.webp`,
        planta_nor: `${especie}_planta_nor.webp`,
      },
      autores: "prueba",
      url: "",
    };
    out[especie] = tree;
  }
  return out;
}

const opts = {
  quality: QUALITY_PROFILES.media,
  env: { night: false, wet: false, groundColor: "#5d6b4a", streetLights: false },
};

describe("árboles impostores (T1.3b)", () => {
  it("las tarjetas cruzadas son tres cuadriláteros de altura 1 y la copa una horizontal", () => {
    const g = crossedCards(1.2);
    g.computeBoundingBox();
    expect(g.boundingBox!.min.y).toBeCloseTo(0, 6);
    expect(g.boundingBox!.max.y).toBeCloseTo(1, 6);
    expect(g.boundingBox!.max.x - g.boundingBox!.min.x).toBeCloseTo(1.2, 3);
    expect(g.index!.count).toBe(3 * 6);
    const c = crownCard(1.2, 0.65);
    c.computeBoundingBox();
    expect(c.boundingBox!.min.y).toBeCloseTo(0.65, 6);
    expect(c.boundingBox!.max.y).toBeCloseTo(0.65, 6);
    expect(palmCrown().index!.count).toBeGreaterThan(9 * 6);
  });

  for (const name of ["volcadura", "lateral_interseccion"] as const) {
    it(`${name}: cada árbol (menos los arbustos) pasa a un impostor de su especie`, async () => {
      const spec = loadFixture(name);
      const r = await loadResultado(name);
      const sg = buildSceneGraph(spec, r, opts);
      const objetos = sg.root.getObjectByName("objetos")!;
      const copas = objetos.getObjectByName("copas") as InstancedMesh | undefined;
      const esferas = copas?.count ?? 0;
      expect(esferas).toBeGreaterThan(5);
      sg.applyTreeImpostors(impostores());
      expect(copas?.visible).toBe(false);
      const g = objetos.getObjectByName("arboles_impostores")!;
      let impostores_ = 0;
      let arbustos = 0;
      g.traverse((o) => {
        if (!(o instanceof InstancedMesh)) return;
        if (o.name === "tarjetas") {
          // Lo que necesita Blender para rearmar la tarjeta (R11).
          const marca = (o.material as { userData: Record<string, unknown> }).userData.croquisArbol;
          expect(marca).toMatchObject({ tarjeta: "frente", noche: false });
          expect(String((marca as { diff: string }).diff)).toMatch(/_frente_diff\.webp$/);
        }
        if (o.name === "tarjetas" || o.name === "troncos") impostores_ += o.count;
        if (o.name === "arbustos") arbustos += o.count;
      });
      // Todos los árboles de pocas caras tienen su sustituto: impostor o arbusto.
      expect(impostores_ + arbustos).toBe(esferas);
      expect(impostores_).toBeGreaterThan(0);
      if (name === "volcadura") expect(arbustos).toBeGreaterThan(0);
      sg.dispose();
    });
  }

  it("las palmeras son troncos y frondas instanciados con el pie en el piso", () => {
    const g = buildPalms([{ x: 1, y: 0.5, z: -2, height: 9, yaw: 0.3 }], { night: false })!;
    const troncos = g.getObjectByName("troncos") as InstancedMesh;
    expect(troncos.count).toBe(1);
    expect(g.getObjectByName("frondas")).toBeInstanceOf(InstancedMesh);
  });
});
