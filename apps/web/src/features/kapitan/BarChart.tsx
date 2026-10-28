/** A small accessible bar chart: the summary sentence is the accessible name, so the bars are decoration for screen readers. */
export function BarChart({ values, labels, summary }: { values: number[]; labels: string[]; summary: string }) {
  const max = Math.max(1, ...values);
  const width = 24;
  const gap = 6;
  const height = 120;
  return (
    <svg role="img" aria-label={summary} viewBox={`0 0 ${values.length * (width + gap)} ${height + 20}`} className="h-44 w-full">
      {values.map((v, i) => {
        const h = Math.round((v / max) * height);
        const x = i * (width + gap);
        return (
          <g key={i}>
            <rect x={x} y={height - h} width={width} height={h} rx={4} className="fill-accent" />
            <text x={x + width / 2} y={height + 14} textAnchor="middle" className="fill-muted text-[10px]">
              {labels[i]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
