import type { Row } from "./types";

const columnRenames = new Map<string, string>([
  ["VB - 0041", "startdato"],
  ["Medarbeiderens alder", "alder"],
  ["Nøkkel for kjønn", "kjonn"],
  ["Stillingsgruppe betegnelse", "stilling"],
  ["107A - Individuell lønn årsbe", "arslonn"],
  ["Kostn.st. 0027", "koststed"],
  ["Kost.st 0027", "koststed"],
  ["Kostnr", "koststed_nr"],
  ["Kostnadssted 0027", "koststed"],
]);

function renamedColumnName(name: string): string {
  const exact = columnRenames.get(name);
  if (exact) return exact;
  if (name.startsWith("Stillingsgruppe bet")) return "stilling";
  if (name.startsWith("107A - Individuell")) return "arslonn";
  return name;
}

export function normalizeRowColumns(row: Row): Row {
  const normalized: Row = {};
  for (const [name, value] of Object.entries(row)) {
    if (name === "Koststed_nr") continue;
    const normalizedName = renamedColumnName(name);
    normalized[normalizedName] = normalized[normalizedName] ?? value;
  }
  return normalized;
}

export function normalizeRows(rows: Row[]): Row[] {
  return rows.map(normalizeRowColumns);
}
