import { PlaybackClock } from './playback-clock';
import { PlayCanvasSequenceRenderer } from './playcanvas-renderer';
import { PLAYER_STYLES } from './styles';
import { resolveFrameUrl, validateManifest, type FourDGSManifestV1 } from './types';

const SPEEDS = [0.25, 0.5, 1, 2, 4];
const ICONS = {
  previous: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 5v14M18 6l-8 6 8 6z"/></svg>',
  next: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M18 5v14M6 6l8 6-8 6z"/></svg>',
  backward: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M19 12H5m6-6-6 6 6 6"/></svg>',
  forward: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 5l11 7-11 7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 6v12M15 6v12"/></svg>',
  reset: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>'
};

export class FourDGSPlayerElement extends HTMLElement {
  static readonly observedAttributes = ['src', 'autoplay', 'loop'];

  private readonly canvas: HTMLCanvasElement;
  private readonly statusElement: HTMLElement;
  private readonly titleElement: HTMLElement;
  private readonly slider: HTMLInputElement;
  private readonly frameLabel: HTMLElement;
  private readonly playButton: HTMLButtonElement;
  private readonly directionButton: HTMLButtonElement;
  private readonly speedSelect: HTMLSelectElement;
  private readonly renderer = new PlayCanvasSequenceRenderer();
  private manifest: FourDGSManifestV1 | null = null;
  private manifestUrl = '';
  private clock: PlaybackClock | null = null;
  private animationFrame = 0;
  private lastAnimationTime = 0;
  private loadGeneration = 0;
  private framePending = false;
  private initialized = false;
  private frameStatusTimer = 0;
  private frameStatusGeneration = 0;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot!.innerHTML = `
      <style>${PLAYER_STYLES}</style>
      <div class="viewport"><canvas tabindex="0" aria-label="4D 高斯泼溅观察窗口"></canvas></div>
      <div class="topbar">
        <div class="title">4DGS 播放器</div>
        <div class="status" data-busy="true" role="status" aria-live="polite">等待场景</div>
      </div>
      <div class="controls" aria-label="4DGS 播放控制">
        <div class="transport">
          <button type="button" data-action="previous" aria-label="上一帧" title="上一帧">${ICONS.previous}</button>
          <button type="button" data-action="direction" aria-label="切换为倒放" title="切换播放方向">${ICONS.forward}</button>
          <button type="button" data-action="toggle" aria-label="播放" title="播放或暂停（空格）">${ICONS.play}</button>
          <button type="button" data-action="next" aria-label="下一帧" title="下一帧">${ICONS.next}</button>
        </div>
        <label class="timeline-wrap">
          <span class="sr-only">时间轴</span>
          <input type="range" min="0" max="0" value="0" step="1" disabled>
          <span class="frame-label">0 / 0</span>
        </label>
        <div class="settings">
          <label>
            <span class="sr-only">播放速度</span>
            <select aria-label="播放速度">
              ${SPEEDS.map((speed) => `<option value="${speed}" ${speed === 1 ? 'selected' : ''}>${speed}×</option>`).join('')}
            </select>
          </label>
          <button type="button" data-action="reset" aria-label="重置视角" title="重置视角">${ICONS.reset}</button>
        </div>
      </div>
    `;

