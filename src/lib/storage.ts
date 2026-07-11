import { normalizeRows } from "./columns";
import type { StoredBundle } from "./types";

export const STORAGE_KEY = "hr-lonn-webapp-datagrunnlag";

export function loadStoredBundle(): StoredBundle | null {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredBundle;
    if (parsed.version !== 2 || !parsed.tables) return null;
    const migrated = normalizeStoredBundle(parsed);
    if (JSON.stringify(migrated.tables) !== JSON.stringify(parsed.tables)) {
      saveStoredBundle(migrated);
    }
    return migrated;
  } catch {
    return null;
  }
}

export function saveStoredBundle(bundle: StoredBundle) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeStoredBundle(bundle)));
}

export function clearStoredBundle() {
  window.localStorage.removeItem(STORAGE_KEY);
}

function normalizeStoredBundle(bundle: StoredBundle): StoredBundle {
  return {
    ...bundle,
    tables: {
      sap_raw: normalizeRows(bundle.tables.sap_raw ?? []),
      referanselonn: normalizeRows(bundle.tables.referanselonn ?? []),
      org_tilordning: normalizeRows(bundle.tables.org_tilordning ?? []),
      medarbeiderdata: normalizeRows(bundle.tables.medarbeiderdata ?? []),
      avdelingsdata_raw: bundle.tables.avdelingsdata_raw ?? [],
      kpi: normalizeRows(bundle.tables.kpi ?? []),
    },
  };
}
