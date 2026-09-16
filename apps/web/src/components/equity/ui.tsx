import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  Columns3,
  Download,
  Filter,
  Search,
  X,
} from "lucide-react";

export type Row = { key: string; [key: string]: unknown };
export type Column<T> = {
  key: string;
  label: string;
  value: (row: T) => string | number | null;
  render?: (row: T) => ReactNode;
  hidden?: boolean;
};
export function downloadText(name: string, content: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
export function csvCell(value: unknown) {
  const s = String(value ?? "");
  return '"' + (/^[=+@\-\t\r]/.test(s) ? "'" : "") + s.replace(/"/g, '""') + '"';
}
export function DataTable<T extends { key: string }>({
  columns,
  rows,
  filename = "capy-export",
  searchable = true,
  initialSearch = "",
  pageSize = 10,
  emptyDescription,
  loading = false,
}: {
  columns: Column<T>[];
  rows: T[];
  filename?: string;
  searchable?: boolean;
  initialSearch?: string;
  pageSize?: number;
  emptyDescription?: ReactNode;
  loading?: boolean;
}) {
  const [search, setSearch] = useState(initialSearch);
  const [sort, setSort] = useState<{ key: string; direction: number } | null>(null);
  const [hidden, setHidden] = useState<string[]>(columns.filter((c) => c.hidden).map((c) => c.key));
  const [menu, setMenu] = useState("");
  const [filterKey, setFilterKey] = useState("");
  const [filterValue, setFilterValue] = useState("");
  const [page, setPage] = useState(0);
  const shown = columns.filter((c) => !hidden.includes(c.key));
  const selected = columns.find((c) => c.key === filterKey);
  const filtered = useMemo(
    () =>
      rows
        .filter(
          (row) =>
            (!search ||
              columns.some((c) =>
                String(c.value(row) ?? "")
                  .toLowerCase()
                  .includes(search.toLowerCase()),
              )) &&
            (!selected || !filterValue || String(selected.value(row) ?? "") === filterValue),
        )
        .sort((a, b) => {
          const col = columns.find((c) => c.key === sort?.key);
          if (!col || !sort) return 0;
          return (
            String(col.value(a) ?? "").localeCompare(String(col.value(b) ?? ""), undefined, {
              numeric: true,
            }) * sort.direction
          );
        }),
    [rows, columns, search, sort, selected, filterValue],
  );
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pages - 1);
  const visible = filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  return (
    <>
      {searchable && (
        <div className="eq-toolbar">
          <label className="eq-search">
            <Search size={14} />
            <input
              aria-label="Search table"
              placeholder="Search..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
            />
          </label>
          <div className="eq-menu-wrap">
            <button
              className="eq-button"
              onClick={() => setMenu(menu === "filters" ? "" : "filters")}
            >
              <Filter size={13} />
              Filters{filterValue && <span className="eq-dot" />}
            </button>
            {menu === "filters" && (
              <div className="eq-popover">
                <label>
                  Column
                  <select
                    value={filterKey}
                    onChange={(e) => {
                      setFilterKey(e.target.value);
                      setFilterValue("");
                    }}
                  >
                    <option value="">All columns</option>
                    {columns.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Value
                  <select value={filterValue} onChange={(e) => setFilterValue(e.target.value)}>
                    <option value="">All values</option>
                    {selected &&
                      [...new Set(rows.map((r) => String(selected.value(r) ?? "")))]
                        .filter(Boolean)
                        .sort()
                        .map((v) => <option key={v}>{v}</option>)}
                  </select>
                </label>
                <button
                  onClick={() => {
                    setFilterKey("");
                    setFilterValue("");
                    setMenu("");
                  }}
                >
                  Clear filters
                </button>
              </div>
            )}
          </div>
          <div className="eq-menu-wrap">
            <button
              className="eq-button"
              onClick={() => setMenu(menu === "columns" ? "" : "columns")}
            >
              <Columns3 size={13} />
              Columns
            </button>
            {menu === "columns" && (
              <div className="eq-popover">
                {columns.map((c) => (
                  <label className="eq-check" key={c.key}>
                    <input
                      type="checkbox"
                      checked={!hidden.includes(c.key)}
                      onChange={() =>
                        setHidden(
                          hidden.includes(c.key)
                            ? hidden.filter((k) => k !== c.key)
                            : [...hidden, c.key],
                        )
                      }
                    />
                    {c.label}
                  </label>
                ))}
              </div>
            )}
          </div>
          <button
            className="eq-button eq-icon-button"
            aria-label="Export table as CSV"
            onClick={() =>
              downloadText(
                filename + ".csv",
                [
                  shown.map((c) => csvCell(c.label)).join(","),
                  ...filtered.map((r) => shown.map((c) => csvCell(c.value(r))).join(",")),
                ].join("\r\n"),
                "text/csv;charset=utf-8",
              )
            }
          >
            <Download size={14} />
          </button>
        </div>
      )}
      <div className="eq-table-scroll">
        <table className="eq-table">
          <thead>
            <tr>
              {shown.map((c) => (
                <th key={c.key}>
                  <button
                    onClick={() =>
                      setSort({ key: c.key, direction: sort?.key === c.key ? -sort.direction : 1 })
                    }
                  >
                    {c.label}
                    {sort?.key === c.key ? (
                      sort.direction === 1 ? (
                        <ArrowUp size={10} />
                      ) : (
                        <ArrowDown size={10} />
                      )
                    ) : (
                      <ChevronDown size={9} />
                    )}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.key}>
                {shown.map((c) => (
                  <td key={c.key}>{c.render ? c.render(row) : String(c.value(row) ?? "—")}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length === 0 && (
        <div className="eq-empty-row" role="status">
          {loading ? (
            "Loading records…"
          ) : search || filterValue ? (
            "No matching records."
          ) : (
            <>
              <div>No records yet.</div>
              {emptyDescription}
            </>
          )}
        </div>
      )}
      {searchable && (
        <div className="eq-table-footer">
          {filtered.length} {filtered.length === 1 ? "record" : "records"}
          {pages > 1 && (
            <div className="eq-actions">
              <button
                className="eq-button"
                disabled={currentPage === 0}
                onClick={() => setPage(currentPage - 1)}
              >
                Previous
              </button>
              <span>
                Page {currentPage + 1} of {pages}
              </span>
              <button
                className="eq-button"
                disabled={currentPage === pages - 1}
                onClick={() => setPage(currentPage + 1)}
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <div
      className="eq-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`eq-modal ${wide ? "eq-modal-wide" : ""}`}
      >
        <header>
          <h2>{title}</h2>
          <button aria-label="Close" onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
export function Empty({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="eq-empty">
      <div className="eq-empty-icon">
        <Check size={28} />
      </div>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {children}
    </div>
  );
}
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="eq-field">
      <span>{label}</span>
      {children}
    </label>
  );
}
