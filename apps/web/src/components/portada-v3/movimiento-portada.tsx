"use client";
/**
 * El movimiento de la portada, sobre el HTML del servidor: las entradas al llegar a cada bloque, las
 * cifras que cuentan (terminan exactamente en el valor del índice), la línea con el punto naranja que
 * sigue la sección y el paso, la cortina con el logo al cambiar de sección desde la barra y el tema
 * del sistema. Con movimiento reducido solo quedan la línea y el tema.
 */
import { useEffect, useRef } from "react";
import { textoContado } from "@/lib/movimiento";

/** Lo que dura la cortina y cuándo ya tapa la página (ms); el mismo orden que la de la app. */
const CORTINA_MS = 1100;
const CORTINA_SUBE_MS = 700;
const CUENTA_MS = 1450;

/**
 * El video del inicio, solo en pantallas anchas, con movimiento y sin ahorro de datos. Se pide al
 * terminar de cargar la página, entra cuando ya corre y se detiene fuera de la pantalla; si falla,
 * queda la foto. Con su botón de pausa (WCAG 2.2.2).
 */
function ponerVideo(raiz: HTMLElement, limpiar: (() => void)[]) {
  const foto = raiz.querySelector<HTMLElement>("[data-video]");
  const url = foto?.dataset.video;
  const boton = foto?.querySelector<HTMLButtonElement>("button");
  const ahorro = (navigator as { connection?: { saveData?: boolean } }).connection?.saveData;
  if (!foto || !url || !boton || ahorro || !window.matchMedia("(min-width: 64rem)").matches) return;
  const video = document.createElement("video");
  Object.assign(video, { muted: true, loop: true, playsInline: true, preload: "auto" });
  video.setAttribute("aria-hidden", "true");
  let pausado = false;
  const correr = () => void video.play().catch(() => undefined);
  const rotular = () => {
    boton.textContent = pausado ? "▶" : "❚❚";
    boton.setAttribute(
      "aria-label",
      (pausado ? boton.dataset.reproducir : boton.dataset.pausar) ?? "",
    );
  };
  const aLaVista = new IntersectionObserver(([e]) =>
    e?.isIntersecting && !pausado ? correr() : video.pause(),
  );
  const alternar = () => {
    pausado = !pausado;
    if (pausado) video.pause();
    else correr();
    rotular();
  };
  const cargar = () => {
    video.src = url;
    boton.before(video);
    video.addEventListener(
      "playing",
      () => {
        video.dataset.listo = "";
        boton.hidden = false;
        rotular();
      },
      { once: true },
    );
    boton.addEventListener("click", alternar);
    aLaVista.observe(foto);
  };
  if (document.readyState === "complete") cargar();
  else window.addEventListener("load", cargar, { once: true });
  limpiar.push(() => {
    window.removeEventListener("load", cargar);
    boton.removeEventListener("click", alternar);
    aLaVista.disconnect();
    boton.hidden = true;
    video.remove();
  });
}

