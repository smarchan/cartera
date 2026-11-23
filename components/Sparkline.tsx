"use client";
import { useMemo } from "react";

/**
 * Tiny SVG line of the last session. The faint dashed line is the previous close;
 * color follows the day's sign (green/red when colorPnl, light/grey otherwise).
 */
export default function Sparkline({
  points,
  prevClose,
  live,
  colorPnl,
  width = 96,
  height = 28,
  label,
}: {
  points: [number, number][];
  prevClose: number;
  live?: number;
  colorPnl: boolean;
  width?: number;
  height?: number;
  label: string;
}) {
  const geo = useMemo(() => {
    const pts = points.slice();
    if (live != null && pts.length) pts.push([pts[pts.length - 1][0] + 1, live]);
    if (pts.length < 2) return null;
    const vals = pts.map((p) => p[1]).concat(prevClose || []);
    let lo = Math.min(...vals);
    let hi = Math.max(...vals);
    if (hi - lo < 1e-9) {
      hi += 1;
      lo -= 1;
    }
    const t0 = pts[0][0];
    const t1 = pts[pts.length - 1][0];
    const x = (t: number) => 1 + ((t - t0) / Math.max(t1 - t0, 1)) * (width - 2);
    const y = (v: number) => 2 + (1 - (v - lo) / (hi - lo)) * (height - 4);
    const d = pts.map((p, i) => `${i ? "L" : "M"}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join("");
    const last = pts[pts.length - 1];
    const up = last[1] >= (prevClose || pts[0][1]);
    return { d, base: prevClose ? y(prevClose) : null, ex: x(last[0]), ey: y(last[1]), up };
  }, [points, prevClose, live, width, height]);

  if (!geo) return <span className="spark-empty" style={{ width, height }} aria-hidden="true" />;
  const color = colorPnl ? (geo.up ? "#6cc495" : "#e07c7c") : geo.up ? "#f2f2f3" : "#8e8e96";
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} className="spark">
      {geo.base != null && <line x1={0} x2={width} y1={geo.base} y2={geo.base} stroke="#3a3a40" strokeDasharray="2 3" strokeWidth={1} />}
      <path d={geo.d} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={geo.ex} cy={geo.ey} r={2.5} fill={color} />
    </svg>
  );
}
