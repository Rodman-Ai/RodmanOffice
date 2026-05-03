import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell as PieCell,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import type { Sheet, ChartSpec } from "@aicell/shared";
import { cellKey } from "@aicell/shared";

const COLORS = ["#2563eb", "#16a34a", "#dc2626", "#ca8a04", "#9333ea", "#0891b2"];

type Row = Record<string, string | number>;

function colNumberFromLetters(s: string): number {
  let n = 0;
  for (const ch of s) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function parseRange(range: string): {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
} | null {
  const m = range.trim().match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
  if (!m) return null;
  return {
    startCol: colNumberFromLetters(m[1]!),
    startRow: Number(m[2]) - 1,
    endCol: colNumberFromLetters(m[3]!),
    endRow: Number(m[4]) - 1,
  };
}

function extractData(
  sheet: Sheet,
  range: string
): { rows: Row[]; numericKeys: string[]; labelKey: string } | null {
  const r = parseRange(range);
  if (!r) return null;
  const rows: Row[] = [];
  // First row is treated as headers
  const headers: string[] = [];
  for (let c = r.startCol; c <= r.endCol; c++) {
    const raw = sheet.cells[cellKey(r.startRow, c)]?.raw ?? "";
    headers.push(raw || `col${c}`);
  }
  const labelKey = headers[0] ?? "label";
  const numericKeys: string[] = [];
  for (let i = 1; i < headers.length; i++) numericKeys.push(headers[i]!);

  for (let row = r.startRow + 1; row <= r.endRow; row++) {
    const obj: Row = {};
    obj[labelKey] = sheet.cells[cellKey(row, r.startCol)]?.raw ?? `row${row}`;
    let any = false;
    for (let c = r.startCol + 1; c <= r.endCol; c++) {
      const raw = sheet.cells[cellKey(row, c)]?.raw ?? "";
      const n = Number(raw);
      const header = headers[c - r.startCol]!;
      if (Number.isFinite(n) && raw.trim() !== "") {
        obj[header] = n;
        any = true;
      } else {
        obj[header] = raw;
      }
    }
    if (any) rows.push(obj);
  }
  return { rows, numericKeys, labelKey };
}

type Props = {
  sheet: Sheet;
  spec: ChartSpec;
  onRemove?: () => void;
};

export function Chart({ sheet, spec, onRemove }: Props) {
  const data = extractData(sheet, spec.range);
  if (!data || data.rows.length === 0) {
    return (
      <div className="chart-card chart-empty">
        <div className="chart-card-header">
          <span className="chart-card-title">{spec.title}</span>
          {onRemove && (
            <button onClick={onRemove} aria-label="Remove chart">
              ×
            </button>
          )}
        </div>
        <div className="chart-card-empty">
          No numeric data found in range <code>{spec.range}</code>
        </div>
      </div>
    );
  }
  const { rows, numericKeys, labelKey } = data;

  return (
    <div className="chart-card">
      <div className="chart-card-header">
        <span className="chart-card-title">
          {spec.title}
          <span className="chart-card-meta"> · {spec.type} · {spec.range}</span>
        </span>
        {onRemove && (
          <button onClick={onRemove} aria-label="Remove chart">
            ×
          </button>
        )}
      </div>
      <div className="chart-card-body">
        <ResponsiveContainer width="100%" height={180}>
          {renderChart(spec.type, rows, numericKeys, labelKey)}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function renderChart(
  type: ChartSpec["type"],
  data: Row[],
  numericKeys: string[],
  labelKey: string
) {
  if (type === "bar") {
    return (
      <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey={labelKey} fontSize={11} />
        <YAxis fontSize={11} />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {numericKeys.map((k, i) => (
          <Bar key={k} dataKey={k} fill={COLORS[i % COLORS.length]} />
        ))}
      </BarChart>
    );
  }
  if (type === "line") {
    return (
      <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey={labelKey} fontSize={11} />
        <YAxis fontSize={11} />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {numericKeys.map((k, i) => (
          <Line
            key={k}
            type="monotone"
            dataKey={k}
            stroke={COLORS[i % COLORS.length]}
            dot={false}
          />
        ))}
      </LineChart>
    );
  }
  if (type === "area") {
    return (
      <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey={labelKey} fontSize={11} />
        <YAxis fontSize={11} />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {numericKeys.map((k, i) => (
          <Area
            key={k}
            type="monotone"
            dataKey={k}
            stroke={COLORS[i % COLORS.length]}
            fill={COLORS[i % COLORS.length]}
            fillOpacity={0.25}
          />
        ))}
      </AreaChart>
    );
  }
  if (type === "pie") {
    const key = numericKeys[0]!;
    return (
      <PieChart>
        <Pie
          data={data}
          dataKey={key}
          nameKey={labelKey}
          outerRadius={70}
          label={(entry: Record<string, unknown>) => String(entry[labelKey] ?? "")}
        >
          {data.map((_, i) => (
            <PieCell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip />
      </PieChart>
    );
  }
  // scatter
  const xKey = numericKeys[0] ?? labelKey;
  const yKey = numericKeys[1] ?? numericKeys[0] ?? labelKey;
  return (
    <ScatterChart margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
      <CartesianGrid />
      <XAxis dataKey={xKey} fontSize={11} type="number" name={xKey} />
      <YAxis dataKey={yKey} fontSize={11} type="number" name={yKey} />
      <Tooltip />
      <Scatter data={data} fill={COLORS[0]} />
    </ScatterChart>
  );
}
