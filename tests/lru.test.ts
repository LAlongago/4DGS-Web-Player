import { describe, expect, it } from 'vitest';
import { selectLruKey } from '../src/lru';

describe('selectLruKey', () => {
  it('evicts the oldest unprotected entry', () => {
    const entries = new Map([
      ['current', { lastUsed: 1 }],
      ['oldest', { lastUsed: 2 }],
      ['newest', { lastUsed: 3 }]
    ]);
    expect(selectLruKey(entries, new Set(['current']))).toBe('oldest');
  });

  it('returns undefined when every entry is protected', () => {
    const entries = new Map([['only', { lastUsed: 1 }]]);
    expect(selectLruKey(entries, new Set(['only']))).toBeUndefined();
  });
});
