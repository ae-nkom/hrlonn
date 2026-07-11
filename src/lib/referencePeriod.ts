import { toNumber } from "./format";
import type { Row } from "./types";

export type ReferencePeriod = {
  year: number;
  month: number;
  code: string;
};

export type ReferenceSalary = {
  name: string;
  initials: string;
  period: ReferencePeriod;
  salary: number;
};

export function referencePeriodFromCode(code: unknown): ReferencePeriod | null {
  const match = String(code ?? "").trim().match(/^(\d{4})M(\d{2})$/);
  if (!match) return null;
  return referencePeriod(Number(match[1]), Number(match[2]));
}

export function referencePeriod(yearValue: unknown, monthValue: unknown): ReferencePeriod | null {
  const year = toNumber(yearValue);
  if (year === null || !Number.isInteger(year)) return null;

  let month: number | null = null;
  if (monthValue instanceof Date) {
    if (monthValue.getFullYear() !== year) return null;
    month = monthValue.getMonth() + 1;
  } else {
    const monthText = String(monthValue ?? "").trim();
    const codedPeriod = referencePeriodFromCode(monthText);
    if (codedPeriod) {
      if (codedPeriod.year !== year) return null;
      month = codedPeriod.month;
    } else {
      month = toNumber(monthValue);
    }
  }

  if (month === null || !Number.isInteger(month) || month < 1 || month > 12) return null;
  return {
    year,
    month,
    code: `${year}M${String(month).padStart(2, "0")}`,
  };
}

export function referenceSalary(row: Row): ReferenceSalary | null {
  const name = String(row["navn"] ?? "").trim();
  const initials = String(row["init"] ?? "").trim().toUpperCase();
  const period = referencePeriod(row["ref_ar"], row["ref_mnd"]);
  const salary = toNumber(row["ref_lonn"]);
  if (!name || !initials || !period || salary === null || salary <= 0) return null;
  return { name, initials, period, salary };
}
