import { describe, expect, it } from 'vitest';
import { STAR_CONCAVITY } from '../src/config';
import { starburstPath, starRadii, starRect } from '../src/render/starburst';
import type { StarState } from '../src/types';

const star = (over: Partial<StarState> = {}): StarState => ({
  x: 0.5,
  y: 0.5,
  size: 10,
  aspect: 100,
  rot: 0,
  ...over,
});

describe('starburstPath — 端点', () => {
  const p = starburstPath(200, 40);

  it('四段贝塞尔', () => {
    expect(p.curves).toHaveLength(4);
  });

  it('起点在正上方，四个端点严格落在轴上', () => {
    expect(p.start).toEqual({ x: 0, y: -200 });
    expect(p.curves.map((c) => c.to)).toEqual([
      { x: 40, y: 0 },
      { x: 0, y: 200 },
      { x: -40, y: 0 },
      { x: 0, y: -200 },
    ]);
  });

  it('路径闭合：末段终点回到起点', () => {
    expect(p.curves.at(-1)!.to).toEqual(p.start);
  });
});

describe('starburstPath — 凹陷', () => {
  it('控制点落在 concavity × 半径上', () => {
    const p = starburstPath(200, 40, 0.11);
    expect(p.curves[0]!.control.x).toBeCloseTo(4.4);
    expect(p.curves[0]!.control.y).toBeCloseTo(-22);
    // 四个控制点是同一点的四个象限镜像
    expect(p.curves.map((c) => Math.abs(c.control.x))).toEqual(
      p.curves.map(() => Math.abs(p.curves[0]!.control.x)),
    );
  });

  it('控制点的象限符号决定芒指向', () => {
    const p = starburstPath(200, 40, 0.11);
    const signs = p.curves.map((c) => [Math.sign(c.control.x), Math.sign(c.control.y)]);
    expect(signs).toEqual([
      [1, -1],
      [1, 1],
      [-1, 1],
      [-1, -1],
    ]);
  });

  it('concavity 为 0 时退化成菱形（控制点在原点）', () => {
    const p = starburstPath(200, 40, 0);
    for (const c of p.curves) {
      expect(c.control.x).toBeCloseTo(0);
      expect(c.control.y).toBeCloseTo(0);
    }
  });

  it('默认用 config 里的 STAR_CONCAVITY', () => {
    expect(starburstPath(200, 40)).toEqual(starburstPath(200, 40, STAR_CONCAVITY));
  });
});

describe('starburstPath — 极端比例不产生 NaN', () => {
  it.each([
    [0, 0],
    [648, 0.0001],
    [0.0001, 648],
    [1e6, 1e-6],
  ])('ry=%p rx=%p 的所有坐标都是有限数', (ry, rx) => {
    const p = starburstPath(ry, rx);
    const nums = [p.start, ...p.curves.flatMap((c) => [c.control, c.to])].flatMap((pt) => [
      pt.x,
      pt.y,
    ]);
    expect(nums.every(Number.isFinite)).toBe(true);
  });
});

describe('starRadii', () => {
  it('size 是画布高度百分数，aspect 是相对纵向半长的百分数', () => {
    // 默认那根长芒：17% × 1080 = 183.6 纵向半长，横向 20% 于它
    const { ry, rx } = starRadii(17, 20, 1080);
    expect(ry).toBeCloseTo(183.6);
    expect(rx).toBeCloseTo(36.72);
  });

  it('aspect 100 时是正的（等长等宽）', () => {
    const { ry, rx } = starRadii(10, 100, 1080);
    expect(rx).toBeCloseTo(ry);
  });

  it('换比例时半长跟着画布高度走', () => {
    expect(starRadii(17, 20, 1920).ry).toBeCloseTo(starRadii(17, 20, 1080).ry * (1920 / 1080));
  });
});

describe('starRect', () => {
  it('框以星芒位置为中心，宽高是两倍半径', () => {
    const r = starRect(star(), 1000, 1000, 0.007);
    expect(r).toEqual({ x: 400, y: 400, width: 200, height: 200 });
    expect(r.x + r.width / 2).toBe(500);
    expect(r.y + r.height / 2).toBe(500);
  });

  it('细星芒的横向半宽兜到下限，否则抓不住', () => {
    // ry=100，rx=1；下限 1000×0.012=12 生效
    const r = starRect(star({ aspect: 1 }), 1000, 1000, 0.012);
    expect(r.width).toBe(24);
    expect(r.height).toBe(200);
  });

  it('下限不会把粗星芒改窄', () => {
    expect(starRect(star(), 1000, 1000, 0.012).width).toBe(200);
  });

  it('位置比例落到像素', () => {
    const r = starRect(star({ x: 0.25, y: 0.75 }), 1920, 1080, 0.007);
    expect(r.x + r.width / 2).toBeCloseTo(480);
    expect(r.y + r.height / 2).toBeCloseTo(810);
  });
});
