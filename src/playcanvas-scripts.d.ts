declare module 'playcanvas/scripts/esm/camera-controls.mjs' {
  import type { Script, Vec3 } from 'playcanvas';

  export class CameraControls extends Script {
    enableFly: boolean;
    enableOrbit: boolean;
    enablePan: boolean;
    moveSpeed: number;
    moveFastSpeed: number;
    moveSlowSpeed: number;
    reset(focus: Vec3, position: Vec3): void;
  }
}
