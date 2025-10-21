import type { ReactNode } from "react";

type TrendListItem = {
  name: string;
  count?: number;
  meta?: string;
};

type TrendListProps = {
  title: string;
  rows: TrendListItem[];
  emptyLabel: string;
  symbolPrefix?: ReactNode;
};

function formatCount(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "—";
  }
  return `${Math.round(value * 100)}%`;
}

export default function TrendList({ title, rows, emptyLabel, symbolPrefix }: TrendListProps) {
  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-slate-200">{title}</h4>
      {rows.length > 0 ? (
        <ul className="space-y-2 text-sm text-slate-300">
          {rows.map((row) => (
            <li
              key={row.name}
              className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/40 px-3 py-2"
            >
              <span className="truncate text-slate-200">
                {symbolPrefix ? <span className="mr-2 inline-flex items-center">{symbolPrefix}</span> : null}
                {row.name}
              </span>
              <span className="text-xs text-slate-500">
                {row.meta ?? formatCount(row.count)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/30 px-3 py-4 text-xs text-slate-500">
          {emptyLabel}
        </div>
      )}
    </div>
  );
}
