'use client';

import { ThemeProvider as NextThemes, useTheme } from 'next-themes';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useSyncExternalStore } from 'react';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemes attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </NextThemes>
  );
}

const OPTIONS = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
] as const;

const noopSubscribe = () => () => {};

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  // The server cannot know the resolved theme, so no option is marked selected
  // until hydration — otherwise the markup claims a selection that may be wrong
  // and React logs a mismatch. useSyncExternalStore is the intended way to read
  // "am I on the client": it returns the server snapshot during SSR and the
  // client snapshot after, with no state update in an effect.
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className="no-print flex items-center gap-0.5 rounded-lg border border-line bg-card p-0.5"
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = mounted && theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setTheme(value)}
            className={`rounded-md p-1.5 transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none ${
              active
                ? 'bg-accent text-accent-contrast'
                : 'text-muted hover:bg-zinc-100 dark:hover:bg-zinc-800/60'
            }`}
          >
            <Icon size={15} strokeWidth={1.5} />
          </button>
        );
      })}
    </div>
  );
}
