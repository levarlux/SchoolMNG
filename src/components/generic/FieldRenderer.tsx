"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Eye, EyeOff, Lock } from "lucide-react";

interface FieldRendererProps {
  name: string;
  inputType: string;
  value: string;
  onChange?: (value: string) => void;
  options?: string[];
  isRequired?: boolean;
  isDisabled?: boolean;
  readOnly?: boolean;
  isSensitive?: boolean;
  placeholder?: string;
  className?: string;
}

/**
 * Renders a single form field based on its inputType from the EAV metadata.
 * Supported inputTypes: text_short, text_long, number, date, boolean,
 * dropdown_single, dropdown_multi, file.
 *
 * Supports:
 * - readOnly mode (view-only, no editing)
 * - Sensitive data masking (blur + reveal toggle)
 * - All input types with polished styling
 */
export function FieldRenderer({
  name,
  inputType,
  value,
  onChange,
  options = [],
  isRequired = false,
  isDisabled = false,
  readOnly = false,
  isSensitive = false,
  placeholder,
  className = "",
}: FieldRendererProps) {
  const [showSensitive, setShowSensitive] = useState(false);
  const isEditable = !readOnly && !isDisabled && !!onChange;

  const label = (
    <Label className="text-sm font-medium text-foreground flex items-center gap-1.5">
      {name}
      {isRequired && <span className="text-destructive">*</span>}
      {isSensitive && (
        <Lock className="h-3 w-3 text-amber-500" aria-label="Sensitive data" />
      )}
    </Label>
  );

  const sensitiveMask = (
    <div className="flex items-center gap-2">
      <div
        className={`flex-1 px-3 py-2 text-sm rounded-md border border-border bg-muted/30 ${
          !showSensitive ? "blur-sm select-none" : ""
        } transition-all duration-200`}
      >
        {value || <span className="text-muted-foreground italic">—</span>}
      </div>
      <button
        type="button"
        onClick={() => setShowSensitive(!showSensitive)}
        className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        title={showSensitive ? "Hide" : "Reveal"}
      >
        {showSensitive ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );

  // Read-only display for any field type
  if (readOnly) {
    if (isSensitive && value) {
      return (
        <div className={`space-y-1.5 ${className}`}>
          {label}
          {sensitiveMask}
        </div>
      );
    }

    return (
      <div className={`space-y-1.5 ${className}`}>
        {label}
        <div className="px-3 py-2 text-sm rounded-md border border-border bg-muted/30">
          {renderReadOnlyValue(inputType, value, options)}
        </div>
      </div>
    );
  }

  // Editable field
  switch (inputType) {
    case "text_short":
      return (
        <div className={`space-y-1.5 ${className}`}>
          {label}
          <Input
            value={value}
            onChange={(e) => onChange?.(e.target.value)}
            placeholder={placeholder ?? `Enter ${name.toLowerCase()}`}
            required={isRequired}
            disabled={isDisabled}
          />
        </div>
      );

    case "text_long":
      return (
        <div className={`space-y-1.5 ${className}`}>
          {label}
          <textarea
            value={value}
            onChange={(e) => onChange?.(e.target.value)}
            placeholder={placeholder ?? `Enter ${name.toLowerCase()}`}
            required={isRequired}
            disabled={isDisabled}
            rows={3}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y min-h-[80px]"
          />
        </div>
      );

    case "number":
      return (
        <div className={`space-y-1.5 ${className}`}>
          {label}
          <Input
            type="number"
            value={value}
            onChange={(e) => onChange?.(e.target.value)}
            placeholder={placeholder ?? "0"}
            required={isRequired}
            disabled={isDisabled}
            step="any"
          />
        </div>
      );

    case "date":
      return (
        <div className={`space-y-1.5 ${className}`}>
          {label}
          <Input
            type="date"
            value={value}
            onChange={(e) => onChange?.(e.target.value)}
            required={isRequired}
            disabled={isDisabled}
          />
        </div>
      );

    case "boolean":
      return (
        <div className={`flex items-center gap-3 py-2 ${className}`}>
          <button
            type="button"
            role="switch"
            aria-checked={value === "true"}
            onClick={() => onChange?.(value === "true" ? "false" : "true")}
            disabled={isDisabled}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 ${
              value === "true" ? "border-primary bg-primary" : "border-slate-400 bg-input"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform duration-200 ${
                value === "true" ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
          <Label className="text-sm font-medium cursor-pointer">{name}</Label>
        </div>
      );

    case "dropdown_single":
      return (
        <div className={`space-y-1.5 ${className}`}>
          {label}
          <select
            value={value}
            onChange={(e) => onChange?.(e.target.value)}
            required={isRequired}
            disabled={isDisabled}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="">Select {name.toLowerCase()}...</option>
            {options.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>
      );

    case "dropdown_multi":
      const selected = value.split(",").map((s) => s.trim()).filter(Boolean);
      return (
        <div className={`space-y-1.5 ${className}`}>
          {label}
          <div className="flex flex-wrap gap-1.5">
            {options.length === 0 && (
              <p className="text-xs text-muted-foreground">No options configured</p>
            )}
            {options.map((opt) => {
              const isSelected = selected.includes(opt);
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => {
                    const next = isSelected
                      ? selected.filter((v) => v !== opt)
                      : [...selected, opt];
                    onChange?.(next.join(", "));
                  }}
                  disabled={isDisabled}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-150 ${
                    isSelected
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "bg-background text-muted-foreground border-border hover:border-primary/50 hover:bg-primary/5"
                  }`}
                >
                  {opt}
                </button>
              );
            })}
          </div>
          {selected.length > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              {selected.length} selected
            </p>
          )}
        </div>
      );

    case "file":
      return (
        <div className={`space-y-1.5 ${className}`}>
          {label}
          {value ? (
            <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-muted/30">
              <span className="text-sm truncate flex-1">{value}</span>
              <button
                type="button"
                onClick={() => onChange?.("")}
                className="text-xs text-destructive hover:underline"
              >
                Remove
              </button>
            </div>
          ) : (
            <Input
              type="file"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onChange?.(file.name);
              }}
              disabled={isDisabled}
            />
          )}
        </div>
      );

    default:
      return (
        <div className={`space-y-1.5 ${className}`}>
          {label}
          <Input
            value={value}
            onChange={(e) => onChange?.(e.target.value)}
            placeholder={placeholder ?? `Enter ${name.toLowerCase()}`}
            required={isRequired}
            disabled={isDisabled}
          />
        </div>
      );
  }
}

function renderReadOnlyValue(inputType: string, value: string, options: string[]) {
  if (!value) {
    return <span className="text-muted-foreground italic">—</span>;
  }

  switch (inputType) {
    case "boolean":
      return (
        <Badge variant={value === "true" ? "default" : "secondary"}>
          {value === "true" ? "Yes" : "No"}
        </Badge>
      );
    case "dropdown_single":
      return <span>{value}</span>;
    case "dropdown_multi":
      return (
        <div className="flex flex-wrap gap-1">
          {value.split(",").map((s) => s.trim()).filter(Boolean).map((v) => (
            <Badge key={v} variant="secondary" className="text-xs">{v}</Badge>
          ))}
        </div>
      );
    case "file":
      return (
        <span className="text-primary hover:underline cursor-pointer">{value}</span>
      );
    default:
      return <span>{value}</span>;
  }
}
