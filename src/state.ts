import {
  DEFAULT_STARS,
  DRAG_BOUND,
  FONTS,
  MAX_STARS,
  MAX_TITLE_LEN,
  RANGES,
  RATIOS,
  STORAGE_KEY,
} from './config';
import { DEFAULT_PRESET, PRESETS } from './presets';
import type { AppState, FontKey, NumRange, RatioKey, StarState } from './types';

/**
 * 状态层。这是全工程唯一的信任边界：
 * 代码里的 DEFAULT_STATE 可信，localStorage 与用户粘贴的 JSON 都不可信，
 * 两者必须过 `normalizeState()`。归一化之后全链路不再判空。
 *
 * 本模块不 import 任何 render/ui 模块，也不引用 document —— 于是可以在
 * node 下直接测。
 */

export const DEFAULT_STATE: AppState = {
  preset: DEFAULT_PRESET.key,
  ratio: '16:9',
  bg: DEFAULT_PRESET.patch.bg,
  fg: DEFAULT_PRESET.patch.fg,
  dim: 0,
  title: DEFAULT_PRESET.patch.title,
  font: DEFAULT_PRESET.patch.font,
  logoSize: 21,
  tracking: 2,
  titleX: 0.5,
  titleY: 0.485,
  starCount: 2,
  stars: DEFAULT_STARS.map((s) => ({ ...s })),
  warn: DEFAULT_PRESET.patch.warn,
  lines: [...DEFAULT_PRESET.patch.lines],
  infoSize: 2.6,
  lineGap: 3.5,
  bottom: 6.2,
};

export function defaultState(): AppState {
  return {
    ...DEFAULT_STATE,
    stars: DEFAULT_STATE.stars.map((s) => ({ ...s })),
    lines: [...DEFAULT_STATE.lines],
  };
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * `Object.hasOwn` 而不是 `in`：`'toString' in RATIOS` 会顺着原型链返回 true，
 * 于是 `{"ratio":"toString"}` 这种输入能骗过枚举校验，后面查表拿到 undefined。
 */
function isRatioKey(v: unknown): v is RatioKey {
  return typeof v === 'string' && Object.hasOwn(RATIOS, v);
}

function isFontKey(v: unknown): v is FontKey {
  return typeof v === 'string' && Object.hasOwn(FONTS, v);
}

/** 只接受真数字和非空数字字符串；null / true / '' / 'abc' 一律当缺失 */
function toNumber(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw === 'string' && raw.trim() !== '') {
    const v = Number(raw);
    return Number.isFinite(v) ? v : null;
  }
  return null;
}

function clampTo(raw: unknown, fallback: number, range: NumRange): number {
  const v = toNumber(raw);
  if (v === null) return fallback;
  return Math.min(range.max, Math.max(range.min, v));
}

/** 位置类字段：允许略微出画（做出血），但不能跑到天边去 */
function bounded(raw: unknown, fallback: number): number {
  const v = toNumber(raw);
  if (v === null) return fallback;
  return Math.min(1 + DRAG_BOUND, Math.max(-DRAG_BOUND, v));
}

function clampInt(raw: unknown, fallback: number, min: number, max: number): number {
  const v = toNumber(raw);
  if (v === null) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(v)));
}

function text(raw: unknown, fallback: string): string {
  return typeof raw === 'string' ? raw : fallback;
}

/**
 * 标题额外限长。输入框的 `maxlength` 拦不住粘贴进来的配置 JSON 和
 * localStorage 里的旧值 —— 超长标题会一路排到画面外面去，且此后每次打开都是
 * 这个坏状态。上限属于状态层，UI 的 `maxlength` 读同一份常量。
 *
 * 先 `Array.from` 再切：按码点切，不按 UTF-16 码元 —— 直接 `String.slice` 的
 * 截断处可能落在代理对中间，切出半个 emoji。
 *
 * 这里刻意不用 `Intl.Segmenter` 按字素簇切，尽管 `quality-guidelines.md` 把
 * `Array.from` 分字列为「今后禁用」：限长的单位必须和排版的单位一致。
 * `logotype.ts` 是按码点逐个摆字盒的，一个 12 字素的标题可能有三十几个码点、
 * 照样排到画面外面去 —— 那就白限了。等 `logotype.ts` 换成字素簇，这里再一起换。
 *
 * 命名沿用 `color()` 的路子：按字段命名的归一化器。兜底值也走同一条截断路径，
 * 所以默认值超限时同样会被收进上限内（`clampTo` 那边反而漏了这一手）。
 */
function title(raw: unknown, fallback: string): string {
  return Array.from(text(raw, fallback)).slice(0, MAX_TITLE_LEN).join('');
}

