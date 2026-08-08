import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Conditional class names with Tailwind conflict resolution. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Trims a string and returns null when nothing meaningful is left. */
export function trimToNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/** Rounds a ratio to a whole percentage; returns null when there is no data. */
export function percentage(part: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((part / total) * 100);
}
