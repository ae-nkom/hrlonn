import ExcelJS from "exceljs";
import { toNumber } from "./format";
import type { Row } from "./types";

export type ExportColumn = {
  key: string;
  header: string;
};

export type ExportMetadata = {
  label: string;
  value: string;
};

type ExportOptions = {
  rows: Row[];
  columns: ExportColumn[];
  title: string;
  filename: string;
  sheetName?: string;
  metadata?: ExportMetadata[];
};

function cleanFileName(filename: string): string {
  const safeName = filename.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim();
  return safeName.toLocaleLowerCase("nb-NO").endsWith(".xlsx") ? safeName : `${safeName}.xlsx`;
}

function cleanSheetName(name: string): string {
  const safeName = name.replace(/[\\/*?:\[\]]+/g, " ").replace(/\s+/g, " ").trim();
  return (safeName || "Eksport").slice(0, 31);
}

function columnKind(key: string, header: string): "salary" | "percent" | "number" | "text" {
  const normalized = `${key} ${header}`.toLocaleLowerCase("nb-NO");
  if (normalized.includes("prosent") || normalized.includes("referansebane")) return "percent";
  if (normalized.includes("lønn") || normalized.includes("lonn") || normalized.includes("kroner") || normalized.includes("arslonn")) return "salary";
  if (normalized.includes("antall") || normalized.includes("alder")) return "number";
  return "text";
}

function exportValue(value: unknown): unknown {
  if (value === null || value === undefined || value === "") return null;
  const numberValue = toNumber(value);
  if (numberValue !== null && String(value).trim() === String(numberValue)) return numberValue;
  return value;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export async function exportRowsToXlsx({ rows, columns, title, filename, sheetName, metadata = [] }: ExportOptions) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "HR lønn";
  workbook.created = new Date();
  const metaLines = [
    `Eksportert ${new Date().toLocaleString("nb-NO")} - ${rows.length.toLocaleString("nb-NO")} rader`,
    ...metadata.map((item) => `${item.label}: ${item.value || "Alle"}`),
  ];
  const headerRowNumber = metaLines.length + 3;

  const worksheet = workbook.addWorksheet(cleanSheetName(sheetName ?? title), {
    views: [{ state: "frozen", ySplit: headerRowNumber }],
  });

  const columnCount = Math.max(columns.length, 1);
  worksheet.mergeCells(1, 1, 1, columnCount);
  const titleCell = worksheet.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 14 };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF12313E" } };
  titleCell.alignment = { vertical: "middle" };
  worksheet.getRow(1).height = 24;

  metaLines.forEach((line, index) => {
    const rowNumber = index + 2;
    worksheet.mergeCells(rowNumber, 1, rowNumber, columnCount);
    const metaCell = worksheet.getCell(rowNumber, 1);
    metaCell.value = line;
    metaCell.font = { color: { argb: "FF52616B" }, italic: index === 0 };
    metaCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F7F9" } };
  });

  const headerRow = worksheet.getRow(headerRowNumber);
  headerRow.values = columns.map((column) => column.header);
  headerRow.height = 22;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F6F8B" } };
    cell.alignment = { vertical: "middle" };
    cell.border = { bottom: { style: "thin", color: { argb: "FF9FB0BD" } } };
  });

  rows.forEach((row, index) => {
    const excelRow = worksheet.addRow(columns.map((column) => exportValue(row[column.key])));
    if (index % 2 === 1) {
      excelRow.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7FAFC" } };
      });
    }
  });

  columns.forEach((column, index) => {
    const columnNumber = index + 1;
    const values = [column.header, ...rows.map((row) => row[column.key])].map((value) => String(value ?? ""));
    worksheet.getColumn(columnNumber).width = Math.min(48, Math.max(12, ...values.map((value) => value.length + 2)));
    const kind = columnKind(column.key, column.header);
    if (kind === "salary" || kind === "number") worksheet.getColumn(columnNumber).numFmt = "#,##0";
    if (kind === "percent") worksheet.getColumn(columnNumber).numFmt = "0.0";
  });

  if (columns.length > 0) {
    worksheet.autoFilter = {
      from: { row: headerRowNumber, column: 1 },
      to: { row: Math.max(headerRowNumber, rows.length + headerRowNumber), column: columns.length },
    };
  }

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber < headerRowNumber) return;
    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFE4EBF0" } },
        bottom: { style: "thin", color: { argb: "FFE4EBF0" } },
      };
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    cleanFileName(filename),
  );
}
