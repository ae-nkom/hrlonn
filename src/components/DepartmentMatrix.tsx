import { Download } from "lucide-react";
import { useMemo, useState } from "react";
import { asText } from "../lib/format";
import type { Row } from "../lib/types";
import { exportRowsToXlsx } from "../lib/xlsxExport";

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
  const departments = buildDepartmentColumns(rows);
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

  return (
    <section className="department-matrix-shell">
      <div className="table-toolbar">
        <div>
          <h2>Avdelingsdata</h2>
          <span>{departments.length.toLocaleString("nb-NO")} avdelinger</span>
        </div>
        {exportFilename ? (
          <button className="table-export-button" disabled={exporting} onClick={handleExport}>
            <Download size={16} />
            {exporting ? "Lager Excel" : "Eksporter Excel"}
          </button>
        ) : null}
      </div>
      <div className="department-matrix-scroll">
        <table className="department-matrix">
          <thead>
            <tr>
              {departments.map((department) => (
                <th key={department.name}>
                  <strong>{nameWithCode(department.name, department.code)}</strong>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {departments.map((department) => {
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
