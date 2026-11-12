"use client";

/**
 * El 3D de un caso de `/cesvi` con Unity (U6): las mismas notas y la misma escena que el visor
 * three.js, que queda de respaldo. Agrega el modo edición (mover objetos y marcar puntos de C1 en
 * el 3D) y «Descargar paquete 3D».
 *
 * `?visor=ligero` en la dirección abre directo el visor three.js (para comparar o diagnosticar).
 * Un navegador automatizado (las e2e, `navigator.webdriver`) también abre el ligero, salvo que la
 * prueba pida Unity con `window.__croquisVisorUnity = true`: así CI no baja el build de 70 MB en
 * cada flujo, y la e2e de U6 usa un Unity de mentira (`e2e/unity-falso.js`).
 */
import type { Expediente } from "@croquis/cesvi";
import type { HerramientaEdicion, MensajesDeUnity } from "@croquis/scene-schema";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import { especDel3d, NotasDel3d, Visor3dCaso } from "@/components/cesvi/caso/reconstruccion";
import { downloadBytes } from "@/lib/download";
import { impactosAColocar } from "@/lib/pasos-caso";
import { camaraUnity } from "@/lib/visor-unity/camaras";
import type { CanalTiempo } from "@/lib/visor-unity/canal";
import { aplicarObjetoEditado, aplicarPuntoMarcado } from "@/lib/visor-unity/edicion";
import { nombreDelPaquete } from "@/lib/visor-unity/paquete";
import { VisorUnity, type ApiVisorUnity } from "./visor-unity";

const HERRAMIENTAS: { id: HerramientaEdicion; texto: string; conVehiculo: boolean }[] = [
  { id: "mover", texto: "Mover objetos", conVehiculo: false },
  { id: "punto_inicial", texto: "Primer golpe", conVehiculo: false },
  { id: "choque_intermedio", texto: "Choque contra un objeto", conVehiculo: true },
  { id: "punto_paso", texto: "Punto de paso", conVehiculo: true },
];

