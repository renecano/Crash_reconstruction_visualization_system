/** Textos del flujo guiado (`/cuenta`, PLAN §11.4). */
import { textos } from "@/i18n";

export const TEXTOS_FLUJO = textos(
  {
    titulo: "Cuenta qué pasó",
    pasos: {
      etiqueta: "Pasos",
      cuenta: "Cuenta",
      falta: "¿Qué falta?",
      ubica: "Ubica",
      simula: "Simula",
      actual: "paso actual",
      hecho: "hecho",
      pendiente: "todavía no",
    },
    cuenta: {
      etiqueta: "Tu relato",
      ayuda: "Escríbelo como se lo contarías a alguien: por dónde ibas, qué pasó y cómo quedó.",
      ejemplos: "O empieza con un ejemplo:",
      caracteres: (n: number, max: number) => `${n} de ${max} caracteres`,
      privacidadVacia:
        "Los nombres, placas, teléfonos y correos se quitan aquí, en tu dispositivo, antes de enviar.",
      privacidad: (lista: string) => `Se quitarán en tu dispositivo: ${lista}.`,
      verEnvio: "Ver lo que se envía",
      leer: "Leer mi relato",
      sinRed:
        "Sin conexión: leer el relato necesita internet. Sin red puedes abrir las escenas de ejemplo en el visor o armar una en el croquis.",
      entiende: "Lo que ya se entiende",
      entiendeNota:
        "Con reglas de español mexicano, en tu dispositivo. Al leer tu relato, la IA lo completa.",
      entiendeVacio: "Todavía nada. Escribe qué vehículos había, por dónde iban y qué pasó.",
      vehiculos: (n: number) => (n === 1 ? "1 vehículo" : `${n} vehículos`),
      personas: (n: number) => (n === 1 ? "1 persona" : `${n} personas`),
      marcadores: {
        nombre: "nombre",
        placa: "placa",
        "teléfono": "teléfono",
        correo: "correo",
        CURP: "CURP",
        RFC: "RFC",
        "número de domicilio": "número de domicilio",
      },
    },
    progreso: {
      titulo: "Leyendo tu relato",
      privacidad: "Quitamos tus datos personales en este dispositivo",
      claude: "Claude está leyendo tu relato",
      reglas: "Lo leemos con reglas de español mexicano",
      escritos: (n: number) => `${n} caracteres escritos`,
      citas: "Verificamos cada cita contra tu texto",
      escena: "Armamos la escena y las preguntas",
      listo: "listo",
      enCurso: "en curso",
      pendiente: "pendiente",
    },
    falta: {
      metodoClaude: "Lo leyó Claude y cada cita se verificó contra tu texto.",
      metodoReglas: "Lo leyeron las reglas de español mexicano y cada cita se verificó contra tu texto.",
      verificador: (revisados: number, corregidos: number) =>
        corregidos > 0
          ? `Se revisaron ${revisados} citas y se corrigieron ${corregidos}.`
          : `Se revisaron ${revisados} citas.`,
      tuRelato: "Tu relato, con lo que se entendió",
      leyendaCitas: "Lo subrayado en naranja es de donde salió cada dato.",
      seguir: "Acomodar el croquis",
      saltar: "Seguir sin contestar",
      sinPreguntas:
        "No hay más preguntas: con lo que contaste se puede armar el croquis. Puedes corregir cualquier detalle en él.",
    },
    ubica: {
      ayuda:
        "Acomoda los vehículos y las personas donde estaban. Lo que muevas queda marcado como tuyo.",
      ver: "Ver tu reconstrucción",
    },
    simula: {
      volver: "Volver al croquis",
      otro: "Contar otro",
    },
    errores: {
      guardar: "El navegador no permitió guardar la escena en esta pestaña. Revisa que no esté en modo privado estricto.",
    },
  },
  {
    titulo: "Tell what happened",
    pasos: {
      etiqueta: "Steps",
      cuenta: "Tell",
      falta: "What's missing?",
      ubica: "Place",
      simula: "Simulate",
      actual: "current step",
      hecho: "done",
      pendiente: "not yet",
    },
    cuenta: {
      etiqueta: "Your narrative",
      ayuda: "Write it the way you would tell someone: where you were going, what happened and how it ended.",
      ejemplos: "Or start with an example:",
      caracteres: (n: number, max: number) => `${n} of ${max} characters`,
      privacidadVacia: "Names, plates, phone numbers and emails are removed here, on your device, before sending.",
      privacidad: (lista: string) => `Removed on your device: ${lista}.`,
      verEnvio: "See what is sent",
      leer: "Read my narrative",
      sinRed:
        "Offline: reading the narrative needs internet. Offline you can open the example scenes in the viewer or build one in the sketch.",
      entiende: "What is already understood",
      entiendeNota:
        "With Mexican Spanish rules, on your device. When it reads your narrative, the AI completes it. The extractor reads Spanish best.",
      entiendeVacio: "Nothing yet. Write which vehicles there were, where they were going and what happened.",
      vehiculos: (n: number) => (n === 1 ? "1 vehicle" : `${n} vehicles`),
      personas: (n: number) => (n === 1 ? "1 person" : `${n} people`),
      marcadores: {
        nombre: "name",
        placa: "plate",
        "teléfono": "phone number",
        correo: "email",
        CURP: "CURP",
        RFC: "RFC",
        "número de domicilio": "street number",
      },
    },
    progreso: {
      titulo: "Reading your narrative",
      privacidad: "We removed your personal data on this device",
      claude: "Claude is reading your narrative",
      reglas: "We read it with Mexican Spanish rules",
      escritos: (n: number) => `${n} characters written`,
      citas: "We check every quote against your text",
      escena: "We build the scene and the questions",
      listo: "done",
      enCurso: "in progress",
      pendiente: "pending",
    },
    falta: {
      metodoClaude: "Claude read it and every quote was checked against your text.",
      metodoReglas: "The Mexican Spanish rules read it and every quote was checked against your text.",
      verificador: (revisados: number, corregidos: number) =>
        corregidos > 0
          ? `${revisados} quotes were checked and ${corregidos} were corrected.`
          : `${revisados} quotes were checked.`,
      tuRelato: "Your narrative, with what was understood",
      leyendaCitas: "The orange underline shows where each fact came from.",
      seguir: "Arrange the sketch",
      saltar: "Continue without answering",
      sinPreguntas:
        "No more questions: what you told is enough to build the sketch. You can correct any detail in it.",
    },
    ubica: {
      ayuda: "Place the vehicles and people where they were. Whatever you move is marked as yours.",
      ver: "See your reconstruction",
    },
    simula: {
      volver: "Back to the sketch",
      otro: "Tell another one",
    },
    errores: {
      guardar: "The browser did not allow saving the scene in this tab. Check that it is not in strict private mode.",
    },
  },
);
