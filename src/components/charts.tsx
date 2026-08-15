"use client";

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Bar, Line, Pie, Doughnut } from "react-chartjs-2";
import type { ReactNode } from "react";

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

// ── Color Palette ───────────────────────────────────────────────────

const COLORS = {
  primary: "rgba(99, 102, 241, 0.5)",
  primaryLight: "rgba(99, 102, 241, 0.15)",
  success: "rgba(34, 197, 94, 0.5)",
  successLight: "rgba(34, 197, 94, 0.15)",
  warning: "rgba(234, 179, 8, 0.5)",
  warningLight: "rgba(234, 179, 8, 0.15)",
  danger: "rgba(239, 68, 68, 0.5)",
  dangerLight: "rgba(239, 68, 68, 0.15)",
  muted: "rgba(156, 163, 175, 0.5)",
  mutedLight: "rgba(156, 163, 175, 0.15)",
};

const PALETTE = [
  "rgba(99, 102, 241, 0.5)",   // indigo
  "rgba(34, 197, 94, 0.5)",    // green
  "rgba(234, 179, 8, 0.5)",    // yellow
  "rgba(239, 68, 68, 0.5)",    // red
  "rgba(168, 85, 247, 0.5)",   // purple
  "rgba(20, 184, 166, 0.5)",   // teal
  "rgba(249, 115, 22, 0.5)",   // orange
  "rgba(59, 130, 246, 0.5)",   // blue
];

// Replace an rgba() color's alpha channel with the given value.
function withAlpha(color: string, alpha: number): string {
  return color.replace(/rgba\(([^)]+)\)/, (_, inner: string) => {
    const parts = inner.split(",").map((p) => p.trim());
    parts[3] = String(alpha);
    return `rgba(${parts.join(", ")})`;
  });
}

/** Convert a #rrggbb hex color to an rgba() string with the given alpha. */
export function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return `rgba(99, 102, 241, ${alpha})`;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ── Shared Options ──────────────────────────────────────────────────

const defaultOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      labels: {
        usePointStyle: true,
        padding: 16,
      },
    },
  },
};

// ── Bar Chart ───────────────────────────────────────────────────────

export function BarChart({
  labels,
  datasets,
  title,
  height = 300,
}: {
  labels: string[];
  datasets: Array<{ label: string; data: number[]; color?: string }>;
  title?: string;
  height?: number;
}) {
  const data = {
    labels,
    datasets: datasets.map((ds, i) => ({
      label: ds.label,
      data: ds.data,
      backgroundColor: ds.color ?? PALETTE[i % PALETTE.length],
      borderRadius: 6,
      borderSkipped: false,
    })),
  };

  const options = {
    ...defaultOptions,
    plugins: {
      ...defaultOptions.plugins,
      title: {
        display: !!title,
        text: title ?? "",
        font: { size: 14, weight: "bold" as const },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: { color: "rgba(0,0,0,0.05)" },
      },
      x: {
        grid: { display: false },
      },
    },
  };

  return (
    <div style={{ height }}>
      <Bar data={data} options={options} />
    </div>
  );
}

// ── Line Chart ──────────────────────────────────────────────────────

export function LineChart({
  labels,
  datasets,
  title,
  height = 300,
  showArea = false,
}: {
  labels: string[];
  datasets: Array<{ label: string; data: number[]; color?: string }>;
  title?: string;
  height?: number;
  showArea?: boolean;
}) {
  const data = {
    labels,
    datasets: datasets.map((ds, i) => ({
      label: ds.label,
      data: ds.data,
      borderColor: ds.color ?? PALETTE[i % PALETTE.length],
      backgroundColor: showArea
        ? withAlpha(ds.color ?? PALETTE[i % PALETTE.length], 0.15)
        : "transparent",
      fill: showArea,
      tension: 0.4,
      pointRadius: 4,
      pointHoverRadius: 6,
    })),
  };

  const options = {
    ...defaultOptions,
    plugins: {
      ...defaultOptions.plugins,
      title: {
        display: !!title,
        text: title ?? "",
        font: { size: 14, weight: "bold" as const },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: { color: "rgba(0,0,0,0.05)" },
      },
      x: {
        grid: { display: false },
      },
    },
  };

  return (
    <div style={{ height }}>
      <Line data={data} options={options} />
    </div>
  );
}

// ── Pie Chart ───────────────────────────────────────────────────────

export function PieChart({
  labels,
  data,
  title,
  height = 300,
}: {
  labels: string[];
  data: number[];
  title?: string;
  height?: number;
}) {
  const chartData = {
    labels,
    datasets: [
      {
        data,
        backgroundColor: PALETTE.slice(0, data.length),
        borderWidth: 2,
        borderColor: "#fff",
      },
    ],
  };

  const options = {
    ...defaultOptions,
    plugins: {
      ...defaultOptions.plugins,
      title: {
        display: !!title,
        text: title ?? "",
        font: { size: 14, weight: "bold" as const },
      },
    },
  };

  return (
    <div style={{ height }}>
      <Pie data={chartData} options={options} />
    </div>
  );
}

