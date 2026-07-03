import React from "react";
import ReactDOM from "react-dom/client";
import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { BarChart, ColumnChart, DistributionChart, ExternalComparisonToggleChart, ExternalSalaryDevelopmentChart, GroupedBarChart, MatrixTable, YearGenderTrendChart } from "./components/Charts";
import { DataTable } from "./components/DataTable";
import { DepartmentMatrix } from "./components/DepartmentMatrix";
import { MetricGrid } from "./components/MetricGrid";
import { Sidebar, type Page } from "./components/Sidebar";
import { UploadPanel } from "./components/UploadPanel";
import { formatInt, formatPercent, mean } from "./lib/format";
import { withFreshKpiDataset } from "./lib/kpi";
import { buildModel, filterAnnualSettlementRows, filterOptions, filterRows, noFilterSelection, presentationReportRows, salarySummary } from "./lib/model";
import { updateStoredBundleFromUploads } from "./lib/parse";
import { clearStoredBundle, loadStoredBundle, saveStoredBundle } from "./lib/storage";
import type { Filters, Row, StoredBundle, UploadFilePatch } from "./lib/types";
import type { ExportMetadata } from "./lib/xlsxExport";
import "./styles.css";

const emptyFilters: Filters = { Avdeling: [], Seksjon: [], Tariff: [], Fagforening: [], stilling: [] };
const filterColumns: Array<keyof Filters> = ["Avdeling", "Seksjon", "Tariff", "Fagforening"];
const presentationFilterColumns: Array<keyof Filters> = [...filterColumns, "stilling"];
const filterColumnLabels: Record<keyof Filters, string> = {
  Avdeling: "Avdeling",
  Seksjon: "Seksjon",
  Tariff: "Tariff",
  Fagforening: "Fagforening",
  stilling: "Stilling",
};
type PresentationView = "tables" | "salary" | "development" | "external";
const pageStorageKey = "hr-lonn:selected-page";
const presentationViewStorageKey = "hr-lonn:presentation-view";
const validPages: Page[] = ["datagrunnlag", "oversikt", "kildedata", "lonn", "lonnsniva", "presentasjon"];
const validPresentationViews: PresentationView[] = ["tables", "salary", "development", "external"];

function storedValue<T extends string>(key: string, validValues: T[], fallback: T): T {
  const value = window.localStorage.getItem(key);
  return value && validValues.includes(value as T) ? (value as T) : fallback;
}

const developmentColumnWidths = {
  Gruppe: 170,
  Antall: 90,
  Gjennomsnittslønn: 170,
  "Avvik prosent": 340,
  "Avvik kroner": 340,
  "Grunnlag for å prioritere lokalt": 230,
};
const salaryLevelSummaryColumnLabels = {
  "Avvik prosent": "Avvik fra ref. bane",
};
const salaryLevelSummaryHiddenColumns = ["Grunnlag for å prioritere lokalt"];
const developmentSummaryColumnLabels = {
  "Avvik prosent": "Avvik fra ref. bane (%)",
  "Avvik kroner": "Avvik fra ref. bane (kr)",
};
const developmentSummaryHiddenColumns = ["Grunnlag for å prioritere lokalt"];
function deviationRowClassName(row: Row) {
  const deviation = Number(row["Avvik prosent"] ?? 0);
  if (deviation < 0) return "negative-deviation";
  if (deviation > 0) return "positive-deviation";
  return "";
}

function filterExportMetadata(filters: Filters): ExportMetadata[] {
  return presentationFilterColumns.flatMap((column) => {
    const values = filters[column].filter(Boolean);
    if (values.length === 0) return [];
    const value = values.includes(noFilterSelection) ? "Ingen verdi" : values.join(", ");
    return [{ label: `Filter ${filterColumnLabels[column]}`, value }];
  });
}
const hiddenAppColumns = [
  "Ref. År",
  "Ref. Lønn",
  "Stillingsbrøk15",
  "Årsverk-telle-med",
  "Årsverk",
  "Fødselsnr.",
  "Føds.dato",
  "Gateadresse",
  "Postnummer",
  "Sted",
  "Try.kont.navn",
  "Arbeidsplanregel",
  "Deltids-% 0007",
  "LT",
  "Medarbeidergruppe",
  "Ansettelsesstatus",
  "1000-Årslønn 100%",
  "Val.",
  "1001-Bruttolønn",
  "Val.2",
  "Tr.kont.",
  "Still.grp.",
  "1071 - Tilleggslønn årsbeløp",
  "Val.3",
  "1072 - Tilleggslønn mnd",
  "Val.4",
  "Val.5",
  "107B - Individuell lønn måned",
  "Val.6",
  "Ansattnr - navn",
  "1006-Årslønn lederlønnstab.",
  "Val.7",
  "Hjemmel",
  "Inngår i lønnsoppgjør",
  "Ansettelsesår",
  "Stillingskode",
  "koststed",
  "Stillingsgruppebetegnelse",
];
const overviewColumnOrder = [
  "Avdeling",
  "Seksjon",
  "Etternavn",
  "Fornavn",
  "Initialer",
  "kjonn",
  "alder",
  "startdato",
  "stilling",
  "Utdanning",
  "Fagforening",
  "Tariff",
  "arslonn",
  "Referanseår",
  "Referanselønn",
  "Lønnsutvikling kroner",
  "Lønnsutvikling prosent",
  "Referansebane",
  "Avvik prosent",
  "Avvik kroner",
];
const overviewHiddenColumns = [...hiddenAppColumns, "Ansiennitetsgruppe", "SeksjonGammel", "koststed_nr", "Avdelingskode", "Aldersgruppe"];
const overviewColumnLabels = {
  kjonn: "Kjønn",
  alder: "Alder",
  startdato: "Startdato",
  arslonn: "Årslønn",
  stilling: "Stilling",
};
const overviewInitialSorting = [
  { id: "Avdeling", desc: false },
  { id: "Seksjon", desc: false },
];
const developmentTableColumnOrder = [
  "Avdeling",
  "Seksjon",
  "Etternavn",
  "Fornavn",
  "Fagforening",
  "alder",
  "startdato",
  "Referanseår",
  "Referanselønn",
  "arslonn",
  "Lønnsutvikling prosent",
  "Referansebane",
  "Avvik prosent",
  "Avvik kroner",
];
const genderChartOrder = ["Mann", "Kvinne"];
const seniorityChartOrder = ["0-2 år", "3-5 år", "6-10 år", "11-15 år", "16-20 år", "21 år eller mer"];
const ageChartOrder = ["Under 30", "30-39", "40-49", "50-59", "60+"];
const nkomAkadUnioExternalSalary = 820_972;
const nkomLoStatExternalSalary = 720_569;

