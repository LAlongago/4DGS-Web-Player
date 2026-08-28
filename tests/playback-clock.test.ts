import { describe, expect, it } from 'vitest';
import { PlaybackClock } from '../src/playback-clock';

describe('PlaybackClock', () => {
  it('advances, reverses, and reports media-style time', () => {
    const clock = new PlaybackClock({ fps: 10, startFrame: 5, frameCount: 4, loop: true });
    clock.play();
    expect(clock.update(0.11).frameChanged).toBe(true);
    expect(clock.currentFrame).toBe(6);
    expect(clock.currentTime).toBeCloseTo(0.1);
    expect(clock.duration).toBeCloseTo(0.4);

    clock.setPlaybackRate(-2);
    clock.update(0.11);
    expect(clock.currentFrame).toBe(8);
  });

  it('stops at either boundary when looping is disabled', () => {
    const clock = new PlaybackClock({ fps: 30, startFrame: 0, frameCount: 3, loop: false });
    clock.seekFrame(2);
    clock.play();
    expect(clock.step(1)).toEqual({ frameChanged: false, ended: true });
    expect(clock.paused).toBe(true);

    clock.seekFrame(0);
    clock.play();
    clock.setPlaybackRate(-1);
    expect(clock.step(-1)).toEqual({ frameChanged: false, ended: true });
  });

  it('clamps seeks to the valid frame range', () => {
    const clock = new PlaybackClock({ fps: 25, startFrame: 10, frameCount: 5, loop: false });
    clock.seekTo(99);
    expect(clock.currentFrame).toBe(14);
    clock.seekTo(-1);
    expect(clock.currentFrame).toBe(10);
  });
});
