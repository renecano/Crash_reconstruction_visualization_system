/** Formatos de números para las páginas (español de México e inglés; las cifras se escriben igual). */

/** Número con separador de miles y hasta tres decimales. */
export function numero(x: number): string {
  return x.toLocaleString("es-MX", { maximumFractionDigits: 3 });
}

/** Fracción como porcentaje con un decimal («58.4 %» en español, «58.4%» en inglés). */
export function pct(x: number, lang: "es" | "en" = "es"): string {
  return `${numero(Math.round(x * 1000) / 10)}${lang === "es" ? " %" : "%"}`;
}

/** «primer», «segundo», «tercer» lugar; después, el número. En inglés, «1st», «2nd», «3rd»… */
export function ordinal(n: number, lang: "es" | "en" = "es"): string {
  if (lang === "en") {
    const r = n % 100;
    const suf = r >= 11 && r <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
    return `${n}${suf}`;
  }
  return ["primer", "segundo", "tercer", "cuarto", "quinto"][n - 1] ?? `${n}.º`;
}
