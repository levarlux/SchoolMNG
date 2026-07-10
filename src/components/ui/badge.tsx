import { cn } from "@/lib/utils";
import { HTMLAttributes, forwardRef } from "react";

const variants = {
  default: "bg-primary/10 text-primary border-transparent",
  secondary: "bg-secondary/10 text-secondary border-transparent",
  success: "bg-green-100 text-green-700 border-green-200",
  warning: "bg-yellow-100 text-yellow-700 border-yellow-200",
  danger: "bg-red-100 text-red-700 border-red-200",
  outline: "text-foreground border-border",
} as const;

interface BadgeProps extends HTMLAttributes<HTMLDivElement> {
  variant?: keyof typeof variants;
}

export const Badge = forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant = "default", ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
        variants[variant],
        className
      )}
      {...props}
    />
  )
);
Badge.displayName = "Badge";
