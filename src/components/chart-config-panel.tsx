"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Settings2,
  Eye,
  EyeOff,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  Palette,
  GripVertical,
  Check,
} from "lucide-react";
import type { Id } from "../../convex/_generated/dataModel";

interface ChartConfig {
  _id: string | null;
  chartKey: string;
  chartType: string;
  title: string;
  description?: string | null;
  isVisible: boolean;
  position: number;
  color?: string | null;
  options?: unknown;
  isDefault: boolean;
}

interface ChartConfigPanelProps {
  schoolId: Id<"schools">;
  page: string;
  configs: ChartConfig[];
}

const CHART_TYPE_LABELS: Record<string, string> = {
  bar: "Bar",
  line: "Line",
  doughnut: "Doughnut",
  horizontalBar: "H. Bar",
  radial: "Radial",
  sparkline: "Sparkline",
};

const PRESET_COLORS = [
  "#6366f1", // indigo
  "#22c55e", // green
  "#ef4444", // red
  "#f59e0b", // amber
  "#8b5cf6", // purple
  "#10b981", // emerald
  "#f97316", // orange
  "#3b82f6", // blue
  "#ec4899", // pink
  "#14b8a6", // teal
];

export function ChartConfigPanel({ schoolId, page, configs }: ChartConfigPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editColor, setEditColor] = useState<string | null>(null);

  const upsert = useMutation(api.chartConfigs.upsert);
  const toggleVisibility = useMutation(api.chartConfigs.toggleVisibility);
  const reorder = useMutation(api.chartConfigs.reorder);
  const resetPage = useMutation(api.chartConfigs.resetPage);

  const sortedConfigs = [...configs].sort((a, b) => a.position - b.position);

  async function handleToggle(chartKey: string) {
    await toggleVisibility({ schoolId, page, chartKey });
  }

  async function handleMoveUp(index: number) {
    if (index === 0) return;
    const keys = sortedConfigs.map((c) => c.chartKey);
    // Swap with previous
    [keys[index - 1], keys[index]] = [keys[index], keys[index - 1]];
    await reorder({ schoolId, page, chartKeys: keys });
  }

  async function handleMoveDown(index: number) {
    if (index >= sortedConfigs.length - 1) return;
    const keys = sortedConfigs.map((c) => c.chartKey);
    // Swap with next
    [keys[index], keys[index + 1]] = [keys[index + 1], keys[index]];
    await reorder({ schoolId, page, chartKeys: keys });
  }

  function startEdit(config: ChartConfig) {
    setEditingKey(config.chartKey);
    setEditTitle(config.title);
    setEditColor(config.color ?? null);
  }

  async function saveEdit(chartKey: string) {
    await upsert({
      schoolId,
      page,
      chartKey,
      title: editTitle,
      color: editColor ?? undefined,
    });
    setEditingKey(null);
  }

  async function handleReset() {
    await resetPage({ schoolId, page });
  }

  return (
    <div className="relative">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className="gap-2"
      >
        <Settings2 className="h-4 w-4" />
        Customize Charts
      </Button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Panel */}
          <Card className="absolute right-0 top-full mt-2 z-50 w-[380px] max-h-[500px] overflow-hidden shadow-xl border">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div>
                <h3 className="font-semibold text-sm">Chart Layout</h3>
                <p className="text-xs text-muted-foreground capitalize">{page} page</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
                className="gap-1 text-xs"
              >
                <RotateCcw className="h-3 w-3" />
                Reset
              </Button>
            </div>

            <CardContent className="p-0 overflow-y-auto max-h-[420px]">
              {sortedConfigs.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  No charts configured for this page.
                </div>
              ) : (
                <div className="divide-y">
                  {sortedConfigs.map((config, index) => (
                    <div
                      key={config.chartKey}
                      className={`px-4 py-3 flex items-center gap-3 transition-colors ${
                        config.isVisible ? "bg-background" : "bg-muted/30"
                      }`}
                    >
                      {/* Drag handle + position */}
                      <div className="flex flex-col items-center gap-0.5 shrink-0">
                        <button
                          onClick={() => handleMoveUp(index)}
                          disabled={index === 0}
                          className="p-0.5 hover:bg-muted rounded disabled:opacity-30"
                        >
                          <ArrowUp className="h-3 w-3" />
                        </button>
                        <GripVertical className="h-3 w-3 text-muted-foreground" />
                        <button
                          onClick={() => handleMoveDown(index)}
                          disabled={index === sortedConfigs.length - 1}
                          className="p-0.5 hover:bg-muted rounded disabled:opacity-30"
                        >
                          <ArrowDown className="h-3 w-3" />
                        </button>
                      </div>

                      {/* Color dot */}
                      {editingKey === config.chartKey ? (
                        <div className="flex gap-1 shrink-0">
                          {PRESET_COLORS.slice(0, 6).map((c) => (
                            <button
                              key={c}
                              onClick={() => setEditColor(editColor === c ? null : c)}
                              className={`w-4 h-4 rounded-full border-2 shrink-0 ${
                                editColor === c ? "border-foreground" : "border-transparent"
                              }`}
                              style={{ backgroundColor: c }}
                            />
                          ))}
                        </div>
                      ) : config.color ? (
                        <div
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: config.color }}
                        />
                      ) : (
                        <Palette className="h-3 w-3 text-muted-foreground shrink-0" />
                      )}

                      {/* Title + type */}
                      <div className="flex-1 min-w-0">
                        {editingKey === config.chartKey ? (
                          <input
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                          className="w-full text-sm font-medium border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary"
                          autoFocus
                          onKeyDown={(e: React.KeyboardEvent) => {
                            if (e.key === "Enter") saveEdit(config.chartKey);
                            if (e.key === "Escape") setEditingKey(null);
                          }}
                          />
                        ) : (
                          <p
                            className="text-sm font-medium truncate cursor-pointer hover:underline"
                            onClick={() => startEdit(config)}
                          >
                            {config.title}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {CHART_TYPE_LABELS[config.chartType] ?? config.chartType}
                          {config.isDefault && (
                            <Badge variant="secondary" className="ml-1 text-[10px] px-1 py-0">
                              default
                            </Badge>
                          )}
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        {editingKey === config.chartKey && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => saveEdit(config.chartKey)}
                            className="h-7 px-2"
                          >
                            <Check className="h-3 w-3" />
                          </Button>
                        )}
                        <button
                          onClick={() => handleToggle(config.chartKey)}
                          className={`p-1.5 rounded hover:bg-muted transition-colors ${
                            config.isVisible ? "text-green-600" : "text-muted-foreground"
                          }`}
                          title={config.isVisible ? "Hide chart" : "Show chart"}
                        >
                          {config.isVisible ? (
                            <Eye className="h-4 w-4" />
                          ) : (
                            <EyeOff className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
