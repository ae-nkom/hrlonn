import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type Row as TableRow,
  type SortingState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Columns3, Download, Eye, EyeOff, Search } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { formatInt, toNumber } from "../lib/format";
import { exportTableToPng, pngFilenameFromExportFilename } from "../lib/pngExport";
import type { Row } from "../lib/types";
import { exportRowsToXlsx, type ExportMetadata } from "../lib/xlsxExport";
import { HelpPopover } from "./HelpPopover";
import { PngExportButton } from "./PngExportButton";

type Props = {
  rows: Row[];
  title?: string;
  height?: number;
  hiddenColumns?: string[];
  columnWidths?: Record<string, number>;
  columnOrder?: string[];
  columnLabels?: Record<string, string>;
  initialSorting?: SortingState;
  rowClassName?: (row: Row) => string;
  hideSearch?: boolean;
  exportFilename?: string;
  exportMetadata?: ExportMetadata[];
  helpText?: string;
};

function isSalaryColumn(name: string): boolean {
  const normalized = name.toLocaleLowerCase("nb-NO");
  return (
    normalized === "arslonn" ||
    normalized === "ref_lonn" ||
    normalized.includes("lønn") ||
    normalized.includes("lonn") ||
    normalized.includes("kroner")
  ) && !normalized.includes("prosent");
}

function isPercentColumn(name: string): boolean {
  const normalized = name.toLocaleLowerCase("nb-NO");
  return normalized.includes("prosent") || normalized === "referansebane";
}

function formatCellValue(columnName: string, value: unknown): string {
  if (value === null || value === undefined) return "";
  if (isPercentColumn(columnName) && toNumber(value) !== null) {
    return new Intl.NumberFormat("nb-NO", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(toNumber(value)!);
  }
  if (isSalaryColumn(columnName) && toNumber(value) !== null) return formatInt(value).replace(/\u00a0/g, " ");
  return String(value);
}

function isTotalRow(row: Row): boolean {
  return row.__rowType === "total" || String(row["Gruppe"] ?? "").toLocaleLowerCase("nb-NO") === "total";
}

function totalClassName(row: Row, rowClassName?: (row: Row) => string): string {
  return [isTotalRow(row) ? "total-row" : "", rowClassName?.(row) ?? ""].filter(Boolean).join(" ");
}

function groupSortValue(value: unknown): number | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (/under\s+\d+/i.test(text)) return Number(text.match(/\d+/)?.[0] ?? 0) - 1;
  if (/\d+\s*(år\s*)?\+/.test(text) || /\d+\s*år\s*eller\s*mer/i.test(text)) return Number(text.match(/\d+/)?.[0] ?? 0);
  const numbers = text.match(/\d+/g)?.map(Number) ?? [];
  if (numbers.length > 0) return Math.max(...numbers);
  return null;
}

function compareGroupValues(a: unknown, b: unknown) {
  const valueA = groupSortValue(a);
  const valueB = groupSortValue(b);
  if (valueA !== null || valueB !== null) return (valueA ?? Number.NEGATIVE_INFINITY) - (valueB ?? Number.NEGATIVE_INFINITY);
  return String(a ?? "").localeCompare(String(b ?? ""), "nb");
}

function compareNumericValues(a: unknown, b: unknown) {
  const valueA = toNumber(a);
  const valueB = toNumber(b);
  if (valueA !== null && valueB !== null) return valueA - valueB;
  if (valueA !== null) return -1;
  if (valueB !== null) return 1;
  return 0;
}

function compareTextValues(a: unknown, b: unknown) {
  return String(a ?? "").localeCompare(String(b ?? ""), "nb");
}

