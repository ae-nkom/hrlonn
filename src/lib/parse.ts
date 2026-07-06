import ExcelJS from "exceljs";
import { normalizeRows } from "./columns";
import type { Row, StoredBundle, UploadFilePatch, UploadFiles } from "./types";

const REFERENCE_SHEET_NAME = "Referanselønn";
const REFERENCE_TITLE = "Referanselønn";
const REFERENCE_HEADER_ROW = 4;
const REFERENCE_HEADERS = ["navn", "init", "ref_ar", "ref_lonn"];

function cleanCell(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  if (typeof value === "bigint") return Number(value);
  if (value && typeof value === "object") {
    const cell = value as Record<string, unknown>;
    if ("result" in cell) return cleanCell(cell.result);
    if ("text" in cell) return cleanCell(cell.text);
    if ("richText" in cell && Array.isArray(cell.richText)) {
      return cell.richText.map((part) => (part as Record<string, unknown>).text ?? "").join("");
    }
    if ("hyperlink" in cell && "text" in cell) return cleanCell(cell.text);
  }
  return value ?? null;
}

function cleanRows(rows: Row[]): Row[] {
  return rows.map((row) =>
    Object.fromEntries(Object.entries(row).map(([key, value]) => [key, cleanCell(value)])),
  );
}

async function readWorkbook(file: File) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  return workbook;
}

function getWorksheet(workbook: ExcelJS.Workbook, sheetName: string): ExcelJS.Worksheet {
  const worksheet = workbook.getWorksheet(sheetName);
  if (!worksheet) throw new Error(`Mangler arkfanen "${sheetName}"`);
  return worksheet;
}

function rowValues(worksheet: ExcelJS.Worksheet, rowNumber: number): unknown[] {
  const row = worksheet.getRow(rowNumber);
  return Array.from({ length: worksheet.columnCount }, (_, index) => cleanCell(row.getCell(index + 1).value));
}

function sheetRows(workbook: ExcelJS.Workbook, sheetName: string): Row[] {
  const worksheet = getWorksheet(workbook, sheetName);
  const rows = Array.from({ length: worksheet.rowCount }, (_, index) => rowValues(worksheet, index + 1));
  if (rows.length === 0) return [];
  const headers = rows[0].map((value, index) => String(value ?? `Kolonne ${index + 1}`).trim());
  return cleanRows(
    rows.slice(1).map((row) =>
      Object.fromEntries(headers.map((header, index) => [header, cleanCell(row[index])])),
    ),
  );
}

function rowsFromHeaderRow(worksheet: ExcelJS.Worksheet, headerRowNumber: number): Row[] {
  const rows = Array.from({ length: worksheet.rowCount }, (_, index) => rowValues(worksheet, index + 1));
  const headerRow = rows[headerRowNumber - 1] ?? [];
  const headers = REFERENCE_HEADERS.map((_, index) => String(headerRow[index] ?? "").trim());
  const invalidHeader = REFERENCE_HEADERS.find((header, index) => headers[index] !== header);
  if (invalidHeader) {
    throw new Error(`Referanselønn må ha kolonnene ${REFERENCE_HEADERS.join(", ")} på rad ${headerRowNumber}.`);
  }
  return cleanRows(
    rows.slice(headerRowNumber).map((row) =>
      Object.fromEntries(REFERENCE_HEADERS.map((header, index) => [header, cleanCell(row[index])])),
    ),
  );
}

function referenceSalaryRows(workbook: ExcelJS.Workbook): Row[] {
  const worksheet = getWorksheet(workbook, REFERENCE_SHEET_NAME);
  const title = cleanCell(worksheet.getRow(1).getCell(1).value);
  if (title !== REFERENCE_TITLE) {
    throw new Error(`Referanselønn må være en Excel-fil eksportert med "${REFERENCE_TITLE}" i celle A1.`);
  }
  return rowsFromHeaderRow(worksheet, REFERENCE_HEADER_ROW);
}

