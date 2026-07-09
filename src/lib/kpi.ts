import { toInt } from "./format";
import type { Row, StoredBundle } from "./types";
import fallbackKpiCsv from "../../data/kpi_historie.csv?raw";

const SSB_KPI_DATA_URL = "https://data.ssb.no/api/pxwebapi/v2/tables/14700/data";
const REFERENCE_START_YEAR = 2021;
const REFERENCE_START_MONTH = 5;
const TARGET_MONTH = 5;
const KPI_FETCH_TIMEOUT_MS = 20_000;

const monthNames: Record<number, string> = {
  1: "januar",
  2: "februar",
  3: "mars",
  4: "april",
  5: "mai",
  6: "juni",
  7: "juli",
  8: "august",
  9: "september",
  10: "oktober",
  11: "november",
  12: "desember",
};

const shortMonthNames: Record<number, string> = {
  1: "Jan",
  2: "Feb",
  3: "Mar",
  4: "Apr",
  5: "Mai",
  6: "Jun",
  7: "Jul",
  8: "Aug",
  9: "Sep",
  10: "Okt",
  11: "Nov",
  12: "Des",
};

const monthColumnToNumber = new Map(Object.entries(monthNames).map(([number, name]) => [name.toLocaleLowerCase("nb-NO"), Number(number)]));

function periodCode(year: number, month: number): string {
  return `${year}M${String(month).padStart(2, "0")}`;
}

function shortPeriodLabel(code: string): string {
  const period = parsePeriodCode(code);
  if (!period) return code;
  return `${shortMonthNames[period.month]} ${String(period.year).slice(-2)}`;
}

function parsePeriodCode(code: string): { year: number; month: number } | null {
  const match = code.match(/^(\d{4})M(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null;
  return { year, month };
}

function monthlyPeriodCodes(startYear: number, startMonth: number, endYear: number, endMonth: number): string[] {
  const codes: string[] = [];
  for (let year = startYear, month = startMonth; year < endYear || (year === endYear && month <= endMonth);) {
    codes.push(periodCode(year, month));
    month += 1;
    if (month > 12) {
      year += 1;
      month = 1;
    }
  }
  return codes;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), KPI_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) throw new Error(`Klarte ikke hente KPI fra SSB (${response.status})`);
    return response.json() as Promise<T>;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Klarte ikke hente KPI fra SSB: forespørselen tidsavbrøt. Prøv igjen senere.");
    }
    if (err instanceof TypeError && err.message === "Failed to fetch") {
      throw new Error("Klarte ikke hente KPI fra SSB. SSB er trolig midlertidig utilgjengelig, eller nettleseren blokkerte feilresponsen fra SSB. Prøv igjen senere.");
    }
    throw err;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

type SsbJsonStat = {
  dimension: {
    Tid: {
      category: {
        index: Record<string, number>;
      };
    };
  };
  value: number[];
};

function kpiDataUrl(periodCodes: string[]) {
  const params = new URLSearchParams();
  params.set("lang", "no");
  params.set("valueCodes[Tid]", periodCodes.join(","));
  params.set("valueCodes[VareTjenesteGrp]", "00");
  params.set("valueCodes[ContentsCode]", "KpiIndMnd");
  return `${SSB_KPI_DATA_URL}?${params.toString()}`;
}

function kpiRowFromReferencePath(referenceCode: string, targetCode: string, referencePath: number, source: "ssb" | "fallback", kpiValues?: Record<string, number>): Row {
  const referencePeriod = parsePeriodCode(referenceCode);
  const targetPeriod = parsePeriodCode(targetCode);
  const referenceKpi = kpiValues?.[referenceCode] ?? null;
  const targetKpi = kpiValues?.[targetCode] ?? null;

  return {
    Periode: shortPeriodLabel(referenceCode),
    Referansebane: referencePath,
    Referanseår: referencePeriod?.year ?? null,
    ReferansemånedNr: referencePeriod?.month ?? null,
    Referansemåned: referenceCode,
    Sluttmåned: targetCode,
    "_kpi_referanse": referenceKpi,
    "_kpi_slutt": targetKpi,
    "_kpi_kilde": source,
    Målår: targetPeriod?.year ?? null,
    Målmåned: targetPeriod?.month ?? null,
  };
}

