export const PLAYER_STYLES = `
  :host {
    --four-dgs-accent: #72e1ff;
    --four-dgs-panel: rgba(12, 16, 24, 0.88);
    --four-dgs-text: #f7f9fc;
    --four-dgs-muted: #b9c1ce;
    display: block;
    position: relative;
    width: 100%;
    min-height: 320px;
    overflow: hidden;
    color: var(--four-dgs-text);
    background: #0a0d13;
    border-radius: inherit;
    contain: layout paint;
    color-scheme: dark;
    font: 500 14px/1.35 Inter, ui-sans-serif, system-ui, sans-serif;
  }

  *, *::before, *::after { box-sizing: border-box; }

  .viewport, canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  canvas { display: block; touch-action: none; outline: none; }

  .topbar {
    position: absolute;
    top: 12px;
    left: 12px;
    right: 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    pointer-events: none;
  }

  .title, .status {
    max-width: min(60%, 420px);
    padding: 8px 11px;
    overflow: hidden;
    color: var(--four-dgs-text);
    background: var(--four-dgs-panel);
    border: 1px solid rgba(255,255,255,.12);
    border-radius: 10px;
    backdrop-filter: blur(10px);
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .status { color: var(--four-dgs-muted); }
  .status[hidden] { display: none; }
  .status[data-busy="true"]::before {
    content: "";
    display: inline-block;
    width: 8px;
    height: 8px;
    margin-right: 7px;
    border-radius: 50%;
    background: var(--four-dgs-accent);
    animation: pulse 1s ease-in-out infinite;
  }

  .controls {
    position: absolute;
    right: 12px;
    bottom: 12px;
    left: 12px;
    display: grid;
    grid-template-columns: auto minmax(100px, 1fr) auto;
    align-items: center;
    gap: 12px;
    padding: 10px;
    background: var(--four-dgs-panel);
    border: 1px solid rgba(255,255,255,.14);
    border-radius: 14px;
    box-shadow: 0 12px 38px rgba(0,0,0,.38);
    backdrop-filter: blur(14px);
  }

  :host(:not([controls])) .controls { display: none; }
  .transport { display: flex; gap: 4px; }
  .timeline-wrap { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 10px; min-width: 0; }
  .settings { display: flex; align-items: center; gap: 6px; }

  button, select {
    min-width: 44px;
    min-height: 44px;
    color: inherit;
    background: rgba(255,255,255,.07);
    border: 1px solid transparent;
    border-radius: 9px;
    font: inherit;
  }

  button { padding: 0 12px; cursor: pointer; }
  button svg {
    width: 21px;
    height: 21px;
    display: block;
    margin: auto;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  button:hover, select:hover { background: rgba(255,255,255,.13); }
  button[data-active="true"] { color: #061015; background: var(--four-dgs-accent); }
  button:focus-visible, select:focus-visible, input:focus-visible {
    outline: 3px solid var(--four-dgs-accent);
    outline-offset: 2px;
  }

  button:disabled, select:disabled, input:disabled { cursor: wait; opacity: .48; }
  select { padding: 0 30px 0 10px; cursor: pointer; color-scheme: dark; }
  select option { color: #f7f9fc; background: #20252f; }
  .frame-label { min-width: 88px; color: var(--four-dgs-muted); text-align: right; font-variant-numeric: tabular-nums; }

  input[type="range"] {
    width: 100%;
    height: 44px;
    margin: 0;
    accent-color: var(--four-dgs-accent);
    cursor: pointer;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  @keyframes pulse { 50% { opacity: .35; transform: scale(.8); } }

  @media (max-width: 720px) {
    .controls { grid-template-columns: 1fr auto; gap: 6px; }
    .timeline-wrap { grid-column: 1 / -1; grid-row: 1; }
    .transport { grid-column: 1; grid-row: 2; }
    .settings { grid-column: 2; grid-row: 2; }
    .transport button { padding: 0 9px; }
    .title { max-width: 50%; }
  }

  @media (max-width: 460px) {
    .controls { right: 6px; bottom: 6px; left: 6px; padding: 7px; }
    .topbar { top: 6px; left: 6px; right: 6px; }
    .transport { gap: 2px; }
    .transport button { min-width: 40px; padding: 0 6px; }
    .settings button { display: none; }
    .frame-label { min-width: 72px; font-size: 12px; }
  }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; }
  }
`;
