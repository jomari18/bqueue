// The TV reads ticket numbers digit by digit (spec 10).
const FILIPINO = ["sero", "isa", "dalawa", "tatlo", "apat", "lima", "anim", "pito", "walo", "siyam"];
const ENGLISH = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];

function spell(code: string, words: string[]): string {
  const [letter = "", digits = ""] = code.split("-");
  return [letter, ...[...digits].map((d) => words[Number(d)])].join(", ");
}

/** "D-012" → "D, sero, isa, dalawa" */
export function filipinoDigits(code: string): string {
  return spell(code, FILIPINO);
}

/** "D-012" → "D, zero, one, two" */
export function englishDigits(code: string): string {
  return spell(code, ENGLISH);
}

/** The sentence the TV speaks for a call. */
export function announcement(code: string, counterName: string, lang: "en" | "fil"): string {
  return lang === "fil"
    ? `Numero ${filipinoDigits(code)}, sa ${counterName}.`
    : `Now serving ${englishDigits(code)}, at ${counterName}.`;
}
