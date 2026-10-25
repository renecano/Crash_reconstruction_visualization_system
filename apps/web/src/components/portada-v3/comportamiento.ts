/**
 * El comportamiento de la portada v3, llevado de los scripts de la referencia
 * (`docs/cesvi/rediseno/Portada-v3.html`) a una sola función con limpieza:
 * - las hojas del expediente (la activa cruza el 45 % de la ventana) y la transición con el símbolo;
 * - la película de fondo: las tomas de la reconstrucción de Croquis, una por hoja, con la primera
 *   cargando antes que las demás, la versión de menor resolución en celular y, con movimiento
 *   reducido, solo el póster;
 * - las entradas al hacer scroll, las lecturas que se «decodifican», las cifras que cuentan, la
 *   narración que se lee, las preguntas que abren con movimiento, la mira y los botones magnéticos;
 * - los huevos de pascua: la consola, el modo croquis a mano («croquis» o triple clic al logo), el
 *   doble clic en la cifra del renglón y el botón que «choca»;
 * - las siete letras de «Qué significa Croquis».
 */

export interface TomaPortada {
  /** MP4 (H.264) de escritorio, el de celular y el póster. */
  mp4: string;
  movil: string;
  poster: string;
}

interface Opciones {
  tomas: TomaPortada[];
  etiquetas: Record<string, string>;
  toast: { sketch: string; vuelta: string; dato: string };
  consola: string;
}

/** Segundos por toma en la portada. */
const HOLD = 7.2;

