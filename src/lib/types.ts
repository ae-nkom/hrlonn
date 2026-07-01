export type Row = Record<string, unknown>;

export type TableName =
  | "sap_raw"
  | "referanselonn"
  | "org_tilordning"
  | "medarbeiderdata"
  | "avdelingsdata_raw"
  | "kpi";

export type SourceInfo = {
  name: string;
  role: string;
  size: number;
};

export type StoredBundle = {
  version: 1;
  createdAt: string;
  sources: Record<string, SourceInfo>;
  tables: Record<TableName, Row[]>;
};

export type UploadFiles = {
  sap: File;
  referanselonn: File;
  manuell: File;
};

export type UploadFilePatch = Partial<UploadFiles>;

export type Filters = {
  Avdeling: string[];
  Seksjon: string[];
  Tariff: string[];
  Fagforening: string[];
};

export type Metric = {
  label: string;
  value: string;
  tone?: "blue" | "green" | "orange" | "neutral";
};

export type AppModel = {
  main: Row[];
  analysis: Row[];
  kpi: Row[];
};

export type ReportDefinition = {
  id: string;
  title: string;
  rows: Row[];
};