export function MovimientoPortada() {
  const marca = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const raiz = marca.current?.closest<HTMLElement>(".pv");
    if (!raiz) return undefined;
    const abortar = new AbortController();
    const { signal } = abortar;
    const limpiar: (() => void)[] = [];
    const todos = (s: string) => [...raiz.querySelectorAll<HTMLElement>(s)];

    const oscuro = window.matchMedia("(prefers-color-scheme: dark)");
    const ponerTema = () => (raiz.dataset.tema = oscuro.matches ? "oscuro" : "claro");
    ponerTema();
    oscuro.addEventListener("change", ponerTema, { signal });

    const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // La línea de la barra: hasta el centro del elemento que se lee.
    const linea = (cual: string, lleno: number) => {
      const l = raiz.querySelector<HTMLElement>(`[data-linea="${cual}"]`);
      l?.style.setProperty("--lleno", `${lleno}%`);
    };
    const seguir = (blancos: HTMLElement[], alEntrar: (k: number) => void) => {
      const o = new IntersectionObserver(
        (es) => {
          for (const e of es)
            if (e.isIntersecting) alEntrar(blancos.indexOf(e.target as HTMLElement));
        },
        { rootMargin: "-45% 0px -54% 0px" },
      );
      blancos.forEach((b) => o.observe(b));
      limpiar.push(() => o.disconnect());
    };
    const enlaces = todos(".pv-nav [data-ir]");
    // El inicio (0 %) y las secciones de la barra, en orden.
    const secciones = [
      raiz.querySelector<HTMLElement>("#inicio")!,
      ...enlaces.map((a) => raiz.querySelector<HTMLElement>(`#${a.dataset.ir}`)!),
    ];
    seguir(secciones, (k) => {
      enlaces.forEach((a, j) =>
        j === k - 1 ? a.setAttribute("aria-current", "true") : a.removeAttribute("aria-current"),
      );
      linea("secciones", k === 0 ? 0 : ((k - 0.5) / enlaces.length) * 100);
    });
    const actos = todos("[data-acto]");
    seguir(todos("[data-paso]"), (k) => {
      actos.forEach((a, j) => a.toggleAttribute("data-actual", j === k));
      linea("pasos", ((k + 0.5) / actos.length) * 100);
    });

    if (!quieto) {
      ponerVideo(raiz, limpiar);
      const ver = new IntersectionObserver(
        (es) => {
          for (const e of es) {
            if (!e.isIntersecting) continue;
            e.target.setAttribute("data-visto", "");
            ver.unobserve(e.target);
          }
        },
        { threshold: 0.2 },
      );
      todos("[data-ve]").forEach((x) => ver.observe(x));
      limpiar.push(() => ver.disconnect());

      const tapada = () => Boolean(raiz.querySelector("[data-cortina][data-activa]"));
      const contar = new IntersectionObserver(
        (es) => {
          for (const e of es) {
            if (!e.isIntersecting) continue;
            contar.unobserve(e.target);
            const n = e.target;
            const final = Number((n as HTMLElement).dataset.cuenta);
            // Detrás de la cortina todavía no se ve: se empieza a contar cuando sube.
            const t0 = performance.now() + (tapada() ? CORTINA_SUBE_MS : 0);
            const paso = (ahora: number) => {
              if (signal.aborted) return;
              const p = Math.min(1, Math.max(0, (ahora - t0) / CUENTA_MS));
              n.textContent = textoContado(final, 0, p);
              if (p < 1) requestAnimationFrame(paso);
            };
            requestAnimationFrame(paso);
          }
        },
        { threshold: 0.6 },
      );
      todos("[data-cuenta]").forEach((x) => contar.observe(x));
      limpiar.push(() => contar.disconnect());

      // La cortina con el logo: tapa, la página salta a la sección y se descubre.
      const cortina = raiz.querySelector<HTMLElement>("[data-cortina]")!;
      const numero = cortina.querySelector("[data-cortina-numero]")!;
      const nombre = cortina.querySelector("[data-cortina-nombre]")!;
      let reloj = 0;
      limpiar.push(() => window.clearTimeout(reloj));
      const bajar = (ms: number) => {
        window.clearTimeout(reloj);
        reloj = window.setTimeout(() => {
          delete cortina.dataset.activa;
          delete raiz.dataset.apertura;
        }, ms);
      };
      if (raiz.dataset.apertura) bajar(CORTINA_MS);
      raiz.addEventListener(
        "click",
        (ev) => {
          const a = (ev.target as Element).closest<HTMLElement>("[data-ir]");
          const me = ev as MouseEvent;
          if (!a || me.metaKey || me.ctrlKey || me.shiftKey) return;
          const destino = raiz.querySelector<HTMLElement>(`#${a.dataset.ir}`);
          if (!destino) return;
          ev.preventDefault();
          numero.textContent = a.dataset.numero ?? "";
          nombre.textContent = a.dataset.numero ? a.textContent : "";
          delete cortina.dataset.activa;
          void cortina.offsetWidth; // reinicia la animación
          cortina.dataset.activa = "";
          history.pushState(null, "", `#${a.dataset.ir}`);
          destino.scrollIntoView({ behavior: "instant", block: "start" });
          destino.focus({ preventScroll: true });
          bajar(CORTINA_MS);
        },
        { signal },
      );
    }
    return () => {
      abortar.abort();
      limpiar.forEach((f) => f());
    };
  }, []);
  return <span ref={marca} hidden />;
}
