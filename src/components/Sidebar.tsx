import { BarChart3, Database, FileChartColumn, LayoutDashboard, PanelLeftClose, PanelLeftOpen, TrendingUp, Upload } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type Page = "datagrunnlag" | "oversikt" | "kildedata" | "lonn" | "lonnsniva" | "presentasjon";

const pages: Array<{ id: Page; label: string; icon: LucideIcon }> = [
  { id: "datagrunnlag", label: "Datagrunnlag", icon: Upload },
  { id: "kildedata", label: "Kildedata", icon: Database },
  { id: "oversikt", label: "Oversikt", icon: LayoutDashboard },
  { id: "lonn", label: "Lønnsutvikling", icon: TrendingUp },
  { id: "lonnsniva", label: "Lønnsnivå", icon: BarChart3 },
  { id: "presentasjon", label: "Presentasjon", icon: FileChartColumn },
];

export function Sidebar({
  page,
  setPage,
  status,
  collapsed,
  onToggleCollapsed,
}: {
  page: Page;
  setPage: (page: Page) => void;
  status: string;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  return (
    <aside className={collapsed ? "sidebar collapsed" : "sidebar"}>
      <div className="sidebar-top">
        <div className="brand" aria-hidden={collapsed}>
          <span>HR</span>
          <strong>lønn</strong>
        </div>
        <button className="sidebar-toggle" type="button" onClick={onToggleCollapsed} aria-label={collapsed ? "Vis venstremeny" : "Skjul venstremeny"} title={collapsed ? "Vis venstremeny" : "Skjul venstremeny"}>
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>
      <nav>
        {pages.map((item) => {
          const Icon = item.icon;
          return (
            <button className={page === item.id ? "active" : ""} onClick={() => setPage(item.id)} key={item.id} title={item.label} aria-label={item.label}>
              <Icon size={18} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
      <div className="status-line">{status}</div>
    </aside>
  );
}
