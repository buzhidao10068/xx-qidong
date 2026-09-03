import { describe, expect, it } from 'vitest';
import { DRAG_BOUND } from '../src/config';
import {
  draggedPosition,
  grabOffset,
  hitTest,
  moveTarget,
  snapToLastGlyph,
  toCanvasPoint,
} from '../src/interaction';
import type { SceneLayout } from '../src/render/canvas';
import { defaultState } from '../src/state';
import type { AppState, StarState } from '../src/types';

/** 1000×1000 的画布，标题框 400..600 × 450..550，两个 100px 宽的字 */
const layout: SceneLayout = {
  width: 1000,
  height: 1000,
  title: { x: 400, y: 450, width: 200, height: 100 },
  glyphs: [
    { char: '原', x: 400, width: 100, centerX: 450 },
    { char: '神', x: 500, width: 100, centerX: 550 },
  ],
};

/** 居中、100×100 半径的一颗星，外接框 400..600 */
const centered: StarState = { x: 0.5, y: 0.5, size: 10, aspect: 100, rot: 0 };

function stateWith(over: Partial<AppState> = {}): AppState {
  return { ...defaultState(), ...over };
}

describe('toCanvasPoint', () => {
  it('按显示尺寸换算到画布像素', () => {
    const bounds = { x: 100, y: 50, width: 500, height: 250 };
    expect(toCanvasPoint({ x: 350, y: 175 }, bounds, 1000, 500)).toEqual({ x: 500, y: 250 });
  });

  it('左上角映射到原点', () => {
    const bounds = { x: 100, y: 50, width: 500, height: 250 };
    expect(toCanvasPoint({ x: 100, y: 50 }, bounds, 1000, 500)).toEqual({ x: 0, y: 0 });
  });

  it('尺寸为 0 时不返回 NaN', () => {
    expect(toCanvasPoint({ x: 5, y: 5 }, { x: 0, y: 0, width: 0, height: 0 }, 1000, 500)).toEqual({
      x: 0,
      y: 0,
    });
  });
});

describe('hitTest', () => {
  const withStar = stateWith({ starCount: 1, stars: [centered, ...defaultState().stars.slice(1)] });

  it('点在星芒外接框（含容差）内算中', () => {
    expect(hitTest(withStar, layout, { x: 500, y: 500 })).toEqual({ type: 'star', index: 0 });
    // 框右边 600 + 1000×0.006 容差 = 606
    expect(hitTest(withStar, layout, { x: 606, y: 400 })).toEqual({ type: 'star', index: 0 });
    expect(hitTest(withStar, layout, { x: 607, y: 300 })).toBeNull();
  });

  it('后面的星芒压在上面，先被抓到', () => {
    const two = stateWith({
      starCount: 2,
      stars: [centered, { ...centered }, defaultState().stars[2]!],
    });
    expect(hitTest(two, layout, { x: 500, y: 500 })).toEqual({ type: 'star', index: 1 });
  });

  it('超出 starCount 的星芒不参与命中（看不见就抓不到）', () => {
    const hidden = stateWith({ starCount: 0, stars: [centered, ...defaultState().stars.slice(1)] });
    // 落在星芒上但星芒没画：退到标题
    expect(hitTest(hidden, layout, { x: 500, y: 500 })).toEqual({ type: 'title' });
    // 标题框外就什么都不中
    expect(hitTest(hidden, layout, { x: 500, y: 200 })).toBeNull();
  });

  it('标题只放宽左右，不放宽上下', () => {
    const bare = stateWith({ starCount: 0 });
    expect(hitTest(bare, layout, { x: 389, y: 500 })).toEqual({ type: 'title' });
    expect(hitTest(bare, layout, { x: 387, y: 500 })).toBeNull();
    expect(hitTest(bare, layout, { x: 500, y: 556 })).toBeNull();
  });
});

describe('grabOffset 与 draggedPosition', () => {
  it('按下时记住指针与锚点的偏移', () => {
    const s = stateWith({ titleX: 0.5, titleY: 0.485 });
    expect(grabOffset(s, { type: 'title' }, { x: 520, y: 500 }, 1000, 1000)).toEqual({
      x: 20,
      y: 15,
    });
  });

  it('偏移让元素不在按下那一刻跳位', () => {
    const s = stateWith({ titleX: 0.5, titleY: 0.485 });
    const p = { x: 520, y: 500 };
    const grab = grabOffset(s, { type: 'title' }, p, 1000, 1000);
    expect(draggedPosition(p, grab, 1000, 1000)).toEqual({ x: 0.5, y: 0.485 });
  });

  it('星芒的偏移用星芒自己的位置', () => {
    const s = stateWith({ starCount: 1, stars: [centered, ...defaultState().stars.slice(1)] });
    expect(grabOffset(s, { type: 'star', index: 0 }, { x: 505, y: 495 }, 1000, 1000)).toEqual({
      x: 5,
      y: -5,
    });
  });

  it('拖太远被 clamp 在出血范围内', () => {
    const pos = draggedPosition({ x: 5000, y: -5000 }, { x: 0, y: 0 }, 1000, 1000);
    expect(pos).toEqual({ x: 1 + DRAG_BOUND, y: -DRAG_BOUND });
  });
});

describe('moveTarget', () => {
  it('写回标题位置', () => {
    const s = stateWith();
    moveTarget(s, { type: 'title' }, { x: 0.3, y: 0.7 });
    expect([s.titleX, s.titleY]).toEqual([0.3, 0.7]);
  });

  it('写回指定星芒，不动别的', () => {
    const s = stateWith();
    const before = { ...s.stars[0]! };
    moveTarget(s, { type: 'star', index: 1 }, { x: 0.1, y: 0.2 });
    expect([s.stars[1]!.x, s.stars[1]!.y]).toEqual([0.1, 0.2]);
    expect(s.stars[0]).toEqual(before);
  });

  it('下标越界不抛，也不改任何东西', () => {
    const s = stateWith();
    const snapshot = JSON.stringify(s);
    moveTarget(s, { type: 'star', index: 99 }, { x: 0.1, y: 0.2 });
    expect(JSON.stringify(s)).toBe(snapshot);
  });
});

describe('snapToLastGlyph', () => {
  it('吸到末字偏右处 —— 正好是默认那根长芒的位置', () => {
    expect(snapToLastGlyph(layout.glyphs, 1000, 0.485)).toEqual({ x: 0.578, y: 0.485 });
    expect(defaultState().stars[0]!.x).toBe(0.578);
  });

  it('空标题没有可吸附的字', () => {
    expect(snapToLastGlyph([], 1000, 0.485)).toBeNull();
  });
});
