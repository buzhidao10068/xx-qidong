import {
  BG_SWATCHES,
  FG_SWATCHES,
  FONTS,
  FONT_KEYS,
  MAX_STARS,
  RANGES,
  RATIO_KEYS,
} from '../config';
import { PRESETS } from '../presets';
import { applyPreset, defaultState, parseConfig, serializeState } from '../state';
import type { AppState, NumRange } from '../types';
import { el } from './dom';

/**
 * 控件层：建控件、绑事件、把状态推回控件（`sync`）。
 *
 * 单向数据流：控件事件改 `rt.state` → 调 `paint`/`reflow` 重画；
 * 整体换状态（模板、重置、粘贴配置）之后调 `sync()` 把控件拉回来。
 * 滑块的 min/max/step 全部从 `RANGES` 生成 —— 和归一化 clamp 同一份数字，
 * 不会出现「拖到底还能再变」。
 */

/** 界面运行时状态：state 之外那些不进持久化的东西 */
export interface Runtime {
  state: AppState;
  /** 正在编辑的星芒下标 */
  selected: number;
  background: HTMLImageElement | null;
}

export interface ControlsHost {
  rt: Runtime;
  /** 重画 */
  paint(): void;
  /** 重画 + 等字体切片就绪后再画（改文字或字体时用） */
  reflow(): void;
  /** 把当前星芒吸附到标题末字（要用最近一帧的字盒，所以由 main 实现） */
  snapSelectedStar(): void;
  openExport(): void;
}

export interface Controls {
  /** 状态 → 全部控件 */
  sync(): void;
  /** 只同步当前星芒的三个滑块 */
  syncStar(): void;
  /** 选中某个星芒（画面上点中时也会调） */
  selectStar(index: number): void;
}

/** 分段控件的选中态用 aria-pressed，既是样式钩子也是无障碍状态 */
function setPressed(container: HTMLElement, value: string): void {
  for (const b of container.querySelectorAll('button')) {
    b.setAttribute('aria-pressed', String(b.dataset.v === value));
  }
}

function segButtons(container: HTMLElement, items: readonly { v: string; label: string }[]): void {
  container.textContent = '';
  for (const item of items) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.v = item.v;
    b.textContent = item.label;
    container.appendChild(b);
  }
}

/** 点在分段控件里的哪个按钮上；点在空隙里返回 null */
function segValue(event: Event): string | null {
  const target = event.target;
  if (!(target instanceof Element)) return null;
  return target.closest('button')?.dataset.v ?? null;
}

function applyRange(input: HTMLInputElement, range: NumRange): void {
  input.min = String(range.min);
  input.max = String(range.max);
  input.step = String(range.step);
}

/** 六个直接对应 AppState 数值字段的滑块；字段名与 RANGES 的键同名 */
const SLIDERS = [
  { id: 'f-size', out: 'v-size', key: 'logoSize' },
  { id: 'f-track', out: 'v-track', key: 'tracking' },
  { id: 'f-infosize', out: 'v-infosize', key: 'infoSize' },
  { id: 'f-gap', out: 'v-gap', key: 'lineGap' },
  { id: 'f-bottom', out: 'v-bottom', key: 'bottom' },
  { id: 'f-dim', out: 'v-dim', key: 'dim' },
] as const;

/** 星芒的三个滑块，作用于当前选中那一颗 */
const STAR_SLIDERS = [
  { id: 'f-starsize', out: 'v-starsize', key: 'size', range: 'starSize', unit: '%' },
  { id: 'f-staraspect', out: 'v-staraspect', key: 'aspect', range: 'starAspect', unit: '%' },
  { id: 'f-starrot', out: 'v-starrot', key: 'rot', range: 'starRot', unit: '°' },
] as const;

