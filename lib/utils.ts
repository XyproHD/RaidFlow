import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Hilfsfunktion für Klassen-Namen (shadcn/ui). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
