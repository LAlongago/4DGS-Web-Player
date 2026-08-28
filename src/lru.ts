export interface LruEntry {
  lastUsed: number;
}

export function selectLruKey<Key>(
  entries: ReadonlyMap<Key, LruEntry>,
  protectedKeys: ReadonlySet<Key>
): Key | undefined {
  let selected: Key | undefined;
  let oldest = Number.POSITIVE_INFINITY;
  for (const [key, entry] of entries) {
    if (protectedKeys.has(key) || entry.lastUsed >= oldest) continue;
    selected = key;
    oldest = entry.lastUsed;
  }
  return selected;
}

