"use client";

/**
 * Phase 2.3 — Guided tour engine.
 *
 * Spotlight tooltips over real DOM targets (via CSS selectors), prev/next
 * navigation, progress dots, a step counter, and an X button that stops the
 * ENTIRE tour permanently (the parent persists the dismissal).
 *
 * - Steps whose `target` can't be found render as a centered card instead —
 *   the tour never breaks when a module is disabled or role-hidden.
 * - Positions recompute after the target scrolls into view and on resize.
 * - Keyboard: Esc = dismiss permanently, ←/→ = navigate.
 * - `prefers-reduced-motion` is respected (no smooth scrolling or fades).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  X, ChevronLeft, ChevronRight, Check, Map,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type TourStep = {
  id: string;
  title: string;
  body: string;
  /** CSS selector of the element to spotlight. Omitted / not found → centered. */
  target?: string;
  placement?: "right" | "left" | "top" | "bottom";
  icon?: LucideIcon;
};

type Rect = { top: number; left: number; width: number; height: number };

const PAD = 10;
const GAP = 16;

function getRect(selector: string): Rect | null {
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

function computePos(
  rect: Rect,
  placement: TourStep["placement"],
  cardW: number,
  cardH: number
): { left: number; top: number } {
  const side = placement ?? "right";
  let left = 0;
  let top = 0;
  switch (side) {
    case "right":
      left = rect.left + rect.width + GAP;
      top = rect.top + rect.height / 2 - cardH / 2;
      break;
    case "left":
      left = rect.left - GAP - cardW;
      top = rect.top + rect.height / 2 - cardH / 2;
      break;
    case "top":
      left = rect.left + rect.width / 2 - cardW / 2;
      top = rect.top - GAP - cardH;
      break;
    case "bottom":
      left = rect.left + rect.width / 2 - cardW / 2;
      top = rect.top + rect.height + GAP;
      break;
  }
  // Flip the primary axis when there's no room, then clamp to the viewport.
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (side === "right" && left + cardW > vw - PAD) left = rect.left - GAP - cardW;
  if (side === "left" && left < PAD) left = rect.left + rect.width + GAP;
  left = Math.max(PAD, Math.min(left, vw - cardW - PAD));
  top = Math.max(PAD, Math.min(top, vh - cardH - PAD));
  return { left, top };
}

export function GuidedTour({
  open,
  steps,
  onFinish,
  onDismiss,
  dismissLabel = "End tour",
  partLabel = "Part",
}: {
  open: boolean;
  steps: TourStep[];
  /** Completed the last step of the current part. */
  onFinish: () => void;
  /** X / backdrop / Esc — stop the ENTIRE tour permanently. */
  onDismiss: () => void;
  dismissLabel?: string;
  partLabel?: string;
}) {
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [cardSize, setCardSize] = useState({ w: 340, h: 240 });
  const [visible, setVisible] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const total = steps.length;
  const safeStep = Math.min(step, Math.max(0, total - 1));
  const current = steps[safeStep];

  const locate = useCallback(() => {
    const t = steps[Math.min(step, total - 1)];
    const r = t?.target ? getRect(t.target) : null;
    setRect(r);
    if (cardRef.current) {
      setCardSize({ w: cardRef.current.offsetWidth, h: cardRef.current.offsetHeight });
    }
  }, [steps, step, total]);

  // On every step change: bring the target into view, then measure twice
  // (once after the smooth scroll starts, once after it settles).
  useEffect(() => {
    if (!open || total === 0) return;
    const t = steps[Math.min(step, total - 1)];
    if (t?.target) {
      document.querySelector(t.target)?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    const id1 = window.setTimeout(locate, 60);
    const id2 = window.setTimeout(locate, 400);
    const id3 = window.setTimeout(locate, 750);
    return () => {
      window.clearTimeout(id1);
      window.clearTimeout(id2);
      window.clearTimeout(id3);
    };
  }, [open, step, steps, total, locate]);

  // Reposition when the window resizes.
  useEffect(() => {
    if (!open) return;
    const onResize = () => locate();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open, locate]);

  // Fade in on open.
  useEffect(() => {
    if (!open) {
      setVisible(false);
      return;
    }
    const id = window.setTimeout(() => setVisible(true), 30);
    return () => window.clearTimeout(id);
  }, [open]);

  // Keyboard: Esc = dismiss permanently, arrows = navigate.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onDismiss();
      } else if (e.key === "ArrowRight") {
        setStep((s) => Math.min(total - 1, s + 1));
      } else if (e.key === "ArrowLeft") {
        setStep((s) => Math.max(0, s - 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, total, onDismiss]);

  if (!open || total === 0) return null;

  const isLast = safeStep === total - 1;
  const centered = !current?.target || !rect;
  const pos = centered ? null : computePos(rect!, current.placement, cardSize.w, cardSize.h);
  const Icon = current.icon ?? Map;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={current.title}
      className={cn(
        "fixed inset-0 z-[100] transition-opacity duration-200 motion-reduce:transition-none",
        visible ? "opacity-100" : "opacity-0"
      )}
    >
      {/* Backdrop — click to dismiss the whole tour. */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[1px]" onClick={onDismiss} />

      {/* Spotlight hole over the target. */}
      {!centered && rect && (
        <div
          className="absolute rounded-xl border-2 border-primary/90 pointer-events-none transition-[left,top,width,height] duration-300 motion-reduce:transition-none"
          style={{
            left: rect.left - 4,
            top: rect.top - 4,
            width: rect.width + 8,
            height: rect.height + 8,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
          }}
        />
      )}

      {/* Tooltip / centered card */}
      <div
        ref={cardRef}
        className={cn(
          "fixed w-[min(92vw,340px)] rounded-2xl border border-border bg-background shadow-2xl transition-all duration-300 motion-reduce:transition-none",
          centered ? "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" : ""
        )}
        style={pos ? { left: pos.left, top: pos.top } : undefined}
      >
        {/* Header */}
        <div className="flex items-start gap-3 p-4 pb-2 pr-12">
          <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Icon className="h-[18px] w-[18px]" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {partLabel} · Step {safeStep + 1} of {total}
            </p>
            <h3 className="text-sm font-bold leading-tight">{current.title}</h3>
          </div>
        </div>

        {/* X — stops the ENTIRE tour permanently. */}
        <button
          onClick={onDismiss}
          aria-label={dismissLabel}
          title={dismissLabel}
          className="absolute top-3 right-3 p-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>

        <p className="px-4 pb-3 text-[13px] text-muted-foreground leading-relaxed">{current.body}</p>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-1.5 px-4 pb-3">
          {steps.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setStep(i)}
              aria-label={`Go to step ${i + 1}`}
              className={cn(
                "h-1.5 rounded-full transition-all duration-200 cursor-pointer",
                i === safeStep
                  ? "w-6 bg-primary"
                  : i < safeStep
                    ? "w-1.5 bg-primary/40 hover:bg-primary/60"
                    : "w-1.5 bg-muted-foreground/25 hover:bg-muted-foreground/50"
              )}
            />
          ))}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 p-3 pt-0">
          <button
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={safeStep === 0}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Back
          </button>
          <div className="flex-1" />
          <button
            onClick={onDismiss}
            className="px-2.5 py-1.5 text-xs font-medium text-muted-foreground/70 hover:text-foreground transition-colors cursor-pointer"
          >
            {dismissLabel}
          </button>
          {isLast ? (
            <button
              onClick={onFinish}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 transition-opacity cursor-pointer"
            >
              <Check className="h-3.5 w-3.5" /> Finish
            </button>
          ) : (
            <button
              onClick={() => setStep((s) => Math.min(total - 1, s + 1))}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 transition-opacity cursor-pointer"
            >
              Next <ChevronRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
