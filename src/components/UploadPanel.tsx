import { FileSpreadsheet, RefreshCw, Trash2, UploadCloud } from "lucide-react";
import type { DragEvent } from "react";
import { useState } from "react";
import type { SourceInfo, UploadFilePatch, UploadFiles } from "../lib/types";

export function UploadPanel({
  onUpload,
  onFetchKpi,
  onClear,
  sources,
  busy,
  busyLabel,
  message,
}: {
  onUpload: (files: UploadFilePatch) => Promise<void>;
  onFetchKpi: (targetYear: number) => Promise<void>;
  onClear: () => void;
  sources: Record<string, SourceInfo> | null;
  busy: boolean;
  busyLabel?: string | null;
  message?: string | null;
}) {
  const [sap, setSap] = useState<File | null>(null);
  const [referanselonn, setReferanselonn] = useState<File | null>(null);
  const [manuell, setManuell] = useState<File | null>(null);
  const [kpiYear, setKpiYear] = useState(String(new Date().getFullYear()));
  const complete = sap && referanselonn && manuell;
  const hasStoredData = Boolean(sources);
  const parsedKpiYear = Number(kpiYear);
  const canFetchKpi = hasStoredData && Number.isInteger(parsedKpiYear) && parsedKpiYear >= 2000 && parsedKpiYear <= 2100;
  const isParsingFiles = busy && busyLabel === "Parser filer";
  const isFetchingKpi = busy && busyLabel === "Henter KPI-data";

  async function handleFile(kind: keyof UploadFiles, file: File | null) {
    if (kind === "sap") setSap(file);
    if (kind === "referanselonn") setReferanselonn(file);
    if (kind === "manuell") setManuell(file);
    if (hasStoredData && file) await onUpload({ [kind]: file });
  }

  return (
    <section className="upload-panel">
      <div className="upload-heading">
        <div>
          <p>Datagrunnlag</p>
          <h1>Last opp lønnsgrunnlaget</h1>
        </div>
        <button className="danger" onClick={onClear}>
          <Trash2 size={16} />
          Tøm lagret data
        </button>
      </div>
      <div className="upload-grid">
        <FileInput title="SAP-rådata" accept=".xlsx,.xls" file={sap} source={sources?.sap_raw} setFile={(file) => handleFile("sap", file)} />
        <FileInput title="Referanselønn" accept=".xlsx,.xls" file={referanselonn} source={sources?.referanselonn} setFile={(file) => handleFile("referanselonn", file)} />
        <FileInput title="Manuell input" accept=".xlsx,.xls" file={manuell} source={sources?.manuell_input} setFile={(file) => handleFile("manuell", file)} />
      </div>
      <button className="primary-action" disabled={!complete || busy} onClick={() => complete && onUpload({ sap, referanselonn, manuell })}>
        {isParsingFiles ? <RefreshCw size={18} className="spin" /> : <UploadCloud size={18} />}
        {isParsingFiles ? "Parser filer" : hasStoredData ? "Erstatt med alle valgte filer" : "Bruk disse filene"}
      </button>
      <div className="kpi-fetch">
        <label>
          <span>KPI målår</span>
          <input
            type="text"
            inputMode="numeric"
            value={kpiYear}
            onChange={(event) => setKpiYear(event.currentTarget.value)}
            placeholder="2026"
          />
        </label>
        <button className="secondary-action" disabled={!canFetchKpi || busy} onClick={() => onFetchKpi(parsedKpiYear)}>
          {isFetchingKpi ? <RefreshCw size={16} className="spin" /> : null}
          {isFetchingKpi ? "Henter KPI-data" : "Hent KPI-data"}
        </button>
      </div>
      {message ? <div className="success-box">{message}</div> : null}
      {sources ? (
        <div className="source-list">
          {Object.entries(sources).map(([key, source]) => (
            <div key={key}>
              <FileSpreadsheet size={18} />
              <span>{source.role}</span>
              <strong>{source.name}</strong>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function FileInput({
  title,
  accept,
  file,
  source,
  setFile,
}: {
  title: string;
  accept: string;
  file: File | null;
  source?: SourceInfo;
  setFile: (file: File | null) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const displayedName = file?.name ?? source?.name ?? "Velg eller dra inn fil";
  const acceptLabel = accept
    .split(",")
    .map((part) => part.trim().replace(".", "").toUpperCase())
    .join(" / ");

  function acceptsFile(candidate: File): boolean {
    return accept
      .split(",")
      .map((part) => part.trim().toLowerCase())
      .some((part) => candidate.name.toLowerCase().endsWith(part));
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    const droppedFile = event.dataTransfer.files?.[0] ?? null;
    if (!droppedFile) {
      setFile(null);
      return;
    }
    if (acceptsFile(droppedFile)) setFile(droppedFile);
  }

  return (
    <label
      className={`${file || source ? "file-card ready" : "file-card"}${dragging ? " drag-over" : ""}`}
      onDragEnter={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={handleDrop}
    >
      <span className="file-card-title">{title}</span>
      <strong>{displayedName}</strong>
      <span className="file-card-drop-hint">
        <UploadCloud size={18} />
        {dragging ? "Slipp filen her" : `Klikk eller slipp ${acceptLabel}`}
      </span>
      <input type="file" accept={accept} onChange={(event) => setFile(event.currentTarget.files?.[0] ?? null)} />
    </label>
  );
}
