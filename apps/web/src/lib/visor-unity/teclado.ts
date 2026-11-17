/**
 * El teclado de la página con Unity vivo.
 *
 * Unity Web oye el teclado de toda la ventana y cancela cada tecla, tenga o no el foco su lienzo
 * (`WebGLInput.captureAllKeyboardInput`, activo por defecto): con el 3D ya cargado no se podía
 * escribir en ningún campo de la página (la conclusión y el nombre del perito, en el dictamen).
 *
 * Aquí se envuelven los oyentes de teclado que registra Unity para que no vean las teclas que son de
 * la página: lo que se escribe en un campo, el tabulador, y Intro o espacio sobre un control. Todo lo
 * demás le sigue llegando igual (las flechas de la cámara libre, Mayús y Esc al editar en 3D).
 *
 * Los oyentes de Unity se reconocen por su nombre: su framework (emscripten,
 * `JSEvents.registerOrRemoveHandler`) los registra siempre como una función `jsEventHandler`.
 */

const TIPOS = new Set(["keydown", "keypress", "keyup"]);

/** Tipos de `<input>` en los que no se escribe: ahí las teclas no son texto. */
const SIN_TEXTO = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

const CONTROLES =
  'button, a[href], summary, input, select, [role="button"], [role="tab"], [role="switch"], [role="menuitem"], [role="menuitemradio"], [role="option"], [role="checkbox"], [role="radio"]';

/** Si en ese elemento se escribe texto. */
export function esCampoDeTexto(t: EventTarget | null): boolean {
  if (typeof Element === "undefined" || !(t instanceof Element)) return false;
  const nombre = t.tagName.toLowerCase();
  if (nombre === "textarea" || nombre === "select") return true;
  if (nombre === "input") return !SIN_TEXTO.has((t.getAttribute("type") ?? "text").toLowerCase());
  const editable = t.getAttribute("contenteditable");
  return editable !== null && editable.toLowerCase() !== "false";
}

/** Si esa tecla es de la página y Unity no debe verla. */
export function teclaDeLaPagina(e: { key?: string; target: EventTarget | null }): boolean {
  if (e.key === "Tab") return true;
  if (esCampoDeTexto(e.target)) return true;
  if ((e.key === "Enter" || e.key === " ") && e.target instanceof Element)
    return e.target.matches(CONTROLES);
  return false;
}

/** Si ese oyente es de los que registra el framework de Unity. */
export function esOyenteDeUnity(oyente: unknown): oyente is (e: Event) => void {
  return typeof oyente === "function" && oyente.name === "jsEventHandler";
}

const protegidos = new WeakSet<object>();

/**
 * Deja instalada la protección en `window` y `document` (donde Unity pone sus oyentes). Se llama
 * antes de crear la instancia de Unity; llamarla otra vez no hace nada.
 */
export function protegerTecladoDeLaPagina(
  destinos: readonly EventTarget[] = [window, document],
): void {
  for (const destino of destinos) {
    if (protegidos.has(destino)) continue;
    protegidos.add(destino);
    const agregar = destino.addEventListener.bind(destino);
    const quitar = destino.removeEventListener.bind(destino);
    // El mismo oyente con el mismo envoltorio: así Unity lo puede quitar después.
    const envoltorios = new WeakMap<object, EventListener>();
    destino.addEventListener = (
      tipo: string,
      oyente: EventListenerOrEventListenerObject | null,
      opciones?: boolean | AddEventListenerOptions,
    ) => {
      if (!TIPOS.has(tipo) || !esOyenteDeUnity(oyente)) return agregar(tipo, oyente, opciones);
      let envuelto = envoltorios.get(oyente);
      if (!envuelto) {
        envuelto = function (this: unknown, e: Event) {
          if (!teclaDeLaPagina(e as KeyboardEvent)) oyente.call(this, e);
        };
        envoltorios.set(oyente, envuelto);
      }
      agregar(tipo, envuelto, opciones);
    };
    destino.removeEventListener = (
      tipo: string,
      oyente: EventListenerOrEventListenerObject | null,
      opciones?: boolean | EventListenerOptions,
    ) => {
      const envuelto = typeof oyente === "function" ? envoltorios.get(oyente) : undefined;
      quitar(tipo, envuelto ?? oyente, opciones);
    };
  }
}
