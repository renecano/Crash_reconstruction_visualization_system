// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  esCampoDeTexto,
  esOyenteDeUnity,
  protegerTecladoDeLaPagina,
  teclaDeLaPagina,
} from "./teclado";

/** Un oyente como los que registra el framework de Unity: cancela cada tecla y se llama así. */
function oyenteDeUnity(vistas: string[]) {
  return function jsEventHandler(e: Event) {
    vistas.push(`${e.type}:${(e as KeyboardEvent).key}`);
    e.preventDefault();
  };
}

function teclear(en: Element, key: string, tipo = "keydown"): boolean {
  // `dispatchEvent` da `false` si alguien canceló la tecla.
  return en.dispatchEvent(new KeyboardEvent(tipo, { key, bubbles: true, cancelable: true }));
}

function poner(html: string): Element {
  document.body.innerHTML = html;
  return document.body.firstElementChild!;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("el teclado de la página con Unity vivo", () => {
  it("reconoce dónde se escribe", () => {
    expect(esCampoDeTexto(poner("<textarea></textarea>"))).toBe(true);
    expect(esCampoDeTexto(poner("<input />"))).toBe(true);
    expect(esCampoDeTexto(poner('<input type="search" />'))).toBe(true);
    expect(esCampoDeTexto(poner('<input type="number" />'))).toBe(true);
    expect(esCampoDeTexto(poner("<select></select>"))).toBe(true);
    expect(esCampoDeTexto(poner('<div contenteditable="true"></div>'))).toBe(true);
    expect(esCampoDeTexto(poner('<input type="checkbox" />'))).toBe(false);
    expect(esCampoDeTexto(poner('<input type="range" />'))).toBe(false);
    expect(esCampoDeTexto(poner("<button></button>"))).toBe(false);
    expect(esCampoDeTexto(poner("<canvas></canvas>"))).toBe(false);
    expect(esCampoDeTexto(document.body)).toBe(false);
    expect(esCampoDeTexto(null)).toBe(false);
  });

  it("deja para la página lo que se escribe, el tabulador y activar un control", () => {
    const campo = poner("<textarea></textarea>");
    expect(teclaDeLaPagina({ key: "a", target: campo })).toBe(true);
    expect(teclaDeLaPagina({ key: "Backspace", target: campo })).toBe(true);
    expect(teclaDeLaPagina({ key: "ArrowLeft", target: campo })).toBe(true);
    expect(teclaDeLaPagina({ key: "Tab", target: document.body })).toBe(true);
    const boton = poner("<button></button>");
    expect(teclaDeLaPagina({ key: "Enter", target: boton })).toBe(true);
    expect(teclaDeLaPagina({ key: " ", target: boton })).toBe(true);
    expect(teclaDeLaPagina({ key: " ", target: poner('<div role="switch"></div>') })).toBe(true);
  });

  it("le deja a Unity las teclas del 3D", () => {
    const boton = poner("<button></button>");
    // Tras elegir la cámara libre el foco queda en un botón: las flechas siguen moviendo la cámara.
    expect(teclaDeLaPagina({ key: "ArrowUp", target: boton })).toBe(false);
    expect(teclaDeLaPagina({ key: "Shift", target: boton })).toBe(false);
    expect(teclaDeLaPagina({ key: "Escape", target: boton })).toBe(false);
    const lienzo = poner("<canvas></canvas>");
    expect(teclaDeLaPagina({ key: " ", target: lienzo })).toBe(false);
    expect(teclaDeLaPagina({ key: "Enter", target: document.body })).toBe(false);
    expect(teclaDeLaPagina({ key: "a", target: document.body })).toBe(false);
  });

  it("solo envuelve los oyentes de Unity", () => {
    expect(esOyenteDeUnity(oyenteDeUnity([]))).toBe(true);
    expect(esOyenteDeUnity(() => {})).toBe(false);
    expect(esOyenteDeUnity({ handleEvent() {} })).toBe(false);
    expect(esOyenteDeUnity(null)).toBe(false);
  });

  it("con la protección, lo que se escribe en un campo no llega a Unity ni se cancela", () => {
    protegerTecladoDeLaPagina();
    protegerTecladoDeLaPagina(); // Dos veces no envuelve dos veces.
    const vistas: string[] = [];
    const deUnity = oyenteDeUnity(vistas);
    const propias: string[] = [];
    const deLaPagina = (e: Event) => propias.push((e as KeyboardEvent).key);
    for (const tipo of ["keydown", "keypress", "keyup"])
      window.addEventListener(tipo, deUnity, true);
    window.addEventListener("keydown", deLaPagina);
    try {
      const campo = poner("<textarea></textarea>");
      expect(teclear(campo, "U")).toBe(true);
      expect(teclear(campo, "U", "keypress")).toBe(true);
      expect(teclear(campo, "U", "keyup")).toBe(true);
      expect(vistas).toEqual([]);
      // Los oyentes de la página (Ctrl+P del dictamen, Esc) la siguen viendo.
      expect(propias).toEqual(["U"]);

      // Fuera de un campo, Unity ve la tecla y la cancela, como antes.
      expect(teclear(document.body, "ArrowUp")).toBe(false);
      expect(vistas).toEqual(["keydown:ArrowUp"]);
      // El tabulador siempre es de la página.
      expect(teclear(document.body, "Tab")).toBe(true);
      expect(vistas).toEqual(["keydown:ArrowUp"]);
    } finally {
      // Unity quita sus oyentes con la función original: se quita el envoltorio.
      for (const tipo of ["keydown", "keypress", "keyup"])
        window.removeEventListener(tipo, deUnity, true);
      window.removeEventListener("keydown", deLaPagina);
    }
    vistas.length = 0;
    expect(teclear(document.body, "ArrowUp")).toBe(true);
    expect(vistas).toEqual([]);
  });
});
