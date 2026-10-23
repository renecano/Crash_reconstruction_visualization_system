"use client";
/** Abre un caso guardado en este navegador (solo el navegador lo tiene) en el recorrido. */
import Link from "next/link";
import { RUTAS } from "@/lib/casos";
import { useCasoGuardado } from "@/lib/casos-navegador";
import { RecorridoCaso } from "./recorrido-caso";

export function CasoGuardadoAbierto({ id }: { id: string }) {
  const caso = useCasoGuardado(id);
  if (caso === undefined) return null;
  if (caso === null)
    return (
      <main className="flex flex-col items-start gap-3 px-4 py-10 md:px-8">
        <h1 className="t-titulo">Este caso no está en este equipo</h1>
        <p className="t-cuerpo text-texto-2">
          Los casos se guardan en el navegador donde se trabajaron. Si tienes el archivo del caso,
          ábrelo desde «Caso nuevo».
        </p>
        <Link href={RUTAS.lista} className="boton-secundario">
          Ver los casos
        </Link>
      </main>
    );
  return <RecorridoCaso inicial={caso} />;
}
