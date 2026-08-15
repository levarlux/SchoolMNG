"use client";

import { cn } from "@/lib/utils";

type BrandLoaderVariant = "dots" | "book" | "full";
type BrandLoaderSize = "sm" | "md" | "lg";

const DOT_SIZES: Record<BrandLoaderSize, string> = {
  sm: "h-1.5 w-1.5",
  md: "h-2 w-2",
  lg: "h-2.5 w-2.5",
};

const BOOK_SIZES: Record<BrandLoaderSize, string> = {
  sm: "h-5 w-5",
  md: "h-10 w-10",
  lg: "h-16 w-16",
};

const FULL_SIZES: Record<BrandLoaderSize, string> = {
  sm: "h-12 w-12",
  md: "h-20 w-20",
  lg: "h-28 w-28",
};

/** The SchoolMNG mark — an open book with its two pages in brand colors. */
function BookMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* soft glow */}
      <circle
        cx="24"
        cy="25"
        r="20"
        fill="var(--school-primary, #0ea5e9)"
        className="brand-loader-glow"
        opacity="0.25"
      />
      {/* left page */}
      <path
        d="M5 10.5 C12 9 19 10.5 23 15 L23 36 C19 32.5 12 31.5 5 33 Z"
        fill="var(--school-primary, #0ea5e9)"
      />
      {/* right page */}
      <path
        d="M43 10.5 C36 9 29 10.5 25 15 L25 36 C29 32.5 36 31.5 43 33 Z"
        fill="var(--school-secondary, #f97316)"
      />
      {/* spine */}
      <line
        x1="24"
        y1="10.5"
        x2="24"
        y2="37"
        stroke="rgba(255,255,255,0.55)"
        strokeWidth="1.2"
      />
      {/* graduation cap */}
      <path
        d="M13 7 L24 3 L35 7 L24 11 Z"
        fill="#ffffff"
        opacity="0.9"
      />
      <line
        x1="24"
        y1="11"
        x2="24"
        y2="16"
        stroke="#ffffff"
        strokeWidth="1.2"
        opacity="0.9"
      />
      <circle cx="24" cy="17.5" r="1.6" fill="#ffffff" opacity="0.9" />
    </svg>
  );
}

export function BrandLoader({
  variant = "book",
  size = "md",
  label,
  className,
}: {
  variant?: BrandLoaderVariant;
  size?: BrandLoaderSize;
  label?: string;
  className?: string;
}) {
  if (variant === "dots") {
    const dots = [0, 1, 2];
    return (
      <span
        role="status"
        aria-live="polite"
        aria-label={label ?? "Loading"}
        className={cn("inline-flex items-center gap-1", className)}
      >
        {dots.map((i) => (
          <span
            key={i}
            className={cn("rounded-full brand-bounce", DOT_SIZES[size])}
            style={{
              backgroundColor:
                i % 2 === 0
                  ? "var(--school-primary, #0ea5e9)"
                  : "var(--school-secondary, #f97316)",
              animationDelay: `${i * 0.18}s`,
            }}
          />
        ))}
      </span>
    );
  }

  if (variant === "book") {
    return (
      <span
        role="status"
        aria-live="polite"
        aria-label={label ?? "Loading"}
        className={cn("inline-flex items-center justify-center", className)}
      >
        <BookMark className={cn("brand-book", BOOK_SIZES[size])} />
      </span>
    );
  }

  // variant === "full"
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label ?? "Loading"}
      className={cn("flex flex-col items-center justify-center gap-4", className)}
    >
      <div className="relative">
        <div className="absolute inset-0 brand-glow rounded-full blur-2xl" />
        <BookMark className={cn("relative brand-book", FULL_SIZES[size])} />
      </div>
      <span className="brand-wordmark text-xl font-bold tracking-wide">
        SchoolMNG
      </span>
      {label && (
        <span className="text-sm text-muted-foreground animate-pulse">{label}</span>
      )}
    </div>
  );
}
