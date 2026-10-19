import { useCallback, useEffect, useRef, useState } from 'react';

// A small in-memory, session-scoped cache for screen data.
//
// The problem this solves: Today and Trends both fetched inside
// useFocusEffect and unconditionally set `loading = true` on every visit —
// so switching tabs, or switching Week/Month/Year, always blanked the screen
// for a spinner even when the exact same data had been fetched seconds
// earlier. This makes a visit to an already-seen key show that data
// instantly while quietly re-fetching in the background, the same way a
// normal app behaves.
//
// Deliberately NOT persisted across app restarts — it's a plain Map, cleared
// when the JS runtime restarts. It only exists to avoid redundant network
// round-trips within one session; things that need to survive a restart
// (the logging draft, the TOTP secret) already have their own storage.

const cache = new Map<string, unknown>();

export interface CachedQueryResult<T> {
  /** Cached or freshly-fetched data. Null only before the first successful fetch for this key. */
  data: T | null;
  /** True only when nothing is cached yet for this key — the case that needs a skeleton. */
  loading: boolean;
  /** True while re-fetching data that's already on screen. No skeleton needed for this. */
  refreshing: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

/**
 * Fetches `fetcher()`, caching the result under `key`. If a cache entry
 * already exists for `key`, it's returned immediately (`loading` stays
 * false) while a fresh fetch runs silently in the background and swaps in
 * once it resolves. Automatically re-fetches when `key` changes.
 *
 * Pass `null` as the key to skip fetching (e.g. before the user id is known).
 */
export function useCachedQuery<T>(key: string | null, fetcher: () => Promise<T>): CachedQueryResult<T> {
  const initial = key !== null ? (cache.get(key) as T | undefined) : undefined;
  const [data, setData] = useState<T | null>(initial ?? null);
  const [loading, setLoading] = useState(key !== null && initial === undefined);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Read through a ref rather than depending on `fetcher` directly, so callers
  // can pass a fresh closure every render without that alone triggering a
  // re-fetch — only an actual `key` change or an explicit reload() should.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const run = useCallback(async (forKey: string) => {
    const existing = cache.get(forKey) as T | undefined;
    if (existing !== undefined) {
      setData(existing);
      setLoading(false);
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const result = await fetcherRef.current();
      cache.set(forKey, result);
      setData(result);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (key !== null) void run(key);
    // Intentionally keyed only on `key`. `run` is stable (via the ref above),
    // so this fires exactly on mount and on key changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const reload = useCallback(async () => {
    if (key !== null) await run(key);
  }, [key, run]);

  return { data, loading, refreshing, error, reload };
}

/**
 * Drops everything cached under keys starting with `prefix`.
 *
 * Needed because caching introduces a new failure mode: writing new data
 * (e.g. saving today's log) doesn't automatically invalidate a screen that
 * cached a view of the old data. Without this, switching to Trends right
 * after logging would flash the pre-save numbers for one fetch cycle before
 * quietly correcting itself.
 */
export function invalidateCache(prefix: string): void {
  for (const k of cache.keys()) {
    if (k.startsWith(prefix)) cache.delete(k);
  }
}
