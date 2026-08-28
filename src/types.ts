export type Vec3Tuple = [number, number, number];
export type RgbaTuple = [number, number, number, number];

export interface FourDGSManifestV1 {
  version: 1;
  title?: string;
  fps: number;
  loop: boolean;
  frames: {
    pattern: string;
    start: number;
    count: number;
  };
  background?: RgbaTuple;
  camera?: {
    position: Vec3Tuple;
    target: Vec3Tuple;
    fov: number;
  };
}

const isFiniteTuple = (value: unknown, length: number): value is number[] =>
  Array.isArray(value) && value.length === length && value.every(Number.isFinite);

export function validateManifest(value: unknown): FourDGSManifestV1 {
  if (!value || typeof value !== 'object') {
    throw new Error('The 4DGS manifest must be a JSON object.');
  }

  const manifest = value as Record<string, unknown>;
  if (manifest.version !== 1) {
    throw new Error('Unsupported 4DGS manifest version. Expected version 1.');
  }
  if (!Number.isFinite(manifest.fps) || (manifest.fps as number) <= 0) {
    throw new Error('Manifest fps must be greater than zero.');
  }
  if (typeof manifest.loop !== 'boolean') {
    throw new Error('Manifest loop must be a boolean.');
  }
  if (!manifest.frames || typeof manifest.frames !== 'object') {
    throw new Error('Manifest frames must be an object.');
  }

  const frames = manifest.frames as Record<string, unknown>;
  if (typeof frames.pattern !== 'string' || !frames.pattern.includes('{frame')) {
    throw new Error('Manifest frames.pattern must contain a {frame} placeholder.');
  }
  if (!Number.isInteger(frames.start)) {
    throw new Error('Manifest frames.start must be an integer.');
  }
  if (!Number.isInteger(frames.count) || (frames.count as number) < 1) {
    throw new Error('Manifest frames.count must be a positive integer.');
  }

  if (manifest.background !== undefined && !isFiniteTuple(manifest.background, 4)) {
    throw new Error('Manifest background must contain four finite numbers.');
  }
  if (manifest.camera !== undefined) {
    if (!manifest.camera || typeof manifest.camera !== 'object') {
      throw new Error('Manifest camera must be an object.');
    }
    const camera = manifest.camera as Record<string, unknown>;
    if (!isFiniteTuple(camera.position, 3) || !isFiniteTuple(camera.target, 3)) {
      throw new Error('Manifest camera position and target must contain three finite numbers.');
    }
    if (!Number.isFinite(camera.fov) || (camera.fov as number) <= 0 || (camera.fov as number) >= 180) {
      throw new Error('Manifest camera fov must be between 0 and 180 degrees.');
    }
  }

  return value as FourDGSManifestV1;
}

export function resolveFrameUrl(
  manifestUrl: string,
  manifest: FourDGSManifestV1,
  frame: number
): string {
  const paddingMatch = manifest.frames.pattern.match(/\{frame(?::(\d+))?\}/);
  if (!paddingMatch) {
    throw new Error('Manifest frame pattern is missing its placeholder.');
  }
  const width = paddingMatch[1] ? Number.parseInt(paddingMatch[1], 10) : 0;
  const value = width > 0 ? String(frame).padStart(width, '0') : String(frame);
  const path = manifest.frames.pattern.replace(paddingMatch[0], value);
  return new URL(path, manifestUrl).href;
}
