/**
 * El sello del dictamen firmado (René, 2026-11-16): para qué sirve la huella, en palabras; el código,
 * con qué se calcula y cómo comprobarla, en letra chica.
 */
export const HUELLA_PARA_QUE =
  "Huella del documento: sirve para comprobar que nadie modificó este dictamen después de firmarlo.";
export const huellaLetraChica = (huella: string) =>
  `Código de la huella: ${huella} (SHA-256 de la narración y del expediente que validó el perito). Para comprobarla, abre en Croquis el archivo del caso: si nada cambió desde la firma, el sello «Validado» aparece con este mismo código; si algo cambió, Croquis avisa que la validación ya no corresponde.`;
