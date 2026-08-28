import {
  Application,
  Asset,
  Color,
  DEVICETYPE_WEBGL2,
  DEVICETYPE_WEBGPU,
  Entity,
  Keyboard,
  Mouse,
  RESOLUTION_AUTO,
  TouchDevice,
  Vec3,
  createGraphicsDevice
} from 'playcanvas';
import { CameraControls } from 'playcanvas/scripts/esm/camera-controls.mjs';
import { selectLruKey } from './lru';
import type { FourDGSManifestV1 } from './types';

const CAMERA_KEY_CODES = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE']);
const PLAYBACK_KEY_CODE = 'Space';

interface CameraPose {
  position: Vec3;
  angles: Vec3;
  distance: number;
  getFocus(out: Vec3): Vec3;
}

interface CameraControlsInternals extends CameraControls {
  _pose: CameraPose;
  _controller: {
    attach(pose: CameraPose, smooth?: boolean): void;
  };
  _setMode(mode: 'orbit'): void;
  _desktopInput: {
    read(): { button: number[]; key: number[]; mouse: number[]; wheel: number[]; [key: string]: unknown };
  };
}

interface CachedFrame {
  asset: Asset;
  lastUsed: number;
  promise: Promise<Asset>;
}

interface PendingFrameSwap {
  asset: Asset;
  token: number;
  url: string;
  resolve: (displayed: boolean) => void;
  targetIndex?: 0 | 1;
}

class FrameAssetCache {
  private readonly entries = new Map<string, CachedFrame>();
  private readonly pendingUnloads = new Map<Asset, number>();
  private counter = 0;
  private frameIndex = 0;

  constructor(
    private readonly app: Application,
    private readonly maxEntries: number
  ) {
    app.on('frameupdate', this.processPendingUnloads);
  }

  load(frame: number, url: string): Promise<Asset> {
    const cached = this.entries.get(url);
    if (cached) {
      cached.lastUsed = ++this.counter;
      return cached.promise;
    }

    const asset = new Asset(`4dgs-frame-${frame}`, 'gsplat', { url }, { reorder: false });
    const promise = new Promise<Asset>((resolve, reject) => {
      const onLoad = () => resolve(asset);
      const onError = (error: unknown) => reject(error instanceof Error ? error : new Error(String(error)));
      asset.once('load', onLoad);
      asset.once('error', onError);
      this.app.assets.add(asset);
      this.app.assets.load(asset);
    });
    this.entries.set(url, { asset, promise, lastUsed: ++this.counter });
    void promise.catch(() => {
      this.release(url);
    });
    return promise;
  }

  trim(protectedUrls: Set<string>): void {
    while (this.entries.size > this.maxEntries) {
      const candidate = selectLruKey(this.entries, protectedUrls);
      if (candidate === undefined) return;
      this.release(candidate);
    }
  }

  clear(): void {
    for (const url of [...this.entries.keys()]) this.release(url);
  }

  dispose(): void {
    this.app.off('frameupdate', this.processPendingUnloads);
    this.clear();
    for (const asset of this.pendingUnloads.keys()) {
      this.app.assets.remove(asset);
      asset.unload();
    }
    this.pendingUnloads.clear();
  }

  get size(): number {
    return this.entries.size;
  }

  private release(url: string): void {
    const entry = this.entries.get(url);
    if (!entry) return;
    this.entries.delete(url);
    // Component/world references are released during PlayCanvas' frame update.
    // Deferring unload avoids destroying a resource still used by GSplatWorld.
    // Keep evicted GPU resources alive across the renderer's queued frames.
    this.pendingUnloads.set(entry.asset, this.frameIndex + 4);
  }

  private readonly processPendingUnloads = (): void => {
    this.frameIndex += 1;
    for (const [asset, releaseFrame] of this.pendingUnloads) {
      if (this.frameIndex < releaseFrame) continue;
      if (asset.loading) continue;
      const resource = asset.resource as { refCount?: number } | null;
      if (resource && typeof resource.refCount === 'number' && resource.refCount > 0) continue;
      this.app.assets.remove(asset);
      if (asset.resource) asset.unload();
      this.pendingUnloads.delete(asset);
    }
  };
}

