import type { ReactNode } from 'react';

export function Card({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 rounded-sm border border-line bg-surface ${className}`}>
      <h3 className="border-b border-line px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-2">{title}</h3>
      <div className="p-3 text-[12px]">{children}</div>
    </div>
  );
}

export function Row({ k, v, sub }: { k: ReactNode; v: ReactNode; sub?: ReactNode }) {
  return (
    <tr className="border-b border-line/60 last:border-0">
      <td className="py-1 pr-3 text-ink-2">{k}</td>
      <td className="tabular py-1 text-right font-mono text-ink">{v}</td>
      {sub !== undefined ? <td className="tabular py-1 pl-3 text-right font-mono text-muted">{sub}</td> : null}
    </tr>
  );
}

export function Warn({ children }: { children: ReactNode }) {
  return <p className="mt-2 rounded-sm border border-line border-l-2 border-l-s4 bg-panel px-2 py-1 text-[11.5px] text-ink-2">{children}</p>;
}
