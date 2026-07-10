import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getSubdomain(host: string): string | null {
  const parts = host.split(".");
  if (parts.length >= 3) {
    return parts[0];
  }
  return null;
}
