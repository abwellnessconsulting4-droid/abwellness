import type { ReactNode } from "react";

/**
 * Server-rendered SVG charts (no client JS). Colors come from validated
 * palette roles (--viz-series-1/2, see resources/custom.css .viz-root), with
 * separate light and dark steps. Every chart has a per-mark tooltip (<title>,
 * also announced on keyboard focus) and a data table, so nothing relies on
 * color or hover alone.
 */

export interface Point {
  label: string;
  value: number;
}

type Format = (n: number) => string;

const WIDE = 640;
const NARROW = 380; // half-width charts: a narrower viewBox keeps text at a readable size
const H = 220;
const PAD = { top: 20, right: 12, bottom: 28, left: 52 };

function niceMax(max: number, integer = false) {
  if (integer && max <= 10) return Math.max(2, Math.ceil(max / 2) * 2); // whole-number midpoint for counts
  if (max <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(max));
  const f = max / exp;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * exp;
}

/** Rounded top corners only; the bar stays flat on the baseline. */
function barPath(x: number, y: number, w: number, h: number, r = 4) {
  if (h <= 0) return "";
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

function Frame({ title, caption, children, table }: { title: string; caption?: string; children: ReactNode; table: ReactNode }) {
  return (
    <figure className="viz-root viz-card">
      <figcaption>
        <span className="viz-title">{title}</span>
        {caption && <span className="viz-caption">{caption}</span>}
      </figcaption>
      {children}
      <details className="viz-table">
        <summary>Show data table</summary>
        {table}
      </details>
    </figure>
  );
}

function Axis({ max, format, plotH, W }: { max: number; format: Format; plotH: number; W: number }) {
  const ticks = [0, 0.5, 1].map((t) => t * max);
  return (
    <g className="viz-axis" aria-hidden="true">
      {ticks.map((t) => {
        const y = PAD.top + plotH - (t / max) * plotH;
        return (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} className="viz-grid" />
            <text x={PAD.left - 8} y={y + 4} textAnchor="end">{format(t)}</text>
          </g>
        );
      })}
    </g>
  );
}

