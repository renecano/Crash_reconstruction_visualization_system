/**
 * W6 (O3): el encuadre de la maqueta en 2D. «Ver todo» deja a la vista todo lo que importa, «Ir al
 * impacto» encuadra el choque, y acercar, alejar y desplazar tienen límites. Con escenas canónicas
 * y su resultado versionado.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cajaDe, encuadre, type ResultadoMaqueta } from "./maqueta";
import {
  acercar,
  ALEJAR_MAXIMO,
  cajaDePuntos,
  conProporcion,
  desplazar,
  encajar,
  escalaGrafica,
  irAlImpacto,
  LADO_MINIMO_M,
  posesEnImpacto,
  puntosDeInteres,
  verTodo,
  vistaInicial,
  type Caja,
  type EscenaPlano,
} from "./vista-maqueta";

const FX = join(__dirname, "../../../../packages/scene-schema/fixtures");
const leer = <T>(p: string) => JSON.parse(readFileSync(join(FX, p), "utf8")) as T;
const escena = (n: string) => leer<EscenaPlano>(`${n}.json`);
const resultado = (n: string) => leer<ResultadoMaqueta>(`resultados/${n}.json`);

const dentro = (c: Caja, p: { x: number; y: number }) =>
  p.x >= c[0] - 1e-9 && p.x <= c[2] + 1e-9 && p.y >= c[1] - 1e-9 && p.y <= c[3] + 1e-9;

describe("«Ver todo»", () => {
  it.each(["alcance", "carambola", "peaton_cruce", "terraceria_topes", "objeto_fijo_arbol"])(
    "en %s deja a la vista las trayectorias, los reposos, la evidencia, los objetos y los topes",
    (n) => {
      const spec = escena(n);
      const r = resultado(n);
      const todo = verTodo(spec, r);
      for (const p of puntosDeInteres(spec, r)) expect(dentro(todo, p)).toBe(true);
      // Contiene las trayectorias completas (lo que «Ir al impacto» recorta).
      const [a, b, c, d] = cajaDe(r, 0);
      expect(todo[0]).toBeLessThanOrEqual(a);
      expect(todo[1]).toBeLessThanOrEqual(b);
      expect(todo[2]).toBeGreaterThanOrEqual(c);
      expect(todo[3]).toBeGreaterThanOrEqual(d);
      for (const v of r.vehiculos) if (v.pose_final) expect(dentro(todo, v.pose_final)).toBe(true);
    },
  );

  it("cuenta la evidencia física, los puntos de paso, los objetos y los topes de la escena", () => {
    const r = resultado("alcance");
    const lejos = { x: 400, y: -250 };
    const con = (extra: EscenaPlano) => verTodo(extra, r);
    expect(dentro(con({}), lejos)).toBe(false);
    expect(dentro(con({ evidencias: [{ puntos: [lejos] }] }), lejos)).toBe(true);
    expect(dentro(con({ vehiculos: [{ puntos_paso: [{ posicion: lejos }] }] }), lejos)).toBe(true);
    expect(dentro(con({ entorno: { objetos: [{ posicion: lejos }] } }), lejos)).toBe(true);
    expect(
      dentro(
        con({ lugar: { terreno: { topes: [{ linea: [lejos, { x: 401, y: -250 }] }] } } }),
        lejos,
      ),
    ).toBe(true);
    // Una zona de «todo el lugar» no se come el encuadre.
    const zona = [
      { x: -200, y: -200 },
      { x: 200, y: -200 },
      { x: 200, y: 200 },
    ];
    expect(con({ lugar: { terreno: { superficies: [{ poligono: zona }] } } })).toEqual(con({}));
  });

  it("sin nada que mostrar, un cuadro de 30 m centrado en el origen", () => {
    expect(cajaDePuntos([])).toEqual([-15, -15, 15, 15]);
    // Un solo punto: el lado mínimo, centrado en él.
    expect(cajaDePuntos([{ x: 10, y: 20 }], 8, 30)).toEqual([-5, 5, 25, 35]);
  });
});

describe("«Ir al impacto»", () => {
  it("es el encuadre de siempre: el impacto y los vehículos en ese instante a la vista, más chico que «Ver todo»", () => {
    const spec = escena("alcance");
    const r = resultado("alcance");
    const imp = irAlImpacto(r);
    expect(imp).toEqual(encuadre(r));
    expect(dentro(imp, r.punto_impacto!)).toBe(true);
    for (const p of posesEnImpacto(r)) expect(dentro(imp, p)).toBe(true);
    const todo = verTodo(spec, r);
    expect(imp[2] - imp[0]).toBeLessThan(todo[2] - todo[0]);
  });
});

describe("la proporción de la pantalla", () => {
  it("crece por el lado corto, sin recortar y con el mismo centro", () => {
    const c: Caja = [0, 0, 100, 50];
    expect(conProporcion(c, 1)).toEqual([0, -25, 100, 75]);
    expect(conProporcion(c, 4)).toEqual([-50, 0, 150, 50]);
    expect(conProporcion(c, 2)).toEqual([0, 0, 100, 50]);
    expect(conProporcion(c, Number.NaN)).toEqual(c);
    const v = vistaInicial(escena("alcance"), resultado("alcance"), 16 / 9);
    expect((v[2] - v[0]) / (v[3] - v[1])).toBeCloseTo(16 / 9, 9);
  });
});

describe("encajar en lo que no tapan los paneles", () => {
  it("la caja queda entera en el hueco, centrada, y llena uno de sus lados", () => {
    const c: Caja = [-30, -50, 70, 10];
    const m = { arriba: 120, abajo: 200, izq: 24, der: 24 };
    const [w, h] = [952, 828];
    const v = encajar(c, w, h, m);
    expect((v[2] - v[0]) / (v[3] - v[1])).toBeCloseTo(w / h, 9);
    const sx = (x: number) => ((x - v[0]) / (v[2] - v[0])) * w;
    const sy = (y: number) => ((v[3] - y) / (v[3] - v[1])) * h;
    expect(sx(c[0])).toBeGreaterThanOrEqual(m.izq - 1e-6);
    expect(sx(c[2])).toBeLessThanOrEqual(w - m.der + 1e-6);
    expect(sy(c[3])).toBeGreaterThanOrEqual(m.arriba - 1e-6);
    expect(sy(c[1])).toBeLessThanOrEqual(h - m.abajo + 1e-6);
    // Centrada en el hueco.
    expect((sx(c[0]) + sx(c[2])) / 2).toBeCloseTo(m.izq + (w - m.izq - m.der) / 2, 6);
    expect((sy(c[3]) + sy(c[1])) / 2).toBeCloseTo(m.arriba + (h - m.arriba - m.abajo) / 2, 6);
    // Llena el hueco en al menos un sentido.
    const llenaX = Math.abs(sx(c[2]) - sx(c[0]) - (w - m.izq - m.der)) < 1e-6;
    const llenaY = Math.abs(sy(c[1]) - sy(c[3]) - (h - m.arriba - m.abajo)) < 1e-6;
    expect(llenaX || llenaY).toBe(true);
  });

  it("sin márgenes es la caja con la proporción de la pantalla; con márgenes enormes, los ignora", () => {
    const c: Caja = [0, 0, 100, 50];
    encajar(c, 400, 400).forEach((x, i) => expect(x).toBeCloseTo(conProporcion(c, 1)[i]!, 9));
    const grandes = { arriba: 300, abajo: 300, izq: 0, der: 0 };
    expect(encajar(c, 400, 400, grandes)).toEqual(encajar(c, 400, 400));
    expect(encajar(c, 0, 400)).toEqual(c);
  });
});

describe("acercar, alejar y desplazar", () => {
  const todo: Caja = [-50, -50, 50, 50];

  it("acercar deja quieto el punto bajo el puntero", () => {
    const v: Caja = [-50, -50, 50, 50];
    const ancla = { x: 20, y: -10 };
    const a = acercar(v, 2, ancla, todo);
    expect(a[2] - a[0]).toBeCloseTo(50, 9);
    // El ancla queda en la misma fracción de la vista.
    expect((ancla.x - a[0]) / (a[2] - a[0])).toBeCloseTo((ancla.x - v[0]) / (v[2] - v[0]), 9);
    expect((ancla.y - a[1]) / (a[3] - a[1])).toBeCloseTo((ancla.y - v[1]) / (v[3] - v[1]), 9);
    // Alejar lo deshace.
    const b = acercar(a, 0.5, ancla, todo);
    b.forEach((x, i) => expect(x).toBeCloseTo(v[i]!, 9));
  });

  it("no se acerca a menos de 6 m ni se aleja a más de 4 veces «Ver todo»", () => {
    let v: Caja = [-50, -50, 50, 50];
    for (let k = 0; k < 40; k++) v = acercar(v, 1.5, { x: 0, y: 0 }, todo);
    expect(v[2] - v[0]).toBeCloseTo(LADO_MINIMO_M, 9);
    for (let k = 0; k < 40; k++) v = acercar(v, 0.5, { x: 0, y: 0 }, todo);
    expect(v[2] - v[0]).toBeCloseTo(100 * ALEJAR_MAXIMO, 9);
  });

  it("desplazar mueve la vista sin cambiar su tamaño y no pierde la escena de vista", () => {
    const v: Caja = [-10, -10, 10, 10];
    expect(desplazar(v, 5, -3, todo)).toEqual([-5, -13, 15, 7]);
    const lejos = desplazar(v, 10_000, -10_000, todo);
    expect(lejos[2] - lejos[0]).toBeCloseTo(20, 9);
    // El centro se queda a lo más a media vista de la orilla de «Ver todo»: algo sigue a la vista.
    expect(lejos[0]).toBeLessThanOrEqual(todo[2]);
    expect(lejos[3]).toBeGreaterThanOrEqual(todo[1]);
  });
});

describe("la escala gráfica", () => {
  it("es 1, 2 o 5 por una potencia de 10, cerca de un quinto del ancho", () => {
    expect(escalaGrafica(100)).toBe(20);
    expect(escalaGrafica(60)).toBe(10);
    expect(escalaGrafica(30)).toBe(5);
    expect(escalaGrafica(7)).toBe(1);
    expect(escalaGrafica(2600)).toBe(500);
    expect(escalaGrafica(4)).toBe(0.5);
  });
});
