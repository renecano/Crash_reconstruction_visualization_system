"use client";
/**
 * Mientras la IA lee (PLAN §11.4): lo que de verdad va pasando, no un indicador genérico. El
 * primer paso ocurre en el dispositivo antes de enviar; el segundo sigue los eventos del servidor
 * (método elegido y caracteres que Claude lleva escritos); verificar las citas y armar la escena
 * ocurren en el servidor antes de responder, así que se marcan al llegar la respuesta.
 */
import { useTextos } from "@/i18n/cliente";
import type { Progreso } from "@/lib/relato-api";
import { TEXTOS_FLUJO } from "./textos";

type Estado = "listo" | "enCurso" | "pendiente";

export function ProgresoLectura({ progreso }: { progreso: Progreso | null }) {
  const t = useTextos(TEXTOS_FLUJO).progreso;
  const metodo = progreso?.metodo ?? null;
  const filas: { id: string; texto: string; detalle?: string; estado: Estado }[] = [
    { id: "privacidad", texto: t.privacidad, estado: "listo" },
    {
      id: "lectura",
      texto: metodo === "reglas" ? t.reglas : t.claude,
      detalle:
        metodo === "claude" && progreso && progreso.caracteres > 0
          ? t.escritos(progreso.caracteres)
          : undefined,
      estado: "enCurso",
    },
    { id: "citas", texto: t.citas, estado: "pendiente" },
    { id: "escena", texto: t.escena, estado: "pendiente" },
  ];
  return (
    <section aria-labelledby="progreso-titulo" data-testid="progreso-lectura" className="carril">
      <h2 id="progreso-titulo" className="t-subtitulo mb-4">
        {t.titulo}
      </h2>
      <ol className="flex flex-col gap-4" aria-live="polite">
        {filas.map((f) => (
          <li
            key={f.id}
            data-estado={f.estado}
            className="grid grid-cols-[1.25rem_1fr] items-baseline gap-3"
          >
            <span
              aria-hidden="true"
              className={`inline-block h-2.5 w-2.5 rounded-full ${
                f.estado === "listo"
                  ? "bg-texto"
                  : f.estado === "enCurso"
                    ? "animate-pulse bg-texto-2"
                    : "border border-texto-3"
              }`}
            />
            <span className={f.estado === "pendiente" ? "t-interfaz text-texto-3" : "t-interfaz"}>
              {f.texto}
              <span className="sr-only"> ({t[f.estado]})</span>
              {f.detalle ? <span className="t-nota cifras block">{f.detalle}</span> : null}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
