type ExportImageOptions = {
  filename: string;
  width?: number;
  height?: number;
  padding?: number;
};

type TableColumn = {
  key: string;
  header: string;
  width?: number;
};

type TableExportOptions = ExportImageOptions & {
  title: string;
  subtitle?: string;
  metadata?: Array<{ label: string; value: string }>;
  columns: TableColumn[];
  rows: Array<Record<string, unknown>>;
  rowClassNames?: string[];
  formatValue?: (columnKey: string, value: unknown) => string;
};

const powerpointWidth = 1920;
const powerpointHeight = 1080;
const defaultPadding = 56;
const tableRowsPerImage = 50;
const tableHeaderHeight = 34;
const minTableColumnWidth = 56;
const maxAutoTableColumnWidth = 320;

function cleanFileName(filename: string) {
  const normalized = filename.trim().replace(/[\\/:*?"<>|]+/g, "-");
  return normalized.toLocaleLowerCase("nb-NO").endsWith(".png") ? normalized : `${normalized}.png`;
}

function fileNamePart(filename: string, partNumber: number, partCount: number) {
  if (partCount <= 1) return filename;
  const clean = cleanFileName(filename);
  const suffix = ` - del ${String(partNumber).padStart(2, "0")} av ${String(partCount).padStart(2, "0")}`;
  return clean.replace(/\.png$/i, `${suffix}.png`);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = cleanFileName(filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function removeExcludedNodes(root: HTMLElement) {
  root.querySelectorAll("[data-png-exclude='true']").forEach((node) => node.remove());
}

function stylesheetText() {
  return Array.from(document.styleSheets)
    .map((stylesheet) => {
      try {
        return Array.from(stylesheet.cssRules)
          .map((rule) => rule.cssText)
          .join("\n");
      } catch {
        return "";
      }
    })
    .join("\n");
}

function imageFromDataUrl(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Kunne ikke lese PNG-bildet."));
    image.src = dataUrl;
  });
}

async function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Kunne ikke lage PNG-fil."));
    }, "image/png");
  });
}