function externalComparison(_rows: Row[]): Row[] {
  const referenceRows: Record<string, Array<[string, number]>> = {
    "Akademikerne/Unio": [
      ["Havindustritilsynet", 1_145_964],
      ["Finanstilsynet", 947_698],
      ["Statens jernbanetilsyn", 933_502],
      ["Statens helsetilsyn", 922_407],
      ["Helsedirektoratet", 900_273],
      ["Riksrevisjonen", 893_473],
      ["Konkurransetilsynet", 892_949],
      ["Jernbanedirektoratet", 886_110],
      ["Nasjonal sikkerhetsmyndighet", 885_543],
      ["Forsvarets forskningsinstitutt", 879_611],
      ["Luftfartstilsynet", 877_272],
      ["Norges vassdrags- og energidirektorat (NVE)", 873_254],
      ["Datatilsynet", 868_723],
      ["Nkom", nkomAkadUnioExternalSalary],
      ["Direktoratet for strålevern og atomsikkerhet", 858_078],
      ["Folkehelseinstituttet", 856_274],
      ["Direktoratet for samfunnssikkerhet og beredskap (DSB)", 848_289],
      ["Digitaliseringsdirektoratet", 843_897],
      ["Vegdirektoratet", 816_701],
      ["Skattedirektoratet", 815_370],
      ["Sjøfartsdirektoratet", 801_152],
      ["Medietilsynet", 792_569],
      ["Miljødirektoratet", 787_430],
      ["Utdanningsdirektoratet", 786_647],
      ["Direktoratet for arbeidstilsynet", 783_160],
      ["Lotteri- og stiftelsestilsynet", 778_657],
      ["Statistisk sentralbyrå", 765_699],
      ["Politidirektoratet", 761_742],
      ["Statsforvalteren i Agder", 731_219],
      ["Forbrukertilsynet", 695_195],
    ],
    "LO Stat": [
      ["Luftfartstilsynet", 898_618],
      ["Havindustritilsynet", 884_960],
      ["Nasjonal sikkerhetsmyndighet", 834_829],
      ["Finanstilsynet", 814_321],
      ["Datatilsynet", 811_849],
      ["Riksrevisjonen", 780_309],
      ["Helsedirektoratet", 775_978],
      ["Norges vassdrags- og energidirektorat (NVE)", 761_337],
      ["Medietilsynet", 751_606],
      ["Statens jernbanetilsyn", 747_731],
      ["Konkurransetilsynet", 742_659],
      ["Digitaliseringsdirektoratet", 741_995],
      ["Folkehelseinstituttet", 739_466],
      ["Miljødirektoratet", 736_961],
      ["Nkom", nkomLoStatExternalSalary],
      ["Utdanningsdirektoratet", 715_604],
      ["Statistisk sentralbyrå", 713_204],
      ["Forsvarets forskningsinstitutt", 703_981],
      ["Vegdirektoratet", 700_883],
      ["Direktoratet for samfunnssikkerhet og beredskap (DSB)", 697_516],
      ["Direktoratet for arbeidstilsynet", 690_607],
      ["Statens helsetilsyn", 682_720],
      ["Skattedirektoratet", 680_321],
      ["Statsforvalteren i Agder", 678_868],
      ["Jernbanedirektoratet", 671_936],
      ["Sjøfartsdirektoratet", 663_957],
      ["Politidirektoratet", 650_822],
      ["Forbrukertilsynet", 637_041],
      ["Lotteri- og stiftelsestilsynet", 623_784],
    ],
  };
  return Object.entries(referenceRows).flatMap(([avtale, avtaleRows]) =>
    [...avtaleRows]
      .sort((a, b) => b[1] - a[1])
      .map(([virksomhet, gjennomsnittslonn], index) => ({
        Avtale: avtale,
        Rangering: index + 1,
        Virksomhet: virksomhet,
        Gjennomsnittslønn: gjennomsnittslonn,
      })),
  );
}

