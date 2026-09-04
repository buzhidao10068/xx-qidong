import { BODY_FONT_WEIGHT, FONTS, RATIOS } from './config';
import { copyPngToClipboard, downloadName, toPngDataUrl, type FrameHooks } from './export';
import {
  draggedPosition,
  grabOffset,
  hitTest,
  moveTarget,
  snapToLastGlyph,
  toCanvasPoint,
} from './interaction';
import { collectRows } from './render/block';
import { drawScene, type SceneLayout } from './render/canvas';
import { defaultState, loadState, saveState } from './state';
import { createControls, type Runtime } from './ui/controls';
import { el } from './ui/dom';
import type { DragTarget, Pt } from './types';

/**
 * 装配层：把状态、渲染、控件、交互接起来，并处理两件只有浏览器才有的事 ——
 * 字体切片加载后重画，以及导出。
 */

const canvas = el<HTMLCanvasElement>('cv');
const ctx = context2d(canvas);

function context2d(target: HTMLCanvasElement): CanvasRenderingContext2D {
  const c = target.getContext('2d');
  if (!c) throw new Error('这个浏览器不支持 canvas 2d');
  return c;
}

const proof = el('proof');
const readout = el('readout');
const veil = el('veil');

const rt: Runtime = {
  state: loadState() ?? defaultState(),
  selected: 0,
  background: null,
};

let layout: SceneLayout | null = null;
let hovering = false;
let dragging: DragTarget | null = null;
let grab: Pt = { x: 0, y: 0 };

/** 虚线框套在谁身上：正在拖的优先，否则是当前编辑的星芒，没星芒就框标题 */
function focus(): DragTarget {
  if (dragging) return dragging;
  return rt.state.starCount > 0 ? { type: 'star', index: rt.selected } : { type: 'title' };
}

let saveTimer = 0;

function paint(): void {
  layout = drawScene(ctx, rt.state, {
    // 页面静止时预览就是成品本身，虚线框只在悬停或拖动时出现
    overlay: hovering || dragging !== null,
    focus: focus(),
    background: rt.background,
  });

  const [w, h] = RATIOS[rt.state.ratio];
  const rows = collectRows(rt.state.warn, rt.state.lines).length;
  readout.textContent = `${w} × ${h} · PNG · 标题「${rt.state.title || '—'}」· 星芒 ×${rt.state.starCount} · 版号 ${rows} 行`;

  // 连续拖滑块时别每帧都写 localStorage
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => saveState(rt.state), 350);
}

/**
 * Google Fonts 的 CJK 按 unicode-range 切片，改标题会触发新切片下载 ——
 * 「字体就绪」不是一次性事件。先用当前可用字体画一帧，切片到位后再画一帧；
 * 自增序号保证慢请求回来时不覆盖更新的状态。
 */
let fontSeq = 0;

function reflow(): void {
  paint();
  if (!('fonts' in document)) return;
  const seq = ++fontSeq;
  const spec = FONTS[rt.state.font];
  const family = spec.stack.split(',')[0]!.trim();
  const blockText = collectRows(rt.state.warn, rt.state.lines)
    .map((r) => r.text)
    .join('');
  void Promise.allSettled([
    document.fonts.load(`${spec.weight} 100px ${family}`, rt.state.title || '启动'),
    document.fonts.load(`${BODY_FONT_WEIGHT} 40px "Noto Sans SC"`, blockText || '审批文号'),
  ]).then(() => {
    if (seq === fontSeq) paint();
  });
}

/** 取图前后的帧切换。overlay 恒为 false 的那一帧才是被取走的 */
const frames: FrameHooks = {
  drawClean: () => {
    drawScene(ctx, rt.state, { overlay: false, background: rt.background });
  },
  restore: () => paint(),
};

/**
 * 弹窗是 `aria-modal`，那就得真的把焦点关在里面：否则 Tab 会走到背后的控制面板
 * 上去，键盘用户改着看不见的滑块。关闭后焦点回到打开它的那个按钮。
 */
let restoreFocus: HTMLElement | null = null;

function isExportOpen(): boolean {
  return veil.classList.contains('on');
}

/**
 * 弹窗里可聚焦的只有几个按钮和那个下载链接（预览图没有 tabindex，不进 Tab 序）。
 * 排掉 disabled 的：`focus()` 对它无效，而下面已经 `preventDefault()` 掉了 Tab，
 * 真让它当上首项或末项就会把焦点卡死。
 */
function veilFocusables(): HTMLElement[] {
  return [...veil.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]')];
}

