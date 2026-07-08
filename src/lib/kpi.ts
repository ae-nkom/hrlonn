import { toInt } from "./format";
import type { Row, StoredBundle } from "./types";

const SSB_KPI_DATA_URL = "https://data.ssb.no/api/pxwebapi/v2/tables/14700/data";
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

  const data = await fetchJson<SsbJsonStat>(kpiDataUrl(requestedCodes));
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