function externalDevelopment(_rows: Row[]): Row[] {
  return [
    { Avtale: "Akademikerne/Unio", Virksomhet: "Konkurransetilsynet", "Lønn 2021": 671_955, "Lønn 2026": 892_949 },
    { Avtale: "Akademikerne/Unio", Virksomhet: "Nasjonal sikkerhetsmyndighet", "Lønn 2021": 724_248, "Lønn 2026": 885_543 },
    { Avtale: "Akademikerne/Unio", Virksomhet: "Luftfartstilsynet", "Lønn 2021": 765_326, "Lønn 2026": 877_272 },
    { Avtale: "Akademikerne/Unio", Virksomhet: "Datatilsynet", "Lønn 2021": 688_604, "Lønn 2026": 868_723 },
    { Avtale: "Akademikerne/Unio", Virksomhet: "Nkom", "Lønn 2021": 713_034, "Lønn 2026": nkomAkadUnioExternalSalary },
    { Avtale: "Akademikerne/Unio", Virksomhet: "Direktoratet for samfunnssikkerhet og beredskap (DSB)", "Lønn 2021": 762_607, "Lønn 2026": 848_289 },
    { Avtale: "Akademikerne/Unio", Virksomhet: "Digitaliseringsdirektoratet", "Lønn 2021": 721_902, "Lønn 2026": 843_897 },
    { Avtale: "Akademikerne/Unio", Virksomhet: "Statsforvalteren i Agder", "Lønn 2021": 619_603, "Lønn 2026": 731_219 },
    { Avtale: "LO Stat", Virksomhet: "Luftfartstilsynet", "Lønn 2021": 750_799, "Lønn 2026": 898_618 },
    { Avtale: "LO Stat", Virksomhet: "Nasjonal sikkerhetsmyndighet", "Lønn 2021": 713_726, "Lønn 2026": 834_829 },
    { Avtale: "LO Stat", Virksomhet: "Datatilsynet", "Lønn 2021": 711_897, "Lønn 2026": 811_849 },
    { Avtale: "LO Stat", Virksomhet: "Konkurransetilsynet", "Lønn 2021": 744_144, "Lønn 2026": 742_659 },
    { Avtale: "LO Stat", Virksomhet: "Digitaliseringsdirektoratet", "Lønn 2021": 659_033, "Lønn 2026": 741_995 },
    { Avtale: "LO Stat", Virksomhet: "Nkom", "Lønn 2021": 665_868, "Lønn 2026": nkomLoStatExternalSalary },
    { Avtale: "LO Stat", Virksomhet: "Direktoratet for samfunnssikkerhet og beredskap (DSB)", "Lønn 2021": 618_093, "Lønn 2026": 697_516 },
    { Avtale: "LO Stat", Virksomhet: "Statsforvalteren i Agder", "Lønn 2021": 577_997, "Lønn 2026": 678_868 },
  ];
}

function PageTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <header className="page-title">
      <span>{eyebrow}</span>
      <h1>{title}</h1>
    </header>
  );
}

function MultiSelectDropdown({
  label,
  values,
  selected,
  onChange,
  disabled = false,
}: {
  label: string;
  values: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const visibleSelected = selected.filter((item) => values.includes(item));
  const summary = visibleSelected.length === 0 ? "Alle" : visibleSelected[0];

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (!detailsRef.current?.open || detailsRef.current.contains(event.target as Node)) return;
      detailsRef.current.open = false;
    }

    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, []);

  function selectValue(value: string) {
    if (disabled) return;
    onChange(visibleSelected[0] === value ? [] : [value]);
    if (detailsRef.current) detailsRef.current.open = false;
  }

  return (
    <details className={`filter-dropdown ${disabled ? "disabled" : ""}`} ref={detailsRef}>
      <summary aria-disabled={disabled} onClick={(event) => (disabled ? event.preventDefault() : undefined)}>
        <span>{label}</span>
        <strong>{summary}</strong>
        <ChevronDown className="dropdown-chevron" size={18} aria-hidden="true" />
      </summary>
      <div className="filter-dropdown-menu">
        {values.map((value) => (
          <button type="button" className={visibleSelected[0] === value ? "active" : ""} onClick={() => selectValue(value)} disabled={disabled} key={value}>
            {value}
          </button>
        ))}
      </div>
    </details>
  );
}

function relevantFilterOptions(rows: Row[], filters: Filters, columns: Array<keyof Filters> = filterColumns): Filters {
  return Object.fromEntries(
    columns.map((column) => {
      const otherFilters = { ...filters, [column]: [] };
      return [column, filterOptions(filterRows(rows, otherFilters))[column]];
    }),
  ) as Filters;
}

