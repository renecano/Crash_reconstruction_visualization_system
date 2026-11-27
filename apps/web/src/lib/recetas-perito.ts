/**
 * Las recetas de los cinco ejemplos (René, 2026-11-26): lo que haría un perito en La escena con cada
 * narración. Acepta lo que La escena propone cuando coincide con el texto y lo corrige cuando no; lo
 * que La escena no lee, lo marca en el mapa como lo dice el texto. Cada valor cita su frase.
 * Las usan la tabla del índice (`cifras-ronda4.test.ts`) y la prueba contra la app.
 */
import type { RecetaPerito } from "./ejemplo-como-perito";

export const RECETAS_PERITO: readonly (RecetaPerito & { cifra: string })[] = [
  {
    // «No se describen huellas de frenado, restos ni posiciones finales»: los dos junto al choque.
    clave: "crucero-noche",
    quedo: { Jetta: "junto", Camaro: "junto" },
    cifra: "V1",
  },
  {
    clave: "alcance-deformacion",
    quedo: {
      // «El vehículo A quedó en el carril de baja velocidad, 9 metros adelante del inicio de los restos».
      NP300: { de: "NP300", adelante: 9 },
      // «el vehículo B quedó sobre el acotamiento, 21 metros adelante»: del centro del carril de 3.50 m
      // al centro del acotamiento de 2.50 m hay 3.00 m, a la derecha.
      Vento: { de: "Vento", adelante: 21, izquierda: -3 },
    },
    cifra: "V1",
  },
  {
    clave: "carambola-lluvia",
    quedo: {
      // «El vehículo A quedó sobre el área de restos» («en el área del primer contacto»).
      Ranger: "junto",
      // «el vehículo B, en el mismo carril, 5 metros adelante del área de restos».
      Corolla: { de: "Corolla", adelante: 5 },
      // «y el vehículo C, 10 metros adelante del área de restos».
      Aveo: { de: "Aveo", adelante: 10 },
    },
    cifra: "V1",
  },
  {
    clave: "reversa-pendiente",
    // «salía en reversa de ese acceso vehicular hacia la calle» y golpea el costado izquierdo del que
    // «circulaba de Sur a Norte»: el acceso está al poniente.
    venia: { "CR-V": "poniente" },
    quedo: {
      // «quedó con su parte posterior sobre el carril con sentido al Norte, a 2.40 metros del acceso».
      "CR-V": [-1.8, 0.4],
      // «el vehículo B quedó 7 metros al Norte del área de contacto, junto a la guarnición».
      Versa: [0.6, 7],
    },
    // «12 metros al Sur de ese acceso se encuentra un reductor de velocidad tipo tope».
    terreno: [{ tipo: "tope-circular", en: [0.6, -12] }],
    cifra: "V2",
  },
  {
    clave: "poste-terraceria",
    // «una huella de derrape de 18.40 metros que inicia en el área de contacto … hasta un poste …
    // situado a 1.50 metros del borde de la carpeta»: adelante en la marcha del Sentra, hacia su
    // izquierda (el golpe del Mazda en su costado derecho lo empuja a ese lado).
    // En La escena: «¿Chocó contra algo más?» → el Sentra → Poste, y se toca donde está.
    otros: [
      { vehiculo: "Sentra", objeto: "poste", en: { de: "Sentra", adelante: 18, izquierda: 3 } },
    ],
    quedo: {
      // «el vehículo A quedó sobre el cruce, 1 metro al Oriente del área de contacto» (René, 2026-11-26:
      // decía «8 metros al Norte», que la física no alcanza: tras pegarle en el costado al Sentra, el
      // Mazda avanza unos 2.5 m).
      Mazda: [1, 0],
      // «El vehículo B quedó en contacto con el poste».
      Sentra: { de: "Sentra", adelante: 16.4, izquierda: 2.7 },
    },
    // La huella «cruza el borde de la carpeta y continúa sobre el acotamiento de terracería».
    pasos: [{ vehiculo: "V2", en: { de: "Sentra", adelante: 9, izquierda: 1.5 } }],
    terreno: [{ tipo: "terraceria", en: { de: "Sentra", adelante: 15, izquierda: 4 } }],
    cifra: "V2",
  },
];
