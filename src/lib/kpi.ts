import { toInt } from "./format";
import type { Row, StoredBundle } from "./types";

const SSB_KPI_DATA_URL = "https://data.ssb.no/api/pxwebapi/v2/tables/14700/data";
const TARGET_MONTH = 5;
const KPI_FETCH_TIMEOUT_MS = 20_000;
const fallbackKpiReferencePaths2026 = new Map<number, number>([
  [2021, 23.5],
  [2022, 16.6],
  [2023, 9.5],
  [2024, 6.3],
  [2025, 3.1],
  [2026, 1.4],
]);

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

function uniqueReferenceYears(referanselonn: Row[]): number[] {
  return Array.from(
    new Set(
      referanselonn
        .map((row) => toInt(row["ref_ar"] ?? row["Referanseår"]))
        .filter((year): year is number => year !== null),
    ),
  ).sort((a, b) => a - b);
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

function kpiRowFromReferencePath(year: number, targetYear: number, targetMonth: number, referencePath: number, source: "ssb" | "fallback", kpiValues?: Record<string, number>): Row {
  const targetCode = `${targetYear}M${String(targetMonth).padStart(2, "0")}`;
  const januaryCode = `${targetYear}M01`;
  const referenceCode = year === targetYear ? januaryCode : `${year}M${String(targetMonth).padStart(2, "0")}`;
  const referenceKpi = source === "ssb" ? kpiValues?.[referenceCode] : null;
  const targetKpi = source === "ssb" ? kpiValues?.[targetCode] : null;

  return {
    Periode: year === targetYear
      ? `KPI januar-${monthNames[targetMonth]} ${targetYear}`
      : `KPI ${monthNames[targetMonth]} ${year}-${targetYear}`,
    Referansebane: referencePath,
    Referanseår: year,
    Referansemåned: referenceCode,
    Sluttmåned: targetCode,
    "_kpi_referanse": referenceKpi,
    "_kpi_slutt": targetKpi,
    "_kpi_kilde": source,
    Målår: targetYear,
    Målmåned: targetMonth,
  };
}

function fallbackKpiRows(refYears: number[], targetYear: number, targetMonth: number): Row[] | null {
  if (targetYear !== 2026 || targetMonth !== 5) return null;
  const coveredYears = refYears.filter((year) => fallbackKpiReferencePaths2026.has(year));
  if (coveredYears.length === 0) return null;
  return coveredYears.map((year) => kpiRowFromReferencePath(year, targetYear, targetMonth, fallbackKpiReferencePaths2026.get(year) ?? 0, "fallback"));
}

function kpiFallbackError(targetYear: number) {
  return new Error(`Klarte ikke hente KPI fra SSB. Lokalt fallbackgrunnlag finnes bare for målår 2026, men valgt målår er ${targetYear}.`);
}

export async function buildKpiRows(referanselonn: Row[], targetYear = new Date().getFullYear()): Promise<Row[]> {
  const refYears = uniqueReferenceYears(referanselonn);
  if (refYears.length === 0) return [];

  const targetMonth = TARGET_MONTH;
  const targetCode = `${targetYear}M${String(targetMonth).padStart(2, "0")}`;
  const januaryCode = `${targetYear}M01`;
  const requestedCodes = Array.from(
    new Set([
      ...refYears.map((year) => (year === targetYear ? januaryCode : `${year}M${String(targetMonth).padStart(2, "0")}`)),
      januaryCode,
      targetCode,
    ]),
  );

  let data: SsbJsonStat;
  try {
    data = await fetchJson<SsbJsonStat>(kpiDataUrl(requestedCodes));
  } catch (err) {
    const fallbackRows = fallbackKpiRows(refYears, targetYear, targetMonth);
    if (fallbackRows) return fallbackRows;
    if (targetYear !== 2026) throw kpiFallbackError(targetYear);
    throw err;
  }

  const kpiValues = Object.fromEntries(
    Object.entries(data.dimension.Tid.category.index).map(([code, position]) => [code, Number(data.value[position])]),
  );
  const targetKpi = kpiValues[targetCode];
  const januaryKpi = kpiValues[januaryCode];
  if (!Number.isFinite(targetKpi) || !Number.isFinite(januaryKpi)) {
    const fallbackRows = fallbackKpiRows(refYears, targetYear, targetMonth);
    if (fallbackRows) return fallbackRows;
    if (targetYear !== 2026) throw kpiFallbackError(targetYear);
    throw new Error("SSB-responsen mangler forventede KPI-verdier");
  }

  const missingReferenceCode = refYears
    .map((year) => (year === targetYear ? januaryCode : `${year}M${String(targetMonth).padStart(2, "0")}`))
    .find((referenceCode) => !Number.isFinite(kpiValues[referenceCode]));
  if (missingReferenceCode) {
    const fallbackRows = fallbackKpiRows(refYears, targetYear, targetMonth);
    if (fallbackRows) return fallbackRows;
    if (targetYear !== 2026) throw kpiFallbackError(targetYear);
    throw new Error(`SSB-responsen mangler KPI-verdi for ${missingReferenceCode}`);
  }

  return refYears.map((year) => {
    const referenceCode = year === targetYear ? januaryCode : `${year}M${String(targetMonth).padStart(2, "0")}`;
    const referenceKpi = year === targetYear ? januaryKpi : kpiValues[referenceCode];
    const referencePath = Math.round(((targetKpi / referenceKpi - 1) * 100) * 10) / 10;
    return kpiRowFromReferencePath(year, targetYear, targetMonth, referencePath, "ssb", kpiValues);
  });
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
  return rows.some((row) => toInt(row["Målår"]) !== targetYear);
}
