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

function openExport(): void {
  const url = toPngDataUrl(canvas, frames);
  const [w, h] = RATIOS[rt.state.ratio];
  el<HTMLImageElement>('ex-img').src = url;
  const link = el<HTMLAnchorElement>('btn-dl');
  link.href = url;
  link.download = downloadName(rt.state.title);
  el('ex-status').textContent = `${w} × ${h}`;
  el('ex-note').textContent = '若浏览器拦截了下载，在图片上右键选择「图片另存为」同样可以保存。';
  veil.classList.add('on');
  el('btn-close').focus();
}

function closeExport(): void {
  veil.classList.remove('on');
}

el('btn-close').addEventListener('click', closeExport);
veil.addEventListener('click', (e) => {
  if (e.target === veil) closeExport();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeExport();
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