function parseCsvNumber(value: string | undefined): number | null {
  const text = String(value ?? "").trim();
  if (!text || text === ".") return null;
  const parsed = Number(text.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function fallbackKpiValuesFromCsv(): Record<string, number> {
  const rows = fallbackKpiCsv.trim().split(/\r?\n/).filter(Boolean);
  const header = rows[0]?.split(";").map((cell) => cell.trim()) ?? [];
  const values: Record<string, number> = {};
  for (const line of rows.slice(1)) {
    const cells = line.split(";");
    const year = toInt(cells[0]);
    if (year === null) continue;
    for (let index = 1; index < header.length; index += 1) {
      const month = monthColumnToNumber.get(header[index].toLocaleLowerCase("nb-NO"));
      if (!month) continue;
      const value = parseCsvNumber(cells[index]);
      if (value !== null) values[periodCode(year, month)] = value;
    }
  }
  return values;
}

function kpiRowsFromValues(referenceCodes: string[], targetCode: string, source: "ssb" | "fallback", kpiValues: Record<string, number>): Row[] {
  const targetKpi = kpiValues[targetCode];
  if (!Number.isFinite(targetKpi)) throw new Error(`KPI-grunnlaget mangler sluttverdi for ${targetCode}`);
  return referenceCodes.map((referenceCode) => {
    const referenceKpi = kpiValues[referenceCode];
    if (!Number.isFinite(referenceKpi)) throw new Error(`KPI-grunnlaget mangler referanseverdi for ${referenceCode}`);
    const referencePath = Math.round(((targetKpi / referenceKpi - 1) * 100) * 10) / 10;
    return kpiRowFromReferencePath(referenceCode, targetCode, referencePath, source, kpiValues);
  });
}

function kpiFallbackError(targetYear: number) {
  return new Error(`Klarte ikke hente KPI fra SSB. Lokalt fallbackgrunnlag finnes bare til og med mai 2026, men valgt målår er ${targetYear}.`);
}

export async function buildKpiRows(_referanselonn: Row[], targetYear = new Date().getFullYear()): Promise<Row[]> {
  const targetMonth = TARGET_MONTH;
  const targetCode = periodCode(targetYear, targetMonth);
  const referenceCodes = monthlyPeriodCodes(REFERENCE_START_YEAR, REFERENCE_START_MONTH, targetYear, targetMonth);

  let data: SsbJsonStat;
  try {
    data = await fetchJson<SsbJsonStat>(kpiDataUrl(referenceCodes));
  } catch (err) {
    if (targetYear !== 2026 || targetMonth !== 5) throw kpiFallbackError(targetYear);
    return kpiRowsFromValues(referenceCodes, targetCode, "fallback", fallbackKpiValuesFromCsv());
  }

  const kpiValues = Object.fromEntries(
    Object.entries(data.dimension.Tid.category.index).map(([code, position]) => [code, Number(data.value[position])]),
  );
  try {
    return kpiRowsFromValues(referenceCodes, targetCode, "ssb", kpiValues);
  } catch (err) {
    if (targetYear !== 2026 || targetMonth !== 5) throw err;
    return kpiRowsFromValues(referenceCodes, targetCode, "fallback", fallbackKpiValuesFromCsv());
  }
}

export async function withFreshKpiDataset(bundle: StoredBundle, targetYear = new Date().getFullYear()): Promise<StoredBundle> {
  const kpi = await buildKpiRows(bundle.tables.referanselonn ?? [], targetYear);
  const usedFallback = kpi.some((row) => row["_kpi_kilde"] === "fallback");
  return {
    ...bundle,
    createdAt: new Date().toISOString(),
    sources: {
      ...bundle.sources,
      kpi: { name: usedFallback ? `Lokalt fallbackgrunnlag for KPI (${targetYear})` : `SSB tabell 14700 (${targetYear})`, role: "KPI", size: kpi.length },
    },
    tables: {
      ...bundle.tables,
      kpi,
    },
  };
}

export function kpiDatasetNeedsRefresh(bundle: StoredBundle, now = new Date()): boolean {
  const rows = bundle.tables.kpi ?? [];
  if (rows.length === 0) return (bundle.tables.referanselonn ?? []).length > 0;
  const targetYear = now.getFullYear();
  const expectedCodes = monthlyPeriodCodes(REFERENCE_START_YEAR, REFERENCE_START_MONTH, targetYear, TARGET_MONTH);
  const existingCodes = new Set(rows.map((row) => String(row["Referansemåned"] ?? "")));
  return rows.some((row) => toInt(row["Målår"]) !== targetYear) || expectedCodes.some((code) => !existingCodes.has(code));
}
