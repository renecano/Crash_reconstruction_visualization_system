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
 * La fachada del tráiler: el enlace a YouTube se cambia por el reproductor de youtube-nocookie solo
 * cuando la persona lo toca (no se carga nada antes ni suena solo). Con Ctrl, Cmd o Mayús abre YouTube.
 */
function ponerTrailer(raiz: HTMLElement, signal: AbortSignal) {
  raiz.querySelector<HTMLAnchorElement>("[data-youtube]")?.addEventListener(
    "click",
    (ev) => {
      const a = ev.currentTarget as HTMLAnchorElement;
      if (ev.metaKey || ev.ctrlKey || ev.shiftKey) return;
      ev.preventDefault();
      const marco = document.createElement("iframe");
      marco.src = `https://www.youtube-nocookie.com/embed/${a.dataset.youtube}?autoplay=1&rel=0&playsinline=1`;
      marco.title = a.dataset.titulo ?? "";
      marco.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
      marco.allowFullscreen = true;
      marco.referrerPolicy = "strict-origin-when-cross-origin";
      a.replaceWith(marco);
      marco.focus();
    },
    { signal, once: true },
  );
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
    ponerTrailer(raiz, signal);

    const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // La línea de una barra llega al centro de su enlace.
    const linea = (cual: string, enlace: HTMLElement | undefined) => {
      const l = raiz.querySelector<HTMLElement>(`[data-linea="${cual}"]`);
      const li = enlace?.parentElement;
      l?.style.setProperty("--lleno", li ? `${li.offsetLeft + li.offsetWidth / 2}px` : "0px");
    };
    /**
     * El bloque que se lee: el último cuyo borde de arriba ya pasó el 45 % de la ventana. Se calcula
     * de la posición y no de entradas y salidas: un salto largo no deja marcado el de antes.
     */
    const seguir = (blancos: HTMLElement[], alLeer: (k: number) => void) => {
      let cuadro = 0;
      const leer = () => {
        cuadro = 0;
        const y = window.innerHeight * 0.45;
        alLeer(
          Math.max(
            0,
            blancos.findLastIndex((b) => b.getBoundingClientRect().top <= y),
          ),
        );
      };
      const pedir = () => (cuadro ||= requestAnimationFrame(leer));
      window.addEventListener("scroll", pedir, { passive: true, signal });
      window.addEventListener("resize", pedir, { signal });
      limpiar.push(() => cancelAnimationFrame(cuadro));
      leer();
    };
    const marcar = (enlaces: HTMLElement[], k: number, valor: string) =>
      enlaces.forEach((a, j) =>
        j === k ? a.setAttribute("aria-current", valor) : a.removeAttribute("aria-current"),
      );
    const enlaces = todos(".pv-nav [data-ir]");
    // El inicio (la línea vacía) y las secciones de la barra, en orden.
    const secciones = [
      raiz.querySelector<HTMLElement>("#inicio")!,
      ...enlaces.map((a) => raiz.querySelector<HTMLElement>(`#${a.dataset.ir}`)!),
    ];
    seguir(secciones, (k) => {
      marcar(enlaces, k - 1, "true");
      linea("secciones", enlaces[k - 1]);
    });
    const actos = todos("[data-acto]");
    seguir(todos("[data-paso]"), (k) => {
      marcar(actos, k, "step");
      linea("pasos", actos[k]);
    });

    if (!quieto) {
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
