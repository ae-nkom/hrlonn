import { ageGroup, asText, excelDateYear, mean, seniorityGroup, toInt, toNumber, uniqueSorted } from "./format";
import type { ReportDefinition } from "./types";
import type { AppModel, Filters, Row, StoredBundle } from "./types";

function key(value: unknown): string {
  return asText(value).replace(/\s+/g, " ");
}

export const noFilterSelection = "__NO_FILTER_SELECTION__";

function byInitial(rows: Row[]): Map<string, Row> {
  const entries: Array<[string, Row]> = [];
  for (const row of rows) {
    const initial = key(row["Initialer"]);
    if (initial) entries.push([initial, row]);
  }
  return new Map(entries);
}

function normalizedKey(value: unknown): string {
  return key(value)
    .toLocaleLowerCase("nb-NO")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildSectionLookup(avdelingsdata: Row[]): Map<string, { Avdeling: string; Avdelingskode: string }> {
  const columns = Array.from({ length: 12 }, (_, index) => `Kolonne ${index + 1}`);
  const rows = avdelingsdata.map((row) => columns.map((column) => row[column]));
  const result = new Map<string, { Avdeling: string; Avdelingskode: string }>();
  const pairs: Array<[number, number]> = [
    [0, 1],
    [2, 3],
    [4, 5],
    [6, 7],
    [8, 9],
    [10, 11],
  ];
  for (const [nameIndex, codeIndex] of pairs) {
    const avdeling = key(rows[2]?.[nameIndex]);
    const avdelingskode = key(rows[2]?.[codeIndex]);
    if (avdeling) result.set(avdeling, { Avdeling: avdeling, Avdelingskode: avdelingskode });
    for (const row of rows.slice(3)) {
      const seksjon = key(row[nameIndex]);
      if (seksjon && !result.has(seksjon)) {
        result.set(seksjon, { Avdeling: avdeling, Avdelingskode: avdelingskode });
      }
    }
  }
  const direktor = result.get("Direktør") ?? result.get("Direktør og enheter");
  if (direktor) result.set("DD - Direktør", direktor);
  return result;
}

function salaryValue(sapRow: Row): number | null {
  const individual = toInt(sapRow["arslonn"]) ?? toInt(sapRow["107A - Individuell lønn årsbe"]) ?? toInt(sapRow["Individuell årslønn"]);
  if (individual !== null && individual > 0) return individual;
  return toInt(sapRow["1006-Årslønn lederlønnstab."]) ?? individual;
}

function referenceMonthNumber(year: unknown, month: unknown): number | null {
  const text = key(month);
  const period = text.match(/^\d{4}M(\d{2})$/);
  if (period) return Number(period[1]);
  if (month instanceof Date && toInt(year) === month.getFullYear()) return month.getMonth() + 1;
  return toInt(month);
}

function referenceMonthCode(year: unknown, month: unknown): string | null {
  const parsed = toInt(year);
  if (parsed === null) return null;
  const parsedMonth = referenceMonthNumber(year, month) ?? 5;
  if (parsedMonth < 1 || parsedMonth > 12) return null;
  return `${parsed}M${String(parsedMonth).padStart(2, "0")}`;
}

function referencePath(year: unknown, month: unknown, kpiByReferenceMonth: Map<string, number>): number | null {
  const referenceCode = referenceMonthCode(year, month);
  if (!referenceCode) return null;
  return kpiByReferenceMonth.get(referenceCode) ?? null;
}

export function buildModel(bundle: StoredBundle): AppModel {
  const sap = bundle.tables.sap_raw ?? [];
  const referanselonn = bundle.tables.referanselonn ?? [];
  const org = bundle.tables.org_tilordning ?? [];
  const medarbeidere = bundle.tables.medarbeiderdata ?? [];
  const kpiRows = bundle.tables.kpi ?? [];
  const kpiByReferenceMonth = new Map(
    kpiRows
      .map((row): [string, number | null] => [key(row["Referansemåned"]), toNumber(row["Referansebane"])])
      .filter((entry): entry is [string, number] => Boolean(entry[0]) && entry[1] !== null),
  );
  const sectionLookup = buildSectionLookup(bundle.tables.avdelingsdata_raw ?? []);
  const orgByInitial = byInitial(org);
  const medarbeiderByInitial = byInitial(medarbeidere);
  const refByInitial = byInitial(
    referanselonn.map((row) => ({
      Initialer: row["init"] ?? row["Initialer"],
      "Referanseår": toInt(row["ref_ar"]),
      "ReferansemånedNr": referenceMonthNumber(row["ref_ar"], row["ref_mnd"] ?? row["ReferansemånedNr"] ?? row["Referansemåned"]),
      "Referanselønn": toInt(row["ref_lonn"]),
      Navn: row["navn"],
    })),
  );

  const analysis = sap.map((sapRow) => {
    const initialer = key(sapRow["Initialer"]);
    const orgRow = orgByInitial.get(initialer) ?? {};
    const medarbeiderRow = medarbeiderByInitial.get(initialer) ?? {};
    const section = key(orgRow["Seksjon"]);
    const sectionInfo = sectionLookup.get(section) ?? { Avdeling: key(orgRow["Avdeling"]), Avdelingskode: "" };
    const refRow = refByInitial.get(initialer) ?? {};
    const lonn = salaryValue(sapRow);
    const refLonn = toInt(refRow["Referanselønn"]);
    const lonnKroner = lonn !== null && refLonn !== null ? lonn - refLonn : null;
    const referansebane = referencePath(refRow["Referanseår"], refRow["ReferansemånedNr"], kpiByReferenceMonth);
    const kpiJustertRef = refLonn !== null && referansebane !== null ? refLonn * (1 + referansebane / 100) : null;
    const avvikKroner = lonn !== null && kpiJustertRef !== null ? Math.round(lonn - kpiJustertRef) : null;
    const avvikProsent = lonn !== null && kpiJustertRef ? Math.round(((lonn - kpiJustertRef) / kpiJustertRef) * 1000) / 10 : null;
    const startdato = sapRow["startdato"] ?? sapRow["VB - 0041"];
    const alder = sapRow["alder"] ?? sapRow["Medarbeiderens alder"];
    const stilling = key(sapRow["stilling"]);
    return {
      ...medarbeiderRow,
      ...orgRow,
      ...sapRow,
      Initialer: initialer,
      alder: toInt(alder),
      "Ansettelsesår": excelDateYear(startdato),
      arslonn: lonn,
      Seksjon: section,
      Avdeling: sectionInfo.Avdeling || "Ukjent",
      Avdelingskode: sectionInfo.Avdelingskode,
      Tariff: medarbeiderRow["Tariff"] ?? orgRow["Tariff"] ?? "",
      Fagforening: medarbeiderRow["Fagforening"] ?? orgRow["Fagforening"] ?? "",
      Hjemmel: medarbeiderRow["Hjemmel"] ?? "",
      "Inngår i lønnsoppgjør": medarbeiderRow["Inngår i lønnsoppgjør"] ?? "",
      "Referanseår": refRow["Referanseår"] ?? null,
      "Referansemåned": referenceMonthCode(refRow["Referanseår"], refRow["ReferansemånedNr"]),
      "Referanselønn": refLonn,
      "Lønnsutvikling kroner": lonnKroner,
      "Lønnsutvikling prosent": lonnKroner !== null && refLonn ? Math.round((lonnKroner / refLonn) * 1000) / 10 : null,
      Referansebane: referansebane,
      "Avvik prosent": avvikProsent,
      "Avvik kroner": avvikKroner,
      Aldersgruppe: ageGroup(alder),
      Ansiennitetsgruppe: seniorityGroup(excelDateYear(startdato)),
      Stillingskode: stilling.split(/\s+/)[0] ?? "",
      Stillingsgruppebetegnelse: stilling,
    };
  });

  return {
    main: analysis,
    analysis,
    kpi: kpiRows,
  };
}

function salaryRows(rows: Row[]): Row[] {
  return rows.filter((row) => {
    const salary = toInt(row["arslonn"]);
    return salary !== null && salary > 0;
  });
}

function sortByLag(rows: Row[]): Row[] {
  return [...rows].sort(
    (a, b) =>
      (Number(a["Avvik prosent"] ?? 999) -
        Number(b["Avvik prosent"] ?? 999)) ||
      key(a["Etternavn"]).localeCompare(key(b["Etternavn"]), "nb"),
  );
}

function reportRows(rows: Row[]): Row[] {
  return sortByLag(rows)
    .map((row) => ({
      Avdeling: row["Avdeling"],
      Seksjon: row["Seksjon"],
      Stilling: row["Stillingsgruppebetegnelse"],
      Fornavn: row["Fornavn"],
      Etternavn: row["Etternavn"],
      Fagforening: row["Fagforening"],
      Tariff: row["Tariff"],
      Alder: row["alder"],
      "Ansattår": row["Ansettelsesår"],
      "Årslønn": row["arslonn"],
      "Referanselønn": row["Referanselønn"],
      "Lønnsutvikling kroner": row["Lønnsutvikling kroner"],
      "Lønnsutvikling prosent": row["Lønnsutvikling prosent"],
      Referansebane: row["Referansebane"],
      "Avvik prosent": row["Avvik prosent"],
      "Avvik kroner": row["Avvik kroner"],
    }));
}

function report(id: string, title: string, rows: Row[]): ReportDefinition {
  return { id, title, rows: reportRows(rows) };
}

export function presentationReportRows(rows: Row[]): Row[] {
  return reportRows(salaryRows(rows));
}

export function presentationReports(rows: Row[]): ReportDefinition[] {
  const base = salaryRows(rows);
  const reports: ReportDefinition[] = [];
  for (const union of uniqueSorted(base.map((row) => row["Fagforening"]))) {
    reports.push(report(`union-${normalizedKey(union)}`, `${union} - synkende etter avvik referansebane`, base.filter((row) => key(row["Fagforening"]) === union)));
  }
  for (const section of uniqueSorted(base.map((row) => row["Seksjon"]))) {
    reports.push(report(`section-${normalizedKey(section)}`, `${section} - synkende etter avvik referansebane`, base.filter((row) => key(row["Seksjon"]) === section)));
  }
  for (const avdeling of uniqueSorted(base.map((row) => row["Avdeling"]))) {
    for (const tariff of uniqueSorted(base.filter((row) => key(row["Avdeling"]) === avdeling).map((row) => row["Tariff"]))) {
      reports.push(
        report(
          `department-${normalizedKey(avdeling)}-${normalizedKey(tariff)}`,
          `${avdeling} - ${tariff} - synkende etter avvik referansebane`,
          base.filter((row) => key(row["Avdeling"]) === avdeling && key(row["Tariff"]) === tariff),
        ),
      );
    }
  }
  const roleFilters = [
    ["underdirektor", "Underdirektører", "1059"],
    ["seksjonssjef", "Seksjonssjefer", "1211"],
    ["fagdirektor", "Fagdirektører", "1538"],
  ];
  for (const [id, title, code] of roleFilters) {
    reports.push(report(id, `${title} - synkende etter avvik referansebane`, base.filter((row) => key(row["Stillingskode"]) === code)));
  }
  return reports.filter((item) => item.rows.length > 0);
}

export function salarySummary(rows: Row[], groupColumn: string): Row[] {
  const base = salaryRows(rows);
  const groups = new Map<string, Row[]>();
  for (const row of base) {
    const group = key(row[groupColumn]) || "Ukjent";
    groups.set(group, [...(groups.get(group) ?? []), row]);
  }
  const summaryRows = Array.from(groups.entries())
    .map(([group, groupRows]) => {
      const lagPct = mean(groupRows.map((row) => row["Avvik prosent"]));
      const lagKr = mean(groupRows.map((row) => row["Avvik kroner"]));
      return {
        Gruppe: group,
        Antall: groupRows.length,
        "Gjennomsnittslønn": Math.round(mean(groupRows.map((row) => row["arslonn"])) ?? 0),
        "Avvik prosent": lagPct === null ? null : Math.round(lagPct * 10) / 10,
        "Avvik kroner": lagKr === null ? null : Math.round(lagKr),
        "Grunnlag for å prioritere lokalt": lagPct !== null && lagPct < 0 ? "ja" : "nei",
      };
    })
    .sort((a, b) => Number(a["Avvik prosent"] ?? 999) - Number(b["Avvik prosent"] ?? 999));
  const lagPct = mean(base.map((row) => row["Avvik prosent"]));
  const lagKr = mean(base.map((row) => row["Avvik kroner"]));
  const totalRow = {
    __rowType: "total",
    Gruppe: "Total",
    Antall: base.length,
    "Gjennomsnittslønn": Math.round(mean(base.map((row) => row["arslonn"])) ?? 0),
    "Avvik prosent": lagPct === null ? null : Math.round(lagPct * 10) / 10,
    "Avvik kroner": lagKr === null ? null : Math.round(lagKr),
    "Grunnlag for å prioritere lokalt": lagPct !== null && lagPct < 0 ? "ja" : "nei",
  };
  return base.length > 0 ? [...summaryRows, totalRow] : summaryRows;
}

export function filterRows(rows: Row[], filters: Filters): Row[] {
  return rows.filter((row) =>
    (Object.entries(filters) as Array<[keyof Filters, string[]]>).every(([column, values]) => {
      if (values.includes(noFilterSelection)) return false;
      if (values.length === 0) return true;
      return values.includes(key(row[column]));
    }),
  );
}

export function filterAnnualSettlementRows(rows: Row[]): Row[] {
  return rows.filter((row) => key(row["Inngår i lønnsoppgjør"]).toLocaleLowerCase("nb-NO") === "ja" && key(row["Hjemmel"]) === "2.5.1");
}

export function filterOptions(rows: Row[]): Filters {
  return {
    Avdeling: uniqueSorted(rows.map((row) => row["Avdeling"])),
    Seksjon: uniqueSorted(rows.map((row) => row["Seksjon"])),
    Tariff: uniqueSorted(rows.map((row) => row["Tariff"])),
    Fagforening: uniqueSorted(rows.map((row) => row["Fagforening"])),
    stilling: uniqueSorted(rows.map((row) => row["stilling"])),
  };
}
