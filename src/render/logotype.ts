import type { GlyphBox, Measure, Rect, TitleLayout } from '../types';

/**
 * 标题排版。纯算术 + 一个注入的测量函数，不碰 canvas。
 */

/**
 * 逐字排版，而不是设 canvas 的 `letterSpacing`。两个理由：
 * 1. 星芒要吸附到某个字的字盒中心（原版那根长芒穿过「神」字右竖），
 *    所以必须知道每个字的 x 与宽度；
 * 2. `letterSpacing` 在末字之后是否留一份间距，各家实现并不一致，
 *    居中就会偏半个字距。
 *
 * 字距只加在字与字之间，共 n-1 份。
 */
export function layoutGlyphs(
  text: string,
  fontSize: number,
  trackingPct: number,
  centerX: number,
  font: string,
  measure: Measure,
): TitleLayout {
  // Array.from 而不是 split('')：代理对（emoji、生僻字）不能按 UTF-16 码元切
  const chars = Array.from(text);
  const tracking = (fontSize * trackingPct) / 100;
  const widths = chars.map((c) => measure(c, font));
  const sum = widths.reduce((a, b) => a + b, 0);
  const width = sum + tracking * Math.max(0, chars.length - 1);
  const left = centerX - width / 2;

  const glyphs: GlyphBox[] = [];
  let x = left;
  for (let i = 0; i < chars.length; i++) {
    const w = widths[i]!;
    glyphs.push({ char: chars[i]!, x, width: w, centerX: x + w / 2 });
    x += w + tracking;
  }
  return { glyphs, left, width };
}

/**
 * 字盒经验值：基线走中线（`textBaseline='middle'`）时，视觉字盒的上沿大约在
 * 中线上方 0.56 个字号处，总高约 1.12 个字号。用于命中测试与虚线框，
 * 不参与绘制，所以不需要真实字形度量。
 */
const BOX_ASCENT = 0.56;
const BOX_HEIGHT = 1.12;

/** 标题的命中框 / 虚线框。centerY 是标题中线的像素 y */
export function titleBox(layout: TitleLayout, fontSize: number, centerY: number): Rect {
  return {
    x: layout.left,
    y: centerY - fontSize * BOX_ASCENT,
    width: layout.width,
    height: fontSize * BOX_HEIGHT,
  };
}