export function DataTable({
  rows,
  title,
  height = 560,
  hiddenColumns = [],
  columnWidths = {},
  columnOrder = [],
  columnLabels = {},
  initialSorting = [],
  rowClassName,
  hideSearch = false,
  exportFilename,
  exportMetadata = [],
  helpText,
}: Props) {
  const [globalFilter, setGlobalFilter] = useState("");
  const [sorting, setSorting] = useState<SortingState>(initialSorting);
  const [exporting, setExporting] = useState(false);
  const [hiddenColumnIds, setHiddenColumnIds] = useState<string[]>([]);
  const parentRef = useRef<HTMLDivElement>(null);
  const allColumns = useMemo(() => {
    const hidden = new Set([...hiddenColumns, "__rowType"]);
    const names = Array.from(new Set(rows.flatMap((row) => Object.keys(row)))).filter((name) => !hidden.has(name));
    const filtered = names;
    const orderedNames =
      columnOrder.length > 0 ? [...new Set([...columnOrder.filter((name) => filtered.includes(name)), ...filtered.filter((name) => !columnOrder.includes(name))])] : filtered;
    return orderedNames.map((name) => {
      const hasOrderedGroups = name === "Gruppe" && rows.some((row) => groupSortValue(row[name]) !== null);
      const hasNumericValues = !hasOrderedGroups && rows.some((row) => toNumber(row[name]) !== null);
      return {
        id: name,
        accessorFn: (row: Row) => row[name],
        header: columnLabels[name] ?? name,
        sortingFn: hasOrderedGroups
          ? (rowA: TableRow<Row>, rowB: TableRow<Row>, columnId: string) => compareGroupValues(rowA.getValue(columnId), rowB.getValue(columnId))
          : hasNumericValues
            ? (rowA: TableRow<Row>, rowB: TableRow<Row>, columnId: string) => compareNumericValues(rowA.getValue(columnId), rowB.getValue(columnId))
            : (rowA: TableRow<Row>, rowB: TableRow<Row>, columnId: string) => compareTextValues(rowA.getValue(columnId), rowB.getValue(columnId)),
        sortDescFirst: hasOrderedGroups || hasNumericValues,
        cell: (info: { getValue: () => unknown }) => {
          return formatCellValue(name, info.getValue());
        },
      };
    });
  }, [columnOrder, columnLabels, hiddenColumns, rows]);
  const validHiddenColumnIds = hiddenColumnIds.filter((columnId) => allColumns.some((column) => String(column.id) === columnId));
  const visibleColumns = allColumns.filter((column) => !validHiddenColumnIds.includes(String(column.id)));
  const hiddenColumnLabels = validHiddenColumnIds.map((columnId) => ({
    id: columnId,
    label: columnLabels[columnId] ?? columnId,
  }));

  const totalRows = useMemo(() => rows.filter(isTotalRow), [rows]);
  const bodyRows = useMemo(() => rows.filter((row) => !isTotalRow(row)), [rows]);

  const table = useReactTable({
    data: bodyRows,
    columns: visibleColumns,
    state: { globalFilter, sorting },
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const tableRows = table.getRowModel().rows;
  const shouldShowSearch = !hideSearch && bodyRows.length >= 20;
  const exportColumns = allColumns.map((column) => {
    const key = String(column.id);
    return { key, header: columnLabels[key] ?? key };
  });
  const pngColumns = visibleColumns.map((column) => {
    const key = String(column.id);
    return { key, header: columnLabels[key] ?? key };
  });
  const visibleTotalRows = totalRows.filter((row) => {
    if (!globalFilter.trim()) return true;
    const needle = globalFilter.toLocaleLowerCase("nb-NO");
    return exportColumns.some((column) => String(row[column.key] ?? "").toLocaleLowerCase("nb-NO").includes(needle));
  });
  const exportRows = [
    ...tableRows.map((row) =>
      Object.fromEntries(exportColumns.map((column) => [column.key, row.original[column.key]])),
    ),
    ...visibleTotalRows.map((row) => Object.fromEntries(exportColumns.map((column) => [column.key, row[column.key]]))),
  ];
  const pngRows = [
    ...tableRows.map((row) =>
      Object.fromEntries(pngColumns.map((column) => [column.key, row.getValue(column.key)])),
    ),
    ...visibleTotalRows.map((row) => Object.fromEntries(pngColumns.map((column) => [column.key, row[column.key]]))),
  ];
  const defaultColumnWidth = 150;
  const visibleColumnWidths = visibleColumns.map((column) => columnWidths[String(column.id)] ?? defaultColumnWidth);
  const tableWidth = Math.max(
    visibleColumnWidths.reduce((sum, width) => sum + width, 0),
    900,
  );
  const gridTemplateColumns = visibleColumnWidths.map((width) => `${width}px`).join(" ");
  const virtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 14,
  });

  async function handleExport() {
    if (!exportFilename || exportColumns.length === 0) return;
    setExporting(true);
    try {
      await exportRowsToXlsx({
        rows: exportRows,
        columns: exportColumns,
        title: title ?? "Tabell",
        filename: exportFilename,
        sheetName: title,
        metadata: exportMetadata,
      });
    } finally {
      setExporting(false);
    }
  }

  async function handlePngExport() {
    if (!exportFilename || pngColumns.length === 0) return;
    await exportTableToPng({
      rows: pngRows,
      columns: pngColumns.map((column, index) => ({ ...column, width: visibleColumnWidths[index] })),
      title: title ?? "Tabell",
      subtitle: `${tableRows.length.toLocaleString("nb-NO")} av ${bodyRows.length.toLocaleString("nb-NO")} rader`,
      filename: pngFilenameFromExportFilename(exportFilename),
      metadata: exportMetadata,
      rowClassNames: [...tableRows.map((row) => totalClassName(row.original, rowClassName)), ...visibleTotalRows.map((row) => totalClassName(row, rowClassName))],
      formatValue: formatCellValue,
    });
  }

  function hideColumn(columnId: string) {
    if (visibleColumns.length <= 1) return;
    setHiddenColumnIds((current) => (current.includes(columnId) ? current : [...current, columnId]));
  }

  function showColumn(columnId: string) {
    setHiddenColumnIds((current) => current.filter((id) => id !== columnId));
  }

  return (
    <section className="table-shell">
      <div className="table-toolbar">
        <div>
          {title ? <h2>{title}</h2> : null}
          <span>
            {tableRows.length.toLocaleString("nb-NO")} av {bodyRows.length.toLocaleString("nb-NO")} rader
          </span>
        </div>
        <div className="table-actions">
          {helpText ? <HelpPopover title={title ?? "Tabell"}>{helpText}</HelpPopover> : null}
          {shouldShowSearch ? (
            <label className="table-search" data-png-exclude="true">
              <Search size={16} />
              <input value={globalFilter} onChange={(event) => setGlobalFilter(event.target.value)} placeholder="Søk i tabellen" />
            </label>
          ) : null}
          <details className="column-menu">
            <summary aria-label="Vis eller skjul kolonner" title="Vis eller skjul kolonner">
              <Columns3 size={16} />
              {validHiddenColumnIds.length > 0 ? <span>{validHiddenColumnIds.length}</span> : null}
            </summary>
            <div className="column-menu-panel">
              <strong>Skjulte kolonner</strong>
              {hiddenColumnLabels.length === 0 ? <p>Alle kolonner vises</p> : null}
              {hiddenColumnLabels.map((column) => (
                <button type="button" onClick={() => showColumn(column.id)} key={column.id}>
                  <Eye size={15} />
                  {column.label}
                </button>
              ))}
              {hiddenColumnLabels.length > 0 ? (
                <button type="button" className="show-all-columns" onClick={() => setHiddenColumnIds([])}>
                  Vis alle kolonner
                </button>
              ) : null}
            </div>
          </details>
          {exportFilename ? (
            <>
              <button className="table-export-button" disabled={exporting} onClick={handleExport} aria-label={exporting ? "Lager Excel" : "Eksporter Excel"} title="Eksporter Excel" data-png-exclude="true">
                <Download size={16} />
              </button>
              <PngExportButton className="table-export-button" filename={pngFilenameFromExportFilename(exportFilename)} onExport={handlePngExport} />
            </>
          ) : null}
        </div>
      </div>
      <div className={`table-scroll${visibleTotalRows.length > 0 ? " has-total-footer" : ""}`} ref={parentRef} style={{ height }}>
        <table className="virtual-table" style={{ width: tableWidth }}>
          <thead style={{ width: tableWidth }}>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} style={{ gridTemplateColumns }}>
                {headerGroup.headers.map((header, index) => (
                  <th
                    key={header.id}
                    onClick={header.column.getToggleSortingHandler()}
                    style={{ width: visibleColumnWidths[index], minWidth: visibleColumnWidths[index], maxWidth: visibleColumnWidths[index] }}
                  >
                    <span className="column-header-label">
                      <span>
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        <span className="sort-mark">
                          {{ asc: " ↑", desc: " ↓" }[header.column.getIsSorted() as string] ?? ""}
                        </span>
                      </span>
                      <button
                        className="column-hide-button"
                        type="button"
                        title="Skjul kolonne"
                        aria-label={`Skjul ${String(header.column.columnDef.header)}`}
                        disabled={visibleColumns.length <= 1}
                        onClick={(event) => {
                          event.stopPropagation();
                          hideColumn(String(header.column.id));
                        }}
                      >
                        <EyeOff size={14} />
                      </button>
                    </span>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody style={{ height: `${virtualizer.getTotalSize()}px`, width: tableWidth }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const row = tableRows[virtualRow.index];
              return (
                <tr
                  key={row.id}
                  className={totalClassName(row.original, rowClassName)}
                  style={{
                    gridTemplateColumns,
                    transform: `translateY(${virtualRow.start}px)`,
                    width: tableWidth,
                  }}
                >
                  {row.getVisibleCells().map((cell, index) => (
                    <td
                      key={cell.id}
                      style={{ width: visibleColumnWidths[index], minWidth: visibleColumnWidths[index], maxWidth: visibleColumnWidths[index] }}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
          {visibleTotalRows.length > 0 ? (
            <tfoot style={{ width: tableWidth }}>
              {visibleTotalRows.map((row, rowIndex) => (
                <tr key={rowIndex} className={totalClassName(row, rowClassName)} style={{ gridTemplateColumns, width: tableWidth }}>
                  {visibleColumns.map((column, index) => {
                    const key = String(column.id);
                    return (
                      <td key={key} style={{ width: visibleColumnWidths[index], minWidth: visibleColumnWidths[index], maxWidth: visibleColumnWidths[index] }}>
                        {formatCellValue(key, row[key])}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tfoot>
          ) : null}
        </table>
      </div>
    </section>
  );
}
