import { DRAG_BOUND, HIT } from './config';
import type { SceneLayout } from './render/canvas';
import { starRect } from './render/starburst';
import type { AppState, DragTarget, GlyphBox, Pt, Rect } from './types';

/**
 * 画面上的直接操作：命中测试与拖动。
 *
 * 这里全是纯几何 —— 事件监听在 main.ts，本模块不碰 DOM，于是「点在哪算中」
 * 和「拖到哪算越界」都能在 node 下断言。
 */

/**
 * 屏幕坐标 → 画布像素坐标。canvas 按 CSS 缩放显示（内部恒 1920×1080 等），
 * 所以必须按显示尺寸换算，否则缩放窗口后指针就对不上图形。
 */
export function toCanvasPoint(
  client: Pt,
  bounds: Rect,
  canvasWidth: number,
  canvasHeight: number,
): Pt {
  if (!(bounds.width > 0) || !(bounds.height > 0)) return { x: 0, y: 0 };
  return {
    x: ((client.x - bounds.x) / bounds.width) * canvasWidth,
    y: ((client.y - bounds.y) / bounds.height) * canvasHeight,
  };
}

function inflate(rect: Rect, dx: number, dy: number): Rect {
  return {
    x: rect.x - dx,
    y: rect.y - dy,
    width: rect.width + dx * 2,
    height: rect.height + dy * 2,
  };
}

function contains(rect: Rect, p: Pt): boolean {
  return (
    p.x >= rect.x && p.x <= rect.x + rect.width && p.y >= rect.y && p.y <= rect.y + rect.height
  );
}

/**
 * 星芒优先于标题，且从后往前找 —— 后画的在视觉上压在上面，就该先被抓到。
 * 只有前 starCount 个星芒参与：看不见的东西不能命中。
 */
export function hitTest(state: AppState, layout: SceneLayout, p: Pt): DragTarget | null {
  const { width, height } = layout;
  for (let i = state.starCount - 1; i >= 0; i--) {
    const star = state.stars[i];
    if (!star) continue;
    const box = inflate(
      starRect(star, width, height, HIT.starMinRx),
      width * HIT.tolerance,
      height * HIT.tolerance,
    );
    if (contains(box, p)) return { type: 'star', index: i };
  }
  // 标题只放宽左右：上下放宽会盖住下面的星芒
  if (contains(inflate(layout.title, HIT.titlePadX, 0), p)) return { type: 'title' };
  return null;
}

function anchorOf(state: AppState, target: DragTarget): Pt {
  if (target.type === 'title') return { x: state.titleX, y: state.titleY };
  const star = state.stars[target.index];
  return star ? { x: star.x, y: star.y } : { x: state.titleX, y: state.titleY };
}

/**
 * 按下时记住「指针 － 元素锚点」的偏移，拖动全程沿用。
 * 不记这个偏移的话，元素会在按下那一刻跳到指针正下方。
 */
export function grabOffset(
  state: AppState,
  target: DragTarget,
  p: Pt,
  canvasWidth: number,
  canvasHeight: number,
): Pt {
  const anchor = anchorOf(state, target);
  return { x: p.x - anchor.x * canvasWidth, y: p.y - anchor.y * canvasHeight };
}

function clampFraction(v: number): number {
  return Math.min(1 + DRAG_BOUND, Math.max(-DRAG_BOUND, v));
}

/** 拖动中的新位置（画布比例）。允许略微出画做出血，但不能拖到天边 */
export function draggedPosition(
  p: Pt,
  grab: Pt,
  canvasWidth: number,
  canvasHeight: number,
): Pt {
  return {
    x: clampFraction((p.x - grab.x) / canvasWidth),
    y: clampFraction((p.y - grab.y) / canvasHeight),
  };
}

/** 把拖动结果写回状态。整个模块只有这一个函数改状态，改的只有位置 */
export function moveTarget(state: AppState, target: DragTarget, pos: Pt): void {
  if (target.type === 'title') {
    state.titleX = pos.x;
    state.titleY = pos.y;
    return;
  }
  const star = state.stars[target.index];
  if (star) {
    star.x = pos.x;
    star.y = pos.y;
  }
}

/**
 * 0.78 而不是 0.5：原版那根长芒不在「神」字正中，而是压在右边那一竖上。
 * 吸附到字盒偏右的位置才对得上。
 */
const GLYPH_SNAP_X = 0.78;

/** 把星芒吸附到标题末字。没有字（空标题）时返回 null，调用方什么都不做 */
export function snapToLastGlyph(
  glyphs: readonly GlyphBox[],
  canvasWidth: number,
  titleY: number,
): Pt | null {
  const glyph = glyphs.at(-1);
  if (!glyph || !(canvasWidth > 0)) return null;
  return { x: (glyph.x + glyph.width * GLYPH_SNAP_X) / canvasWidth, y: titleY };
}
