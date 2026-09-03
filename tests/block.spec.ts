import { describe, expect, it } from 'vitest';
import { BLOCK_MAX_WIDTH_RATIO, EMPHASIS_SCALE } from '../src/config';
import { blockMaxWidth, collectRows, fitLine, layoutBlock } from '../src/render/block';
import type { Measure } from '../src/types';

/**
 * 假等宽测量器：每字宽 = 0.9 × 字号，字号从 font 简写里读。
 * 字号相关是有意的 —— fitLine 缩放后要能重新量一遍，验证「缩完确实撑得进」。
 */
const CHAR_RATIO = 0.9;
const fontAt = (size: number): string => `700 ${size}px X`;
const mono: Measure = (text, font) => {
  const m = /([\d.]+)px/.exec(font);
  return Array.from(text).length * (m ? Number(m[1]) : 0) * CHAR_RATIO;
};

describe('collectRows', () => {
  it('忠告在前、信息行在后，忠告按换行拆', () => {
    expect(collectRows('甲\n乙', ['丙'])).toEqual([
      { text: '甲', emphasis: true },
      { text: '乙', emphasis: true },
      { text: '丙', emphasis: false },
    ]);
  });

  it('空白行被滤掉，不留空隙', () => {
    expect(collectRows('甲\n\n  \n乙', ['', '  ', '丙'])).toEqual([
      { text: '甲', emphasis: true },
      { text: '乙', emphasis: true },
      { text: '丙', emphasis: false },
    ]);
  });

  it('全空得到空数组（空白模板要能什么都不画）', () => {
    expect(collectRows('', [''])).toEqual([]);
    expect(collectRows('   \n\t', [])).toEqual([]);
  });
});

describe('blockMaxWidth', () => {
  it('按画布宽度取固定比例', () => {
    expect(blockMaxWidth(1920)).toBeCloseTo(1920 * BLOCK_MAX_WIDTH_RATIO);
    expect(blockMaxWidth(1080)).toBeLessThan(blockMaxWidth(1920));
  });
});

describe('fitLine', () => {
  it('没超限时字号一字不改', () => {
    // 6 字 × 20px × 0.9 = 108
    expect(fitLine('六个字六个字', 20, 1000, fontAt(20), mono)).toBe(20);
  });

  it('超限时按比例缩，缩完正好撑满', () => {
    const text = '六个字六个字';
    const fitted = fitLine(text, 20, 54, fontAt(20), mono);
    expect(fitted).toBeCloseTo(10);
    expect(mono(text, fontAt(fitted))).toBeCloseTo(54);
  });

  it('空串与零宽不产生 NaN / Infinity 字号', () => {
    expect(fitLine('', 20, 100, fontAt(20), mono)).toBe(20);
    expect(fitLine('甲', 20, 0, fontAt(20), mono)).toBe(20);
    expect(fitLine('甲', 20, 100, fontAt(20), () => NaN)).toBe(20);
  });
});

describe('layoutBlock', () => {
  const rows = collectRows('忠告', ['行一', '行二']);
  const geom = { baseSize: 20, gap: 30, maxWidth: 1000, lastBaselineY: 1000 };
  const out = layoutBlock(rows, geom, fontAt, mono);

  it('从底往上排：末行钉在 lastBaselineY，往上每行减一个 gap', () => {
    expect(out.map((r) => r.y)).toEqual([940, 970, 1000]);
  });

  it('忠告行字号按 EMPHASIS_SCALE 放大，信息行用基准字号', () => {
    expect(out[0]!.fontSize).toBeCloseTo(20 * EMPHASIS_SCALE);
    expect(out[1]!.fontSize).toBe(20);
    expect(out[2]!.fontSize).toBe(20);
  });

  it('文字原样带过来', () => {
    expect(out.map((r) => r.text)).toEqual(['忠告', '行一', '行二']);
  });

  it('只缩超限的那一行，其余不受影响', () => {
    const long = 'x'.repeat(60);
    const mixed = layoutBlock(
      [
        { text: long, emphasis: false },
        { text: '短', emphasis: false },
      ],
      { baseSize: 24, gap: 30, maxWidth: 1000, lastBaselineY: 1000 },
      fontAt,
      mono,
    );
    expect(mixed[0]!.fontSize).toBeLessThan(24);
    expect(mixed[1]!.fontSize).toBe(24);
    // 缩放后确实撑进了可用宽度
    expect(mono(long, fontAt(mixed[0]!.fontSize))).toBeLessThanOrEqual(1000 + 1e-6);
  });

  it('空行序列得到空布局', () => {
    expect(layoutBlock([], geom, fontAt, mono)).toEqual([]);
  });

  it('单行就贴在 lastBaselineY 上', () => {
    const one = layoutBlock([{ text: '甲', emphasis: false }], geom, fontAt, mono);
    expect(one[0]!.y).toBe(1000);
  });
});
