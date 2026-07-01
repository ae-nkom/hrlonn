import { BarChart3, Database, FileChartColumn, LayoutDashboard, TrendingUp, Upload } from "lucide-react";
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
}: {
  page: Page;
  setPage: (page: Page) => void;
  status: string;
}) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <span>HR</span>
        <strong>lønn</strong>
      </div>
      <nav>
        {pages.map((item) => {
          const Icon = item.icon;
          return (
            <button className={page === item.id ? "active" : ""} onClick={() => setPage(item.id)} key={item.id}>
              <Icon size={18} />
              {item.label}
            </button>
          );
        })}
      </nav>
      <div className="status-line">{status}</div>
    </aside>
  );
}
