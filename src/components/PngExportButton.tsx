import { Image as ImageIcon } from "lucide-react";
import { type RefObject, useState } from "react";
import { exportElementToPng, exportImageDataUrlToPng } from "../lib/pngExport";

type Props = {
  filename: string;
  className: string;
  label?: string;
  targetRef?: RefObject<HTMLElement>;
  getImageDataUrl?: () => string | null | undefined;
  onExport?: () => Promise<void>;
};

export function PngExportButton({ filename, className, label = "Eksporter PNG", targetRef, getImageDataUrl, onExport }: Props) {
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    const target = targetRef?.current;
    const imageDataUrl = getImageDataUrl?.();
    if (!target && !imageDataUrl && !onExport) return;

    setExporting(true);
    try {
      if (onExport) await onExport();
      else if (imageDataUrl) await exportImageDataUrlToPng(imageDataUrl, { filename });
      else if (target) await exportElementToPng(target, { filename });
    } finally {
      setExporting(false);
    }
  }

  return (
    <button className={className} type="button" disabled={exporting} onClick={handleExport} aria-label={exporting ? "Lager PNG" : label} title={label} data-png-exclude="true">
      <ImageIcon size={16} />
    </button>
  );
}
