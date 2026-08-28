# 4DGS Web Player

基于 PlayCanvas 的可复用 4D Gaussian Splatting 网页播放器，以 Web Component 形式提供自由视角和时间轴播放能力。

## 功能

- WebGPU 优先，WebGL2 自动回退；
- 正放、倒放、暂停、逐帧和时间轴跳转；
- 0.25×、0.5×、1×、2×、4× 倍速；
- 有界 LRU 缓存、方向感知预加载和双实体无闪烁切换；
- 桌面端支持 WASD 环绕、Q/E 缩放、鼠标左右键、滚轮和空格播放控制；
- 移动端支持单指环绕、双指平移和捏合缩放；
- Shadow DOM 样式隔离，可嵌入普通 HTML、React 或 Vue。

## 安装与验证

```powershell
npm install
npm test
npm run build
```

## 启动示例

```powershell
npm run dev -- --host 127.0.0.1
```

通过查询参数指定场景清单：

```text
http://127.0.0.1:5173/?scene=/scene/manifest.json
```

## 场景格式

播放器不在浏览器中运行 deformation 网络，而是读取预计算的 Gaussian 帧序列：

```text
scene/
├─ manifest.json
└─ frames/
   ├─ frame_00000.compressed.ply
   ├─ frame_00001.compressed.ply
   └─ ...
```

manifest v1 示例：

```json
{
  "version": 1,
  "title": "示例场景",
  "fps": 30,
  "loop": true,
  "frames": {
    "pattern": "frames/frame_{frame:05}.compressed.ply",
    "start": 0,
    "count": 141
  },
  "background": [1, 1, 1, 1],
  "camera": {
    "position": [0, 0, 3],
    "target": [0, 0, 0],
    "fov": 60
  }
}
```

## 压缩逐帧 PLY

输入目录需要包含一个 manifest 和该 manifest 引用的标准 3DGS PLY 帧：

```powershell
npm run pack-scene -- `
  --input C:\path\to\raw-scene `
  --output C:\path\to\web-scene
```

只有需要替换已有输出时才添加 `--overwrite`。

## 嵌入页面

```html
<script type="module" src="/four-dgs-player.js"></script>

<four-dgs-player
  src="/scene/manifest.json"
  controls
  autoplay
  loop>
</four-dgs-player>
```

公共属性包括 `currentTime`、`duration`、`currentFrame`、`paused` 和 `playbackRate`。公共方法包括 `load()`、`play()`、`pause()`、`seekTo()`、`step()`、`resetCamera()` 和 `dispose()`。

组件会发送 `loadstart`、`ready`、`progress`、`timeupdate`、`play`、`pause`、`ended` 和 `error` 事件。

## 交互

| 输入 | 行为 |
|---|---|
| W/A/S/D | 围绕当前观察中心上下左右移动 |
| Q/E | 放大/缩小 |
| 鼠标左键 | 环绕 |
| 鼠标右键 | 平面平移 |
| 鼠标滚轮 | 缩放 |
| 空格 | 播放/暂停 |
| 单指拖动 | 移动端环绕 |
| 双指拖动 | 移动端平移 |
| 双指捏合 | 移动端缩放 |

桌面键鼠操作仅在画布聚焦且指针位于播放画面内时生效。

## 文档

- [播放器运行原理](docs/principles.md)

## 许可证与依赖

本项目采用 Apache License 2.0。PlayCanvas Engine 和 SplatTransform 为 MIT 许可依赖；重新分发时请同时遵守相应上游许可证。
