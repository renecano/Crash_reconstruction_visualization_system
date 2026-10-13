import Link from "next/link";
import { Legend } from "@/components/legend";

export default function Page() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-16">
      <h1 className="text-4xl font-semibold tracking-tight">Croquis</h1>
      <p className="text-lg text-neutral-700 dark:text-neutral-300">
        Reconstrucción 3D de percances viales a partir del relato de quien los vivió. La IA traduce,
        la física decide y el visor muestra.
      </p>
      <nav aria-label="Secciones" className="flex flex-wrap gap-3">
        <Link
          href="/visor"
          className="rounded bg-neutral-900 px-4 py-2 font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
        >
          Ver las escenas en 3D
        </Link>
        <Link href="/croquis" className="rounded border border-neutral-400 px-4 py-2 font-medium">
          Editar el croquis 2D
        </Link>
      </nav>
      <Legend />
    </main>
  );
}
