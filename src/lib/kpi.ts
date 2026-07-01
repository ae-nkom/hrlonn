import { toInt } from "./format";
import type { Row, StoredBundle } from "./types";

const SSB_KPI_TABLE_URL = "https://data.ssb.no/api/v0/no/table/14700";
const TARGET_MONTH = 5;

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
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`Klarte ikke hente KPI fra SSB (${response.status})`);
  return response.json() as Promise<T>;
}

type SsbMetadata = {
  variables: Array<{ code: string; values: string[] }>;
};

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

export async function buildKpiRows(referanselonn: Row[], targetYear = new Date().getFullYear()): Promise<Row[]> {
  const refYears = uniqueReferenceYears(referanselonn);
  if (refYears.length === 0) return [];

  const metadata = await fetchJson<SsbMetadata>(SSB_KPI_TABLE_URL);
  const tidValues = metadata.variables.find((variable) => variable.code === "Tid")?.values ?? [];
  const availableTargetMonths = tidValues
    .filter((value) => value.startsWith(`${targetYear}M`))
    .map((value) => Number(value.replace(`${targetYear}M`, "")))
    .filter((month) => Number.isInteger(month) && month <= TARGET_MONTH)
    .sort((a, b) => a - b);
  if (availableTargetMonths.length === 0) {
    throw new Error(`SSB-tabell 14700 mangler KPI-måneder for ${targetYear}`);
  }

  const targetMonth = availableTargetMonths.includes(TARGET_MONTH)
    ? TARGET_MONTH
    : availableTargetMonths[availableTargetMonths.length - 1];
  const targetCode = `${targetYear}M${String(targetMonth).padStart(2, "0")}`;
  const januaryCode = `${targetYear}M01`;
  const requestedCodes = Array.from(
    new Set([
      ...refYears.map((year) => (year === targetYear ? januaryCode : `${year}M${String(targetMonth).padStart(2, "0")}`)),
      januaryCode,
      targetCode,
    ]),
  );

  const query = {
    query: [
      { code: "VareTjenesteGrp", selection: { filter: "item", values: ["00"] } },
      { code: "ContentsCode", selection: { filter: "item", values: ["KpiIndMnd"] } },
      { code: "Tid", selection: { filter: "item", values: requestedCodes } },
    ],
    response: { format: "JSON-stat2" },
  };
  const data = await fetchJson<SsbJsonStat>(SSB_KPI_TABLE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(query),
  });
  const kpiValues = Object.fromEntries(
    Object.entries(data.dimension.Tid.category.index).map(([code, position]) => [code, Number(data.value[position])]),
  );
  const targetKpi = kpiValues[targetCode];
  const januaryKpi = kpiValues[januaryCode];
  if (!Number.isFinite(targetKpi) || !Number.isFinite(januaryKpi)) {
    throw new Error("SSB-responsen mangler forventede KPI-verdier");
  }

  return refYears.map((year) => {
    const referenceCode = year === targetYear ? januaryCode : `${year}M${String(targetMonth).padStart(2, "0")}`;
    const referenceKpi = year === targetYear ? januaryKpi : kpiValues[referenceCode];
    if (!Number.isFinite(referenceKpi)) {
      throw new Error(`SSB-responsen mangler KPI-verdi for ${referenceCode}`);
    }
    const referencePath = Math.round(((targetKpi / referenceKpi - 1) * 100) * 10) / 10;
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
      Målår: targetYear,
      Målmåned: targetMonth,
    };
  });
}

export async function withFreshKpiDataset(bundle: StoredBundle, targetYear = new Date().getFullYear()): Promise<StoredBundle> {
  const kpi = await buildKpiRows(bundle.tables.referanselonn ?? [], targetYear);
  return {
    ...bundle,
    createdAt: new Date().toISOString(),
    sources: {
      ...bundle.sources,
      kpi: { name: `SSB tabell 14700 (${targetYear})`, role: "KPI", size: kpi.length },
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
