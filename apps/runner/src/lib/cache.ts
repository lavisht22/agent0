interface CacheEntry<T> {
	data: T;
	expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

/** Cached query that also deduplicates concurrent callers of the same key. */
export async function cachedQuery<T>(
	key: string,
	ttlMs: number,
	fetcher: () => Promise<T>,
): Promise<T> {
	const entry = cache.get(key) as CacheEntry<T> | undefined;
	if (entry && entry.expiresAt > Date.now()) {
		return entry.data;
	}

	const pending = inflight.get(key) as Promise<T> | undefined;
	if (pending) {
		return pending;
	}

	const promise = fetcher()
		.then((data) => {
			cache.set(key, { data, expiresAt: Date.now() + ttlMs });
			inflight.delete(key);
			return data;
		})
		.catch((err) => {
			inflight.delete(key);
			throw err;
		});

	inflight.set(key, promise);
	return promise;
}

/** Invalidate a single cache key */
export function invalidate(key: string): void {
	cache.delete(key);
	inflight.delete(key);
}

/** Invalidate all keys starting with the given prefix */
export function invalidatePrefix(prefix: string): void {
	for (const key of cache.keys()) {
		if (key.startsWith(prefix)) {
			cache.delete(key);
		}
	}
	for (const key of inflight.keys()) {
		if (key.startsWith(prefix)) {
			inflight.delete(key);
		}
	}
}
