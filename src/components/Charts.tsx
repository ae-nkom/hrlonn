import { useRef, useState, type RefObject } from "react";
import ReactECharts from "echarts-for-react";
import { Download } from "lucide-react";
import { formatInt, mean, toNumber, uniqueSorted } from "../lib/format";
import { pngFilenameFromExportFilename } from "../lib/pngExport";
import type { Row } from "../lib/types";
import { exportRowsToXlsx, type ExportMetadata } from "../lib/xlsxExport";
import { PngExportButton } from "./PngExportButton";

type DataPoint = {
  name: string;
  value: number;
  count: number;
  row?: Row;
};

function chartImageDataUrl(ref: RefObject<ReactECharts>) {
  return ref.current?.getEchartsInstance().getDataURL({
    type: "png",
    pixelRatio: 3,
    backgroundColor: "#ffffff",
  });
}

function ChartExportActions({
  exportFilename,
  exporting,
  onExcelExport,
  chartRef,
}: {
  exportFilename?: string;
  exporting: boolean;
  onExcelExport: () => void;
  chartRef: RefObject<ReactECharts>;
}) {
  if (!exportFilename) return null;
  return (
    <div className="chart-export-actions" data-png-exclude="true">
      <button className="chart-export-button" disabled={exporting} onClick={onExcelExport} aria-label={exporting ? "Lager Excel" : "Eksporter Excel"} title="Eksporter Excel">
        <Download size={16} />
      </button>
      <PngExportButton className="chart-export-button" getImageDataUrl={() => chartImageDataUrl(chartRef)} filename={pngFilenameFromExportFilename(exportFilename)} />
    </div>
  );
}

function numericSalaryValues(values: unknown[]) {
  return values.map(toNumber).filter((value): value is number => value !== null && value > 0);
}

