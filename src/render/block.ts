import { BLOCK_MAX_WIDTH_RATIO, EMPHASIS_SCALE } from '../config';
import type { FittedRow, Measure, Row } from '../types';

/**
 * 底部版号文字块的排版：把忠告与信息行收成行序列，逐行算字号与基线 y。
 * 纯算术 + 注入的测量函数，不碰 canvas。
 */

/**
 * 忠告行在前、信息行在后。空白行直接丢掉：用户把某一行清空时，
 * 版面不该留一道空隙。
 */
export function collectRows(warn: string, lines: readonly string[]): Row[] {
  const out: Row[] = [];
  for (const text of warn.split('\n')) {
    if (text.trim()) out.push({ text, emphasis: true });
  }
  for (const text of lines) {
    if (text.trim()) out.push({ text, emphasis: false });
  }
  return out;
}

/** 版号块允许占用的宽度。原版那行审批文号几乎顶到边，留一点余量 */
export function blockMaxWidth(canvasWidth: number): number {
  return canvasWidth * BLOCK_MAX_WIDTH_RATIO;
}

/**
 * 撑不进可用宽度时按比例缩这一行的字号 —— 只缩超限的行，别的行保持原大小，
 * 原版就是这个观感（长的审批文号行明显比下面两行小）。
 *
 * 文字宽度对字号是线性的，所以量一次算比例就够，不用二分逼近。
 * 宽度为 0（空串）或测量器返回 NaN 时原样返回，不产生 Infinity/NaN 字号。
 */
export function fitLine(
  text: string,
  fontSize: number,
  maxWidth: number,
  font: string,
  measure: Measure,
): number {
  const w = measure(text, font);
  if (!(w > 0) || !(maxWidth > 0) || w <= maxWidth) return fontSize;
  return (fontSize * maxWidth) / w;
}

export interface BlockGeometry {
  /** 信息行字号（像素）；忠告行按 EMPHASIS_SCALE 放大 */
  baseSize: number;
  /** 行距（像素，基线到基线） */
  gap: number;
  maxWidth: number;
  /** 最后一行的基线 y（像素） */
  lastBaselineY: number;
}

/**
 * 从底往上排：最后一行钉在 `lastBaselineY`，往上每行减一个 gap。
 * 这样加减行数时底边距不变 —— 底边距是用户直接调的那个值。
 */
export function layoutBlock(
  rows: readonly Row[],
  geom: BlockGeometry,
  fontAt: (size: number) => string,
  measure: Measure,
): FittedRow[] {
  const last = rows.length - 1;
  return rows.map((row, i) => {
    const size = row.emphasis ? geom.baseSize * EMPHASIS_SCALE : geom.baseSize;
    return {
      text: row.text,
      fontSize: fitLine(row.text, size, geom.maxWidth, fontAt(size), measure),
      y: geom.lastBaselineY - (last - i) * geom.gap,
    };
  });
}
