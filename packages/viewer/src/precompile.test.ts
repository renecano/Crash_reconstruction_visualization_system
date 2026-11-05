import {
  BoxGeometry,
  Group,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
} from "three";
import { describe, expect, it } from "vitest";
import {
  CAPA_OCULTA,
  cederHilo,
  dibujables,
  esconder,
  mostrar,
  ordenDeRevelado,
  ordenarPorEncuadre,
} from "./precompile";

describe("precompilado progresivo (René, 2026-11-04)", () => {
  it("recoge solo lo que se dibuja: mallas e instancias, no grupos", () => {
    const root = new Group();
    const g = new Group();
    const m = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial());
    const im = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial(), 3);
    g.add(m);
    root.add(g, im);
    expect(dibujables(root)).toEqual([m, im]);
  });

  it("separa lo que cae en el encuadre de la cámara del resto", () => {
    const cam = new PerspectiveCamera(45, 1, 0.1, 100);
    cam.position.set(0, 0, 10);
    cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix();
    const enfrente = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial());
    const detras = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial());
    detras.position.set(0, 0, 20);
    const sinRecorte = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial());
    sinRecorte.position.set(0, 0, 20);
    sinRecorte.frustumCulled = false;
    const { visibles, resto } = ordenarPorEncuadre([enfrente, detras, sinRecorte], cam);
    expect(visibles).toEqual([enfrente, sinRecorte]);
    expect(resto).toEqual([detras]);
  });

  it("esconde una rama en la capa oculta y la devuelve a la capa normal", () => {
    const rama = new Group();
    const m = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial());
    rama.add(m);
    esconder(rama);
    expect(m.layers.mask).toBe(2 ** CAPA_OCULTA);
    expect(m.layers.test(new PerspectiveCamera().layers)).toBe(false);
    mostrar(rama);
    expect(m.layers.mask).toBe(1);
  });

  it("ceder el hilo vuelve en una tarea posterior", async () => {
    let despues = false;
    const p = cederHilo().then(() => {
      despues = true;
    });
    expect(despues).toBe(false);
    await p;
    expect(despues).toBe(true);
  });
});

describe("orden de revelado", () => {
  it("lo grande visible primero, luego los vehículos, el resto visible y al final lo de fuera", () => {
    const cam = new PerspectiveCamera(60, 1, 0.1, 500);
    cam.position.set(0, 20, 40);
    cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix();
    const suelo = new Mesh(new BoxGeometry(200, 0.1, 200), new MeshStandardMaterial());
    const auto = new Mesh(new BoxGeometry(4, 1.5, 2), new MeshStandardMaterial());
    const poste = new Mesh(new BoxGeometry(0.2, 4, 0.2), new MeshStandardMaterial());
    poste.position.set(5, 2, 0);
    const lejos = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial());
    lejos.position.set(0, 0, 400);
    const orden = ordenDeRevelado([lejos, poste, auto, suelo], cam, (o) => o === auto, 1);
    expect(orden).toEqual([suelo, auto, poste, lejos]);
  });
});
