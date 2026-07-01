export function asText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "bigint") return Number(value);
  const normalized = String(value).replace(/\s/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function toInt(value: unknown): number | null {
  const parsed = toNumber(value);
  return parsed === null ? null : Math.round(parsed);
}

export function formatInt(value: unknown): string {
  const parsed = toNumber(value);
  if (parsed === null) return "";
  return new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 }).format(parsed);
}

export function formatDecimal(value: unknown, digits = 1): string {
  const parsed = toNumber(value);
  if (parsed === null) return "";
  return new Intl.NumberFormat("nb-NO", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(parsed);
}

export function formatPercent(value: unknown): string {
  const parsed = toNumber(value);
  if (parsed === null) return "";
  return `${formatDecimal(parsed, 1)} %`;
}

export function uniqueSorted(values: unknown[]): string[] {
  return Array.from(new Set(values.map(asText).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, "nb"),
  );
}

export function mean(values: unknown[]): number | null {
  const numbers = values.map(toNumber).filter((value): value is number => value !== null);
  if (numbers.length === 0) return null;
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

export function sum(values: unknown[]): number {
  return values.map(toNumber).filter((value): value is number => value !== null).reduce((a, b) => a + b, 0);
}

export function excelDateYear(value: unknown): number | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.getFullYear();
  if (typeof value === "number") {
    const millis = Math.round((value - 25569) * 86400 * 1000);
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? null : date.getUTCFullYear();
  }
  const text = asText(value);
  if (!text) return null;
  const date = new Date(text);
  if (!Number.isNaN(date.getTime())) return date.getFullYear();
  const year = text.match(/\b(19|20)\d{2}\b/)?.[0];
  return year ? Number(year) : null;
}

export function seniorityGroup(year: unknown): string {
  const parsed = toInt(year);
  if (!parsed) return "Ukjent";
  const currentYear = new Date().getFullYear();
  const years = currentYear - parsed;
  if (years < 3) return "0-2 år";
  if (years < 6) return "3-5 år";
  if (years < 11) return "6-10 år";
  if (years < 16) return "11-15 år";
  if (years < 21) return "16-20 år";
  return "21 år eller mer";
}

export function ageGroup(age: unknown): string {
  const parsed = toInt(age);
  if (!parsed) return "Ukjent";
  if (parsed < 30) return "Under 30";
  if (parsed < 40) return "30-39";
  if (parsed < 50) return "40-49";
  if (parsed < 60) return "50-59";
  return "60+";
}