// ── Doughnut Chart ──────────────────────────────────────────────────

export function DoughnutChart({
  labels,
  data,
  title,
  height = 300,
}: {
  labels: string[];
  data: number[];
  title?: string;
  height?: number;
}) {
  const chartData = {
    labels,
    datasets: [
      {
        data,
        backgroundColor: PALETTE.slice(0, data.length),
        borderWidth: 2,
        borderColor: "#fff",
        cutout: "60%",
      },
    ],
  };

  const options = {
    ...defaultOptions,
    plugins: {
      ...defaultOptions.plugins,
      title: {
        display: !!title,
        text: title ?? "",
        font: { size: 14, weight: "bold" as const },
      },
    },
  };

  return (
    <div style={{ height }}>
      <Doughnut data={chartData} options={options} />
    </div>
  );
}

// ── Utility: Prepare data for charts ────────────────────────────────

// ── Horizontal Bar Chart ────────────────────────────────────────────

export function HorizontalBarChart({
  labels,
  datasets,
  title,
  height = 300,
}: {
  labels: string[];
  datasets: Array<{ label: string; data: number[]; color?: string }>;
  title?: string;
  height?: number;
}) {
  const data = {
    labels,
    datasets: datasets.map((ds, i) => ({
      label: ds.label,
      data: ds.data,
      backgroundColor: ds.color ?? PALETTE[i % PALETTE.length],
      borderRadius: 6,
      borderSkipped: false,
    })),
  };

  const options = {
    ...defaultOptions,
    indexAxis: "y" as const,
    plugins: {
      ...defaultOptions.plugins,
      title: {
        display: !!title,
        text: title ?? "",
        font: { size: 14, weight: "bold" as const },
      },
    },
    scales: {
      x: {
        beginAtZero: true,
        grid: { color: "rgba(0,0,0,0.05)" },
      },
      y: {
        grid: { display: false },
      },
    },
  };

  return (
    <div style={{ height }}>
      <Bar data={data} options={options} />
    </div>
  );
}

// ── Radial Progress (SVG ring) ──────────────────────────────────────

export function RadialProgress({
  value,
  size = 120,
  stroke = 12,
  color = "#6366f1",
  label,
  sublabel,
}: {
  value: number; // 0–100
  size?: number;
  stroke?: number;
  color?: string;
  label?: string;
  sublabel?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="rotate-[-90deg]">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(0,0,0,0.08)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-700 ease-out motion-reduce:transition-none"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-bold leading-none" style={{ color }}>
          {Math.round(clamped)}%
        </span>
        {label && <span className="text-[10px] text-muted-foreground mt-1 text-center leading-tight">{label}</span>}
        {sublabel && <span className="text-[10px] text-muted-foreground/70">{sublabel}</span>}
      </div>
    </div>
  );
}

// ── Sparkline (pure SVG, no axes) ───────────────────────────────────

export function Sparkline({
  data,
  width = 96,
  height = 28,
  color = "#6366f1",
}: {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
}) {
  if (data.length < 2) {
    return <div style={{ width, height }} />;
  }
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = width / (data.length - 1);
  const points = data
    .map((v, i) => {
      const x = i * step;
      const y = height - 3 - ((v - min) / range) * (height - 6);
      return `${x},${y}`;
    })
    .join(" ");
  const area = `${points} ${width},${height} 0,${height}`;
  return (
    <svg width={width} height={height} className="overflow-visible">
      <polygon points={area} fill={hexToRgba(color, 0.12)} />
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Chart Card + empty state ────────────────────────────────────────

export function ChartCard({
  title,
  subtitle,
  actions,
  children,
  height = 260,
  empty,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  height?: number;
  empty?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <p className="text-sm font-semibold">{title}</p>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
      <div style={{ minHeight: height }} className="flex flex-col justify-center">
        {children}
        {empty}
      </div>
    </div>
  );
}

export function EmptyChart({ message = "No data yet" }: { message?: string }) {
  return (
    <div className="flex items-center justify-center h-full text-sm text-muted-foreground py-8">
      {message}
    </div>
  );
}

/**
 * Transform a key-value map into chart-ready format.
 */
export function toChartData(
  map: Record<string, number>,
): { labels: string[]; data: number[] } {
  return {
    labels: Object.keys(map),
    data: Object.values(map),
  };
}

/**
 * Transform an array of objects into chart-ready format.
 */
export function arrayToChartData<T extends Record<string, unknown>>(
  items: T[],
  labelKey: keyof T,
  valueKey: keyof T,
): { labels: string[]; data: number[] } {
  return {
    labels: items.map((item) => String(item[labelKey])),
    data: items.map((item) => Number(item[valueKey]) || 0),
  };
}
