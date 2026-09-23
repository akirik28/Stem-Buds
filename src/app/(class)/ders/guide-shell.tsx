'use client';

import { useState, type ReactNode } from 'react';
import { LogoutButton } from '@/app/panel/logout-button';

/**
 * The lesson guide's chrome: one step on screen, and a way back.
 *
 * Class mode is the only white surface in the panel. That is the point —
 * the change of ground is what tells someone the hour has started, without
 * a banner saying so. Steps are free to move between in both directions
 * because a mentor who forgot to mark someone present should not have to
 * start again.
 */
export type GuideStep = {
  /** Shown in the rail and above the content. Two or three words. */
  title: string;
  content: ReactNode;
  /** Skipped entirely when false — an absent step is better than an empty one. */
  when?: boolean;
};

export function GuideShell({
  steps,
  heading,
  subheading,
}: {
  steps: GuideStep[];
  heading: string;
  subheading: string;
}) {
  const visible = steps.filter((step) => step.when !== false);
  const [index, setIndex] = useState(0);
  const current = visible[Math.min(index, visible.length - 1)];
  const atFirst = index === 0;
  const atLast = index >= visible.length - 1;

  return (
    <div className="class-mode theme-light">
      <div className="mx-auto max-w-2xl px-5 pb-28 pt-8">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <p className="text-[13px] font-semibold uppercase tracking-[0.18em] text-class-accent">
              {subheading}
            </p>
            <h1 className="mt-1 text-2xl font-bold text-ink">{heading}</h1>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[13px] text-ink-3">
              Ders bitince
              <br />
              panel geri gelir
            </p>
            <div className="mt-1">
              <LogoutButton />
            </div>
          </div>
        </div>

        {/* The rail is the whole map of the hour: five dots, where you are. */}
        <ol className="mt-6 flex items-center gap-2" aria-label="Adımlar">
          {visible.map((step, i) => (
            <li key={step.title} className="flex-1">
              <button
                type="button"
                onClick={() => setIndex(i)}
                aria-current={i === index ? 'step' : undefined}
                className={`block h-1.5 w-full rounded-full transition-colors ${
                  i <= index ? 'bg-class-accent' : 'bg-line'
                }`}
              >
                <span className="sr-only">
                  {i + 1}. adım: {step.title}
                </span>
              </button>
            </li>
          ))}
        </ol>

        <p className="mt-5 text-[13px] font-semibold text-ink-3">
          {index + 1} / {visible.length}
        </p>
        <h2 className="mt-1 text-xl font-bold text-ink">{current?.title}</h2>

        <div className="mt-5">{current?.content}</div>
      </div>

      <div className="class-mode-bar">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-5 py-3">
          <button
            type="button"
            onClick={() => setIndex((value) => Math.max(0, value - 1))}
            disabled={atFirst}
            className="min-h-11 rounded-[var(--radius-control)] px-5 text-sm font-semibold text-ink-2 disabled:opacity-40"
          >
            ← Geri
          </button>
          {atLast ? (
            <span className="min-h-11 px-6 text-sm font-semibold leading-[2.75rem] text-ink-3">
              Son adım
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setIndex((value) => Math.min(visible.length - 1, value + 1))}
              className="min-h-11 rounded-[var(--radius-control)] bg-class-accent px-6 text-sm font-semibold text-white"
            >
              İleri →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** A row of large, obvious choices. The only input class mode really needs. */
export function ChoiceRow<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { value: T; label: string }[];
  value: T | null;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <fieldset className="mt-1">
      <legend className="text-sm font-semibold text-ink-2">{label}</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
            className={`min-h-11 rounded-full border px-4 text-sm font-semibold transition-colors ${
              value === option.value
                ? 'border-class-accent bg-class-accent text-white'
                : 'border-line bg-surface text-ink-2 hover:border-class-accent'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
