import type { Sheet } from "@aicell/shared";
import { Chart } from "./Chart";

type Props = {
  sheet: Sheet;
  onRemove: (chartId: string) => void;
};

export function ChartStrip({ sheet, onRemove }: Props) {
  const charts = sheet.charts ?? [];
  if (charts.length === 0) return null;
  return (
    <div className="chart-strip">
      {charts.map((spec) => (
        <Chart
          key={spec.id}
          sheet={sheet}
          spec={spec}
          onRemove={() => onRemove(spec.id)}
        />
      ))}
    </div>
  );
}