export function createControls(host: ControlsHost): Controls {
  const rt = host.rt;

  // ---- 一次性搭控件 ----
  const font = el<HTMLSelectElement>('f-font');
  for (const key of FONT_KEYS) {
    const option = document.createElement('option');
    option.value = key;
    option.textContent = FONTS[key].label;
    font.appendChild(option);
  }

  const chips = el('chips');
  segButtons(
    chips,
    PRESETS.map((p) => ({ v: p.key, label: p.chip })),
  );

  const ratio = el('f-ratio');
  segButtons(
    ratio,
    RATIO_KEYS.map((k) => ({ v: k, label: k })),
  );

  const starCount = el('f-starcount');
  segButtons(
    starCount,
    Array.from({ length: MAX_STARS + 1 }, (_, i) => ({ v: String(i), label: String(i) })),
  );

  for (const s of SLIDERS) applyRange(el<HTMLInputElement>(s.id), RANGES[s.key]);
  for (const s of STAR_SLIDERS) applyRange(el<HTMLInputElement>(s.id), RANGES[s.range]);

  for (const [wrap, list, key, input] of [
    ['sw-bg', BG_SWATCHES, 'bg', 'f-bg'],
    ['sw-fg', FG_SWATCHES, 'fg', 'f-fg'],
  ] as const) {
    const container = el(wrap);
    for (const color of list) {
      const b = document.createElement('button');
      b.type = 'button';
      b.style.background = color;
      b.title = color;
      b.setAttribute('aria-label', `使用颜色 ${color}`);
      b.addEventListener('click', () => {
        rt.state[key] = color;
        el<HTMLInputElement>(input).value = color;
        host.paint();
      });
      container.appendChild(b);
    }
  }

  // ---- 状态 → 控件 ----
  function buildStarSel(): void {
    const container = el('f-starsel');
    segButtons(
      container,
      Array.from({ length: rt.state.starCount }, (_, i) => ({
        v: String(i),
        label: `星芒 ${'ABC'[i] ?? i + 1}`,
      })),
    );
    setPressed(container, String(rt.selected));

    // 星芒数为 0 时，下面那几排控件没有作用对象，直接收起来
    const off = rt.state.starCount === 0;
    for (const id of ['star-edit', 'star-dims', 'star-more']) {
      el(id).style.display = off ? 'none' : '';
    }
    el('star-note').textContent = off ? '已关闭' : '拖动可移动';
  }

  function syncStar(): void {
    const star = rt.state.stars[rt.selected];
    if (!star) return;
    for (const s of STAR_SLIDERS) {
      el<HTMLInputElement>(s.id).value = String(star[s.key]);
      el(s.out).textContent = `${star[s.key]}${s.unit}`;
    }
  }

  function sync(): void {
    const state = rt.state;
    el<HTMLInputElement>('f-title').value = state.title;
    font.value = state.font;
    el<HTMLTextAreaElement>('f-warn').value = state.warn;
    el<HTMLTextAreaElement>('f-lines').value = state.lines.join('\n');
    el<HTMLInputElement>('f-bg').value = state.bg;
    el<HTMLInputElement>('f-fg').value = state.fg;
    for (const s of SLIDERS) {
      el<HTMLInputElement>(s.id).value = String(state[s.key]);
      el(s.out).textContent = `${state[s.key]}%`;
    }
    setPressed(ratio, state.ratio);
    setPressed(starCount, String(state.starCount));
    setPressed(chips, state.preset);
    buildStarSel();
    syncStar();
  }

  function selectStar(index: number): void {
    rt.selected = index;
    setPressed(el('f-starsel'), String(index));
    syncStar();
  }

  // ---- 控件 → 状态 ----
  for (const s of SLIDERS) {
    const input = el<HTMLInputElement>(s.id);
    input.addEventListener('input', () => {
      const v = Number(input.value);
      if (!Number.isFinite(v)) return;
      rt.state[s.key] = v;
      el(s.out).textContent = `${v}%`;
      host.paint();
    });
  }

  for (const s of STAR_SLIDERS) {
    const input = el<HTMLInputElement>(s.id);
    input.addEventListener('input', () => {
      const star = rt.state.stars[rt.selected];
      const v = Number(input.value);
      if (!star || !Number.isFinite(v)) return;
      star[s.key] = v;
      el(s.out).textContent = `${v}${s.unit}`;
      host.paint();
    });
  }

  // 改文字和字体会触发新的字体切片下载，所以走 reflow 而不是 paint
  el<HTMLInputElement>('f-title').addEventListener('input', (e) => {
    rt.state.title = (e.currentTarget as HTMLInputElement).value;
    host.reflow();
  });
  font.addEventListener('change', () => {
    const key = FONT_KEYS.find((k) => k === font.value);
    if (key) rt.state.font = key;
    host.reflow();
  });
  el<HTMLTextAreaElement>('f-warn').addEventListener('input', (e) => {
    rt.state.warn = (e.currentTarget as HTMLTextAreaElement).value;
    host.reflow();
  });
  el<HTMLTextAreaElement>('f-lines').addEventListener('input', (e) => {
    rt.state.lines = (e.currentTarget as HTMLTextAreaElement).value.split('\n');
    host.reflow();
  });
  el<HTMLInputElement>('f-bg').addEventListener('input', (e) => {
    rt.state.bg = (e.currentTarget as HTMLInputElement).value;
    host.paint();
  });
  el<HTMLInputElement>('f-fg').addEventListener('input', (e) => {
    rt.state.fg = (e.currentTarget as HTMLInputElement).value;
    host.paint();
  });

  ratio.addEventListener('click', (e) => {
    const v = segValue(e);
    const key = RATIO_KEYS.find((k) => k === v);
    if (!key) return;
    rt.state.ratio = key;
    setPressed(ratio, key);
    host.paint();
  });

  starCount.addEventListener('click', (e) => {
    const v = segValue(e);
    if (v === null) return;
    const n = Number(v);
    if (!Number.isInteger(n)) return;
    rt.state.starCount = n;
    // 数量调小后原来选中的可能已经不存在了
    rt.selected = Math.min(rt.selected, Math.max(0, n - 1));
    setPressed(starCount, v);
    buildStarSel();
    syncStar();
    host.paint();
  });

  el('f-starsel').addEventListener('click', (e) => {
    const v = segValue(e);
    if (v === null) return;
    selectStar(Number(v));
    host.paint();
  });

  chips.addEventListener('click', (e) => {
    const key = segValue(e);
    if (key === null) return;
    rt.state = applyPreset(rt.state, key);
    sync();
    host.reflow();
  });

  el('btn-center').addEventListener('click', () => {
    rt.state.titleX = 0.5;
    rt.state.titleY = 0.485;
    host.paint();
  });

  el('btn-snap').addEventListener('click', () => {
    host.snapSelectedStar();
  });

  const bgFile = el<HTMLInputElement>('f-bgimg');
  bgFile.addEventListener('change', () => {
    const file = bgFile.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      const img = new Image();
      img.addEventListener('load', () => {
        rt.background = img;
        host.paint();
      });
      img.src = String(reader.result);
    });
    reader.readAsDataURL(file);
  });

  el('btn-clearimg').addEventListener('click', () => {
    rt.background = null;
    bgFile.value = '';
    host.paint();
  });

  el('btn-reset').addEventListener('click', () => {
    rt.state = defaultState();
    rt.selected = 0;
    rt.background = null;
    bgFile.value = '';
    sync();
    host.reflow();
  });

  for (const id of ['btn-export', 'btn-export-2']) {
    el(id).addEventListener('click', () => {
      host.openExport();
    });
  }

  const json = el<HTMLTextAreaElement>('f-json');
  el('btn-json-read').addEventListener('click', () => {
    json.value = serializeState(rt.state);
  });
  el('btn-json-apply').addEventListener('click', () => {
    const next = parseConfig(json.value);
    if (!next) {
      json.value = '配置读不出来，检查一下是不是完整的 JSON。';
      return;
    }
    rt.state = next;
    rt.selected = 0;
    rt.background = null;
    bgFile.value = '';
    sync();
    host.reflow();
  });

  return { sync, syncStar, selectStar };
}