function sheetMatrix(workbook: ExcelJS.Workbook, sheetName: string): Row[] {
  const worksheet = getWorksheet(workbook, sheetName);
  const matrix = Array.from({ length: worksheet.rowCount }, (_, index) => rowValues(worksheet, index + 1));
  const selected = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12];
  return matrix.map((row) =>
    Object.fromEntries(selected.map((index, outIndex) => [`Kolonne ${outIndex + 1}`, cleanCell(row[index])])),
  );
}

export async function parseUploadFiles(files: UploadFiles): Promise<StoredBundle> {
  const [sapWorkbook, manualWorkbook, referenceWorkbook] = await Promise.all([
    readWorkbook(files.sap),
    readWorkbook(files.manuell),
    readWorkbook(files.referanselonn),
  ]);
  const sapRaw = normalizeRows(sheetRows(sapWorkbook, "Ark1"));
  const referanselonn = referenceSalaryRows(referenceWorkbook);
  const orgTilordning = normalizeRows(sheetRows(manualWorkbook, "Org-tilordning"));
  const medarbeiderdata = normalizeRows(sheetRows(manualWorkbook, "Medarbeiderdata"));
  const avdelingsdataRaw = sheetMatrix(manualWorkbook, "Avdelingsdata");

  return {
    version: 1,
    createdAt: new Date().toISOString(),
    sources: {
      sap_raw: { name: files.sap.name, role: "SAP-rådata", size: files.sap.size },
      referanselonn: {
        name: files.referanselonn.name,
        role: "Referanselønn",
        size: files.referanselonn.size,
      },
      manuell_input: { name: files.manuell.name, role: "Manuell input", size: files.manuell.size },
    },
    tables: {
      sap_raw: sapRaw,
      referanselonn: normalizeRows(cleanRows(referanselonn)),
      org_tilordning: orgTilordning,
      medarbeiderdata,
      avdelingsdata_raw: avdelingsdataRaw,
      kpi: [],
    },
  };
}

export async function updateStoredBundleFromUploads(existing: StoredBundle | null, files: UploadFilePatch): Promise<StoredBundle> {
  if (!existing) {
    if (!files.sap || !files.referanselonn || !files.manuell) {
      throw new Error("Last opp SAP-rådata, referanselønn og manuell input første gang.");
    }
    return parseUploadFiles({ sap: files.sap, referanselonn: files.referanselonn, manuell: files.manuell });
  }

  const next: StoredBundle = {
    ...existing,
    createdAt: new Date().toISOString(),
    sources: { ...existing.sources },
    tables: { ...existing.tables },
  };

  if (files.sap) {
    const sapWorkbook = await readWorkbook(files.sap);
    next.sources.sap_raw = { name: files.sap.name, role: "SAP-rådata", size: files.sap.size };
    next.tables.sap_raw = normalizeRows(sheetRows(sapWorkbook, "Ark1"));
  }

  if (files.referanselonn) {
    const referenceWorkbook = await readWorkbook(files.referanselonn);
    next.sources.referanselonn = {
      name: files.referanselonn.name,
      role: "Referanselønn",
      size: files.referanselonn.size,
    };
    next.tables.referanselonn = normalizeRows(cleanRows(referenceSalaryRows(referenceWorkbook)));
    next.tables.kpi = [];
    delete next.sources.kpi;
  }

  if (files.manuell) {
    const manualWorkbook = await readWorkbook(files.manuell);
    next.sources.manuell_input = { name: files.manuell.name, role: "Manuell input", size: files.manuell.size };
    next.tables.org_tilordning = normalizeRows(sheetRows(manualWorkbook, "Org-tilordning"));
    next.tables.medarbeiderdata = normalizeRows(sheetRows(manualWorkbook, "Medarbeiderdata"));
    next.tables.avdelingsdata_raw = sheetMatrix(manualWorkbook, "Avdelingsdata");
  }

  return next;
}
