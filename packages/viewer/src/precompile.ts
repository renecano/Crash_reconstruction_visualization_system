/**
 * Precompilado progresivo de los programas de la GPU (René, 2026-11-04).
 *
 * `renderer.compileAsync(todo)` generaba los sombreadores de toda la escena y, en WebGL, enlazaba
 * los programas en una sola tarea del hilo principal (23 s con la CPU limitada ×4); los programas
 * del pase de sombras no los compilaba y cada vehículo los compilaba al entrar en la sombra del sol
 * (tirones de 100–350 ms a media reproducción); y en alta y ultra compilaba para el contexto
 * directo, no para el pase de la posproducción, así que el primer cuadro real volvía a generar
 * todo. Aquí:
 *
 * - se compila **objeto por objeto** y se cede el hilo entre objetos (ninguna tarea abarca más de
 *   un programa);
 * - **primero lo que se ve** desde la cámara inicial (la escena se muestra en cuanto está) y
 *   después el resto en segundo plano;
 * - en **cada contexto de dibujo** (el directo, o los pases de la posproducción en alta y ultra),
 *   para que el cuadro real reutilice lo compilado;
 * - los **programas de sombras** se calientan uno por uno: un cuadro a 8 × 8 con un solo objeto
 *   proyectando sombra (las capas esconden a los demás).
 *
 * Lo que llega después (restos, personas) se compila escondido en `CAPA_OCULTA` y se muestra al
 * terminar: nada se compila a media reproducción.
 */
import {
  Frustum,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  RenderTarget,
  type Camera,
  type Light,
  type Object3D,
  type Scene,
} from "three";

/** Capa en la que se esconden las ramas aún sin compilar (la cámara y la sombra no la ven). */
export const CAPA_OCULTA = 31;
/** Capa auxiliar del calentamiento de sombras: solo las luces y el cebo están en ella. */
const CAPA_LUCES = 30;
/**
 * Capa que la cámara de cada sombra ve además de la normal. three copia a la cámara de la sombra
 * las capas de la cámara principal si la de la sombra solo tiene la capa 0; con esta capa extra
 * la conserva, y el objeto que se calienta (en esta capa) entra al pase de sombras sin que la
 * cámara principal (en la de las luces) lo dibuje.
 */
const CAPA_SOMBRA = 29;

/**
 * Un contexto de dibujo: destino y MRT con los que el renderer dibuja la escena y, si es un pase
 * de posproducción, el pase (su nodo de contexto —p. ej. la oclusión ambiental integrada— entra en
 * la clave de caché de todos los materiales: sin él se compilaban otros programas).
 */
export interface ContextoRender {
  renderTarget: RenderTarget | null;
  mrt: unknown;
  pase?: unknown;
}

/** El nodo de contexto con el que un pase dibuja (lo guarda three tras su primer cuadro). */
function nodoDeContexto(ctx: ContextoRender): unknown {
  const p = ctx.pase as { _contextNodeCache?: { context?: unknown } | null } | undefined;
  return p?._contextNodeCache?.context ?? null;
}

const idDe = (x: unknown): string => String((x as { id?: number } | null)?.id ?? "-");

/** Lo que este módulo necesita del `WebGPURenderer` (en WebGL o WebGPU). */
export interface RendererCompilable {
  contextNode: unknown;
  compileAsync(scene: Object3D, camera: Camera, targetScene?: Scene | null): Promise<void>;
  setRenderTarget(target: RenderTarget | null): void;
  getRenderTarget(): RenderTarget | null;
  setMRT(mrt: unknown): void;
  getMRT(): unknown;
  render(scene: Object3D, camera: Camera): void;
}

type Dibujable = Object3D & {
  geometry?: unknown;
  material?: unknown;
  castShadow: boolean;
};

/** Los objetos que el renderer dibuja (mallas, instancias, puntos, líneas), en orden de recorrido. */
export function dibujables(root: Object3D): Object3D[] {
  const out: Object3D[] = [];
  root.traverse((o) => {
    const d = o as Dibujable;
    if (d.geometry !== undefined && d.material !== undefined) out.push(o);
  });
  return out;
}

/**
 * Separa los objetos en los que caen dentro del encuadre de la cámara (o no se recortan por
 * encuadre) y el resto. La cámara debe tener sus matrices al día.
 */
export function ordenarPorEncuadre(
  objetos: readonly Object3D[],
  camera: Camera,
): { visibles: Object3D[]; resto: Object3D[] } {
  camera.updateMatrixWorld();
  const frustum = new Frustum().setFromProjectionMatrix(
    new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
  );
  const visibles: Object3D[] = [];
  const resto: Object3D[] = [];
  for (const o of objetos) {
    o.updateMatrixWorld();
    (dentroDelEncuadre(frustum, o) ? visibles : resto).push(o);
  }
  return { visibles, resto };
}

