import { describe, expect, it } from 'vitest';
import { resolveFrameUrl, validateManifest } from '../src/types';

const manifest = validateManifest({
  version: 1,
  fps: 30,
  loop: true,
  frames: { pattern: 'frames/frame_{frame:05}.compressed.ply', start: 0, count: 141 }
});

describe('manifest', () => {
  it('resolves padded frame URLs relative to the manifest', () => {
    expect(resolveFrameUrl('https://example.test/scenes/demo/manifest.json', manifest, 7)).toBe(
      'https://example.test/scenes/demo/frames/frame_00007.compressed.ply'
    );
  });

  it('rejects malformed manifests', () => {
    expect(() => validateManifest({ ...manifest, fps: 0 })).toThrow(/fps/);
    expect(() => validateManifest({ ...manifest, frames: { pattern: 'frame.ply', start: 0, count: 1 } })).toThrow(
      /placeholder/
    );
  });
});
