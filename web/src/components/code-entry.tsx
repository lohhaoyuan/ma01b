'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { ArrowRight, Loader2 } from 'lucide-react';
import { normalizeCode, TOTP_CODE_LENGTH } from '@/shared/totp';

const SLOTS = Array.from({ length: TOTP_CODE_LENGTH }, (_, i) => i);

export function CodeEntry({ expired }: { expired: boolean }) {
  const router = useRouter();
  const [chars, setChars] = useState<string[]>(() => Array(TOTP_CODE_LENGTH).fill(''));
  const [error, setError] = useState<string | null>(
    expired ? 'That session has ended. Enter a new code to continue.' : null,
  );
  const [submitting, setSubmitting] = useState(false);
  const inputs = useRef<Array<HTMLInputElement | null>>([]);

  const code = chars.join('');
  const complete = code.length === TOTP_CODE_LENGTH && !chars.includes('');

  /**
   * Write one or more characters starting at `index`.
   *
   * A slot has to accept more than one character at a time. Fast typing, OTP
   * autofill, and dictation all deliver several characters to whichever input
   * happens to be focused, and a slot that keeps only the last one silently
   * swallows the rest.
   */
  function writeFrom(index: number, raw: string) {
    // Fold as the clinician types, so O and 0 both land on the same glyph and
    // the field never appears to reject a keystroke they believe they made.
    let text = normalizeCode(raw);

    // A controlled input reports its old contents plus the new keystroke when
    // the browser appends rather than replaces. Drop the character already held.
    if (text.length > 1 && chars[index] && text[0] === chars[index]) {
      text = text.slice(1);
    }

    setError(null);

    if (text === '') {
      setChars((prev) => {
        const next = [...prev];
        next[index] = '';
        return next;
      });
      return;
    }

    const next = [...chars];
    let cursor = index;
    for (const ch of text) {
      if (cursor >= TOTP_CODE_LENGTH) break;
      next[cursor] = ch;
      cursor++;
    }
    setChars(next);

    inputs.current[Math.min(cursor, TOTP_CODE_LENGTH - 1)]?.focus();

    const assembled = next.join('');
    if (assembled.length === TOTP_CODE_LENGTH && !next.includes('')) {
      void submit(assembled);
    }
  }

  function onKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace' && chars[index] === '' && index > 0) {
      event.preventDefault();
      inputs.current[index - 1]?.focus();
      setChars((prev) => {
        const next = [...prev];
        next[index - 1] = '';
        return next;
      });
    }
    if (event.key === 'ArrowLeft' && index > 0) inputs.current[index - 1]?.focus();
    if (event.key === 'ArrowRight' && index < TOTP_CODE_LENGTH - 1) inputs.current[index + 1]?.focus();
    if (event.key === 'Enter' && complete) void submit(code);
  }

  function onPaste(event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    // A pasted code always fills from the start, wherever the caret happens to
    // be — nobody pastes a code intending it to begin at slot 5.
    writeFrom(0, event.clipboardData.getData('text'));
  }

  async function submit(value: string) {
    if (submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: value }),
      });

      if (response.ok) {
        router.replace('/patient');
        return;
      }

      const body = await response.json().catch(() => ({}));
      setError(body.error ?? 'Could not verify that code.');
      setChars(Array(TOTP_CODE_LENGTH).fill(''));
      inputs.current[0]?.focus();
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (complete) void submit(code);
      }}
      className="flex flex-col gap-6"
    >
      <div>
        <div className="flex items-center gap-1.5 sm:gap-2" role="group" aria-label="8-character access code">
          {SLOTS.map((i) => (
            <div key={i} className="contents">
              <input
                ref={(el) => {
                  inputs.current[i] = el;
                }}
                value={chars[i]}
                onChange={(e) => writeFrom(i, e.target.value)}
                onKeyDown={(e) => onKeyDown(i, e)}
                onPaste={onPaste}
                onFocus={(e) => e.target.select()}
                inputMode="text"
                autoCapitalize="characters"
                autoComplete="one-time-code"
                spellCheck={false}
                disabled={submitting}
                aria-label={`Character ${i + 1} of ${TOTP_CODE_LENGTH}`}
                aria-invalid={error !== null}
                className="h-13 w-full min-w-0 rounded-lg border border-line bg-card text-center font-mono text-lg uppercase text-ink transition-colors duration-150 focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none disabled:opacity-50"
              />
              {/* The app shows the code as two groups of four; the gap here
                  mirrors that so the clinician can track their place. */}
              {i === 3 && <div aria-hidden className="w-2 shrink-0 sm:w-3" />}
            </div>
          ))}
        </div>

        <p
          role={error ? 'alert' : undefined}
          className={`mt-3 min-h-[2.5rem] text-sm ${error ? 'text-ink' : 'text-muted'}`}
        >
          {error ?? 'The code changes every minute. Enter the one showing in the app right now.'}
        </p>
      </div>

      <button
        type="submit"
        disabled={!complete || submitting}
        className="flex h-11 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-accent-contrast transition-colors duration-150 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
      >
        {submitting ? (
          <>
            <Loader2 size={15} strokeWidth={1.5} className="animate-spin" />
            Checking
          </>
        ) : (
          <>
            View record
            <ArrowRight size={15} strokeWidth={1.5} />
          </>
        )}
      </button>
    </form>
  );
}
