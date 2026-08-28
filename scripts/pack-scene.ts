import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FourDGSManifestV1 } from '../src/types';

const execFileAsync = promisify(execFile);

interface Options {
  input: string;
  output: string;
  overwrite: boolean;
  title?: string;
  fps?: number;
}

function parseArgs(args: string[]): Options {
  const values = new Map<string, string>();
  let overwrite = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--overwrite') {
      overwrite = true;
    } else if (arg.startsWith('--')) {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
      values.set(arg, value);
      index += 1;
    }
  }
  const input = values.get('--input');
  const output = values.get('--output');
  if (!input || !output) {
    throw new Error('Usage: npm run pack-scene -- --input <raw-export> --output <web-scene> [--overwrite]');
  }
  const fpsValue = values.get('--fps');
  const fps = fpsValue === undefined ? undefined : Number(fpsValue);
  if (fps !== undefined && (!Number.isFinite(fps) || fps <= 0)) throw new Error('--fps must be positive.');
  return { input: resolve(input), output: resolve(output), overwrite, title: values.get('--title'), fps };
}

function framePath(pattern: string, frame: number): string {
  const match = pattern.match(/\{frame(?::(\d+))?\}/);
  if (!match) throw new Error('Input manifest frame pattern is invalid.');
  const value = match[1] ? String(frame).padStart(Number(match[1]), '0') : String(frame);
  return pattern.replace(match[0], value);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const inputManifestPath = join(options.input, 'manifest.json');
  const inputManifest = JSON.parse(await readFile(inputManifestPath, 'utf8')) as FourDGSManifestV1;
  const cliPath = fileURLToPath(new URL('../node_modules/@playcanvas/splat-transform/bin/cli.mjs', import.meta.url));
  const outputFrames = join(options.output, 'frames');
  await mkdir(outputFrames, { recursive: true });

  const start = inputManifest.frames.start;
  const end = start + inputManifest.frames.count;
  for (let frame = start; frame < end; frame += 1) {
    const relativeInput = framePath(inputManifest.frames.pattern, frame);
    const inputPath = resolve(dirname(inputManifestPath), relativeInput);
    const outputName = `frame_${String(frame).padStart(5, '0')}.compressed.ply`;
    const outputPath = join(outputFrames, outputName);
    const args = [cliPath];
    if (options.overwrite) args.push('-w');
    args.push(inputPath, outputPath);
    await execFileAsync(process.execPath, args, { maxBuffer: 8 * 1024 * 1024 });
    process.stdout.write(`\rCompressed ${frame - start + 1}/${inputManifest.frames.count}`);
  }
  process.stdout.write('\n');

  const outputManifest: FourDGSManifestV1 = {
    ...inputManifest,
    title: options.title ?? inputManifest.title,
    fps: options.fps ?? inputManifest.fps,
    frames: {
      ...inputManifest.frames,
      pattern: 'frames/frame_{frame:05}.compressed.ply'
    }
  };
  const flag = options.overwrite ? 'w' : 'wx';
  await writeFile(join(options.output, 'manifest.json'), `${JSON.stringify(outputManifest, null, 2)}\n`, { encoding: 'utf8', flag });
  console.log(`Packed scene written to ${options.output}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
