export type PriceHistoryPoint = {
  date: string;
  minPriceCadCents: number;
};

function formatCad(cents: number) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(
    cents / 100
  );
}

export function PriceHistoryChart({ points }: { points: PriceHistoryPoint[] }) {
  if (points.length === 0) {
    return (
      <p className="muted chartEmpty">
        No price snapshots in the last six months for this filter (scrapes add history over time).
      </p>
    );
  }

  const w = 720;
  const h = 220;
  const padL = 52;
  const padR = 16;
  const padT = 12;
  const padB = 36;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;

  const times = points.map((p) => new Date(`${p.date}T12:00:00Z`).getTime());
  const prices = points.map((p) => p.minPriceCadCents);
  const t0 = times[0]!;
  const t1 = times[times.length - 1]!;
  const pMin = Math.min(...prices);
  const pMax = Math.max(...prices);
  const ySpan = Math.max(pMax - pMin, 1);
  const yPad = Math.max(Math.round(ySpan * 0.08), 50);
  const yLo = pMin - yPad;
  const yHi = pMax + yPad;

  const xAt = (t: number) =>
    t1 === t0 ? padL + innerW / 2 : padL + ((t - t0) / (t1 - t0)) * innerW;
  const yAt = (cents: number) => padT + innerH - ((cents - yLo) / (yHi - yLo)) * innerH;

  const lineD = points
    .map((p, i) => {
      const x = xAt(times[i]!);
      const y = yAt(p.minPriceCadCents);
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  const first = points[0]!.date;
  const mid = points[Math.floor(points.length / 2)]!.date;
  const last = points[points.length - 1]!.date;

  return (
    <div className="chartWrap">
      <div className="chartTitle">Lowest price by day (last 6 months)</div>
      <svg className="chartSvg" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Price history chart">
        <line
          x1={padL}
          y1={padT}
          x2={padL}
          y2={padT + innerH}
          className="chartAxis"
        />
        <line
          x1={padL}
          y1={padT + innerH}
          x2={padL + innerW}
          y2={padT + innerH}
          className="chartAxis"
        />
        <text x={padL - 4} y={padT + 4} className="chartAxisLabel" textAnchor="end">
          {formatCad(yHi)}
        </text>
        <text x={padL - 4} y={padT + innerH} className="chartAxisLabel" textAnchor="end">
          {formatCad(yLo)}
        </text>
        <path d={lineD} className="chartLine" fill="none" />
        {points.map((p, i) => (
          <circle
            key={`${p.date}-${i}`}
            cx={xAt(times[i]!)}
            cy={yAt(p.minPriceCadCents)}
            r={3.5}
            className="chartDot"
          >
            <title>{`${p.date}: ${formatCad(p.minPriceCadCents)}`}</title>
          </circle>
        ))}
        <text x={padL} y={h - 8} className="chartAxisLabel">
          {first}
        </text>
        <text x={padL + innerW / 2} y={h - 8} className="chartAxisLabel" textAnchor="middle">
          {mid}
        </text>
        <text x={padL + innerW} y={h - 8} className="chartAxisLabel" textAnchor="end">
          {last}
        </text>
      </svg>
    </div>
  );
}