function normalizeFilters(rows: Row[], filters: Filters, columns: Array<keyof Filters> = filterColumns): Filters {
  let next = filters;
  for (let index = 0; index < columns.length; index += 1) {
    const options = relevantFilterOptions(rows, next, columns);
    const normalized = Object.fromEntries(
      columns.map((column) => {
        const selected = next[column];
        if (selected.includes(noFilterSelection)) return [column, selected];
        return [column, selected.filter((value) => options[column].includes(value))];
      }),
    ) as Filters;
    const merged = { ...next, ...normalized };
    if (columns.every((column) => merged[column].join("\u0000") === next[column].join("\u0000"))) break;
    next = merged;
  }
  return next;
}

function FilterBar({
  options,
  filters,
  setFilters,
  onReset,
  disabled = false,
  disabledMessage,
  columns = filterColumns,
}: {
  options: Filters;
  filters: Filters;
  setFilters: (filters: Filters) => void;
  onReset: () => void;
  disabled?: boolean;
  disabledMessage?: string;
  columns?: Array<keyof Filters>;
}) {
  return (
    <section className={`filter-section ${disabled ? "disabled" : ""}`} aria-label="Filter for lønnsutvikling">
      <div className="page-filter-bar">
        {columns.map((column) => (
          <MultiSelectDropdown
            key={column}
            label={filterColumnLabels[column]}
            values={options[column]}
            selected={filters[column]}
            onChange={(next) => setFilters({ ...filters, [column]: next })}
            disabled={disabled}
          />
        ))}
      </div>
      {disabled && disabledMessage ? <div className="filter-disabled-message">{disabledMessage}</div> : null}
      <button className="reset-filters" type="button" onClick={onReset} disabled={disabled}>
        Nullstill filter
      </button>
    </section>
  );
}

function fullNameLabel(row: Row): string {
  const firstName = String(row["Fornavn"] ?? "").trim();
  const lastName = String(row["Etternavn"] ?? "").trim();
  const fullName = [firstName, lastName].filter(Boolean).join(" ") || String(row["Navn"] ?? "").trim();
  const initials = String(row["Initialer"] ?? "").trim();
  if (fullName && initials) return `${fullName} (${initials})`;
  return fullName || initials || "Ukjent";
}

