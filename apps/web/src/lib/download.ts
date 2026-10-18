/** Descarga bytes generados en el navegador como archivo (sin servidor). */
export function downloadBytes(bytes: BlobPart, filename: string, type: string): void {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Se libera después: algunos navegadores leen la URL de forma asíncrona tras el clic.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Nombre de archivo seguro (sin acentos ni espacios) para una escena. */
export function safeName(text: string): string {
  return (
    text
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "escena"
  );
}