    this.canvas = this.shadowRoot!.querySelector('canvas')!;
    this.statusElement = this.shadowRoot!.querySelector('.status')!;
    this.titleElement = this.shadowRoot!.querySelector('.title')!;
    this.slider = this.shadowRoot!.querySelector('input[type="range"]')!;
    this.frameLabel = this.shadowRoot!.querySelector('.frame-label')!;
    this.playButton = this.getButton('toggle');
    this.directionButton = this.getButton('direction');
    this.speedSelect = this.shadowRoot!.querySelector('select')!;
    this.bindControls();
  }

  connectedCallback(): void {
    if (!this.hasAttribute('tabindex')) this.tabIndex = 0;
    this.animationFrame = requestAnimationFrame(this.updatePlayback);
    const src = this.getAttribute('src');
    if (src) void this.load(src);
  }

  disconnectedCallback(): void {
    cancelAnimationFrame(this.animationFrame);
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (!this.isConnected || oldValue === newValue) return;
    if (name === 'src' && newValue) void this.load(newValue);
    if (name === 'loop' && this.clock) {
      this.clock.loop = this.hasAttribute('loop') || Boolean(this.manifest?.loop);
    }
  }

  get currentTime(): number {
    return this.clock?.currentTime ?? 0;
  }

  set currentTime(value: number) {
    void this.seekTo(value);
  }

  get duration(): number {
    return this.clock?.duration ?? 0;
  }

  get currentFrame(): number {
    return this.clock?.currentFrame ?? 0;
  }

  get paused(): boolean {
    return this.clock?.paused ?? true;
  }

  get playbackRate(): number {
    return this.clock?.playbackRate ?? 1;
  }

  set playbackRate(value: number) {
    this.clock?.setPlaybackRate(value);
    this.updateControls();
    this.preloadNeighbors();
  }

  async load(src = this.getAttribute('src') ?? ''): Promise<void> {
    if (!src) throw new Error('必须提供场景清单地址。');
    const generation = ++this.loadGeneration;
    const manifestUrl = new URL(src, document.baseURI).href;
    this.cancelFrameStatus();
    this.setStatus('正在加载场景…', true);
    this.dispatchEvent(new CustomEvent('loadstart'));

    try {
      const response = await fetch(manifestUrl);
      if (!response.ok) throw new Error(`场景清单请求失败（HTTP ${response.status}）。`);
      const manifest = validateManifest(await response.json());
      if (generation !== this.loadGeneration) return;

      this.manifest = manifest;
      this.manifestUrl = manifestUrl;
      this.clock = new PlaybackClock({
        fps: manifest.fps,
        startFrame: manifest.frames.start,
        frameCount: manifest.frames.count,
        loop: this.hasAttribute('loop') || manifest.loop
      });
      this.titleElement.textContent = manifest.title ?? '4DGS 播放器';
      this.slider.min = String(manifest.frames.start);
      this.slider.max = String(manifest.frames.start + manifest.frames.count - 1);
      this.slider.disabled = false;

      if (!this.initialized) {
        await this.renderer.initialize(this.canvas, manifest, this.togglePlayback);
        this.initialized = true;
      } else {
        this.renderer.applyManifest(manifest);
      }
      if (generation !== this.loadGeneration) return;

      await this.renderCurrentFrame();
      if (generation !== this.loadGeneration) return;
      this.setStatus('', false);
      this.updateControls();
      this.dispatchEvent(new CustomEvent('ready', { detail: { manifest } }));
      if (this.hasAttribute('autoplay')) this.play();
    } catch (error) {
      if (generation !== this.loadGeneration) return;
      this.handleError(error);
      throw error;
    }
  }

  play(): void {
    if (!this.clock || !this.clock.paused) return;
    this.clock.play();
    this.updateControls();
    this.dispatchEvent(new CustomEvent('play'));
  }

  pause(): void {
    if (!this.clock || this.clock.paused) return;
    this.clock.pause();
    this.updateControls();
    this.dispatchEvent(new CustomEvent('pause'));
  }

  async seekTo(seconds: number): Promise<void> {
    if (!this.clock) return;
    this.clock.seekTo(seconds);
    await this.renderCurrentFrame();
  }

  async step(delta: number): Promise<void> {
    if (!this.clock) return;
    this.pause();
    const result = this.clock.step(delta);
    if (result.frameChanged) await this.renderCurrentFrame();
    if (result.ended) this.dispatchEvent(new CustomEvent('ended'));
  }

  resetCamera(): void {
    this.renderer.resetCamera();
  }

  dispose(): void {
    this.loadGeneration += 1;
    cancelAnimationFrame(this.animationFrame);
    this.cancelFrameStatus();
    this.renderer.dispose();
    this.initialized = false;
    this.manifest = null;
    this.clock = null;
  }

  private readonly updatePlayback = (timestamp: number): void => {
    const delta = this.lastAnimationTime === 0 ? 0 : Math.min((timestamp - this.lastAnimationTime) / 1000, 0.1);
    this.lastAnimationTime = timestamp;
    if (this.clock && !this.framePending) {
      const result = this.clock.update(delta);
      if (result.frameChanged) void this.renderCurrentFrame();
      if (result.ended) {
        this.updateControls();
        this.dispatchEvent(new CustomEvent('ended'));
      }
    }
    this.animationFrame = requestAnimationFrame(this.updatePlayback);
  };

  private readonly togglePlayback = (): void => {
    this.paused ? this.play() : this.pause();
  };

  private async renderCurrentFrame(): Promise<void> {
    if (!this.clock || !this.manifest || !this.manifestUrl) return;
    const frame = this.clock.currentFrame;
    const frameOrdinal = frame - this.clock.startFrame + 1;
    const url = resolveFrameUrl(this.manifestUrl, this.manifest, frame);
    const statusGeneration = ++this.frameStatusGeneration;
    if (this.frameStatusTimer) window.clearTimeout(this.frameStatusTimer);
    this.frameStatusTimer = window.setTimeout(() => {
      if (statusGeneration === this.frameStatusGeneration && this.clock?.paused) {
        this.setStatus(`正在缓冲第 ${frameOrdinal} 帧…`, true);
      }
    }, 400);
    this.framePending = true;
    this.updateControls();
    this.dispatchEvent(new CustomEvent('progress', { detail: { frame, state: 'loading' } }));
    let failed = false;
    try {
      const displayed = await this.renderer.showFrame(frame, url);
      if (!displayed || frame !== this.clock.currentFrame) return;
      this.updateControls();
      this.preloadNeighbors();
      this.dispatchEvent(new CustomEvent('progress', { detail: { frame, state: 'ready' } }));
      this.dispatchEvent(new CustomEvent('timeupdate', {
        detail: { currentTime: this.currentTime, currentFrame: frame }
      }));
    } catch (error) {
      failed = true;
      this.pause();
      this.handleError(error);
    } finally {
      if (statusGeneration === this.frameStatusGeneration) {
        if (this.frameStatusTimer) window.clearTimeout(this.frameStatusTimer);
        this.frameStatusTimer = 0;
        if (!failed) this.setStatus('', false);
      }
      this.framePending = false;
      this.updateControls();
    }
  }

  private preloadNeighbors(): void {
    if (!this.clock || !this.manifest) return;
    const direction = Math.sign(this.clock.playbackRate);
    const frames: Array<{ frame: number; url: string }> = [];
    const seen = new Set<number>([this.clock.currentFrame]);
    for (let offset = 1; offset <= 8; offset += 1) {
      const frame = this.wrapFrame(this.clock.currentFrame + direction * offset);
      if (frame === null || seen.has(frame)) break;
      seen.add(frame);
      frames.push({ frame, url: resolveFrameUrl(this.manifestUrl, this.manifest, frame) });
    }
    for (let offset = 1; offset <= 2; offset += 1) {
      const frame = this.wrapFrame(this.clock.currentFrame - direction * offset);
      if (frame === null || seen.has(frame)) continue;
      seen.add(frame);
      frames.push({ frame, url: resolveFrameUrl(this.manifestUrl, this.manifest, frame) });
    }
    this.renderer.preload(frames);
  }

  private wrapFrame(frame: number): number | null {
    if (!this.clock) return null;
    if (frame > this.clock.endFrame) return this.clock.loop ? this.clock.startFrame + (frame - this.clock.endFrame - 1) : null;
    if (frame < this.clock.startFrame) return this.clock.loop ? this.clock.endFrame - (this.clock.startFrame - frame - 1) : null;
    return frame;
  }

  private bindControls(): void {
    this.getButton('previous').addEventListener('click', () => void this.step(-1));
    this.getButton('next').addEventListener('click', () => void this.step(1));
    this.directionButton.addEventListener('click', () => {
      const direction = this.playbackRate < 0 ? 1 : -1;
      this.playbackRate = direction * Number(this.speedSelect.value);
    });
    this.playButton.addEventListener('click', () => this.paused ? this.play() : this.pause());
    this.getButton('reset').addEventListener('click', () => this.resetCamera());
    this.slider.addEventListener('input', () => {
      if (!this.clock) return;
      this.clock.seekFrame(Number(this.slider.value));
      this.updateControls();
    });
    this.slider.addEventListener('change', () => void this.renderCurrentFrame());
    this.speedSelect.addEventListener('change', () => {
      const direction = Math.sign(this.playbackRate) || 1;
      this.playbackRate = direction * Number(this.speedSelect.value);
    });
  }

  private updateControls(): void {
    if (!this.clock) return;
    this.slider.value = String(this.clock.currentFrame);
    this.frameLabel.textContent = `${this.clock.currentFrame - this.clock.startFrame + 1} / ${this.clock.frameCount}`;
    this.playButton.innerHTML = this.clock.paused ? ICONS.play : ICONS.pause;
    this.playButton.setAttribute('aria-label', this.clock.paused ? '播放' : '暂停');
    const backward = this.clock.playbackRate < 0;
    this.directionButton.innerHTML = backward ? ICONS.backward : ICONS.forward;
    this.directionButton.setAttribute('aria-label', backward ? '切换为正放' : '切换为倒放');
    this.directionButton.dataset.active = String(backward);
    this.speedSelect.value = String(Math.abs(this.clock.playbackRate));
  }

  private setStatus(message: string, busy: boolean): void {
    this.statusElement.textContent = message;
    this.statusElement.dataset.busy = String(busy);
    this.statusElement.hidden = message.length === 0;
  }

  private cancelFrameStatus(): void {
    this.frameStatusGeneration += 1;
    if (this.frameStatusTimer) window.clearTimeout(this.frameStatusTimer);
    this.frameStatusTimer = 0;
  }

  private handleError(error: unknown): void {
    const normalized = error instanceof Error ? error : new Error(String(error));
    this.setStatus(normalized.message, false);
    this.dispatchEvent(new CustomEvent('error', { detail: normalized }));
  }

  private getButton(action: string): HTMLButtonElement {
    return this.shadowRoot!.querySelector(`button[data-action="${action}"]`)!;
  }

}

if (!customElements.get('four-dgs-player')) {
  customElements.define('four-dgs-player', FourDGSPlayerElement);
}
