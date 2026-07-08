import { CircleHelp } from "lucide-react";

export function HelpPopover({ title, children }: { title: string; children: string }) {
  return (
    <details className="help-popover" data-png-exclude="true" data-zoom-ignore>
      <summary aria-label={`Forklaring: ${title}`} title={`Forklaring: ${title}`}>
        <CircleHelp size={16} />
      </summary>
      <div className="help-popover-panel">
        <strong>{title}</strong>
        <p>{children}</p>
      </div>
    </details>
  );
}