function dentroDelEncuadre(frustum: Frustum, o: Object3D): boolean {
  if (!o.frustumCulled) return true;
  try {
    return frustum.intersectsObject(o);
  } catch {
    return true;
  }
}

/**
 * Orden de revelado (René, 2026-11-04: ver algo en ≤ 5 s): primero lo más grande de lo que ve la
 * cámara (suelo, calzada, fachadas: pocos programas y mucha pantalla), luego los vehículos (lo
 * que el perito mira) y el resto de lo visible por tamaño; al final lo que queda fuera del
 * encuadre. `esVehiculo` dice qué objetos son parte de un vehículo.
 */
export function ordenDeRevelado(
  objetos: readonly Object3D[],
  camera: Camera,
  esVehiculo: (o: Object3D) => boolean,
  grandesPrimero = 6,
): Object3D[] {
  const { visibles, resto } = ordenarPorEncuadre(objetos, camera);
  const radio = (o: Object3D): number => {
    const g = (o as { geometry?: { boundingSphere?: { radius: number } | null } }).geometry;
    if (g && g.boundingSphere === undefined) return 0;
    if (g && g.boundingSphere === null) {
      (g as { computeBoundingSphere?: () => void }).computeBoundingSphere?.();
    }
    const r = g?.boundingSphere?.radius ?? 0;
    const e = o.matrixWorld.elements;
    const escala = Math.max(Math.hypot(e[0] ?? 1, e[1] ?? 0, e[2] ?? 0), 1e-6);
    return Number.isFinite(r) ? r * escala : 0;
  };
  const porTamano = [...visibles].sort((a, b) => radio(b) - radio(a));
  const grandes = porTamano.filter((o) => !esVehiculo(o)).slice(0, grandesPrimero);
  const vehiculos = porTamano.filter(esVehiculo);
  const demas = porTamano.filter((o) => !grandes.includes(o) && !esVehiculo(o));
  return [...grandes, ...vehiculos, ...demas, ...resto];
}