/** Single-series columns (e.g. monthly volume). Direct labels on the latest and the peak only. */
export function ColumnChart({ title, caption, data, format = (n) => n.toLocaleString("en-US"), unit, narrow, integer = true }: { title: string; caption?: string; data: Point[]; format?: Format; unit?: string; narrow?: boolean; integer?: boolean }) {
  const W = narrow ? NARROW : WIDE;
  const max = niceMax(Math.max(...data.map((d) => d.value), 0), integer);
  const plotH = H - PAD.top - PAD.bottom;
  const slot = (W - PAD.left - PAD.right) / data.length;
  const barW = Math.min(28, slot * 0.6);
  const peak = data.reduce((best, d, i) => (d.value > data[best].value ? i : best), 0);
  return (
    <Frame
      title={title}
      caption={caption}
      table={
        <table className="data-table compact">
          <thead><tr><th scope="col">Month</th><th scope="col" className="num">{unit ?? "Value"}</th></tr></thead>
          <tbody>{data.map((d) => <tr key={d.label}><td>{d.label}</td><td className="num">{format(d.value)}</td></tr>)}</tbody>
        </table>
      }
    >
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}. ${data.map((d) => `${d.label}: ${format(d.value)}`).join(", ")}`} className="viz-svg">
        <Axis max={max} format={format} plotH={plotH} W={W} />
        {data.map((d, i) => {
          const h = (d.value / max) * plotH;
          const x = PAD.left + slot * i + (slot - barW) / 2;
          const y = PAD.top + plotH - h;
          const labelled = d.value > 0 && (i === data.length - 1 || i === peak);
          return (
            <g key={d.label} className="viz-mark" tabIndex={0} aria-label={`${d.label}: ${format(d.value)}`}>
              <title>{`${d.label}: ${format(d.value)}`}</title>
              <rect x={PAD.left + slot * i} y={PAD.top} width={slot} height={plotH} className="viz-hit" />
              <path d={barPath(x, y, barW, h)} className="viz-fill-1" />
              {labelled && <text x={x + barW / 2} y={y - 6} textAnchor="middle" className="viz-value">{format(d.value)}</text>}
              {(!narrow || i % 2 === (data.length - 1) % 2) && <text x={x + barW / 2} y={H - 8} textAnchor="middle" className="viz-label" aria-hidden="true">{d.label}</text>}
            </g>
          );
        })}
      </svg>
    </Frame>
  );
}

/** Two stacked series (e.g. insurance vs client payments) with a 2px surface gap and a legend. */
export function StackedColumnChart({
  title,
  caption,
  data,
  series,
  format,
}: {
  title: string;
  caption?: string;
  data: { label: string; a: number; b: number }[];
  series: [string, string];
  format: Format;
}) {
  const W = WIDE;
  const max = niceMax(Math.max(...data.map((d) => d.a + d.b), 0));
  const plotH = H - PAD.top - PAD.bottom;
  const slot = (W - PAD.left - PAD.right) / data.length;
  const barW = Math.min(28, slot * 0.6);
  return (
    <Frame
      title={title}
      caption={caption}
      table={
        <table className="data-table compact">
          <thead><tr><th scope="col">Month</th><th scope="col" className="num">{series[0]}</th><th scope="col" className="num">{series[1]}</th><th scope="col" className="num">Total</th></tr></thead>
          <tbody>{data.map((d) => <tr key={d.label}><td>{d.label}</td><td className="num">{format(d.a)}</td><td className="num">{format(d.b)}</td><td className="num">{format(d.a + d.b)}</td></tr>)}</tbody>
        </table>
      }
    >
      <ul className="viz-legend">
        <li><span className="viz-swatch viz-fill-1" aria-hidden="true" />{series[0]}</li>
        <li><span className="viz-swatch viz-fill-2" aria-hidden="true" />{series[1]}</li>
      </ul>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}. ${data.map((d) => `${d.label}: ${series[0]} ${format(d.a)}, ${series[1]} ${format(d.b)}`).join("; ")}`} className="viz-svg">
        <Axis max={max} format={format} plotH={plotH} W={W} />
        {data.map((d, i) => {
          const ha = (d.a / max) * plotH;
          const hb = (d.b / max) * plotH;
          const x = PAD.left + slot * i + (slot - barW) / 2;
          const base = PAD.top + plotH;
          const gap = ha > 0 && hb > 0 ? 2 : 0;
          const tip = `${d.label}: ${series[0]} ${format(d.a)}, ${series[1]} ${format(d.b)}, total ${format(d.a + d.b)}`;
          return (
            <g key={d.label} className="viz-mark" tabIndex={0} aria-label={tip}>
              <title>{tip}</title>
              <rect x={PAD.left + slot * i} y={PAD.top} width={slot} height={plotH} className="viz-hit" />
              {/* Bottom segment is flat; only the top of the stack is rounded. */}
              {ha > 0 && (hb > 0 ? <rect x={x} y={base - ha} width={barW} height={ha} className="viz-fill-1" /> : <path d={barPath(x, base - ha, barW, ha)} className="viz-fill-1" />)}
              {hb > 0 && <path d={barPath(x, base - ha - gap - hb, barW, hb)} className="viz-fill-2" />}
              {i === data.length - 1 && d.a + d.b > 0 && <text x={x + barW / 2} y={base - ha - gap - hb - 6} textAnchor="middle" className="viz-value">{format(d.a + d.b)}</text>}
              <text x={x + barW / 2} y={H - 8} textAnchor="middle" className="viz-label" aria-hidden="true">{d.label}</text>
            </g>
          );
        })}
      </svg>
    </Frame>
  );
}

/** Horizontal bars for categories (one series), values printed at the end of each bar. */
export function BarList({ title, caption, data, format = (n) => n.toLocaleString("en-US"), max: fixedMax }: { title: string; caption?: string; data: Point[]; format?: Format; max?: number }) {
  const max = fixedMax ?? Math.max(...data.map((d) => d.value), 0);
  return (
    <Frame
      title={title}
      caption={caption}
      table={
        <table className="data-table compact">
          <tbody>{data.map((d) => <tr key={d.label}><td>{d.label}</td><td className="num">{format(d.value)}</td></tr>)}</tbody>
        </table>
      }
    >
      {data.length === 0 ? (
        <p className="viz-empty">No data yet.</p>
      ) : (
        <ul className="viz-bars">
          {data.map((d) => (
            <li key={d.label} className="viz-mark" tabIndex={0} title={`${d.label}: ${format(d.value)}`}>
              <span className="viz-bar-label">{d.label}</span>
              <span className="viz-bar-track" aria-hidden="true">
                <span className="viz-bar-fill viz-fill-1" style={{ width: `${max > 0 ? Math.max(d.value > 0 ? 2 : 0, (d.value / max) * 100) : 0}%` }} />
              </span>
              <span className="viz-bar-value">{format(d.value)}</span>
            </li>
          ))}
        </ul>
      )}
    </Frame>
  );
}

/** Hero number tile (no plot). */
export function StatTile({ label, value, hint, attention }: { label: string; value: string; hint?: string; attention?: boolean }) {
  return (
    <div className={`viz-stat${attention ? " is-attention" : ""}`}>
      <span className="viz-stat-label">{label}</span>
      <span className="viz-stat-value stat-value">{value}</span>
      {hint && <span className="viz-stat-hint">{hint}</span>}
    </div>
  );
}