function trapTab(e: KeyboardEvent): void {
  const items = veilFocusables();
  const first = items[0];
  const last = items.at(-1);
  if (!first || !last) return;

  const active = document.activeElement;
  // 焦点不在弹窗里：点了预览图或弹窗留白（浏览器会把焦点退回 body），
  // 或者刚从地址栏 Tab 回来。这时先把它收回弹窗，别让 Tab 走到背后去
  if (!(active instanceof HTMLElement) || !veil.contains(active)) {
    e.preventDefault();
    (e.shiftKey ? last : first).focus();
    return;
  }
  if (e.shiftKey && active === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && active === last) {
    e.preventDefault();
    first.focus();
  }
}

function openExport(): void {
  const url = toPngDataUrl(canvas, frames);
  const [w, h] = RATIOS[rt.state.ratio];
  el<HTMLImageElement>('ex-img').src = url;
  const link = el<HTMLAnchorElement>('btn-dl');
  link.href = url;
  link.download = downloadName(rt.state.title);
  el('ex-status').textContent = `${w} × ${h}`;
  el('ex-note').textContent = '若浏览器拦截了下载，在图片上右键选择「图片另存为」同样可以保存。';
  restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  veil.classList.add('on');
  el('btn-close').focus();
}

function closeExport(): void {
  // 幂等：重复关不会把 restoreFocus 抢给一个早已换掉的元素
  if (!isExportOpen()) return;
  veil.classList.remove('on');
  restoreFocus?.focus();
  restoreFocus = null;
}

el('btn-close').addEventListener('click', closeExport);
veil.addEventListener('click', (e) => {
  if (e.target === veil) closeExport();
});
// 只在弹窗开着时接管键盘，别抢走页面正常的 Tab 顺序
document.addEventListener('keydown', (e) => {
  if (!isExportOpen()) return;
  if (e.key === 'Escape') closeExport();
  else if (e.key === 'Tab') trapTab(e);
});

el('btn-copy').addEventListener('click', () => {
  void copyPngToClipboard(canvas, frames).then(
    () => {
      el('ex-status').textContent = '已复制到剪贴板';
    },
    () => {
      // 沙箱 iframe 和非 HTTPS 都会走到这里，明说而不是假装成功
      el('ex-status').textContent = '剪贴板不可用';
      el('ex-note').textContent =
        '这个浏览器不让脚本写剪贴板。在图片上右键选择「图片另存为」或「复制图片」。';
    },
  );
});

const controls = createControls({
  rt,
  paint,
  reflow,
  openExport,
  snapSelectedStar: () => {
    const star = rt.state.stars[rt.selected];
    if (!star || !layout) return;
    const pos = snapToLastGlyph(layout.glyphs, layout.width, rt.state.titleY);
    if (!pos) return;
    star.x = pos.x;
    star.y = pos.y;
    paint();
  },
});

// ---- 画面上的直接操作 ----
function pointOf(e: PointerEvent): Pt {
  const r = canvas.getBoundingClientRect();
  const [w, h] = RATIOS[rt.state.ratio];
  return toCanvasPoint(
    { x: e.clientX, y: e.clientY },
    { x: r.left, y: r.top, width: r.width, height: r.height },
    w,
    h,
  );
}

canvas.addEventListener('pointerenter', () => {
  hovering = true;
  paint();
});

canvas.addEventListener('pointerleave', () => {
  if (dragging) return;
  hovering = false;
  proof.classList.remove('grab');
  paint();
});

canvas.addEventListener('pointerdown', (e) => {
  if (!layout) return;
  const p = pointOf(e);
  const target = hitTest(rt.state, layout, p);
  if (!target) return;
  const [w, h] = RATIOS[rt.state.ratio];
  dragging = target;
  if (target.type === 'star') controls.selectStar(target.index);
  grab = grabOffset(rt.state, target, p, w, h);
  canvas.setPointerCapture(e.pointerId);
  proof.classList.add('grabbing');
  e.preventDefault();
  paint();
});

canvas.addEventListener('pointermove', (e) => {
  const p = pointOf(e);
  if (!dragging) {
    // 光标形状提示这里抓得住
    proof.classList.toggle('grab', layout !== null && hitTest(rt.state, layout, p) !== null);
    return;
  }
  const [w, h] = RATIOS[rt.state.ratio];
  moveTarget(rt.state, dragging, draggedPosition(p, grab, w, h));
  paint();
});

function endDrag(): void {
  if (!dragging) return;
  dragging = null;
  proof.classList.remove('grabbing');
  paint();
}

canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

// ---- 起步 ----
controls.sync();
reflow();