export class PlayCanvasSequenceRenderer {
  private app: Application | null = null;
  private splatEntities: [Entity, Entity] | null = null;
  private activeSplatIndex: -1 | 0 | 1 = -1;
  private cameraEntity: Entity | null = null;
  private cameraControls: CameraControls | null = null;
  private cache: FrameAssetCache | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private requestToken = 0;
  private currentUrl: string | null = null;
  private pendingSwap: PendingFrameSwap | null = null;
  private initialFocus = new Vec3(0, 0, 0);
  private initialPosition = new Vec3(0, 0, 3);
  private readonly pressedOrbitKeys = new Set<string>();
  private readonly cameraMove = new Vec3();
  private readonly cameraFocus = new Vec3();
  private readonly mouseButtonState: [number, number] = [0, 0];
  private pointerInside = false;
  private togglePlayback: (() => void) | null = null;
  private canvas: HTMLCanvasElement | null = null;

  async initialize(
    canvas: HTMLCanvasElement,
    manifest: FourDGSManifestV1,
    togglePlayback: () => void
  ): Promise<void> {
    this.togglePlayback = togglePlayback;
    if (this.app) {
      this.applyManifest(manifest);
      return;
    }

    const device = await createGraphicsDevice(canvas, {
      deviceTypes: [DEVICETYPE_WEBGPU, DEVICETYPE_WEBGL2],
      antialias: false
    });
    device.maxPixelRatio = Math.min(window.devicePixelRatio || 1, 2);

    const app = new Application(canvas, {
      graphicsDevice: device,
      keyboard: new Keyboard(window),
      mouse: new Mouse(canvas),
      touch: new TouchDevice(canvas)
    });
    app.setCanvasResolution(RESOLUTION_AUTO);
    this.canvas = canvas;
    canvas.addEventListener('pointerdown', this.focusCanvas);
    canvas.addEventListener('pointerenter', this.handlePointerEnter);
    canvas.addEventListener('pointerleave', this.handlePointerLeave);
    window.addEventListener('keydown', this.handleCameraKeyDown, true);
    window.addEventListener('keyup', this.handleCameraKeyUp, true);
    window.addEventListener('blur', this.clearCameraKeys);

    const camera = new Entity('4DGS Camera');
    camera.addComponent('camera', {
      nearClip: 0.01,
      farClip: 10_000,
      clearColor: new Color(0.04, 0.05, 0.07, 1)
    });
    camera.addComponent('script');
    const controls = camera.script?.create(CameraControls) as unknown as CameraControls;
    controls.enableFly = false;
    controls.enableOrbit = true;
    controls.enablePan = true;
    const desktopInput = (controls as CameraControlsInternals)._desktopInput;
    const readDesktopInput = desktopInput.read.bind(desktopInput);
    desktopInput.read = () => {
      const input = readDesktopInput();
      input.key.fill(0);
      if (!this.isInteractionActive()) {
        input.button.fill(0);
        input.button[0] = -this.mouseButtonState[0];
        input.button[1] = -this.mouseButtonState[1];
        this.mouseButtonState[0] = 0;
        this.mouseButtonState[1] = 0;
        input.mouse.fill(0);
        input.wheel.fill(0);
        return input;
      }
      const leftButton = input.button[0];
      const rightButton = input.button[2];
      input.button[0] = leftButton;
      input.button[1] = rightButton;
      input.button[2] = 0;
      this.mouseButtonState[0] = Math.min(1, Math.max(0, this.mouseButtonState[0] + leftButton));
      this.mouseButtonState[1] = Math.min(1, Math.max(0, this.mouseButtonState[1] + rightButton));
      return input;
    };

    const splats = [0, 1].map((index) => {
      const splat = new Entity(`4DGS Sequence ${index + 1}`);
      // PlayCanvas 2.21.4 unified placements cannot yet be safely unloaded while
      // a flipbook is switching frames. Pin this compatible path until that
      // engine lifecycle issue is resolved.
      splat.addComponent('gsplat', { unified: false });
      splat.enabled = false;
      return splat;
    }) as [Entity, Entity];

    app.root.addChild(camera);
    app.root.addChild(splats[0]);
    app.root.addChild(splats[1]);
    app.start();

    this.app = app;
    this.cameraEntity = camera;
    this.cameraControls = controls;
    this.splatEntities = splats;
    this.cache = new FrameAssetCache(app, 12);
    app.on('frameupdate', this.commitPendingSwap);
    app.on('update', this.updateKeyboardOrbit);
    this.applyManifest(manifest);

    this.resizeObserver = new ResizeObserver(() => app.resizeCanvas());
    this.resizeObserver.observe(canvas);
  }

