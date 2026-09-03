import { describe, expect, it } from 'vitest';
import { layoutGlyphs, titleBox } from '../src/render/logotype';
import type { Measure } from '../src/types';

/**
 * 假等宽测量器：每个字恒 100px。字号由参数单独传入，所以测量器不必感知字号 ——
 * 于是下面的断言值全是手算的，不是「跑一遍记下来」。
 */
const mono: Measure = () => 100;

describe('layoutGlyphs — 字距为 0', () => {
  const layout = layoutGlyphs('原神', 100, 0, 500, 'F', mono);

  it('总宽是各字宽之和', () => {
    expect(layout.width).toBe(200);
  });

  it('整行以 centerX 居中', () => {
    expect(layout.left).toBe(400);
    expect(layout.left + layout.width / 2).toBe(500);
  });

  it('每字的 x 与字盒中心', () => {
    expect(layout.glyphs).toEqual([
      { char: '原', x: 400, width: 100, centerX: 450 },
      { char: '神', x: 500, width: 100, centerX: 550 },
    ]);
  });
});

describe('layoutGlyphs — 字距', () => {
  it('正字距只加在字与字之间，共 n-1 份', () => {
    // fontSize 100 × 20% = 20px 字距
    const l = layoutGlyphs('原神', 100, 20, 500, 'F', mono);
    expect(l.width).toBe(220);
    expect(l.left).toBe(390);
    expect(l.glyphs.map((g) => g.x)).toEqual([390, 510]);
  });

  it('负字距收紧总宽', () => {
    const l = layoutGlyphs('原神', 100, -10, 500, 'F', mono);
    expect(l.width).toBe(190);
    expect(l.glyphs.map((g) => g.x)).toEqual([405, 495]);
  });

  it('三个字是两份字距', () => {
    const l = layoutGlyphs('原神启', 100, 10, 0, 'F', mono);
    expect(l.width).toBe(320);
  });

  it('单字时字距不影响任何东西', () => {
    const a = layoutGlyphs('原', 100, 0, 500, 'F', mono);
    const b = layoutGlyphs('原', 100, 40, 500, 'F', mono);
    expect(b).toEqual(a);
    expect(a.width).toBe(100);
  });
});

describe('layoutGlyphs — 边界与契约', () => {
  it('空串不产生字形，宽度为 0', () => {
    const l = layoutGlyphs('', 100, 20, 500, 'F', mono);
    expect(l.glyphs).toEqual([]);
    expect(l.width).toBe(0);
    expect(l.left).toBe(500);
  });

  it('代理对按字符切，不按 UTF-16 码元', () => {
    const l = layoutGlyphs('🐟鱼', 100, 0, 0, 'F', mono);
    expect(l.glyphs).toHaveLength(2);
    expect(l.glyphs[0]!.char).toBe('🐟');
  });

  it('末字盒子中心可用于星芒吸附', () => {
    const l = layoutGlyphs('原神', 100, 0, 500, 'F', mono);
    expect(l.glyphs.at(-1)!.centerX).toBe(550);
  });

  it('测量器拿到的正是传入的 font 简写', () => {
    const seen: string[] = [];
    const spy: Measure = (_t, f) => {
      seen.push(f);
      return 100;
    };
    layoutGlyphs('原神', 100, 0, 0, '900 100px "Noto Serif SC"', spy);
    expect(seen).toEqual(['900 100px "Noto Serif SC"', '900 100px "Noto Serif SC"']);
  });
});

describe('titleBox', () => {
  it('框住整行，中线上下按字号取经验值', () => {
    const l = layoutGlyphs('原神', 100, 0, 500, 'F', mono);
    const box = titleBox(l, 100, 540);
    expect(box.x).toBe(400);
    expect(box.width).toBe(200);
    expect(box.y).toBeCloseTo(484);
    expect(box.height).toBeCloseTo(112);
  });
});