async function sourceCanvasFromElement(element: HTMLElement) {
  await document.fonts?.ready;
  const rect = element.getBoundingClientRect();
  const width = Math.ceil(rect.width);
  const height = Math.ceil(rect.height);
  const clone = element.cloneNode(true) as HTMLElement;
  removeExcludedNodes(clone);
  clone.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
  clone.style.width = `${width}px`;
  clone.style.height = `${height}px`;
  clone.style.margin = "0";
  clone.style.background = "#ffffff";

  const serialized = new XMLSerializer().serializeToString(clone);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <foreignObject width="100%" height="100%">
        <div xmlns="http://www.w3.org/1999/xhtml">
          <style>${stylesheetText()}</style>
          ${serialized}
        </div>
      </foreignObject>
    </svg>
  `;
  const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const image = await imageFromDataUrl(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Kunne ikke lage canvas for PNG-eksport.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0);
  return canvas;
}

async function sourceCanvasFromDataUrl(dataUrl: string) {
  const image = await imageFromDataUrl(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Kunne ikke lage canvas for PNG-eksport.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0);
  return canvas;
}

async function exportSourceCanvas(source: HTMLCanvasElement, { filename, width = powerpointWidth, height = powerpointHeight, padding = defaultPadding }: ExportImageOptions) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Kunne ikke lage 16:9-canvas for PNG-eksport.");

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);

  const maxWidth = width - padding * 2;
  const maxHeight = height - padding * 2;
  const scale = Math.min(maxWidth / source.width, maxHeight / source.height);
  const drawWidth = Math.round(source.width * scale);
  const drawHeight = Math.round(source.height * scale);
  const x = Math.round((width - drawWidth) / 2);
  const y = Math.round((height - drawHeight) / 2);
  context.drawImage(source, x, y, drawWidth, drawHeight);

  downloadBlob(await canvasToBlob(canvas), filename);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function rowBackground(className: string | undefined, index: number) {
  if (className?.includes("missing-reference-path") || className?.includes("negative-deviation")) return "#fdecec";
  if (className?.includes("positive-deviation")) return "#eef8ef";
  return index % 2 === 1 ? "#f7fafc" : "#ffffff";
}

function drawClippedText(context: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, height: number) {
  context.save();
  context.beginPath();
  context.rect(x, y, width, height);
  context.clip();
  context.fillText(text, x + 8, y + height / 2);
  context.restore();
}

function tableColumnWidths({
  context,
  columns,
  rows,
  formatValue,
  maxTableWidth,
}: {
  context: CanvasRenderingContext2D;
  columns: TableColumn[];
  rows: Array<Record<string, unknown>>;
  formatValue: (columnKey: string, value: unknown) => string;
  maxTableWidth: number;
}) {
  const desiredWidths = columns.map((column) => {
    const maxWidth = column.width ?? maxAutoTableColumnWidth;
    const values = rows.slice(0, 500).map((row) => formatValue(column.key, row[column.key]));
    const measured = [column.header, ...values].reduce((max, value) => Math.max(max, context.measureText(value).width + 26), 0);
    return Math.min(maxWidth, clamp(measured, minTableColumnWidth, maxWidth));
  });
  const desiredTotalWidth = desiredWidths.reduce((sum, value) => sum + value, 0);
  if (desiredTotalWidth <= 0) return { columnWidths: [], tableWidth: 0 };
  if (desiredTotalWidth <= maxTableWidth) {
    return { columnWidths: desiredWidths, tableWidth: desiredTotalWidth };
  }
  const scale = maxTableWidth / desiredTotalWidth;
  return {
    columnWidths: desiredWidths.map((width) => width * scale),
    tableWidth: maxTableWidth,
  };
}

export async function exportTableToPng({
  filename,
  title,
  subtitle,
  metadata = [],
  columns,
  rows,
  rowClassNames = [],
  formatValue = (_columnKey, value) => String(value ?? ""),
  width = powerpointWidth,
  height = powerpointHeight,
  padding = defaultPadding,
}: TableExportOptions) {
  await document.fonts?.ready;

  const metadataLines = [
    subtitle,
    ...metadata.map((item) => `${item.label}: ${item.value || "Alle"}`),
  ].filter((line): line is string => Boolean(line));
  const top = padding;
  const bottom = height - padding;
  const titleHeight = 42 + metadataLines.length * 22 + 18;
  const tableTop = top + titleHeight;
  const rowsPerImage = tableRowsPerImage;
  const pageCount = Math.max(1, Math.ceil(rows.length / rowsPerImage));
  const pages = Array.from({ length: pageCount }, (_, pageIndex) => {
    const start = pageIndex * rowsPerImage;
    const pageRows = rows.slice(start, start + rowsPerImage);
    const pageRowClassNames = rowClassNames.slice(start, start + rowsPerImage);
    return {
      pageIndex,
      start,
      pageRows,
      pageRowClassNames,
    };
  });

  for (const page of pages) {
    await exportTablePageToPng({
      filename: fileNamePart(filename, page.pageIndex + 1, pageCount),
      title,
      subtitle: pageCount > 1 ? `${subtitle ?? `${rows.length.toLocaleString("nb-NO")} rader`} - del ${page.pageIndex + 1} av ${pageCount}` : subtitle,
      metadata,
      columns,
      rows: page.pageRows,
      rowClassNames: page.pageRowClassNames,
      widthRows: rows,
      rowOffset: page.start,
      formatValue,
      width,
      height,
      padding,
    });
  }
}

async function exportTablePageToPng({
  filename,
  title,
  subtitle,
  metadata = [],
  columns,
  rows,
  rowClassNames = [],
  widthRows = rows,
  rowOffset = 0,
  formatValue = (_columnKey, value) => String(value ?? ""),
  width = powerpointWidth,
  height = powerpointHeight,
  padding = defaultPadding,
}: TableExportOptions & { rowOffset?: number; widthRows?: Array<Record<string, unknown>> }) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Kunne ikke lage 16:9-canvas for PNG-eksport.");

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);

  const left = padding;
  const right = width - padding;
  const top = padding;
  const bottom = height - padding;
  const metadataLines = [
    subtitle,
    ...metadata.map((item) => `${item.label}: ${item.value || "Alle"}`),
  ].filter((line): line is string => Boolean(line));
  const titleHeight = 42 + metadataLines.length * 22 + 18;
  const tableTop = top + titleHeight;
  const maxTableWidth = right - left;
  const tableHeight = bottom - tableTop;
  const headerHeight = tableHeaderHeight;
  const rowHeight = rows.length === 0 ? 32 : Math.min(32, Math.max(1, (tableHeight - headerHeight) / rows.length));
  const cellFontSize = clamp(rowHeight * 0.46, 10, 15);
  const headerFontSize = clamp(Math.max(cellFontSize + 1, headerHeight * 0.42), 3, 15);

  context.textBaseline = "middle";
  context.fillStyle = "#18232b";
  context.font = "700 28px Inter, Arial, sans-serif";
  context.fillText(title, left, top + 16);
  context.font = "15px Inter, Arial, sans-serif";
  context.fillStyle = "#5d6d78";
  metadataLines.forEach((line, index) => {
    context.fillText(line, left, top + 48 + index * 22);
  });

  context.font = `${cellFontSize}px Inter, Arial, sans-serif`;
  const { columnWidths, tableWidth } = tableColumnWidths({
    context,
    columns,
    rows: widthRows,
    formatValue,
    maxTableWidth,
  });

  context.fillStyle = "#1f6f8b";
  context.fillRect(left, tableTop, tableWidth, headerHeight);
  context.strokeStyle = "#dce4ea";
  context.lineWidth = 1;
  context.font = `700 ${headerFontSize}px Inter, Arial, sans-serif`;
  context.fillStyle = "#ffffff";
  let x = left;
  columns.forEach((column, index) => {
    drawClippedText(context, column.header, x, tableTop, columnWidths[index], headerHeight);
    x += columnWidths[index];
  });

  context.font = `${cellFontSize}px Inter, Arial, sans-serif`;
  rows.forEach((row, rowIndex) => {
    const y = tableTop + headerHeight + rowIndex * rowHeight;
    context.fillStyle = rowBackground(rowClassNames[rowIndex], rowOffset + rowIndex);
    context.fillRect(left, y, tableWidth, rowHeight);
    context.fillStyle = "#18232b";
    x = left;
    columns.forEach((column, columnIndex) => {
      drawClippedText(context, formatValue(column.key, row[column.key]), x, y, columnWidths[columnIndex], rowHeight);
      x += columnWidths[columnIndex];
    });
  });

  context.strokeStyle = "#dce4ea";
  x = left;
  columnWidths.forEach((columnWidth) => {
    context.beginPath();
    context.moveTo(x, tableTop);
    context.lineTo(x, tableTop + headerHeight + rows.length * rowHeight);
    context.stroke();
    x += columnWidth;
  });
  context.strokeRect(left, tableTop, tableWidth, headerHeight + rows.length * rowHeight);

  downloadBlob(await canvasToBlob(canvas), filename);
}

export async function exportElementToPng(element: HTMLElement, options: ExportImageOptions) {
  await exportSourceCanvas(await sourceCanvasFromElement(element), options);
}

export async function exportImageDataUrlToPng(dataUrl: string, options: ExportImageOptions) {
  await exportSourceCanvas(await sourceCanvasFromDataUrl(dataUrl), options);
}

export function pngFilenameFromExportFilename(filename: string) {
  return cleanFileName(filename.replace(/\.[^.]+$/, ".png"));
}