  applyManifest(manifest: FourDGSManifestV1): void {
    if (!this.cameraEntity || !this.cameraControls) return;
    const background = manifest.background ?? [0.04, 0.05, 0.07, 1];
    this.cameraEntity.camera!.clearColor = new Color(...background);
    this.cameraEntity.camera!.fov = manifest.camera?.fov ?? 60;
    this.initialPosition.set(...(manifest.camera?.position ?? [0, 0, 3]));
    this.initialFocus.set(...(manifest.camera?.target ?? [0, 0, 0]));
    this.resetCamera();
  }

  async showFrame(frame: number, url: string): Promise<boolean> {
    if (!this.cache || !this.app) {
      throw new Error('The PlayCanvas renderer has not been initialized.');
    }
    const token = ++this.requestToken;
    if (url === this.currentUrl) {
      this.pendingSwap?.resolve(false);
      this.pendingSwap = null;
      return true;
    }
    const asset = await this.cache.load(frame, url);
    if (token !== this.requestToken) return false;
    return new Promise<boolean>((resolve) => {
      this.pendingSwap?.resolve(false);
      this.pendingSwap = { asset, token, url, resolve };
    });
  }

  preload(frames: Array<{ frame: number; url: string }>): void {
    if (!this.cache) return;
    const protectedUrls = new Set<string>(this.currentUrl === null ? [] : [this.currentUrl]);
    for (const item of frames) {
      protectedUrls.add(item.url);
      void this.cache.load(item.frame, item.url).catch(() => undefined);
    }
    this.cache.trim(protectedUrls);
  }

  resetCamera(): void {
    this.cameraControls?.reset(this.initialFocus, this.initialPosition);
  }

  get cachedFrameCount(): number {
    return this.cache?.size ?? 0;
  }

  private readonly commitPendingSwap = (): void => {
    const pending = this.pendingSwap;
    if (!pending) return;
    if (pending.token !== this.requestToken || !this.splatEntities || !this.cameraEntity || !this.cache) {
      this.pendingSwap = null;
      pending.resolve(false);
      return;
    }

    const targetIndex = pending.targetIndex ?? (this.activeSplatIndex === 0 ? 1 : 0);
    const target = this.splatEntities[targetIndex];
    if (pending.targetIndex === undefined) {
      pending.targetIndex = targetIndex;
      target.gsplat!.asset = pending.asset;
      target.gsplat!.instance?.sort(this.cameraEntity);
    }

    const instance = target.gsplat!.instance;
    instance?.update();
    if (!instance || instance.meshInstance.instancingCount === 0) return;

    target.enabled = true;
    if (this.activeSplatIndex !== -1) this.splatEntities[this.activeSplatIndex].enabled = false;
    this.activeSplatIndex = targetIndex;
    this.currentUrl = pending.url;
    this.cache.trim(new Set([pending.url]));
    this.pendingSwap = null;
    pending.resolve(true);
  };

  private readonly focusCanvas = (): void => {
    this.canvas?.focus({ preventScroll: true });
  };

  private hasCanvasFocus(): boolean {
    if (!this.canvas) return false;
    const root = this.canvas.getRootNode();
    return document.activeElement === this.canvas || (root instanceof ShadowRoot && root.activeElement === this.canvas);
  }

  private isInteractionActive(): boolean {
    return this.pointerInside && this.hasCanvasFocus();
  }

  private readonly handlePointerEnter = (): void => {
    this.pointerInside = true;
  };

  private readonly handlePointerLeave = (): void => {
    this.pointerInside = false;
    this.clearCameraKeys();
  };

