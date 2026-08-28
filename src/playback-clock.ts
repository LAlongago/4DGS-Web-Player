export interface PlaybackClockOptions {
  fps: number;
  startFrame: number;
  frameCount: number;
  loop: boolean;
}

export interface PlaybackTick {
  frameChanged: boolean;
  ended: boolean;
}

export class PlaybackClock {
  readonly fps: number;
  readonly startFrame: number;
  readonly frameCount: number;
  loop: boolean;
  playbackRate = 1;
  paused = true;
  currentFrame: number;

  private accumulator = 0;

  constructor(options: PlaybackClockOptions) {
    if (options.fps <= 0 || options.frameCount < 1) {
      throw new Error('PlaybackClock requires a positive fps and frameCount.');
    }
    this.fps = options.fps;
    this.startFrame = options.startFrame;
    this.frameCount = options.frameCount;
    this.loop = options.loop;
    this.currentFrame = options.startFrame;
  }

  get endFrame(): number {
    return this.startFrame + this.frameCount - 1;
  }

  get currentTime(): number {
    return (this.currentFrame - this.startFrame) / this.fps;
  }

  get duration(): number {
    return this.frameCount / this.fps;
  }

  play(): void {
    this.paused = false;
  }

  pause(): void {
    this.paused = true;
  }

  setPlaybackRate(rate: number): void {
    if (!Number.isFinite(rate) || rate === 0) {
      throw new Error('playbackRate must be a finite, non-zero number.');
    }
    this.playbackRate = rate;
    this.accumulator = 0;
  }

  seekTo(seconds: number): boolean {
    const frameOffset = Math.round(Math.max(0, seconds) * this.fps);
    return this.seekFrame(this.startFrame + Math.min(frameOffset, this.frameCount - 1));
  }

  seekFrame(frame: number): boolean {
    const next = Math.max(this.startFrame, Math.min(this.endFrame, Math.round(frame)));
    const changed = next !== this.currentFrame;
    this.currentFrame = next;
    this.accumulator = 0;
    return changed;
  }

  step(delta: number): PlaybackTick {
    if (delta === 0) return { frameChanged: false, ended: false };
    const direction = Math.sign(delta);
    let remaining = Math.abs(Math.trunc(delta));
    let changed = false;
    let ended = false;

    while (remaining > 0) {
      let next = this.currentFrame + direction;
      if (next > this.endFrame || next < this.startFrame) {
        if (this.loop) {
          next = direction > 0 ? this.startFrame : this.endFrame;
        } else {
          next = direction > 0 ? this.endFrame : this.startFrame;
          this.paused = true;
          ended = true;
        }
      }
      changed ||= next !== this.currentFrame;
      this.currentFrame = next;
      remaining -= 1;
      if (ended) break;
    }
    this.accumulator = 0;
    return { frameChanged: changed, ended };
  }

  update(deltaSeconds: number): PlaybackTick {
    if (this.paused || deltaSeconds <= 0) {
      return { frameChanged: false, ended: false };
    }
    this.accumulator += deltaSeconds * Math.abs(this.playbackRate);
    const frameDuration = 1 / this.fps;
    const steps = Math.floor(this.accumulator / frameDuration);
    if (steps < 1) return { frameChanged: false, ended: false };
    this.accumulator -= steps * frameDuration;
    const result = this.step(Math.sign(this.playbackRate) * steps);
    if (!result.ended) {
      this.accumulator = Math.min(this.accumulator, frameDuration);
    }
    return result;
  }
}