export function iniciarPortadaV3(root: HTMLElement, o: Opciones): () => void {
  const limpiar: (() => void)[] = [];
  const escuchar = <K extends keyof WindowEventMap>(
    blanco: Window | Document | HTMLElement,
    tipo: K | string,
    fn: (e: never) => void,
    opts?: AddEventListenerOptions,
  ) => {
    blanco.addEventListener(tipo, fn as EventListener, opts);
    limpiar.push(() => blanco.removeEventListener(tipo, fn as EventListener, opts));
  };
  const timeouts = new Set<number>();
  const despues = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timeouts.delete(id);
      fn();
    }, ms);
    timeouts.add(id);
    return id;
  };
  let vivo = true;
  limpiar.push(() => {
    vivo = false;
    timeouts.forEach((id) => window.clearTimeout(id));
  });
  const $ = <T extends Element = HTMLElement>(sel: string) => root.querySelector<T>(sel);
  const $$ = <T extends Element = HTMLElement>(sel: string) => [...root.querySelectorAll<T>(sel)];
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const movil = matchMedia("(max-width: 900px)").matches;

  $("#intro .mk")?.classList.add("draw");

  /* ---- hojas: la activa es la que cruza el 45 % de la ventana ---- */
  const sheets = $$<HTMLElement>("main .sheet");
  const links = $$<HTMLAnchorElement>("nav a");
  const top = $("#top");
  const setSheet = (id: string) => {
    const key = document.getElementById(id)?.dataset.sheet;
    if (!key) return;
    if (root.dataset.sheet !== key) {
      root.dataset.sheet = key;
      root.dispatchEvent(new CustomEvent("sheet", { detail: key }));
    }
    links.forEach((a) => a.setAttribute("aria-current", a.dataset.go === key ? "true" : "false"));
  };
  links[0]?.setAttribute("aria-current", "true");
  const pick = () => {
    const y = innerHeight * 0.45;
    let cur = sheets[0];
    for (const s of sheets) if (s.getBoundingClientRect().top <= y) cur = s;
    if (cur) setSheet(cur.id);
    top?.classList.toggle("solid", scrollY > 40);
  };
  escuchar(window, "scroll", pick, { passive: true });
  escuchar(window, "resize", pick);

  /* ---- piezas sueltas que se alinean ---- */
  const frags = $("#frags");
  if (frags && "IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (es) =>
        es.forEach((e) => {
          if (e.isIntersecting && e.intersectionRatio > 0.5) frags.classList.add("united");
          else if (!e.isIntersecting) frags.classList.remove("united");
        }),
      { threshold: [0, 0.5, 1] },
    );
    io.observe(frags);
    limpiar.push(() => io.disconnect());
  }

  /* ---- transición entre hojas con el símbolo ---- */
  const wipe = $("#wipe");
  const wl = $("#wipeLabel");
  const wmk = wipe?.querySelector(".mk");
  let busy = false;
  const go = (id: string) => {
    const s = document.getElementById(id);
    if (!s || !wipe || !wl || !wmk) return;
    if (reduce || busy) {
      s.scrollIntoView();
      pick();
      return;
    }
    busy = true;
    wl.textContent = s.dataset.label ?? o.etiquetas[id] ?? "";
    const bars = [...wipe.querySelectorAll<HTMLElement>(".bars i")];
    bars.forEach((b, i) => (b.style.transitionDelay = `${i * 0.045}s`));
    wipe.classList.remove("out");
    wmk.classList.remove("draw");
    void wipe.offsetWidth;
    wipe.classList.add("in");
    despues(() => wmk.classList.add("draw"), 120);
    despues(() => {
      window.scrollTo({
        top: s.getBoundingClientRect().top + scrollY - (id === "hecho" ? 0 : 10),
        behavior: "instant",
      });
      pick();
    }, 560);
    despues(() => {
      bars.forEach((b, i) => (b.style.transitionDelay = `${i * 0.04}s`));
      wipe.classList.remove("in");
      wipe.classList.add("out");
    }, 1550);
    despues(() => (busy = false), 2150);
  };
  $$<HTMLAnchorElement>("[data-go]").forEach((a) =>
    escuchar(a, "click", (e: MouseEvent) => {
      e.preventDefault();
      if (e.detail) a.blur();
      go(a.dataset.go!);
    }),
  );
  const h = location.hash.slice(1);
  if (h && document.getElementById(h))
    despues(() => {
      document.getElementById(h)?.scrollIntoView();
      pick();
    }, 50);

  /* ---- intro: se retira cuando el primer cuadro del video está listo (o a los 6 s) ---- */
  let introDone = false;
  const done = () => {
    if (introDone) return;
    introDone = true;
    const el = $("#intro");
    despues(
      () => {
        el?.classList.add("gone");
        root.classList.add("ready");
        root.dispatchEvent(new Event("croquis:ready"));
        // Se oculta (no se quita: el nodo es de React).
        despues(() => el && (el.style.display = "none"), 1100);
      },
      reduce ? 0 : 900,
    );
  };
  despues(done, reduce ? 200 : 6000);

  /* ---- película: la portada recorre las tomas; cada hoja tiene la suya ---- */
  const CLIPS = o.tomas.map((t) => (movil ? t.movil : t.mp4));
  const SHEET_CLIP: Record<string, number> = { problema: 1, prueba: 2, metodo: 0, preguntas: 3 };
  const vids = [$<HTMLVideoElement>("#vA")!, $<HTMLVideoElement>("#vB")!];
  let front = 0;
  let cur = -1;
  let heroTimer: number | undefined;
  let pending: number | null = null;
  const src = (v: HTMLVideoElement, k: number) => {
    if (v.dataset.k !== String(k)) {
      v.dataset.k = String(k);
      v.preload = "auto";
      v.src = CLIPS[k]!;
      v.load();
    }
  };
  const whenReady = (v: HTMLVideoElement, fn: () => void) => {
    if (v.readyState >= 3) fn();
    else v.addEventListener("canplay", fn, { once: true });
  };
  // deja la siguiente toma cargando en el video de atrás (solo cuando la primera ya corre)
  const preload = () => {
    if (root.dataset.sheet === "hecho" && CLIPS.length > 1)
      src(vids[1 - front]!, (cur + 1) % CLIPS.length);
  };
  const show = (k: number) => {
    if (!vivo || (k === cur && pending === null)) return;
    pending = k;
    const a = vids[front]!;
    const b = vids[1 - front]!;
    if (cur === -1) {
      src(a, k);
      whenReady(a, () => {
        if (!vivo) return;
        cur = k;
        pending = null;
        a.classList.add("on");
        a.play().catch(() => undefined);
        done();
        preload();
      });
      return;
    }
    src(b, k);
    try {
      b.currentTime = 0;
    } catch {
      /* todavía sin metadatos */
    }
    whenReady(b, () => {
      if (!vivo || pending !== k) return;
      b.play().catch(() => undefined);
      b.classList.add("on");
      a.classList.remove("on");
      const sc = $("#scan");
      if (sc && root.dataset.sheet === "hecho") {
        sc.classList.remove("go");
        void sc.offsetWidth;
        sc.classList.add("go");
      }
      front = 1 - front;
      cur = k;
      pending = null;
      despues(() => {
        if (!a.classList.contains("on")) a.pause();
        preload();
      }, 1300);
    });
  };
  const heroLoop = () => {
    window.clearInterval(heroTimer);
    heroTimer = window.setInterval(() => {
      if (root.dataset.sheet === "hecho" && !document.hidden && CLIPS.length)
        show((cur + 1) % CLIPS.length);
    }, HOLD * 1000);
  };
  limpiar.push(() => window.clearInterval(heroTimer));
  if (reduce || !CLIPS.length) {
    // Movimiento reducido: sin video, solo el póster de la primera toma.
    done();
  } else {
    escuchar(root, "sheet", (e: CustomEvent<string>) => {
      const k = e.detail === "hecho" ? Math.max(cur, 0) : SHEET_CLIP[e.detail];
      if (k !== undefined) show(k % CLIPS.length);
      if (e.detail === "hecho") heroLoop();
      else window.clearInterval(heroTimer);
    });
    vids[0]!.addEventListener("error", done, { once: true });
    show(0);
    heroLoop();
  }

  /* ---- huevos de pascua ---- */
  try {
    console.log(
      "%c ◖ CROQUIS %c reconstrucción pericial ",
      "background:#ece8df;color:#0c0d0e;font:800 13px monospace;padding:4px 6px",
      "background:#ff5a1f;color:#0c0d0e;font:600 12px monospace;padding:4px 6px",
    );
    console.log(`%c${o.consola}`, "color:#f2c230;font:12px monospace");
  } catch {
    /* sin consola */
  }
  const toast = $("#toast");
  let tt: number | undefined;
  const say = (html: string) => {
    if (!toast) return;
    toast.innerHTML = html;
    toast.classList.add("on");
    window.clearTimeout(tt);
    tt = despues(() => toast.classList.remove("on"), 5200);
  };
  const sketch = () => {
    const on = root.classList.toggle("sketch");
    say(on ? o.toast.sketch : o.toast.vuelta);
  };
  let buf = "";
  escuchar(window, "keydown", (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t?.closest?.("input,textarea")) return;
    if (e.key.length !== 1) return;
    buf = (buf + e.key.toLowerCase()).slice(-7);
    if (buf === "croquis") {
      buf = "";
      sketch();
    }
  });
  let clicks = 0;
  let ct: number | undefined;
  const brand = $(".brand");
  if (brand)
    escuchar(brand, "click", () => {
      clicks++;
      window.clearTimeout(ct);
      ct = despues(() => (clicks = 0), 900);
      if (clicks === 3) {
        clicks = 0;
        sketch();
      }
    });
  $$<HTMLAnchorElement>(".cta.epic").forEach((b) =>
    escuchar(b, "click", (e: MouseEvent) => {
      if (reduce) return;
      b.classList.remove("hit");
      void b.offsetWidth;
      b.classList.add("hit");
      const r = b.getBoundingClientRect();
      const x = e.clientX || r.left + b.offsetWidth / 2;
      const y = e.clientY || r.top + b.offsetHeight / 2;
      ["", " b2"].forEach((c) => {
        const el = document.createElement("span");
        el.className = `boom${c}`;
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
        root.appendChild(el);
        despues(() => el.remove(), 900);
      });
      if (navigator.vibrate)
        try {
          navigator.vibrate(18);
        } catch {
          /* sin vibración */
        }
    }),
  );
  $$(".dict .v").forEach((v) => escuchar(v, "dblclick", () => say(o.toast.dato)));

  /* ---- qué significa Croquis ---- */
  const list = $("#acro");
  const all = $("#acroAll");
  if (list && all) {
    const lis = [...list.children] as HTMLElement[];
    const G = "ABCDEFGHIJKLMNÑOPQRSTUVWXYZ";
    const decodeL = (el: HTMLElement) => {
      if (reduce) return;
      const final = el.dataset.f ?? (el.dataset.f = el.textContent ?? "");
      const t0 = performance.now();
      const step = (now: number) => {
        if (!vivo) return;
        const k = Math.min(1, (now - t0) / 520);
        const n = Math.floor(final.length * k);
        let out = final.slice(0, n);
        for (let j = n; j < final.length; j++)
          out += /[\s¿?]/.test(final[j]!) ? final[j] : G[(Math.random() * G.length) | 0];
        el.textContent = out;
        if (k < 1) requestAnimationFrame(step);
        else el.textContent = final;
      };
      requestAnimationFrame(step);
    };
    const set = (li: HTMLElement, open: boolean) => {
      if (li.classList.contains("open") === open) return;
      li.classList.toggle("open", open);
      li.querySelector(".L")?.setAttribute("aria-expanded", String(open));
      if (open) decodeL(li.querySelector<HTMLElement>(".m b")!);
      list.classList.remove("hint");
      const n = lis.filter((l) => l.classList.contains("open")).length;
      all.setAttribute("aria-pressed", n === lis.length ? "true" : "false");
    };
    lis.forEach((li) =>
      escuchar(li.querySelector(".L")!, "click", () => set(li, !li.classList.contains("open"))),
    );
    escuchar(all, "click", () => {
      const openAll = all.getAttribute("aria-pressed") !== "true";
      lis.forEach((li, i) =>
        despues(() => set(li, openAll), reduce ? 0 : i * (openAll ? 140 : 60)),
      );
    });
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver(
        (es) =>
          es.forEach((e) => {
            if (e.isIntersecting) {
              despues(() => {
                if (!lis.some((l) => l.classList.contains("open"))) list.classList.add("hint");
              }, 1400);
              io.disconnect();
            }
          }),
        { threshold: 0.35 },
      );
      io.observe(list);
      limpiar.push(() => io.disconnect());
    }
  }

  pick();

  /* ---- movimiento: entradas al hacer scroll, lecturas que se decodifican, cifras que cuentan ---- */
  if (reduce || !("IntersectionObserver" in window)) return () => limpiar.forEach((f) => f());
  root.classList.add("js-anim");
  limpiar.push(() => root.classList.remove("js-anim"));

  // escalonar hermanos sin retraso propio
  const groups = new Map<Element, number>();
  $$("[data-r]").forEach((el) => {
    if (el.style.getPropertyValue("--d")) return;
    const p = el.parentElement!;
    const k = groups.get(p) ?? 0;
    el.style.setProperty("--d", `${k * 0.12}s`);
    groups.set(p, k + 1);
  });

  // lectura que se decodifica, como un instrumento
  const GLYPHS = "0123456789ABCDEFGHJKLMNPRSTUVXYZ/·+";
  const decode = (el: HTMLElement) => {
    if (el.dataset.done) return;
    el.dataset.done = "1";
    const final = el.dataset.final ?? (el.dataset.final = el.textContent ?? "");
    const t0 = performance.now();
    const dur = 650 + final.length * 18;
    const step = (now: number) => {
      if (!vivo) return;
      const k = Math.min(1, (now - t0) / dur);
      const n = Math.floor(final.length * k);
      let out = final.slice(0, n);
      for (let j = n; j < final.length; j++)
        out += final[j] === " " ? " " : GLYPHS[(Math.random() * GLYPHS.length) | 0];
      el.textContent = out;
      if (k < 1) requestAnimationFrame(step);
      else el.textContent = final;
    };
    requestAnimationFrame(step);
  };
  // cifras que cuentan (con el formato con que se escribieron)
  const count = (el: HTMLElement) => {
    const to = parseFloat(el.dataset.count!);
    const dec = Number(el.dataset.dec ?? 0);
    const final = el.textContent ?? "";
    const t0 = performance.now();
    const step = (now: number) => {
      if (!vivo) return;
      const k = Math.min(1, (now - t0) / 1500);
      const e = 1 - Math.pow(1 - k, 4);
      el.textContent = k < 1 ? (to * e).toFixed(dec) : final;
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  // la narración: Croquis «lee» y marca cada dato
  const scan = (el: HTMLElement) => {
    const marks = el.querySelectorAll("mark");
    const found = el.querySelectorAll(".found span");
    marks.forEach((m, i) =>
      despues(
        () => {
          m.classList.add("lit");
          found[i]?.classList.add("lit");
        },
        700 + i * 420,
      ),
    );
  };
  const fire = (el: HTMLElement) => {
    if (el.classList.contains("in")) return;
    el.classList.add("in");
    el.querySelectorAll<HTMLElement>("[data-decode]").forEach(decode);
    if (el.matches("[data-decode]")) decode(el);
    el.querySelectorAll<HTMLElement>("[data-count]").forEach(count);
    if (el.matches("[data-scan]")) scan(el);
  };
  const io = new IntersectionObserver(
    (es) =>
      es.forEach((e) => {
        if (e.isIntersecting) {
          fire(e.target as HTMLElement);
          io.unobserve(e.target);
        }
      }),
    { threshold: 0.18, rootMargin: "0px 0px -6% 0px" },
  );
  limpiar.push(() => io.disconnect());
  const targets = $$(".split, [data-r], [data-watch], [data-decode]");
  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    targets.forEach((t) => io.observe(t));
  };
  if (root.classList.contains("ready")) start();
  else escuchar(root, "croquis:ready", start, { once: true });
  despues(start, 7000);

  // barra de avance del expediente
  const prog = $("#progress");
  const onScroll = () => {
    const h = document.documentElement.scrollHeight - innerHeight;
    prog?.style.setProperty("--p", h > 0 ? (scrollY / h).toFixed(4) : "0");
  };
  escuchar(window, "scroll", onScroll, { passive: true });
  onScroll();

  // preguntas: abren y cierran con movimiento
  $$<HTMLDetailsElement>("details").forEach((d) => {
    const box = d.querySelector<HTMLElement>(".ans");
    const summary = d.querySelector("summary");
    if (!box || !summary) return;
    escuchar(summary, "click", (e: MouseEvent) => {
      e.preventDefault();
      if (d.open) {
        const alto = box.offsetHeight;
        box.animate(
          [
            { height: `${alto}px`, opacity: 1 },
            { height: "0px", opacity: 0 },
          ],
          { duration: 380, easing: "cubic-bezier(.6,0,.2,1)" },
        ).onfinish = () => {
          d.open = false;
        };
      } else {
        d.open = true;
        const alto = box.offsetHeight;
        box.animate(
          [
            { height: "0px", opacity: 0 },
            { height: `${alto}px`, opacity: 1 },
          ],
          { duration: 480, easing: "cubic-bezier(.16,.9,.2,1)" },
        );
      }
    });
  });

  if (matchMedia("(pointer: fine)").matches) {
    // mira que sigue al cursor y se vuelve punto de impacto sobre lo que se puede tocar
    const curEl = $("#cursor");
    let x = -100;
    let y = -100;
    let cx = -100;
    let cy = -100;
    escuchar(
      window,
      "pointermove",
      (e: PointerEvent) => {
        x = e.clientX;
        y = e.clientY;
        curEl?.classList.add("on");
        curEl?.classList.toggle(
          "hot",
          !!(e.target as HTMLElement | null)?.closest?.("a, button, summary"),
        );
      },
      { passive: true },
    );
    escuchar(document, "pointerleave", () => curEl?.classList.remove("on"));
    let raf = 0;
    const loop = () => {
      cx += (x - cx) * 0.22;
      cy += (y - cy) * 0.22;
      if (curEl) curEl.style.transform = `translate(${cx.toFixed(1)}px, ${cy.toFixed(1)}px)`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    limpiar.push(() => cancelAnimationFrame(raf));
    // botones magnéticos
    $$(".cta").forEach((b) => {
      escuchar(b, "pointermove", (e: PointerEvent) => {
        const r = b.getBoundingClientRect();
        const dx = (e.clientX - r.left - r.width / 2) / r.width;
        const dy = (e.clientY - r.top - r.height / 2) / r.height;
        b.style.transform = `translate(${(dx * 10).toFixed(1)}px, ${(dy * 8).toFixed(1)}px)`;
      });
      escuchar(b, "pointerleave", () => {
        b.style.transition = "transform .5s cubic-bezier(.3,1.5,.5,1), background .2s";
        b.style.transform = "";
        despues(() => (b.style.transition = ""), 500);
      });
    });
  }
  return () => limpiar.forEach((f) => f());
}
