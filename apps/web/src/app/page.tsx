import { Legend } from "@/components/legend";

export default function Page() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-16">
      <h1 className="text-4xl font-semibold tracking-tight">Croquis</h1>
      <p className="text-lg text-neutral-700 dark:text-neutral-300">
        Reconstrucción 3D de percances viales a partir del relato de quien los vivió. La IA traduce,
        la física decide y el visor muestra.
      </p>
      <Legend />
    </main>
  );
}