/** Cede el hilo principal a lo demás (entrada, cuadros) antes de seguir. */
export function cederHilo(): Promise<void> {
  const s = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  if (s?.yield) return s.yield();
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Esconde una rama del grafo en `CAPA_OCULTA` (ni la cámara ni las sombras la dibujan). */
export function esconder(rama: Object3D): void {
  rama.traverse((o) => o.layers.set(CAPA_OCULTA));
}

/** Devuelve una rama escondida a la capa normal. */
export function mostrar(rama: Object3D): void {
  rama.traverse((o) => o.layers.set(0));
}

export interface ProgresoPrecompilado {
  etapa: string;
  hechos: number;
  total: number;
}

/**
 * Objetos que se compilan a la vez. Cada `compileAsync` espera varios cuadros (genera nodos y
 * sondea el enlace con `requestAnimationFrame`); con varios en vuelo, esa espera se comparte.
 * En WebGPU los pipelines se crean en paralelo (`createRenderPipelineAsync`). En WebGL el
 * enlace es síncrono en varios controladores (ANGLE sobre D3D11 y Metal: `COMPLETION_STATUS_KHR`
 * bloquea hasta terminar), y un lote de 4 juntaba 4 enlaces en un mismo cuadro (tareas de 1–1.5 s
 * en la laptop de referencia): ahí va de uno en uno.
 */
export const LOTE_WEBGPU = 4;
export const LOTE_WEBGL = 1;

export function loteDe(renderer: { backend?: { isWebGPUBackend?: boolean } }): number {
  return renderer.backend?.isWebGPUBackend ? LOTE_WEBGPU : LOTE_WEBGL;
}

export interface OpcionesTodo {
  etapa: string;
  /** Calienta también el programa de sombras de cada objeto que proyecta sombra. */
  sombras: boolean;
  /** Luces de la escena (para el cuadro de calentamiento de sombras). */
  luces: readonly Light[];
  /** Se llama con cada objeto en cuanto sus programas están listos (p. ej. para mostrarlo). */
  revelar?: (o: Object3D) => void;
  /**
   * Primero todos los programas de dibujo (y el revelado), y solo después las sombras: lo que
   * importa aparece antes. Mientras un objeto no tiene su programa de sombras, no proyecta
   * sombra (`castShadow` apagado), para que ningún cuadro real lo compile al vuelo.
   */
  sombrasDespues?: boolean;
}

export class Precompilador {
  private cancelado = false;
  constructor(
    private readonly renderer: RendererCompilable,
    private readonly scene: Scene,
    private readonly camera: Camera,
    /** Contextos de dibujo vigentes (se consultan en cada objeto: los pases llegan tarde). */
    private readonly contextos: () => readonly ContextoRender[],
    private readonly onProgreso?: (p: ProgresoPrecompilado) => void,
  ) {}

  /** Detiene el trabajo pendiente (el visor se desmontó o el grafo cambió). */
  cancelar(): void {
    this.cancelado = true;
  }

  get activo(): boolean {
    return !this.cancelado;
  }

  /**
   * Objeto por objeto: compila sus programas en cada contexto, calienta su programa de sombras y
   * lo revela; cede el hilo entre objetos. Los objetos pueden estar escondidos (invisibles o en
   * `CAPA_OCULTA`): se fuerzan solo durante la recogida síncrona de `compileAsync` (termina antes
   * de su primer `await`) y durante el cuadro síncrono de sombras.
   */
  async todo(lista: readonly Object3D[], opts: OpcionesTodo): Promise<void> {
    const destino = opts.sombras ? new RenderTarget(8, 8) : null;
    const cebo = opts.sombras ? this.cebo() : null;
    const lote = loteDe(this.renderer as { backend?: { isWebGPUBackend?: boolean } });
    const pendientesDeSombra: Object3D[] = [];
    try {
      let hechos = 0;
      for (let i = 0; i < lista.length; i += lote) {
        if (this.cancelado) return;
        const grupo = lista.slice(i, i + lote);
        await Promise.all(grupo.map((o) => this.enTodosLosContextos(o)));
        if (this.cancelado) return;
        for (const o of grupo) {
          if (this.cancelado) return;
          const d = o as Dibujable;
          if (destino && d.castShadow) {
            if (opts.sombrasDespues) {
              d.castShadow = false;
              pendientesDeSombra.push(o);
            } else this.sombrasDe(o, opts.luces, destino);
          }
          o.userData.precompilado = opts.etapa;
          opts.revelar?.(o);
          hechos++;
        }
        this.onProgreso?.({ etapa: opts.etapa, hechos, total: lista.length });
        await cederHilo();
      }
      if (destino) {
        let sombras = 0;
        for (const o of pendientesDeSombra) {
          if (this.cancelado) return;
          (o as Dibujable).castShadow = true;
          this.sombrasDe(o, opts.luces, destino);
          sombras++;
          this.onProgreso?.({
            etapa: "sombras",
            hechos: sombras,
            total: pendientesDeSombra.length,
          });
          await cederHilo();
        }
      }
    } finally {
      // Cancelado a medias: lo que quedó sin sombra la recupera (la compilará al dibujar).
      for (const o of pendientesDeSombra) (o as Dibujable).castShadow = true;
      if (cebo) {
        this.scene.remove(cebo);
        cebo.geometry.dispose();
        cebo.material.dispose();
      }
      destino?.dispose();
    }
  }

  private async enTodosLosContextos(o: Object3D): Promise<void> {
    for (const ctx of this.contextos()) {
      if (this.cancelado) return;
      await this.uno(o, ctx);
    }
  }

  private async uno(o: Object3D, ctx: ContextoRender): Promise<void> {
    try {
      performance.mark(`precompilando: ${o.name || o.type}`);
    } catch {
      /* sin User Timing */
    }
    const r = this.renderer;
    const rtPrevio = r.getRenderTarget();
    const mrtPrevio = r.getMRT();
    const nodoPrevio = r.contextNode;
    const nodo = nodoDeContexto(ctx);
    const visible = o.visible;
    const culled = o.frustumCulled;
    const mascaraCam = this.camera.layers.mask;
    o.visible = true;
    o.frustumCulled = false;
    this.camera.layers.enable(CAPA_OCULTA);
    r.setRenderTarget(ctx.renderTarget);
    r.setMRT(ctx.mrt);
    if (nodo) r.contextNode = nodo;
    let p: Promise<void>;
    try {
      // La recogida de objetos es síncrona: al volver, ya se puede restaurar todo.
      p = r.compileAsync(o, this.camera, this.scene);
    } finally {
      o.visible = visible;
      o.frustumCulled = culled;
      this.camera.layers.mask = mascaraCam;
      r.setRenderTarget(rtPrevio);
      r.setMRT(mrtPrevio);
      r.contextNode = nodoPrevio;
    }
    try {
      await p;
    } catch (err) {
      console.warn("No se pudo precompilar un objeto", o.name, err);
    }
  }

  /**
   * Una malla diminuta que recibe sombra, solo en la capa de las luces: three dibuja el mapa de
   * sombras al dibujar un objeto iluminado, no antes. Con la cámara en esa capa, el cuadro de
   * calentamiento solo dibuja el cebo, y el pase de sombras, lo que está en la capa normal.
   */
  private cebo(): Mesh<PlaneGeometry, MeshStandardMaterial> {
    const cebo = new Mesh(new PlaneGeometry(0.01, 0.01), new MeshStandardMaterial());
    cebo.name = "cebo_sombras";
    cebo.receiveShadow = true;
    cebo.frustumCulled = false;
    cebo.layers.set(CAPA_LUCES);
    this.scene.add(cebo);
    return cebo;
  }

  /**
   * El pase de sombras corre dentro del pase que lo necesita, con el MRT de ese pase todavía
   * puesto en el renderer (el contexto de dibujo del mapa de sombras lo incluye): se calienta una
   * vez por contexto. Sin posproducción es uno solo (MRT nulo); en alta y ultra, uno por pase.
   */
  private sombrasDe(o: Object3D, luces: readonly Light[], destino: RenderTarget): void {
    const vistos = new Set<string>();
    for (const ctx of this.contextos()) {
      const nodo = nodoDeContexto(ctx);
      const clave = `${idDe(ctx.mrt)}|${idDe(nodo)}`;
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      this.unaSombra(o, luces, destino, ctx.mrt, nodo);
    }
  }

  /**
   * Un cuadro a 8 × 8 con la cámara viendo solo las luces y el cebo: el pase de sombras compila el
   * programa de sombras de `o` (forzado visible, en `CAPA_SOMBRA` y sin recorte por encuadre:
   * fuera del marco de la sombra del sol también se compila, los vehículos entran después). Los
   * objetos ya revelados también se dibujan en el pase de sombras, con programas ya compilados.
   * Todo es síncrono: los cuadros reales nunca ven el estado intermedio.
   */
  private unaSombra(
    o: Object3D,
    luces: readonly Light[],
    destino: RenderTarget,
    mrt: unknown,
    nodo: unknown,
  ): void {
    const r = this.renderer;
    const rtPrevio = r.getRenderTarget();
    const mrtPrevio = r.getMRT();
    const nodoPrevio = r.contextNode;
    const mascara = o.layers.mask;
    const visible = o.visible;
    const culled = o.frustumCulled;
    const mascarasLuces = luces.map((l) => l.layers.mask);
    // three dibuja el mapa de sombras una vez por cámara y por cuadro (`ShadowNode.updateBefore`
    // guarda el cuadro por cámara): cada calentamiento usa una copia nueva de la cámara, para que
    // varios en el mismo cuadro dibujen su sombra. La copia ve solo la capa de las luces.
    const camara = this.camera.clone();
    camara.layers.set(CAPA_LUCES);
    // El pase de sombras recorre la escena desde la raíz: un ancestro invisible (p. ej. un
    // vehículo que aún no entra en escena) esconde al objeto. Se fuerzan visibles los ancestros.
    const ancestros: { o: Object3D; visible: boolean }[] = [];
    for (let a = o.parent; a; a = a.parent) ancestros.push({ o: a, visible: a.visible });
    try {
      o.layers.set(CAPA_SOMBRA);
      o.visible = true;
      o.frustumCulled = false;
      for (const a of ancestros) a.o.visible = true;
      for (const l of luces) {
        l.layers.enable(CAPA_LUCES);
        const sombra = (l as { shadow?: { camera?: Camera } }).shadow;
        sombra?.camera?.layers.enable(CAPA_SOMBRA);
      }
      r.setRenderTarget(destino);
      r.setMRT(mrt);
      if (nodo) r.contextNode = nodo;
      r.render(this.scene, camara);
      const w = globalThis as { __croquisSombrasCalentadas?: number };
      w.__croquisSombrasCalentadas = (w.__croquisSombrasCalentadas ?? 0) + 1;
    } catch (err) {
      console.warn("No se pudo calentar una sombra", o.name, err);
    } finally {
      o.layers.mask = mascara;
      o.visible = visible;
      o.frustumCulled = culled;
      for (const a of ancestros) a.o.visible = a.visible;
      luces.forEach((l, k) => {
        l.layers.mask = mascarasLuces[k] ?? 1;
      });
      r.setRenderTarget(rtPrevio);
      r.setMRT(mrtPrevio);
      r.contextNode = nodoPrevio;
    }
  }
}