function color(raw: unknown, fallback: string): string {
  return typeof raw === 'string' && HEX_COLOR.test(raw) ? raw.toLowerCase() : fallback;
}

/**
 * 第 i 个槽位的默认参数。`MAX_STARS` 派生自 `DEFAULT_STARS` 的长度，所以调用处
 * 的下标恒在范围内，`??` 分支跑不到 —— 它在这里是为了满足
 * `noUncheckedIndexedAccess`：万一将来有人把上限和这份数据解耦，拿到的也是
 * 一个能直接渲染的槽位，而不是 undefined。
 */
function slotDefault(i: number): StarState {
  return DEFAULT_STARS[i] ?? DEFAULT_STARS[0];
}

function normalizeStar(raw: unknown, fallback: StarState): StarState {
  const o = isRecord(raw) ? raw : {};
  return {
    x: bounded(o.x, fallback.x),
    y: bounded(o.y, fallback.y),
    size: clampTo(o.size, fallback.size, RANGES.starSize),
    aspect: clampTo(o.aspect, fallback.aspect, RANGES.starAspect),
    rot: clampTo(o.rot, fallback.rot, RANGES.starRot),
  };
}

/** 数组保留字符串项（空数组是合法的：用户可以不要信息行）；字符串按换行拆 */
function normalizeLines(raw: unknown, fallback: string[]): string[] {
  if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === 'string');
  if (typeof raw === 'string') return raw.split('\n');
  return [...fallback];
}

/**
 * 把任意输入收敛成一个合法 AppState。喂 `{}`、`null`、越界数字、非法枚举值
 * 都必须得到能直接渲染的状态 —— 这一条由 tests/state.spec.ts 守着。
 */
export function normalizeState(raw: unknown): AppState {
  const o = isRecord(raw) ? raw : {};
  const d = DEFAULT_STATE;

  return {
    preset:
      typeof o.preset === 'string' && PRESETS.some((p) => p.key === o.preset)
        ? o.preset
        : d.preset,
    ratio: isRatioKey(o.ratio) ? o.ratio : d.ratio,
    bg: color(o.bg, d.bg),
    fg: color(o.fg, d.fg),
    dim: clampTo(o.dim, d.dim, RANGES.dim),

    title: title(o.title, d.title),
    font: isFontKey(o.font) ? o.font : d.font,
    logoSize: clampTo(o.logoSize, d.logoSize, RANGES.logoSize),
    tracking: clampTo(o.tracking, d.tracking, RANGES.tracking),
    titleX: bounded(o.titleX, d.titleX),
    titleY: bounded(o.titleY, d.titleY),

    starCount: clampInt(o.starCount, d.starCount, 0, MAX_STARS),
    // 恒定补齐到 MAX_STARS 项：starCount 调小再调大时，原来的参数还在
    stars: Array.from({ length: MAX_STARS }, (_, i) =>
      normalizeStar(Array.isArray(o.stars) ? o.stars[i] : undefined, slotDefault(i)),
    ),

    warn: text(o.warn, d.warn),
    lines: normalizeLines(o.lines, d.lines),
    infoSize: clampTo(o.infoSize, d.infoSize, RANGES.infoSize),
    lineGap: clampTo(o.lineGap, d.lineGap, RANGES.lineGap),
    bottom: clampTo(o.bottom, d.bottom, RANGES.bottom),
  };
}

/** 模板只换文案与配色，几何参数原样保留 */
export function applyPreset(state: AppState, key: string): AppState {
  const preset = PRESETS.find((p) => p.key === key);
  if (!preset) return state;
  return {
    ...state,
    ...preset.patch,
    lines: [...preset.patch.lines],
    preset: preset.key,
  };
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** node 下没有 localStorage；隐私模式下访问它还会直接抛异常 */
function ambientStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function saveState(state: AppState, storage?: StorageLike): void {
  const store = storage ?? ambientStorage();
  if (!store) return;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 配额用尽或被禁用：持久化不是核心功能，静默跳过
  }
}

export function loadState(storage?: StorageLike): AppState | null {
  const store = storage ?? ambientStorage();
  if (!store) return null;
  try {
    const raw = store.getItem(STORAGE_KEY);
    return raw === null ? null : normalizeState(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function serializeState(state: AppState): string {
  return JSON.stringify(state, null, 2);
}

/** 用户粘贴的配置：解析失败返回 null，由调用方给出提示 */
export function parseConfig(input: string): AppState | null {
  try {
    return normalizeState(JSON.parse(input));
  } catch {
    return null;
  }
}
