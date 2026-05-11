import React, { useMemo } from "react";

function fmtCount(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return String(Math.round(x));
}

function fmtX(ts, xMode) {
  try {
    const d = new Date(ts);
    if (xMode === "date") {
      return d.toLocaleDateString([], { month: "short", day: "2-digit" });
    }
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export default function Sparkline({ points = [], height = 110, xMode = "time", accent }) {
  const ACCENT = accent || "var(--spark-accent, #E8486F)";

  const w = 320;
  const h = height;

  const padLeft = 34;
  const padRight = 10;
  const padTop = 10;
  const padBottom = 22;

  if (!points.length) {
    return <div style={{ width: "100%", height: h, opacity: 0.4, fontSize: 12 }}>—</div>;
  }

  const ys = points.map((p) => Number(p.value || 0)).filter(Number.isFinite);
  const yRawMax = Math.max(...ys, 0);
  const yLabelMax = Math.max(1, Math.ceil(yRawMax));

  const yMin = 0;
  const yMax = yLabelMax;

  const xMin = 0;
  const xMax = Math.max(1, points.length - 1);

  const xScale = (x) => padLeft + ((x - xMin) / (xMax - xMin)) * (w - padLeft - padRight);
  const yScale = (y) => {
    if (yMax === yMin) return (padTop + (h - padBottom)) / 2;
    return (h - padBottom) - ((y - yMin) / (yMax - yMin)) * (h - padTop - padBottom);
  };

  const d = points
    .map((p, i) => {
      const v = Number(p.value || 0);
      return `${i === 0 ? "M" : "L"} ${xScale(i).toFixed(2)} ${yScale(v).toFixed(2)}`;
    })
    .join(" ");

  const baselineY = yScale(0);
  const areaD = `${d} L ${xScale(points.length - 1).toFixed(2)} ${baselineY.toFixed(2)} L ${xScale(0).toFixed(
    2
  )} ${baselineY.toFixed(2)} Z`;

  const firstTs = points[0]?.ts;
  const lastTs = points[points.length - 1]?.ts;

  const lastX = xScale(points.length - 1);
  const lastY = yScale(points[points.length - 1]?.value);

  const grid = useMemo(() => [yMax, 0], [yMax]);

  return (
    <svg
      width="100%"
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      style={{ display: "block", maxWidth: "100%" }}
    >
      {grid.map((v, idx) => {
        const y = yScale(v);
        return (
          <g key={idx}>
            <line x1={padLeft} x2={w - padRight} y1={y} y2={y} stroke="#e5e7eb" strokeWidth="1" />
            <text x={padLeft - 8} y={y + 4} fontSize="10" textAnchor="end" fill="#6b7280">
              {fmtCount(v)}
            </text>
          </g>
        );
      })}

      <line x1={padLeft} x2={padLeft} y1={padTop} y2={h - padBottom} stroke="#9ca3af" strokeWidth="1" />
      <line x1={padLeft} x2={w - padRight} y1={h - padBottom} y2={h - padBottom} stroke="#9ca3af" strokeWidth="1" />

      <path d={areaD} fill={ACCENT} opacity="0.12" />
      <path d={d} fill="none" stroke={ACCENT} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastX} cy={lastY} r="3.5" fill={ACCENT} stroke="#ffffff" strokeWidth="2" />

      <text x={padLeft} y={h - 6} fontSize="10" textAnchor="start" fill="#6b7280">
        {fmtX(firstTs, xMode)}
      </text>
      <text x={w - padRight} y={h - 6} fontSize="10" textAnchor="end" fill="#6b7280">
        {fmtX(lastTs, xMode)}
      </text>
    </svg>
  );
}