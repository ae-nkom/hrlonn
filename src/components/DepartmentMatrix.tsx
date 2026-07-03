import { Columns3, Download, Eye, EyeOff } from "lucide-react";
import { useMemo, useState } from "react";
import { asText } from "../lib/format";
import { exportTableToPng, pngFilenameFromExportFilename } from "../lib/pngExport";
import type { Row } from "../lib/types";
import { exportRowsToXlsx } from "../lib/xlsxExport";
import { PngExportButton } from "./PngExportButton";

const departmentPairs: Array<[number, number]> = [
  [0, 1],
  [2, 3],
  [4, 5],
  [6, 7],
  [8, 9],
  [10, 11],
];

function cell(row: Row | undefined, index: number): string {
  return asText(row?.[`Kolonne ${index + 1}`]);
}

function buildDepartmentColumns(rows: Row[]) {
  const departmentRow = rows[2];
  return departmentPairs
    .map(([nameIndex, codeIndex]) => ({
      name: cell(departmentRow, nameIndex),
      code: cell(departmentRow, codeIndex),
      nameIndex,
      codeIndex,
    }))
    .filter((department) => department.name);
}

function nameWithCode(name: string, code: string) {
  return code ? `${name} (${code})` : name;
}

export function DepartmentMatrix({ rows, exportFilename }: { rows: Row[]; exportFilename?: string }) {
  const [exporting, setExporting] = useState(false);
  const [hiddenColumnKeys, setHiddenColumnKeys] = useState<string[]>([]);
  const departments = buildDepartmentColumns(rows);
  const visibleDepartments = departments.filter((department) => !hiddenColumnKeys.includes(department.name));
  const hiddenDepartments = departments.filter((department) => hiddenColumnKeys.includes(department.name));
  const sectionRows = rows.slice(3);
  const visibleRows = sectionRows.filter((row) =>
    departments.some((department) => cell(row, department.nameIndex) || cell(row, department.codeIndex)),
  );
  const exportColumns = useMemo(
    () =>
      departments.map((department, index) => ({
        key: `department_${index}`,
        header: nameWithCode(department.name, department.code),
      })),
    [departments],
  );
  const exportRows = useMemo(
    () =>
      visibleRows.map((row) =>
        Object.fromEntries(
          departments.map((department, index) => [
            `department_${index}`,
            nameWithCode(cell(row, department.nameIndex), cell(row, department.codeIndex)),
          ]),
        ),
      ),
    [departments, visibleRows],
  );
  const pngColumns = useMemo(
    () =>
      visibleDepartments.map((department, index) => ({
        key: `department_${index}`,
        header: nameWithCode(department.name, department.code),
      })),
    [visibleDepartments],
  );
  const pngRows = useMemo(
    () =>
      visibleRows.map((row) =>
        Object.fromEntries(
          visibleDepartments.map((department, index) => [
            `department_${index}`,
            nameWithCode(cell(row, department.nameIndex), cell(row, department.codeIndex)),
          ]),
        ),
      ),
    [visibleDepartments, visibleRows],
  );

  async function handleExport() {
    if (!exportFilename) return;
    setExporting(true);
    try {
      await exportRowsToXlsx({
        rows: exportRows,
        columns: exportColumns,
        title: "Avdelingsdata",
        filename: exportFilename,
        sheetName: "Avdelingsdata",
      });
    } finally {
      setExporting(false);
    }
  }

  async function handlePngExport() {
    if (!exportFilename) return;
    await exportTableToPng({
      rows: pngRows,
      columns: pngColumns,
      title: "Avdelingsdata",
      subtitle: `${departments.length.toLocaleString("nb-NO")} avdelinger`,
      filename: pngFilenameFromExportFilename(exportFilename),
    });
  }

  function hideColumn(columnName: string) {
    if (visibleDepartments.length <= 1) return;
    setHiddenColumnKeys((current) => (current.includes(columnName) ? current : [...current, columnName]));
  }

  return (
    <section className="department-matrix-shell">
      <div className="table-toolbar">
        <div>
          <h2>Avdelingsdata</h2>
          <span>{departments.length.toLocaleString("nb-NO")} avdelinger</span>
        </div>
        <div className="table-actions" data-png-exclude="true">
          <details className="column-menu">
            <summary aria-label="Vis eller skjul kolonner" title="Vis eller skjul kolonner">
              <Columns3 size={16} />
              {hiddenDepartments.length > 0 ? <span>{hiddenDepartments.length}</span> : null}
            </summary>
            <div className="column-menu-panel">
              <strong>Skjulte kolonner</strong>
              {hiddenDepartments.length === 0 ? <p>Alle kolonner vises</p> : null}
              {hiddenDepartments.map((department) => (
                <button type="button" onClick={() => setHiddenColumnKeys((current) => current.filter((name) => name !== department.name))} key={department.name}>
                  <Eye size={15} />
                  {nameWithCode(department.name, department.code)}
                </button>
              ))}
              {hiddenDepartments.length > 0 ? (
                <button type="button" className="show-all-columns" onClick={() => setHiddenColumnKeys([])}>
                  Vis alle kolonner
                </button>
              ) : null}
            </div>
          </details>
          {exportFilename ? (
            <>
            <button className="table-export-button" disabled={exporting} onClick={handleExport} aria-label={exporting ? "Lager Excel" : "Eksporter Excel"} title="Eksporter Excel">
              <Download size={16} />
            </button>
            <PngExportButton className="table-export-button" filename={pngFilenameFromExportFilename(exportFilename)} onExport={handlePngExport} />
            </>
          ) : null}
        </div>
      </div>
      <div className="department-matrix-scroll">
        <table className="department-matrix">
          <thead>
            <tr>
              {visibleDepartments.map((department) => (
                <th key={department.name}>
                  <span className="column-header-label">
                    <strong>{nameWithCode(department.name, department.code)}</strong>
                    <button
                      className="column-hide-button"
                      type="button"
                      title="Skjul kolonne"
                      aria-label={`Skjul ${nameWithCode(department.name, department.code)}`}
                      disabled={visibleDepartments.length <= 1}
                      onClick={() => hideColumn(department.name)}
                    >
                      <EyeOff size={14} />
                    </button>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {visibleDepartments.map((department) => {
                  const section = cell(row, department.nameIndex);
                  const code = cell(row, department.codeIndex);
                  return (
                    <td key={department.name}>
                      {section ? (
                        <strong>{nameWithCode(section, code)}</strong>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