function groupedMean(rows: Row[], groupColumn: string, valueColumn: string, limit = 16) {
  const groups = new Map<string, unknown[]>();
  for (const row of rows) {
    const key = String(row[groupColumn] ?? "Ukjent");
    groups.set(key, [...(groups.get(key) ?? []), row[valueColumn]]);
  }
  return Array.from(groups.entries())
    .map(([name, values]) => {
      const numeric = numericSalaryValues(values);
      return { name, value: Math.round(mean(numeric) ?? 0), count: numeric.length };
    })
    .filter((item) => item.count > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

function totalMean(rows: Row[], valueColumn: string): DataPoint | null {
  const values = numericSalaryValues(rows.map((row) => row[valueColumn]));
  const value = mean(values);
  return value === null ? null : { name: "Total", value: Math.round(value), count: values.length };
}

function groupedMeanInOrder(rows: Row[], groupColumn: string, valueColumn: string, order: string[]) {
  const orderIndex = new Map(order.map((name, index) => [name, index]));
  return groupedMean(rows, groupColumn, valueColumn, rows.length)
    .filter((item) => orderIndex.has(item.name))
    .sort((a, b) => orderIndex.get(a.name)! - orderIndex.get(b.name)!);
}

function rowValues(rows: Row[], groupColumn: string, valueColumn: string) {
  return rows
    .map((row) => ({
      name: String(row[groupColumn] ?? "Ukjent"),
      value: toNumber(row[valueColumn]),
      count: 1,
      row,
    }))
    .filter((item): item is DataPoint & { row: Row } => item.value !== null)
    .sort((a, b) => b.value - a.value);
}

function fallbackDepartmentCode(name: string) {
  const words = name.match(/[\p{L}\p{N}]+/gu) ?? [];
  return words
    .filter((word) => !["og", "i", "for", "av", "på"].includes(word.toLocaleLowerCase("nb-NO")))
    .map((word) => word[0])
    .join("")
    .toLocaleUpperCase("nb-NO");
}

function departmentCode(name: string, rows: Row[]) {
  const explicitCode = rows.map((row) => String(row["Avdelingskode"] ?? "").trim()).find(Boolean);
  return explicitCode || fallbackDepartmentCode(name) || name;
}

const departmentPalette = [
  "#2563eb",
  "#f97316",
  "#16a34a",
  "#7c3aed",
  "#0891b2",
  "#db2777",
  "#a16207",
  "#475569",
  "#ca8a04",
  "#dc2626",
  "#4f46e5",
  "#0f766e",
];

const securityAndPreparednessColor = "#a16207";
const genderPalette = {
  total: "#1f6f8b",
  male: "#14532d",
  female: "#dc2626",
};

function createDepartmentColorMap(values: unknown[]) {
  return new Map(uniqueSorted(values).map((name, index) => [name, departmentPalette[index % departmentPalette.length]]));
}

function departmentColor(name: unknown, colorMap: Map<string, string> | null) {
  const departmentName = String(name ?? "");
  const normalizedName = departmentName.toLocaleLowerCase("nb-NO");
  if (normalizedName.includes("sikkerhet") && normalizedName.includes("totalforsvar")) {
    return securityAndPreparednessColor;
  }
  return colorMap?.get(departmentName) ?? departmentPalette[0];
}

function groupedItemColor(groupColumn: string, name: unknown, fallbackColor: string, colorMap: Map<string, string> | null) {
  if (groupColumn === "kjonn") return genderColor(name, fallbackColor);
  return groupColumn === "Avdeling" ? departmentColor(name, colorMap) : fallbackColor;
}

function matrixGroupValue(value: unknown) {
  const text = String(value ?? "");
  return text === "1538 Fagdirektør" || text === "1539 Fagdirektør" ? "1538/1539 Fagdirektør" : text;
}

function genderInitial(name: string) {
  const normalized = name.toLocaleLowerCase("nb-NO");
  if (normalized.includes("kvinne")) return "K";
  if (normalized.includes("mann")) return "M";
  return "";
}

function genderName(value: unknown) {
  const normalized = String(value ?? "").toLocaleLowerCase("nb-NO");
  if (normalized.includes("kvinne")) return "Kvinne";
  if (normalized.includes("mann")) return "Mann";
  return "";
}

function genderColor(value: unknown, fallbackColor = genderPalette.total) {
  const normalized = String(value ?? "").toLocaleLowerCase("nb-NO");
  if (normalized.includes("kvinne")) return genderPalette.female;
  if (normalized.includes("mann")) return genderPalette.male;
  if (normalized.includes("total")) return genderPalette.total;
  return fallbackColor;
}

function meanPoint(rows: Row[], valueColumn: string) {
  const values = numericSalaryValues(rows.map((row) => row[valueColumn]));
  const value = mean(values);
  return value === null ? null : { value: Math.round(value), count: values.length };
}

const fixedMatrixColumnOrders: Record<string, string[]> = {
  kjonn: ["Kvinne", "Mann", "Total"],
  Ansiennitetsgruppe: ["21 år eller mer", "16-20 år", "11-15 år", "6-10 år", "3-5 år", "0-2 år"],
  Aldersgruppe: ["60+", "50-59", "40-49", "30-39", "Under 30"],
};

function matrixEntryOrder(columnColumn: string, columnName: unknown) {
  const order = fixedMatrixColumnOrders[columnColumn];
  if (!order) return null;
  const index = order.indexOf(String(columnName));
  return index === -1 ? 99 : index;
}

function matrixEntryLabel(columnColumn: string, columnName: unknown, matchingRows: Row[]): string {
  if (columnColumn === "Avdeling") return departmentCode(String(columnName), matchingRows);
  if (columnColumn === "Ansiennitetsgruppe" && columnName === "21 år eller mer") return "21 år +";
  return String(columnName);
}

export function BarChart({
  rows,
  groupColumn,
  valueColumn,
  title,
  categoryLabelWidth = 170,
  valueLabelWidth = 84,
  hideXAxisValues = false,
  showCountInside = false,
  startLabelFormatter,
  color = "#1f6f8b",
  aggregate = true,
  includeTotal = false,
  emphasizeDifferences = false,
  showFullCategoryLabels = false,
  barMaxWidth,
  maxRows = 16,
  highlightName,
  highlightColor = "#c95a1a",
  exportFilename,
  exportMetadata = [],
}: {
  rows: Row[];
  groupColumn: string;
  valueColumn: string;
  title: string;
  categoryLabelWidth?: number;
  valueLabelWidth?: number;
  hideXAxisValues?: boolean;
  showCountInside?: boolean;
  startLabelFormatter?: (item: { name: string; value: number; count: number; row?: Row }) => string;
  color?: string;
  aggregate?: boolean;
  includeTotal?: boolean;
  emphasizeDifferences?: boolean;
  showFullCategoryLabels?: boolean;
  barMaxWidth?: number;
  maxRows?: number;
  highlightName?: string;
  highlightColor?: string;
  exportFilename?: string;
  exportMetadata?: ExportMetadata[];
}) {
  const [exporting, setExporting] = useState(false);
  const chartRef = useRef<ReactECharts>(null);
  const groupedData: DataPoint[] = aggregate ? groupedMean(rows, groupColumn, valueColumn, maxRows).map((item) => ({ ...item, row: undefined })) : rowValues(rows, groupColumn, valueColumn);
  const total = includeTotal ? totalMean(rows, valueColumn) : null;
  const data = total ? [total, ...groupedData] : groupedData;
  const departmentColors = groupColumn === "Avdeling" ? createDepartmentColorMap(rows.map((row) => row[groupColumn])) : null;
  const values = data.map((item) => item.value);
  const xAxisMin = (includeTotal || emphasizeDifferences) && values.length > 0 ? Math.max(0, Math.floor((Math.min(...values) - 35_000) / 10_000) * 10_000) : undefined;
  const showInlineLabel = showCountInside || Boolean(startLabelFormatter);

  async function handleExport() {
    if (!exportFilename) return;
    setExporting(true);
    try {
      await exportRowsToXlsx({
        rows: data.map((item) => ({
          [groupColumn]: item.name,
          "Gjennomsnittslønn": item.value,
          Antall: item.count,
        })),
        columns: [
          { key: groupColumn, header: groupColumn },
          { key: "Gjennomsnittslønn", header: "Gjennomsnittslønn" },
          { key: "Antall", header: "Antall" },
        ],
        title,
        filename: exportFilename,
        sheetName: title,
        metadata: exportMetadata,
      });
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className={exportFilename ? "chart-panel with-chart-export" : "chart-panel"}>
      <ChartExportActions exportFilename={exportFilename} exporting={exporting} onExcelExport={handleExport} chartRef={chartRef} />
      <ReactECharts
        ref={chartRef}
        style={{ height: Math.max(360, data.length * 28) }}
        option={{
          title: { text: title, left: 0, top: 0, textStyle: { fontSize: 17, fontWeight: 650 } },
          grid: { left: categoryLabelWidth + 20, right: showCountInside ? 86 : valueLabelWidth, top: 58, bottom: includeTotal || emphasizeDifferences ? 12 : 28 },
          tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
          xAxis: {
            type: "value",
            min: xAxisMin,
            axisLabel: {
              show: !hideXAxisValues && !includeTotal && !emphasizeDifferences,
              formatter: (value: number) => value.toLocaleString("nb-NO"),
            },
          },
          yAxis: {
            type: "category",
            data: data.map((item) => item.name),
            inverse: true,
            axisLabel: {
              width: categoryLabelWidth,
              overflow: showFullCategoryLabels ? "break" : "truncate",
              ellipsis: "...",
              lineHeight: 16,
            },
          },
          series: [
            {
              type: "bar",
              data: data.map((item) => ({
                ...item,
                itemStyle: { color: item.name === highlightName ? highlightColor : groupedItemColor(groupColumn, item.name, color, departmentColors), borderRadius: [0, 4, 4, 0] },
              })),
              barMaxWidth,
              itemStyle: { color, borderRadius: [0, 4, 4, 0] },
              label: showInlineLabel
                ? {
                    show: true,
                    position: "insideLeft",
                    distance: 12,
                    color: "#ffffff",
                    fontWeight: 700,
                    formatter: ({ data }: { data: DataPoint }) => {
                      const label = startLabelFormatter?.(data) ?? `N = ${data.count}`;
                      return label || "\u200b";
                    },
                  }
                : {
                    show: true,
                    position: "right",
                    color: "#1f2937",
                    fontWeight: 650,
                    formatter: ({ value }: { value: number }) => value.toLocaleString("nb-NO"),
                  },
            },
            ...(showInlineLabel
              ? [
                  {
                    type: "bar",
                    barGap: "-100%",
                    data: data.map((item) => item.value),
                    silent: true,
                    tooltip: { show: false },
                    itemStyle: { color: "rgba(0, 0, 0, 0)" },
                    emphasis: { disabled: true },
                    label: {
                      show: true,
                      position: "right",
                      color: "#1f2937",
                      formatter: ({ value }: { value: number }) => value.toLocaleString("nb-NO"),
                    },
                  },
                ]
              : []),
          ],
        }}
      />
    </section>
  );
}

export function ColumnChart({
  rows,
  groupColumn,
  valueColumn,
  title,
  order,
  color = "#1f6f8b",
  includeTotal = false,
  exportFilename,
  exportMetadata = [],
}: {
  rows: Row[];
  groupColumn: string;
  valueColumn: string;
  title: string;
  order: string[];
  color?: string;
  includeTotal?: boolean;
  exportFilename?: string;
  exportMetadata?: ExportMetadata[];
}) {
  const [exporting, setExporting] = useState(false);
  const chartRef = useRef<ReactECharts>(null);
  const total = includeTotal ? totalMean(rows, valueColumn) : null;
  const data = total ? [total, ...groupedMeanInOrder(rows, groupColumn, valueColumn, order)] : groupedMeanInOrder(rows, groupColumn, valueColumn, order);
  const values = data.map((item) => item.value);
  const minValue = values.length > 0 ? Math.min(...values) : 0;
  const yAxisMin = Math.max(0, Math.floor((minValue - 25_000) / 50_000) * 50_000);

  async function handleExport() {
    if (!exportFilename) return;
    setExporting(true);
    try {
      await exportRowsToXlsx({
        rows: data.map((item) => ({
          [groupColumn]: item.name,
          "Gjennomsnittslønn": item.value,
          Antall: item.count,
        })),
        columns: [
          { key: groupColumn, header: groupColumn },
          { key: "Gjennomsnittslønn", header: "Gjennomsnittslønn" },
          { key: "Antall", header: "Antall" },
        ],
        title,
        filename: exportFilename,
        sheetName: title,
        metadata: exportMetadata,
      });
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className={exportFilename ? "chart-panel with-chart-export" : "chart-panel"}>
      <ChartExportActions exportFilename={exportFilename} exporting={exporting} onExcelExport={handleExport} chartRef={chartRef} />
      <ReactECharts
        ref={chartRef}
        style={{ height: 360 }}
        option={{
          title: { text: title, left: 0, top: 0, textStyle: { fontSize: 17, fontWeight: 650 } },
          grid: { left: 72, right: 28, top: 58, bottom: 54 },
          tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
          xAxis: {
            type: "category",
            data: data.map((item) => item.name),
            axisLabel: { interval: 0 },
          },
          yAxis: {
            type: "value",
            min: yAxisMin,
            axisLabel: {
              show: false,
              formatter: (value: number) => value.toLocaleString("nb-NO"),
            },
          },
          series: [
            {
              type: "bar",
              data: data.map((item) => ({
                ...item,
                itemStyle: { color: groupedItemColor(groupColumn, item.name, color, null), borderRadius: [4, 4, 0, 0] },
              })),
              itemStyle: { color, borderRadius: [4, 4, 0, 0] },
              label: {
                show: true,
                position: "insideBottom",
                distance: 12,
                color: "#ffffff",
                fontWeight: 700,
                formatter: ({ data }: { data: DataPoint }) => `N = ${data.count}`,
              },
            },
            {
              type: "bar",
              barGap: "-100%",
              data: data.map((item) => item.value),
              silent: true,
              tooltip: { show: false },
              itemStyle: { color: "rgba(0, 0, 0, 0)" },
              emphasis: { disabled: true },
              label: {
                show: true,
                position: "top",
                color: "#1f2937",
                fontWeight: 650,
                formatter: ({ value }: { value: number }) => value.toLocaleString("nb-NO"),
              },
            },
          ],
        }}
      />
    </section>
  );
}

export function GroupedBarChart({
  rows,
  groupColumn,
  seriesColumn,
  valueColumn,
  title,
  order,
  orientation = "horizontal",
  exportFilename,
  exportMetadata = [],
}: {
  rows: Row[];
  groupColumn: string;
  seriesColumn: string;
  valueColumn: string;
  title: string;
  order?: string[];
  orientation?: "horizontal" | "vertical";
  exportFilename?: string;
  exportMetadata?: ExportMetadata[];
}) {
  const [exporting, setExporting] = useState(false);
  const chartRef = useRef<ReactECharts>(null);
  const groups = (order ? order.filter((name) => rows.some((row) => String(row[groupColumn] ?? "") === name)) : uniqueSorted(rows.map((row) => row[groupColumn]))).slice(0, 18);
  const seriesNames = uniqueSorted(rows.map((row) => row[seriesColumn]));
  const exportRows = groups.flatMap((group) =>
    seriesNames.map((seriesName) => {
      const matchingRows = rows.filter((row) => String(row[groupColumn] ?? "") === group && String(row[seriesColumn] ?? "") === seriesName);
      const numeric = numericSalaryValues(matchingRows.map((row) => row[valueColumn]));
      return {
        [groupColumn]: group,
        [seriesColumn]: seriesName,
        "Gjennomsnittslønn": Math.round(mean(numeric) ?? 0),
        Antall: numeric.length,
      };
    }).filter((row) => Number(row["Antall"]) > 0),
  );
  const allValues: number[] = [];
  const series = seriesNames.map((seriesName) => ({
    id: seriesName,
    name: seriesName,
    type: "bar",
    itemStyle: { color: seriesColumn === "kjonn" ? genderColor(seriesName) : undefined },
    data: groups.map((group) => {
      const values = rows
        .filter((row) => String(row[groupColumn] ?? "") === group && String(row[seriesColumn] ?? "") === seriesName)
        .map((row) => row[valueColumn]);
      const numeric = numericSalaryValues(values);
      const value = Math.round(mean(numeric) ?? 0);
      if (value > 0) allValues.push(value);
      return { value, count: numeric.length };
    }),
  }));
  const valueLabelSeries =
    orientation === "vertical"
      ? series.map((item) => ({
          ...item,
          barGap: "12%",
          barCategoryGap: "34%",
          markPoint: {
            symbol: "circle",
            symbolSize: 0,
            silent: true,
            label: {
              show: true,
              position: "top",
              distance: 4,
              color: "#1f2937",
              fontWeight: 650,
              formatter: ({ value }: { value: number }) => value.toLocaleString("nb-NO"),
            },
            data: item.data.map((point: { value: number; count: number }, index: number) => ({
              coord: [groups[index], point.value],
              value: point.value,
            })),
          },
          label: {
            show: true,
            position: "insideBottom",
            distance: 10,
            color: "#ffffff",
            fontSize: 13,
            fontWeight: 800,
            formatter: ({ data }: { data: { count: number } }) => `N=${data.count}`,
          },
        }))
      : series.map((item) => ({
          ...item,
          label: {
            show: true,
            position: "right",
            color: "#1f2937",
            formatter: ({ value }: { value: number }) => value.toLocaleString("nb-NO"),
          },
        }));
  async function handleExport() {
    if (!exportFilename) return;
    setExporting(true);
    try {
      await exportRowsToXlsx({
        rows: exportRows,
        columns: [
          { key: groupColumn, header: groupColumn },
          { key: seriesColumn, header: seriesColumn },
          { key: "Gjennomsnittslønn", header: "Gjennomsnittslønn" },
          { key: "Antall", header: "Antall" },
        ],
        title,
        filename: exportFilename,
        sheetName: title,
        metadata: exportMetadata,
      });
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className={exportFilename ? "chart-panel with-chart-export" : "chart-panel"}>
      <ChartExportActions exportFilename={exportFilename} exporting={exporting} onExcelExport={handleExport} chartRef={chartRef} />
      <ReactECharts
        ref={chartRef}
        notMerge
        style={{ height: orientation === "vertical" ? 390 : Math.max(390, groups.length * 34) }}
        option={{
          title: { text: title, left: 0, textStyle: { fontSize: 17, fontWeight: 650 } },
          legend: { top: 30 },
          tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
          grid: orientation === "vertical" ? { left: 58, right: 28, top: 82, bottom: 52 } : { left: 170, right: 24, top: 82, bottom: 34 },
          xAxis:
            orientation === "vertical"
              ? { type: "category", data: groups, axisLabel: { interval: 0 } }
              : { type: "value", axisLabel: { formatter: (value: number) => value.toLocaleString("nb-NO") } },
          yAxis:
            orientation === "vertical"
              ? { type: "value", axisLabel: { show: false, formatter: (value: number) => value.toLocaleString("nb-NO") } }
              : { type: "category", inverse: true, data: groups, axisLabel: { width: 150, overflow: "truncate" } },
          series: valueLabelSeries,
        }}
      />
    </section>
  );
}

export function YearGenderTrendChart({
  rows,
  yearColumn,
  genderColumn,
  valueColumn,
  title,
  exportFilename,
  exportMetadata = [],
}: {
  rows: Row[];
  yearColumn: string;
  genderColumn: string;
  valueColumn: string;
  title: string;
  exportFilename?: string;
  exportMetadata?: ExportMetadata[];
}) {
  const [sortBySalary, setSortBySalary] = useState(false);
  const [exporting, setExporting] = useState(false);
  const chartRef = useRef<ReactECharts>(null);
  const years = Array.from(
    new Set(
      rows
        .map((row) => Number(row[yearColumn]))
        .filter((year) => Number.isFinite(year)),
    ),
  ).sort((a, b) => a - b);
  const pointFor = (year: number, gender?: "Mann" | "Kvinne") => {
    const point = meanPoint(
      rows.filter((row) => Number(row[yearColumn]) === year && (!gender || genderName(row[genderColumn]) === gender)),
      valueColumn,
    );
    return point ? { value: point.value, count: point.count } : null;
  };
  const yearPoints = years.map((year) => ({
    year,
    total: pointFor(year),
    male: pointFor(year, "Mann"),
    female: pointFor(year, "Kvinne"),
  }));
  const sortedYearPoints = sortBySalary ? [...yearPoints].sort((a, b) => (b.total?.value ?? 0) - (a.total?.value ?? 0)) : yearPoints;
  const yearLabels = sortedYearPoints.map((point) => String(point.year));
  const totalData = sortedYearPoints.map((point) => point.total);
  const maleData = sortedYearPoints.map((point) => point.male);
  const femaleData = sortedYearPoints.map((point) => point.female);
  const values = yearPoints.flatMap((point) => [point.total?.value, point.male?.value, point.female?.value]).filter((value): value is number => value !== undefined);
  const yAxisMin = values.length > 0 ? Math.max(0, Math.floor((Math.min(...values) - 35_000) / 10_000) * 10_000) : undefined;

  async function handleExport() {
    if (!exportFilename) return;
    setExporting(true);
    try {
      await exportRowsToXlsx({
        rows: sortedYearPoints.map((point) => ({
          [yearColumn]: point.year,
          Total: point.total?.value ?? null,
          "N total": point.total?.count ?? 0,
          Mann: point.male?.value ?? null,
          "N mann": point.male?.count ?? 0,
          Kvinne: point.female?.value ?? null,
          "N kvinne": point.female?.count ?? 0,
        })),
        columns: [
          { key: yearColumn, header: yearColumn },
          { key: "Total", header: "Total" },
          { key: "N total", header: "N total" },
          { key: "Mann", header: "Mann" },
          { key: "N mann", header: "N mann" },
          { key: "Kvinne", header: "Kvinne" },
          { key: "N kvinne", header: "N kvinne" },
        ],
        title,
        filename: exportFilename,
        sheetName: title,
        metadata: [
          ...exportMetadata,
          { label: "Sortering", value: sortBySalary ? "Synkende lønn" : "Stigende årstall" },
        ],
      });
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className={exportFilename ? "chart-panel with-chart-toggle with-chart-export" : "chart-panel with-chart-toggle"}>
      <div className="chart-sort-toggle" aria-label="Sorter årsgraf">
        <button className={!sortBySalary ? "active" : ""} type="button" aria-pressed={!sortBySalary} onClick={() => setSortBySalary(false)}>
          Stigende årstall
        </button>
        <button className={sortBySalary ? "active" : ""} type="button" aria-pressed={sortBySalary} onClick={() => setSortBySalary(true)}>
          Synkende lønn
        </button>
      </div>
      <ChartExportActions exportFilename={exportFilename} exporting={exporting} onExcelExport={handleExport} chartRef={chartRef} />
      <ReactECharts
        ref={chartRef}
        notMerge
        style={{ height: 390 }}
        option={{
          title: { text: title, left: 0, textStyle: { fontSize: 17, fontWeight: 650 } },
          legend: { top: 30 },
          tooltip: {
            trigger: "axis",
            formatter: (params: Array<{ seriesName: string; data: { value?: number; count?: number } | null }>) =>
              params
                .filter((item) => item.data?.value)
                .map((item) => {
                  const salary = item.data!.value!.toLocaleString("nb-NO");
                  const count = item.data!.count ?? 0;
                  return `${item.seriesName}: ${salary} (N=${count})`;
                })
                .join("<br/>"),
          },
          grid: { left: 72, right: 28, top: 82, bottom: 48 },
          xAxis: { type: "category", data: yearLabels, axisLabel: { interval: 0 } },
          yAxis: {
            type: "value",
            min: yAxisMin,
            axisLabel: {
              formatter: (value: number) => value.toLocaleString("nb-NO"),
            },
          },
          series: [
            {
              id: "total",
              name: "Total",
              type: "line",
              data: totalData,
              symbol: "circle",
              symbolSize: 7,
              lineStyle: { width: 3, color: genderPalette.total },
              itemStyle: { color: genderPalette.total },
            },
            {
              id: "mann",
              name: "Mann",
              type: "scatter",
              data: maleData,
              symbolSize: 9,
              itemStyle: { color: genderPalette.male },
            },
            {
              id: "kvinne",
              name: "Kvinne",
              type: "scatter",
              data: femaleData,
              symbolSize: 9,
              itemStyle: { color: genderPalette.female },
            },
          ],
        }}
      />
    </section>
  );
}

export function ExternalSalaryDevelopmentChart({
  rows,
  title,
  exportFilename,
  exportMetadata = [],
}: {
  rows: Row[];
  title: string;
  exportFilename?: string;
  exportMetadata?: ExportMetadata[];
}) {
  const [selectedAgreement, setSelectedAgreement] = useState("Akademikerne/Unio");
  const [exporting, setExporting] = useState(false);
  const chartRef = useRef<ReactECharts>(null);
  const data = rows
    .filter((row) => row["Avtale"] === selectedAgreement)
    .sort((a, b) => Number(b["Lønn 2026"] ?? 0) - Number(b["Lønn 2021"] ?? 0) - (Number(a["Lønn 2026"] ?? 0) - Number(a["Lønn 2021"] ?? 0)));
  const businesses = data.map((row) => String(row["Virksomhet"] ?? ""));
  const values = data.flatMap((row) => [Number(row["Lønn 2021"] ?? 0), Number(row["Lønn 2026"] ?? 0)]).filter((value) => value > 0);
  const xAxisMin = values.length > 0 ? Math.max(0, Math.floor((Math.min(...values) - 30_000) / 50_000) * 50_000) : undefined;
  const xAxisMax = values.length > 0 ? Math.ceil((Math.max(...values) + 30_000) / 50_000) * 50_000 : undefined;
  const rowHeight = 54;
  const chartTop = 96;
  const nkomIndex = businesses.indexOf("Nkom");

  async function handleExport() {
    if (!exportFilename) return;
    setExporting(true);
    try {
      await exportRowsToXlsx({
        rows: data.map((row) => ({
          Virksomhet: row["Virksomhet"],
          "Lønn 2021": row["Lønn 2021"],
          "Lønn 2025": row["Lønn 2026"],
          Endring: Number(row["Lønn 2026"] ?? 0) - Number(row["Lønn 2021"] ?? 0),
        })),
        columns: [
          { key: "Virksomhet", header: "Virksomhet" },
          { key: "Lønn 2021", header: "Lønn 2021" },
          { key: "Lønn 2025", header: "Lønn 2025" },
          { key: "Endring", header: "Endring" },
        ],
        title,
        filename: exportFilename,
        sheetName: title,
        metadata: [...exportMetadata, { label: "Avtale", value: selectedAgreement }],
      });
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className={exportFilename ? "chart-panel with-chart-toggle with-chart-export" : "chart-panel with-chart-toggle"}>
      <div className="chart-sort-toggle" aria-label="Velg avtale">
        <button className={selectedAgreement === "Akademikerne/Unio" ? "active" : ""} type="button" aria-pressed={selectedAgreement === "Akademikerne/Unio"} onClick={() => setSelectedAgreement("Akademikerne/Unio")}>
          Akademikerne/Unio
        </button>
        <button className={selectedAgreement === "LO Stat" ? "active" : ""} type="button" aria-pressed={selectedAgreement === "LO Stat"} onClick={() => setSelectedAgreement("LO Stat")}>
          LO Stat
        </button>
      </div>
      <ChartExportActions exportFilename={exportFilename} exporting={exporting} onExcelExport={handleExport} chartRef={chartRef} />
      <ReactECharts
        ref={chartRef}
        notMerge
        style={{ height: Math.max(420, data.length * 54 + 120) }}
        option={{
          title: {
            text: title,
            subtext: "2021 mot 2025, synkende etter endring",
            left: 0,
            textStyle: { fontSize: 17, fontWeight: 650 },
            subtextStyle: { color: "#425463", fontSize: 13 },
          },
          legend: { top: 44, data: ["2021", "2025"] },
          tooltip: {
            trigger: "item",
            formatter: ({ seriesName, data: itemData }: { seriesName: string; data: [number, string] }) => `${seriesName}: ${itemData[0].toLocaleString("nb-NO")}`,
          },
          grid: { left: 360, right: 170, top: chartTop, bottom: 42 },
          graphic: [
            ...(nkomIndex >= 0
              ? [
                  {
                    type: "rect",
                    left: 0,
                    top: chartTop + nkomIndex * rowHeight - 16,
                    shape: { width: 5000, height: rowHeight },
                    style: { fill: "rgba(0,0,0,0)", stroke: "#1f6f8b", lineWidth: 2 },
                    silent: true,
                    z: 20,
                  },
                ]
              : []),
            {
              type: "text",
              right: 20,
              top: chartTop - 34,
              style: { text: "Endring", fill: "#425463", fontSize: 13, fontWeight: 700, textAlign: "right" },
              silent: true,
            },
            ...data.map((row, index) => {
              const change = Number(row["Lønn 2026"] ?? 0) - Number(row["Lønn 2021"] ?? 0);
              return {
                type: "text",
                right: 20,
                top: chartTop + index * rowHeight + 22,
                style: {
                  text: `${change >= 0 ? "+" : ""}${change.toLocaleString("nb-NO")}`,
                  fill: change >= 0 ? "#1f6f2b" : "#a734a7",
                  fontSize: 13,
                  fontWeight: 700,
                  textAlign: "right",
                },
                silent: true,
              };
            }),
          ],
          xAxis: {
            type: "value",
            min: xAxisMin,
            max: xAxisMax,
            axisLabel: { show: false },
          },
          yAxis: {
            type: "category",
            inverse: true,
            data: businesses,
            axisLabel: { width: 330, overflow: "truncate" },
          },
          series: [
            ...data.map((row) => ({
              id: `line-${row["Avtale"]}-${row["Virksomhet"]}`,
              type: "line",
              data: [
                [Number(row["Lønn 2021"] ?? 0), row["Virksomhet"]],
                [Number(row["Lønn 2026"] ?? 0), row["Virksomhet"]],
              ],
              showSymbol: false,
              lineStyle: { color: "#9aa7af", width: 5 },
              silent: true,
              tooltip: { show: false },
            })),
            {
              id: "salary-2021",
              name: "2021",
              type: "scatter",
              data: data.map((row) => [Number(row["Lønn 2021"] ?? 0), row["Virksomhet"]]),
              symbolSize: 12,
              itemStyle: { color: "#ea712d" },
              label: {
                show: true,
                position: "left",
                color: "#a34818",
                fontWeight: 650,
                formatter: ({ data: itemData }: { data: [number, string] }) => itemData[0].toLocaleString("nb-NO"),
              },
            },
            {
              id: "salary-2026",
              name: "2025",
              type: "scatter",
              data: data.map((row) => [Number(row["Lønn 2026"] ?? 0), row["Virksomhet"]]),
              symbolSize: 12,
              itemStyle: { color: "#1f6f8b" },
              label: {
                show: true,
                position: "right",
                color: "#164f68",
                fontWeight: 650,
                formatter: ({ data: itemData }: { data: [number, string] }) => itemData[0].toLocaleString("nb-NO"),
              },
            },
          ],
        }}
      />
    </section>
  );
}

export function ExternalComparisonToggleChart({
  rows,
  title,
  exportFilename,
  exportMetadata = [],
}: {
  rows: Row[];
  title: string;
  exportFilename?: string;
  exportMetadata?: ExportMetadata[];
}) {
  const [selectedAgreement, setSelectedAgreement] = useState("Akademikerne/Unio");
  const [exporting, setExporting] = useState(false);
  const chartRef = useRef<ReactECharts>(null);
  const data = rows
    .filter((row) => row["Avtale"] === selectedAgreement)
    .map((row) => ({
      name: String(row["Virksomhet"] ?? ""),
      value: Number(row["Gjennomsnittslønn"] ?? 0),
    }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value);

  async function handleExport() {
    if (!exportFilename) return;
    setExporting(true);
    try {
      await exportRowsToXlsx({
        rows: data.map((item) => ({
          Virksomhet: item.name,
          "Gjennomsnittslønn": item.value,
        })),
        columns: [
          { key: "Virksomhet", header: "Virksomhet" },
          { key: "Gjennomsnittslønn", header: "Gjennomsnittslønn" },
        ],
        title: `${title} - ${selectedAgreement}`,
        filename: exportFilename,
        sheetName: title,
        metadata: [...exportMetadata, { label: "Avtale", value: selectedAgreement }],
      });
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className={exportFilename ? "chart-panel with-chart-toggle with-chart-export" : "chart-panel with-chart-toggle"}>
      <div className="chart-sort-toggle" aria-label="Velg avtale">
        <button className={selectedAgreement === "Akademikerne/Unio" ? "active" : ""} type="button" aria-pressed={selectedAgreement === "Akademikerne/Unio"} onClick={() => setSelectedAgreement("Akademikerne/Unio")}>
          Akademikerne/Unio
        </button>
        <button className={selectedAgreement === "LO Stat" ? "active" : ""} type="button" aria-pressed={selectedAgreement === "LO Stat"} onClick={() => setSelectedAgreement("LO Stat")}>
          LO Stat
        </button>
      </div>
      <ChartExportActions exportFilename={exportFilename} exporting={exporting} onExcelExport={handleExport} chartRef={chartRef} />
      <ReactECharts
        ref={chartRef}
        notMerge
        style={{ height: Math.max(500, data.length * 30 + 96) }}
        option={{
          title: { text: `${title} - ${selectedAgreement}`, left: 0, textStyle: { fontSize: 17, fontWeight: 650 } },
          tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
          grid: { left: 380, right: 34, top: 66, bottom: 30 },
          xAxis: {
            type: "value",
            axisLabel: { show: false },
          },
          yAxis: {
            type: "category",
            inverse: true,
            data: data.map((item) => item.name),
            axisLabel: { width: 350, overflow: "truncate" },
          },
          series: [
            {
              type: "bar",
              data: data.map((item) => ({
                value: item.value,
                itemStyle: { color: item.name === "Nkom" ? "#bd5b18" : "#17384c", borderRadius: [0, 4, 4, 0] },
              })),
              label: {
                show: true,
                position: "right",
                color: "#1f2937",
                fontWeight: 650,
                formatter: ({ value }: { value: number }) => value.toLocaleString("nb-NO"),
              },
            },
          ],
        }}
      />
    </section>
  );
}

export function MatrixTable({
  rows,
  rowColumn,
  columnColumn,
  valueColumn,
  title,
  limitRows = 16,
  exportFilename,
  exportMetadata = [],
}: {
  rows: Row[];
  rowColumn: string;
  columnColumn: string;
  valueColumn: string;
  title: string;
  limitRows?: number;
  exportFilename?: string;
  exportMetadata?: ExportMetadata[];
}) {
  const [exporting, setExporting] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const rowNames = uniqueSorted(rows.map((row) => matrixGroupValue(row[rowColumn]))).slice(0, limitRows);
  const columnNames = uniqueSorted(rows.map((row) => row[columnColumn]));
  const departmentColors = columnColumn === "Avdeling" ? createDepartmentColorMap(rows.map((row) => row[columnColumn])) : null;
  const departmentLegendEntries =
    columnColumn === "Avdeling"
      ? columnNames.map((columnName) => {
          const matchingRows = rows.filter((row) => String(row[columnColumn] ?? "") === columnName);
          return {
            name: columnName,
            label: matrixEntryLabel(columnColumn, columnName, matchingRows),
            color: departmentColor(columnName, departmentColors),
          };
        })
      : [];
  const matrixRows = rowNames
    .map((rowName) => {
      const rowRows = rows.filter((row) => matrixGroupValue(row[rowColumn]) === rowName);
      const entries = columnNames.map((columnName) => {
        const matchingRows = rowRows.filter((row) => String(row[columnColumn] ?? "") === columnName);
        const avg = mean(numericSalaryValues(matchingRows.map((row) => row[valueColumn])));
        return {
          columnName,
          label: matrixEntryLabel(columnColumn, columnName, matchingRows),
          count: numericSalaryValues(matchingRows.map((row) => row[valueColumn])).length,
          value: avg === null ? null : Math.round(avg),
        };
      });
      if (columnColumn === "kjonn") {
        const totalValues = numericSalaryValues(rowRows.map((row) => row[valueColumn]));
        const avg = mean(totalValues);
        const genderCount = entries.filter((entry) => entry.count > 0).length;
        if (genderCount > 1) {
          entries.push({
            columnName: "Total",
            label: "Total",
            count: totalValues.length,
            value: avg === null ? null : Math.round(avg),
          });
        }
      }
      const visibleEntries = entries
        .filter((entry) => entry.value !== null && (columnColumn !== "kjonn" || entry.count > 0))
        .sort((a, b) => {
          const fixedOrderA = matrixEntryOrder(columnColumn, a.columnName);
          const fixedOrderB = matrixEntryOrder(columnColumn, b.columnName);
          if (fixedOrderA !== null && fixedOrderB !== null) return fixedOrderA - fixedOrderB;
          return (b.value ?? 0) - (a.value ?? 0);
        });
      return {
        rowName,
        entries: visibleEntries,
      };
    })
    .filter((item) => item.entries.length > 0);

  const exportRows = matrixRows.flatMap(({ rowName, entries }) =>
    entries.map((entry) => ({
      [rowColumn]: rowName,
      [columnColumn]: entry.columnName,
      Visningsnavn: entry.label,
      "Gjennomsnittslønn": entry.value,
      Antall: entry.count,
    })),
  );

  async function handleExport() {
    if (!exportFilename) return;
    setExporting(true);
    try {
      await exportRowsToXlsx({
        rows: exportRows,
        columns: [
          { key: rowColumn, header: rowColumn },
          { key: columnColumn, header: columnColumn },
          { key: "Visningsnavn", header: "Visningsnavn" },
          { key: "Gjennomsnittslønn", header: "Gjennomsnittslønn" },
          { key: "Antall", header: "Antall" },
        ],
        title,
        filename: exportFilename,
        sheetName: title,
        metadata: exportMetadata,
      });
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="matrix-panel" ref={sectionRef}>
      <div className="table-toolbar">
        <div>
          <h2>{title}</h2>
          <span>Gjennomsnittlig årslønn</span>
        </div>
        {exportFilename ? (
          <div className="table-actions" data-png-exclude="true">
            <button className="table-export-button" disabled={exporting} onClick={handleExport} aria-label={exporting ? "Lager Excel" : "Eksporter Excel"} title="Eksporter Excel">
              <Download size={16} />
            </button>
            <PngExportButton className="table-export-button" targetRef={sectionRef} filename={pngFilenameFromExportFilename(exportFilename)} />
          </div>
        ) : null}
      </div>
      {departmentLegendEntries.length > 0 ? (
        <div className="department-color-legend" aria-label="Farger for avdelinger">
          {departmentLegendEntries.map((entry) => (
            <span key={entry.name} title={entry.name}>
              <i className="department-color-swatch" style={{ backgroundColor: entry.color }} aria-hidden="true" />
              {entry.label}
            </span>
          ))}
        </div>
      ) : null}
      <div className="mini-chart-grid" aria-label={`${title}. ${rowColumn} fordelt på ${columnColumn}`}>
        {matrixRows.map(({ rowName, entries }) => (
          <article className="mini-chart-card" key={rowName}>
            <h3>{rowName}</h3>
            <div className="mini-bars">
              {entries.map(({ columnName, label, count, value }) => {
                const cardValues = entries.map((entry) => entry.value ?? 0);
                const minValue = Math.min(...cardValues);
                const maxValue = Math.max(...cardValues);
                const range = Math.max(1, maxValue - minValue);
                const width = maxValue === minValue ? 100 : 45 + (((value ?? 0) - minValue) / range) * 55;
                const fillColor = columnColumn === "Avdeling" ? departmentColor(columnName, departmentColors) : columnColumn === "kjonn" ? genderColor(columnName) : undefined;
                return (
                  <div className="mini-bar-row" key={columnName}>
                    <span className="mini-bar-label" title={columnName}>
                      {label} ({count})
                    </span>
                    <div className="mini-bar-track" aria-hidden="true">
                      <div className="mini-bar-fill" style={{ width: `${width}%`, backgroundColor: fillColor }} />
                    </div>
                    <span className="mini-bar-value">{formatInt(value)}</span>
                  </div>
                );
              })}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function DistributionChart({ rows, exportFilename, exportMetadata = [] }: { rows: Row[]; exportFilename?: string; exportMetadata?: ExportMetadata[] }) {
  const [exporting, setExporting] = useState(false);
  const chartRef = useRef<ReactECharts>(null);
  const groups = groupedMean(rows, "Aldersgruppe", "arslonn", 12);
  const countsByGroup = new Map(groups.map((item) => [item.name, item.count]));

  async function handleExport() {
    if (!exportFilename) return;
    setExporting(true);
    try {
      await exportRowsToXlsx({
        rows: groups.map((item) => ({
          Aldersgruppe: item.name,
          "Gjennomsnittslønn": item.value,
          Antall: item.count,
        })),
        columns: [
          { key: "Aldersgruppe", header: "Aldersgruppe" },
          { key: "Gjennomsnittslønn", header: "Gjennomsnittslønn" },
          { key: "Antall", header: "Antall" },
        ],
        title: "Lønnsnivå etter alder",
        filename: exportFilename,
        sheetName: "Lønnsnivå etter alder",
        metadata: exportMetadata,
      });
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className={exportFilename ? "chart-panel with-chart-export" : "chart-panel"}>
      <ChartExportActions exportFilename={exportFilename} exporting={exporting} onExcelExport={handleExport} chartRef={chartRef} />
      <ReactECharts
        ref={chartRef}
        style={{ height: 360 }}
        option={{
          title: { text: "Lønnsnivå etter alder", left: 0, textStyle: { fontSize: 17, fontWeight: 650 } },
          tooltip: { trigger: "axis" },
          grid: { left: 72, right: 24, top: 58, bottom: 58 },
          xAxis: {
            type: "category",
            data: groups.map((item) => item.name),
            axisLabel: {
              lineHeight: 18,
              formatter: (value: string) => `${value}\nN = ${countsByGroup.get(value) ?? 0}`,
            },
          },
          yAxis: {
            type: "value",
            min: 600000,
            axisLabel: {
              formatter: (value: number) => Math.round(value).toLocaleString("nb-NO"),
            },
          },
          series: [
            {
              type: "line",
              smooth: true,
              symbolSize: 8,
              areaStyle: { opacity: 0.14 },
              data: groups.map((item) => item.value),
              color: "#bd5b18",
              label: {
                show: true,
                position: "top",
                color: "#1f2937",
                fontWeight: 650,
                formatter: ({ value }: { value: number }) => Math.round(value).toLocaleString("nb-NO"),
              },
            },
          ],
        }}
      />
    </section>
  );
}