  private readonly handleCameraKeyDown = (event: KeyboardEvent): void => {
    if (!this.isInteractionActive()) return;
    const modified = event.ctrlKey || event.metaKey || event.altKey;
    if (CAMERA_KEY_CODES.has(event.code) || event.code === PLAYBACK_KEY_CODE || modified) {
      event.preventDefault();
    }
    if (modified) return;
    if (event.code === PLAYBACK_KEY_CODE) {
      event.stopPropagation();
      if (!event.repeat) this.togglePlayback?.();
      return;
    }
    if (!CAMERA_KEY_CODES.has(event.code)) return;
    event.stopPropagation();
    const firstPress = !this.pressedOrbitKeys.has(event.code);
    this.pressedOrbitKeys.add(event.code);
    if (firstPress) this.updateKeyboardOrbit(1 / 60);
  };

  private readonly handleCameraKeyUp = (event: KeyboardEvent): void => {
    const recognized = CAMERA_KEY_CODES.has(event.code) || event.code === PLAYBACK_KEY_CODE;
    if (this.isInteractionActive() && (recognized || event.ctrlKey || event.metaKey || event.altKey)) {
      event.preventDefault();
    }
    if (event.code === PLAYBACK_KEY_CODE) {
      if (this.isInteractionActive()) event.stopPropagation();
      return;
    }
    if (!CAMERA_KEY_CODES.has(event.code)) return;
    const wasPressed = this.pressedOrbitKeys.delete(event.code);
    if (!wasPressed && !this.isInteractionActive()) return;
    event.preventDefault();
    event.stopPropagation();
  };

  private readonly clearCameraKeys = (): void => {
    this.pressedOrbitKeys.clear();
  };

  private isOrbitKeyPressed(code: string): boolean {
    return this.pressedOrbitKeys.has(code);
  }

  private readonly updateKeyboardOrbit = (deltaSeconds: number): void => {
    if (!this.cameraEntity || !this.cameraControls || this.pressedOrbitKeys.size === 0) return;
    const controls = this.cameraControls as CameraControlsInternals;
    controls._setMode('orbit');
    controls._pose.getFocus(this.cameraFocus);
    const rotateStep = 45 * deltaSeconds;
    const pitch = Number(this.isOrbitKeyPressed('KeyS')) - Number(this.isOrbitKeyPressed('KeyW'));
    const yaw = Number(this.isOrbitKeyPressed('KeyD')) - Number(this.isOrbitKeyPressed('KeyA'));
    const zoom = Number(this.isOrbitKeyPressed('KeyE')) - Number(this.isOrbitKeyPressed('KeyQ'));
    controls._pose.angles.x += pitch * rotateStep;
    controls._pose.angles.y += yaw * rotateStep;
    controls._pose.distance = Math.max(0.01, controls._pose.distance * Math.exp(zoom * deltaSeconds));
    this.cameraEntity.setEulerAngles(controls._pose.angles);
    this.cameraMove.copy(this.cameraEntity.forward).mulScalar(-controls._pose.distance).add(this.cameraFocus);
    controls._pose.position.copy(this.cameraMove);
    controls._controller.attach(controls._pose, false);
    this.cameraEntity.setPosition(controls._pose.position);
  };

  dispose(): void {
    this.requestToken += 1;
    this.pendingSwap?.resolve(false);
    this.pendingSwap = null;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.app?.off('frameupdate', this.commitPendingSwap);
    this.app?.off('update', this.updateKeyboardOrbit);
    this.canvas?.removeEventListener('pointerdown', this.focusCanvas);
    this.canvas?.removeEventListener('pointerenter', this.handlePointerEnter);
    this.canvas?.removeEventListener('pointerleave', this.handlePointerLeave);
    window.removeEventListener('keydown', this.handleCameraKeyDown, true);
    window.removeEventListener('keyup', this.handleCameraKeyUp, true);
    window.removeEventListener('blur', this.clearCameraKeys);
    this.clearCameraKeys();
    this.cache?.dispose();
    this.cache = null;
    this.app?.destroy();
    this.app = null;
    this.splatEntities = null;
    this.activeSplatIndex = -1;
    this.cameraEntity = null;
    this.cameraControls = null;
    this.currentUrl = null;
    this.mouseButtonState[0] = 0;
    this.mouseButtonState[1] = 0;
    this.pointerInside = false;
    this.togglePlayback = null;
    this.canvas = null;
  }
}