function App() {
  const [page, setPage] = useState<Page>(() => storedValue(pageStorageKey, validPages, "datagrunnlag"));
  const [bundle, setBundle] = useState<StoredBundle | null>(() => loadStoredBundle());
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [developmentFilters, setDevelopmentFilters] = useState<Filters>(emptyFilters);
  const [salaryLevelFilters, setSalaryLevelFilters] = useState<Filters>(emptyFilters);
  const [presentationFilters, setPresentationFilters] = useState<Filters>(emptyFilters);
  const [presentationView, setPresentationView] = useState<PresentationView>(() => storedValue(presentationViewStorageKey, validPresentationViews, "tables"));

  const model = useMemo(() => (bundle ? buildModel(bundle) : null), [bundle]);
  const allRows = useMemo(() => model?.analysis ?? [], [model]);
  const overviewRows = useMemo(() => filterAnnualSettlementRows(allRows), [allRows]);
  const defaultDevelopmentFilters = useMemo(() => emptyFilters, []);
  const developmentOptions = useMemo(() => relevantFilterOptions(overviewRows, developmentFilters), [overviewRows, developmentFilters]);
  const developmentRows = useMemo(() => filterRows(overviewRows, developmentFilters), [overviewRows, developmentFilters]);
  const developmentExportMetadata = useMemo(() => filterExportMetadata(developmentFilters), [developmentFilters]);
  const salaryLevelOptions = useMemo(() => relevantFilterOptions(overviewRows, salaryLevelFilters), [overviewRows, salaryLevelFilters]);
  const salaryLevelRows = useMemo(() => filterRows(overviewRows, salaryLevelFilters), [overviewRows, salaryLevelFilters]);
  const salaryLevelExportMetadata = useMemo(() => filterExportMetadata(salaryLevelFilters), [salaryLevelFilters]);
  const presentationOptions = useMemo(() => relevantFilterOptions(overviewRows, presentationFilters, presentationFilterColumns), [overviewRows, presentationFilters]);
  const presentationRows = useMemo(() => filterRows(overviewRows, presentationFilters), [overviewRows, presentationFilters]);
  const presentationExportMetadata = useMemo(() => filterExportMetadata(presentationFilters), [presentationFilters]);
  const developmentChartRows = useMemo(
    () =>
      developmentRows
        .filter((row) => row["Lønnsutvikling kroner"] !== null && row["Lønnsutvikling kroner"] !== undefined)
        .map((row): Row => ({ ...row, "Navn og initialer": fullNameLabel(row) }))
        .sort((a, b) => Number(b["Lønnsutvikling kroner"] ?? 0) - Number(a["Lønnsutvikling kroner"] ?? 0)),
    [developmentRows],
  );
  const developmentTableRows = useMemo(
    () =>
      developmentChartRows.map((row) =>
        Object.fromEntries(developmentTableColumnOrder.map((column) => [column, row[column]])),
      ),
    [developmentChartRows],
  );
  const comparison = useMemo(() => externalComparison(allRows), [allRows]);
  const externalDevelopmentRows = useMemo(() => externalDevelopment(allRows), [allRows]);
  const presentationTableRows = useMemo(() => presentationReportRows(presentationRows), [presentationRows]);
  const storedKpiMessage = useMemo(() => {
    const kpiRows = bundle?.tables.kpi ?? [];
    if (!bundle?.sources.kpi || kpiRows.length === 0) return null;
    const targetYear = Number(kpiRows[0]?.["Målår"]);
    const yearText = Number.isFinite(targetYear) ? ` for ${targetYear}` : "";
    return `KPI-data${yearText} er hentet fra SSB og lagret i kildedata.`;
  }, [bundle]);
  const visibleUploadMessage = uploadMessage ?? storedKpiMessage;

  useEffect(() => {
    setDevelopmentFilters(defaultDevelopmentFilters);
  }, [defaultDevelopmentFilters]);

  useEffect(() => {
    window.localStorage.setItem(pageStorageKey, page);
  }, [page]);

  useEffect(() => {
    window.localStorage.setItem(presentationViewStorageKey, presentationView);
  }, [presentationView]);

  async function handleUpload(files: UploadFilePatch) {
    setBusy(true);
    setBusyLabel("Parser filer");
    setError(null);
    setUploadMessage(null);
    try {
      const parsed = await updateStoredBundleFromUploads(bundle, files);
      saveStoredBundle(parsed);
      setBundle(parsed);
      setPage("oversikt");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      setBusyLabel(null);
    }
  }

  async function handleFetchKpi(targetYear: number) {
    if (!bundle) {
      setError("Last opp lønnsgrunnlaget før du henter KPI-data.");
      return;
    }
    setBusy(true);
    setBusyLabel("Henter KPI-data");
    setError(null);
    setUploadMessage(null);
    try {
      const next = await withFreshKpiDataset(bundle, targetYear);
      saveStoredBundle(next);
      setBundle(next);
      setUploadMessage(`KPI-data for ${targetYear} er hentet fra SSB og lagret i kildedata.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      setBusyLabel(null);
    }
  }

  function updateDevelopmentFilters(next: Filters) {
    setDevelopmentFilters(normalizeFilters(overviewRows, next));
  }

  function updateSalaryLevelFilters(next: Filters) {
    setSalaryLevelFilters(normalizeFilters(overviewRows, next));
  }

  function updatePresentationFilters(next: Filters) {
    setPresentationFilters(normalizeFilters(overviewRows, next, presentationFilterColumns));
  }

  function handleClear() {
    clearStoredBundle();
    setBundle(null);
    setDevelopmentFilters(emptyFilters);
    setSalaryLevelFilters(emptyFilters);
    setPresentationFilters(emptyFilters);
    setUploadMessage(null);
    setPage("datagrunnlag");
  }

  const status = bundle ? `Status: ${bundle.sources.sap_raw?.name ?? "Lagret datagrunnlag"}` : "Status: Ingen data lastet";

  return (
    <div className="app">
      <Sidebar page={page} setPage={setPage} status={status} />
      <main>
        {error ? <div className="error-box">{error}</div> : null}
        {page === "datagrunnlag" ? (
          <UploadPanel
            onUpload={handleUpload}
            onFetchKpi={handleFetchKpi}
            onClear={handleClear}
            sources={bundle?.sources ?? null}
            busy={busy}
            busyLabel={busyLabel}
            message={visibleUploadMessage}
          />
        ) : null}
        {!model && page !== "datagrunnlag" ? (
          <UploadPanel onUpload={handleUpload} onFetchKpi={handleFetchKpi} onClear={handleClear} sources={null} busy={busy} busyLabel={busyLabel} message={visibleUploadMessage} />
        ) : null}
        {model && page === "oversikt" ? (
          <>
            <PageTitle eyebrow="Oversikt" title="Nøkkeltall for ansatte som er inkludert i årets 2.5.1" />
            <MetricGrid
              metrics={[
                { label: "Antall ansatte", value: formatInt(overviewRows.length), tone: "blue" },
                { label: "Gjennomsnittlig årslønn", value: formatInt(mean(overviewRows.map((row) => row["arslonn"]))), tone: "orange" },
                { label: "Gjennomsnittsalder", value: formatInt(mean(overviewRows.map((row) => row["alder"]))) },
              ]}
            />
            <div className="two-col">
              <BarChart
                rows={overviewRows}
                groupColumn="Avdeling"
                valueColumn="arslonn"
                title="Gjennomsnittlig årslønn per avdeling"
                categoryLabelWidth={280}
                hideXAxisValues
                showCountInside
                exportFilename="Oversikt - årslønn per avdeling.xlsx"
              />
              <DistributionChart rows={overviewRows} exportFilename="Oversikt - lønnsnivå etter alder.xlsx" />
            </div>
            <DataTable
              rows={overviewRows}
              title="Analysegrunnlag"
              hiddenColumns={overviewHiddenColumns}
              columnOrder={overviewColumnOrder}
              columnLabels={overviewColumnLabels}
              initialSorting={overviewInitialSorting}
              exportFilename="Oversikt - analysegrunnlag.xlsx"
            />
          </>
        ) : null}
        {model && page === "kildedata" ? (
          <>
            <PageTitle eyebrow="Kildedata" title="Komplett innsyn i opplastede kilder" />
            <SourceTabs bundle={bundle!} />
          </>
        ) : null}
        {model && page === "lonn" ? (
          <>
            <PageTitle eyebrow="Lønnsutvikling" title="Utvikling fra referanselønn til dagens lønn" />
            <FilterBar options={developmentOptions} filters={developmentFilters} setFilters={updateDevelopmentFilters} onReset={() => setDevelopmentFilters(defaultDevelopmentFilters)} />
            <MetricGrid
              metrics={[
                { label: "Antall ansatte", value: formatInt(developmentRows.length), tone: "blue" },
                { label: "Snitt lønnsutvikling", value: formatPercent(mean(developmentRows.map((row) => row["Lønnsutvikling prosent"]))), tone: "green" },
                { label: "Snitt kroner", value: formatInt(mean(developmentRows.map((row) => row["Lønnsutvikling kroner"]))), tone: "blue" },
                { label: "Gjennomsnittlig avvik fra referansebane", value: formatPercent(mean(developmentRows.map((row) => row["Avvik prosent"]))), tone: "orange" },
              ]}
            />
            <BarChart
              rows={developmentChartRows}
              groupColumn="Navn og initialer"
              valueColumn="Lønnsutvikling kroner"
              title="Størst lønnsutvikling i kroner"
              categoryLabelWidth={270}
              hideXAxisValues
              startLabelFormatter={(item) => {
                if (item.value <= 30_000) return "";
                const referenceYear = item.row?.["Referanseår"];
                return referenceYear ? `Referanseår = ${referenceYear}` : "";
              }}
              valueLabelWidth={96}
              color="#2f7d55"
              aggregate={false}
              exportFilename="Lønnsutvikling - størst lønnsutvikling i kroner.xlsx"
              exportMetadata={developmentExportMetadata}
            />
            <DataTable
              rows={developmentTableRows}
              title="Lønnsutvikling per ansatt"
              columnOrder={developmentTableColumnOrder}
              columnLabels={overviewColumnLabels}
              exportFilename="Lønnsutvikling - per ansatt.xlsx"
              exportMetadata={developmentExportMetadata}
            />
          </>
        ) : null}
        {model && page === "lonnsniva" ? (
          <>
            <PageTitle eyebrow="Lønnsnivå" title="Fordelinger på kjønn, ansiennitet og stilling" />
            <FilterBar options={salaryLevelOptions} filters={salaryLevelFilters} setFilters={updateSalaryLevelFilters} onReset={() => setSalaryLevelFilters(emptyFilters)} />
            <div className="two-col">
              <ColumnChart rows={salaryLevelRows} groupColumn="kjonn" valueColumn="arslonn" title="Lønnsnivå fordelt på kjønn" color="#1f6f8b" order={genderChartOrder} includeTotal exportFilename="Lønnsnivå - kjønn.xlsx" exportMetadata={salaryLevelExportMetadata} />
              <ColumnChart rows={salaryLevelRows} groupColumn="Ansiennitetsgruppe" valueColumn="arslonn" title="Lønnsnivå fordelt på ansiennitet" color="#bd5b18" order={seniorityChartOrder} exportFilename="Lønnsnivå - ansiennitet.xlsx" exportMetadata={salaryLevelExportMetadata} />
            </div>
            <BarChart rows={salaryLevelRows} groupColumn="stilling" valueColumn="arslonn" title="Lønnsnivå fordelt på stilling" color="#2f7d55" hideXAxisValues showCountInside exportFilename="Lønnsnivå - stilling.xlsx" exportMetadata={salaryLevelExportMetadata} />
          </>
        ) : null}
        {model && page === "presentasjon" ? (
          <PresentationPage
            rows={presentationRows}
            tableRows={presentationTableRows}
            comparison={comparison}
            externalDevelopmentRows={externalDevelopmentRows}
            filterOptions={presentationOptions}
            filters={presentationFilters}
            exportMetadata={presentationExportMetadata}
            setFilters={updatePresentationFilters}
            onResetFilters={() => setPresentationFilters(emptyFilters)}
            view={presentationView}
            setView={setPresentationView}
          />
        ) : null}
      </main>
    </div>
  );
}

function PresentationPage({
  rows,
  tableRows,
  comparison,
  externalDevelopmentRows,
  filterOptions,
  filters,
  exportMetadata,
  setFilters,
  onResetFilters,
  view,
  setView,
}: {
  rows: Row[];
  tableRows: Row[];
  comparison: Row[];
  externalDevelopmentRows: Row[];
  filterOptions: Filters;
  filters: Filters;
  exportMetadata: ExportMetadata[];
  setFilters: (filters: Filters) => void;
  onResetFilters: () => void;
  view: PresentationView;
  setView: (view: PresentationView) => void;
}) {
  const filteredSalaryRows = rows.filter((row) => Number(row["arslonn"] ?? 0) > 0);
  return (
    <>
      <PageTitle eyebrow="Presentasjon" title="Figurer og tabeller fra presentasjonen" />
      <FilterBar
        options={filterOptions}
        filters={filters}
        setFilters={setFilters}
        onReset={onResetFilters}
        disabled={view === "external"}
        columns={presentationFilterColumns}
      />
      <div className="presentation-controls">
        <button className={view === "tables" ? "active" : ""} onClick={() => setView("tables")}>Etterslepstabeller</button>
        <button className={view === "salary" ? "active" : ""} onClick={() => setView("salary")}>Lønnsnivåfigurer</button>
        <button className={view === "development" ? "active" : ""} onClick={() => setView("development")}>Lønnsutvikling</button>
        <button className={view === "external" ? "active" : ""} onClick={() => setView("external")}>Ekstern sammenligning</button>
      </div>
      {view === "tables" ? (
        <DataTable
          rows={tableRows}
          title="Etterslepstabell - synkende etter avvik referansebane"
          height={680}
          rowClassName={(row) => (row["Referansebane"] === null || row["Referansebane"] === undefined || row["Referansebane"] === "" ? "missing-reference-path" : "")}
          exportFilename="Presentasjon - etterslepstabell.xlsx"
          exportMetadata={exportMetadata}
        />
      ) : null}
      {view === "salary" ? (
        <>
          <div className="two-col">
            <BarChart rows={filteredSalaryRows} groupColumn="kjonn" valueColumn="arslonn" title="Lønnsnivå fordelt på kjønn" includeTotal showCountInside exportFilename="Presentasjon - lønnsnivå kjønn.xlsx" exportMetadata={exportMetadata} />
            <BarChart
              rows={filteredSalaryRows}
              groupColumn="Avdeling"
              valueColumn="arslonn"
              title="Lønnsnivå fordelt synkende på avdelinger"
              categoryLabelWidth={330}
              valueLabelWidth={92}
              emphasizeDifferences
              showFullCategoryLabels
              showCountInside
              barMaxWidth={28}
              exportFilename="Presentasjon - lønnsnivå avdelinger.xlsx"
              exportMetadata={exportMetadata}
            />
          </div>
          <MatrixTable rows={filteredSalaryRows} rowColumn="Stillingsgruppebetegnelse" columnColumn="Avdeling" valueColumn="arslonn" title="Lønnsnivå fordelt på stillingskoder og avdelinger" exportFilename="Presentasjon - minifigurer stillingskoder og avdelinger.xlsx" exportMetadata={exportMetadata} />
          <MatrixTable rows={filteredSalaryRows} rowColumn="Stillingsgruppebetegnelse" columnColumn="kjonn" valueColumn="arslonn" title="Lønnsnivå fordelt på stillingskode og kjønn" exportFilename="Presentasjon - minifigurer stillingskode og kjønn.xlsx" exportMetadata={exportMetadata} />
          <div className="two-col">
            <GroupedBarChart
              rows={filteredSalaryRows}
              groupColumn="Ansiennitetsgruppe"
              seriesColumn="kjonn"
              valueColumn="arslonn"
              title="Lønnsnivå fordelt på ansiennitetsgruppe og kjønn"
              order={seniorityChartOrder}
              orientation="vertical"
              exportFilename="Presentasjon - ansiennitetsgruppe og kjønn.xlsx"
              exportMetadata={exportMetadata}
            />
            <GroupedBarChart
              rows={filteredSalaryRows}
              groupColumn="Aldersgruppe"
              seriesColumn="kjonn"
              valueColumn="arslonn"
              title="Lønnsnivå fordelt på aldersgruppe og kjønn"
              order={ageChartOrder}
              orientation="vertical"
              exportFilename="Presentasjon - aldersgruppe og kjønn.xlsx"
              exportMetadata={exportMetadata}
            />
          </div>
          <YearGenderTrendChart rows={filteredSalaryRows} yearColumn="Ansettelsesår" genderColumn="kjonn" valueColumn="arslonn" title="Lønnsnivå fordelt på ansattår og kjønn" exportFilename="Presentasjon - ansattår og kjønn.xlsx" exportMetadata={exportMetadata} />
          <MatrixTable rows={filteredSalaryRows} rowColumn="Fagforening" columnColumn="Avdeling" valueColumn="arslonn" title="Lønnsnivå fordelt på fagforening og avdelinger" exportFilename="Presentasjon - minifigurer fagforening og avdelinger.xlsx" exportMetadata={exportMetadata} />
          <MatrixTable rows={filteredSalaryRows} rowColumn="Fagforening" columnColumn="Ansiennitetsgruppe" valueColumn="arslonn" title="Lønnsnivå fordelt på fagforening og ansiennitetsgrupper" exportFilename="Presentasjon - minifigurer fagforening og ansiennitetsgrupper.xlsx" exportMetadata={exportMetadata} />
          <MatrixTable rows={filteredSalaryRows} rowColumn="Fagforening" columnColumn="Aldersgruppe" valueColumn="arslonn" title="Lønnsnivå fordelt på fagforening og aldersgrupper" exportFilename="Presentasjon - minifigurer fagforening og aldersgrupper.xlsx" exportMetadata={exportMetadata} />
          <DataTable
            rows={salarySummary(filteredSalaryRows, "Tariff")}
            title="Tarifftilhørighet - lønn medlemmer/ansatte synkende"
            height={360}
            columnLabels={salaryLevelSummaryColumnLabels}
            hiddenColumns={salaryLevelSummaryHiddenColumns}
            hideSearch
            exportFilename="Presentasjon - tariff lønnsnivå.xlsx"
            exportMetadata={exportMetadata}
          />
        </>
      ) : null}
      {view === "development" ? (
        <>
          <div className="two-col">
            <DataTable
              rows={salarySummary(filteredSalaryRows, "kjonn")}
              title="Lønnsutvikling over tid - menn og kvinner"
              height={320}
              columnWidths={developmentColumnWidths}
              columnLabels={developmentSummaryColumnLabels}
              hiddenColumns={developmentSummaryHiddenColumns}
              rowClassName={deviationRowClassName}
              hideSearch
              exportFilename="Presentasjon - lønnsutvikling menn og kvinner.xlsx"
              exportMetadata={exportMetadata}
            />
            <DataTable
              rows={salarySummary(filteredSalaryRows, "Ansiennitetsgruppe")}
              title="Lønnsutvikling over tid - ansiennitetsgrupper"
              height={360}
              columnWidths={developmentColumnWidths}
              columnLabels={developmentSummaryColumnLabels}
              hiddenColumns={developmentSummaryHiddenColumns}
              rowClassName={deviationRowClassName}
              hideSearch
              exportFilename="Presentasjon - lønnsutvikling ansiennitetsgrupper.xlsx"
              exportMetadata={exportMetadata}
            />
          </div>
          <DataTable
            rows={salarySummary(filteredSalaryRows, "Aldersgruppe")}
            title="Lønnsutvikling over tid - aldersgrupper"
            height={360}
            columnWidths={developmentColumnWidths}
            columnLabels={developmentSummaryColumnLabels}
            hiddenColumns={developmentSummaryHiddenColumns}
            rowClassName={deviationRowClassName}
            hideSearch
            exportFilename="Presentasjon - lønnsutvikling aldersgrupper.xlsx"
            exportMetadata={exportMetadata}
          />
        </>
      ) : null}
      {view === "external" ? (
        <>
          <ExternalComparisonToggleChart rows={comparison} title="Lønnsnivå sammenlignbare virksomheter - foreløpig 2025-tall" exportFilename="Presentasjon - ekstern sammenligning lønnsnivå.xlsx" />
          <ExternalSalaryDevelopmentChart rows={externalDevelopmentRows} title="Lønnsutvikling utvalgte virksomheter - foreløpig 2025-tall" exportFilename="Presentasjon - ekstern sammenligning lønnsutvikling.xlsx" />
        </>
      ) : null}
    </>
  );
}

function SourceTabs({ bundle }: { bundle: StoredBundle }) {
  const [active, setActive] = useState<keyof StoredBundle["tables"]>("sap_raw");
  const columnWidths = active === "org_tilordning" ? { Seksjon: 300, SeksjonGammel: 360 } : undefined;
  const labels: Record<keyof StoredBundle["tables"], string> = {
    sap_raw: "SAP-rådata",
    referanselonn: "Referanselønn",
    org_tilordning: "Org-tilordning",
    medarbeiderdata: "Medarbeiderdata",
    avdelingsdata_raw: "Avdelingsdata",
    kpi: "KPI",
  };
  const kpiHiddenColumns = ["Referanseår", "Referansemåned", "Sluttmåned", "_kpi_referanse", "_kpi_slutt", "Målår", "Målmåned"];
  const exportFilename = `${labels[active]}.xlsx`;
  return (
    <div className="source-tabs">
      <div className="tab-list">
        {(Object.keys(labels) as Array<keyof StoredBundle["tables"]>).map((key) => (
          <button className={active === key ? "active" : ""} onClick={() => setActive(key)} key={key}>
            {labels[key]}
          </button>
        ))}
      </div>
      {active === "avdelingsdata_raw" ? (
        <DepartmentMatrix rows={bundle.tables.avdelingsdata_raw} exportFilename={exportFilename} />
      ) : active === "kpi" ? (
        <DataTable rows={bundle.tables.kpi} title={labels[active]} height={650} hiddenColumns={kpiHiddenColumns} columnOrder={["Periode", "Referansebane"]} exportFilename={exportFilename} />
      ) : (
        <DataTable rows={bundle.tables[active]} title={labels[active]} height={650} hiddenColumns={hiddenAppColumns} columnWidths={columnWidths} exportFilename={exportFilename} />
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