export function VisorCasoUnity({
  expediente,
  onExpediente,
  editable = false,
  vehiculos = [],
  onApiUnity,
  presentar = null,
  ...props
}: ComponentProps<typeof Visor3dCaso> & {
  /**
   * En «Presentar» el 3D va detrás de la historia, a la derecha, con la cámara cinematográfica y el
   * instante que marca cada capítulo. Sin notas ni botones: la historia los tapa.
   */
  presentar?: CanalTiempo | null;
  expediente: Expediente | null;
  /** Una edición del 3D, ya llevada al expediente: el caso se recalcula y el 3D se vuelve a cargar. */
  onExpediente: (e: Expediente, mensaje: string) => void;
  /** Si se puede editar aquí (la reconstrucción, con el perito trabajando). */
  editable?: boolean;
  /** Los vehículos del caso, con su letra, para los puntos de C1. */
  vehiculos?: readonly { id: string; resId: string; letra: string }[];
  onApiUnity: (api: ApiVisorUnity | null) => void;
}) {
  const { r, calles = null, objetos = null, activo = true, camaraPedida = null } = props;
  const sp = useSearchParams();
  const [automatizado] = useState(
    () =>
      typeof navigator !== "undefined" &&
      navigator.webdriver &&
      !(window as unknown as { __croquisVisorUnity?: boolean }).__croquisVisorUnity,
  );
  const ligero = sp.get("visor") === "ligero" || (automatizado && sp.get("visor") !== "unity");
  const escena = useMemo(() => especDel3d(r, calles, objetos), [r, calles, objetos]);
  const camara = useMemo(
    () =>
      presentar
        ? { modo: "cinematica" as const, n: -1 }
        : camaraPedida
          ? { modo: camaraUnity(camaraPedida.camara), n: camaraPedida.n }
          : null,
    [camaraPedida, presentar],
  );
  const [editando, setEditando] = useState(false);
  const [herramienta, setHerramienta] = useState<HerramientaEdicion>("mover");
  const [vehiculo, setVehiculo] = useState<string | null>(vehiculos[0]?.id ?? null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [api, setApi] = useState<ApiVisorUnity | null>(null);
  const exp = useRef(expediente);
  useEffect(() => {
    exp.current = expediente;
  }, [expediente]);

  const conVehiculo = HERRAMIENTAS.find((h) => h.id === herramienta)?.conVehiculo ?? false;
  // Unity habla con los ids de la escena (`resId`); el expediente, con los suyos.
  const vResId = vehiculos.find((v) => v.id === vehiculo)?.resId;
  const edicion = useMemo(
    () =>
      editable && editando
        ? {
            on: true,
            herramienta,
            ...(conVehiculo && vResId ? { vehiculo_id: vResId } : {}),
          }
        : { on: false },
    [editable, editando, herramienta, conVehiculo, vResId],
  );

  if (ligero) return <Visor3dCaso {...props} />;

  const aplicar = (r2: { expediente: Expediente; mensaje: string; cambio: boolean }) => {
    setAviso(r2.mensaje);
    if (r2.cambio) onExpediente(r2.expediente, r2.mensaje);
  };
  const alObjeto = (m: MensajesDeUnity["objetoEditado"]) => {
    if (exp.current) aplicar(aplicarObjetoEditado(exp.current, r.origen, m));
  };
  const alPunto = (m: MensajesDeUnity["puntoMarcado"]) => {
    if (!exp.current) return;
    // El vehículo vuelve a la forma del expediente.
    const id = vehiculos.find((v) => v.resId === m.vehiculo_id)?.id ?? m.vehiculo_id;
    // El primer golpe, si el caso aún no lo tiene, va con los vehículos del primer impacto.
    aplicar(
      aplicarPuntoMarcado(
        exp.current,
        r.origen,
        { ...m, vehiculo_id: id },
        impactosAColocar(exp.current),
      ),
    );
  };

  return (
    <div
      className={
        presentar
          ? // Detrás del diálogo de Presentar (z-50), donde iba la maqueta: el velo de la izquierda lo cubre.
            "visible pointer-events-none fixed inset-y-0 right-0 left-[30%] z-[49]"
          : `flex h-full flex-col gap-2 p-3 ${props.expandido ? "pt-40 pb-28" : "pt-16"} ${props.aSangre ? "[&>p]:order-last" : ""}`
      }
      data-testid="visor-caso"
      data-presentar={presentar ? "si" : undefined}
    >
      {presentar ? null : (
        <NotasDel3d supuestos={props.supuestos} contraCesvi={props.contraCesvi} />
      )}
      <div className={presentar ? "relative h-full w-full" : "relative min-h-0 flex-1"}>
        <VisorUnity
          escena={escena}
          relieve={r.relieve ?? null}
          activo={activo}
          camara={camara}
          tiempo={presentar}
          edicion={presentar ? { on: false } : edicion}
          respaldo={<Visor3dCaso {...props} />}
          onApi={(a) => {
            setApi(a);
            onApiUnity(a);
          }}
          onObjetoEditado={alObjeto}
          onPuntoMarcado={alPunto}
        />
        {api && !presentar ? (
          <div className="absolute top-3 right-3 z-10 flex flex-wrap items-center justify-end gap-2">
            {editable ? (
              <>
                <button
                  type="button"
                  className="vidrio rounded-full px-3 py-1.5 text-[0.8125rem] font-medium"
                  aria-pressed={editando}
                  onClick={() => {
                    setEditando(!editando);
                    setAviso(null);
                  }}
                  data-testid="editar-3d"
                >
                  {editando ? "Terminar de editar" : "Editar en 3D"}
                </button>
                {editando ? (
                  <div className="segmentado" role="tablist" aria-label="Qué editar">
                    {HERRAMIENTAS.map((h) => (
                      <button
                        key={h.id}
                        type="button"
                        role="tab"
                        aria-selected={herramienta === h.id}
                        className="px-3"
                        onClick={() => setHerramienta(h.id)}
                        data-testid={`herramienta-3d-${h.id}`}
                      >
                        {h.texto}
                      </button>
                    ))}
                  </div>
                ) : null}
                {editando && conVehiculo ? (
                  <div className="segmentado" role="tablist" aria-label="De qué vehículo">
                    {vehiculos.map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        role="tab"
                        aria-selected={vehiculo === v.id}
                        className="px-3"
                        onClick={() => setVehiculo(v.id)}
                      >
                        {v.letra}
                      </button>
                    ))}
                  </div>
                ) : null}
              </>
            ) : null}
            <button
              type="button"
              className="vidrio rounded-full px-3 py-1.5 text-[0.8125rem] font-medium"
              onClick={() =>
                downloadBytes(
                  new TextEncoder().encode(JSON.stringify(api.paquete)),
                  nombreDelPaquete(escena),
                  "application/json",
                )
              }
              data-testid="descargar-paquete-3d"
            >
              Descargar paquete 3D
            </button>
          </div>
        ) : null}
        {editando && editable && !presentar ? (
          <p
            className="t-nota vidrio absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-control px-3 py-1.5"
            data-testid="aviso-edicion-3d"
          >
            {aviso ??
              (herramienta === "mover"
                ? "Arrastra un objeto para moverlo; la rueda lo gira y, con Mayús, cambia su largo. Esc cancela."
                : herramienta === "choque_intermedio"
                  ? "Toca el objeto contra el que chocó, donde lo tocó."
                  : "Toca el piso donde va el punto.")}
          </p>
        ) : null}
      </div>
    </div>
  );
}
