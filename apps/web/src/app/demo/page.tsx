import type { Metadata } from "next";
import Link from "next/link";
import { DemoApp, type CasoDemo } from "@/components/demo/demo-app";
import datos from "@/data/demo.json";

export const metadata: Metadata = {
  title: "Tú eres… — demo de Croquis",
  description:
    "Elige un relato, mira qué entendió la IA campo por campo, contesta lo que falta y ve la reconstrucción en 3D. Sin servidor.",
};

export default function DemoPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-12">
      <header className="flex flex-col gap-3">
        <p className="text-sm">
          <Link href="/" className="underline">
            Croquis
          </Link>{" "}
          · Demo
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Tú eres…</h1>
        <p className="text-neutral-700 dark:text-neutral-300">
          …quien tiene que explicar qué pasó. Elige uno de estos relatos de ejemplo y recorre lo que
          haría Croquis con el tuyo. Esta demo funciona sin servidor y sin conexión; para contar uno
          propio, ve a{" "}
          <Link href="/relato" className="underline">
            Contar qué pasó
          </Link>
          .
        </p>
      </header>
      <DemoApp casos={datos.casos as CasoDemo[]} metodo={datos.metodo} fuente={datos.fuente} />
    </main>
  );
}
