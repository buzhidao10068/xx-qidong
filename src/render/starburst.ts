import { STAR_CONCAVITY } from '../config';
import type { PathSpec, Rect, StarState } from '../types';

/**
 * 四芒星。返回几何描述而不是直接画 —— 于是端点和控制点的坐标可以断言，
 * 见 design.md 第 5 节。canvas.ts 里有一个几行的适配器把它喂给
 * `quadraticCurveTo`。
 */

/**
 * 四段二次贝塞尔围成一颗针状星。控制点从直角处向中心收 `concavity` 倍：
 * 系数为 0 时退化成菱形（直边），越大边越向内凹、芒越尖。
 *
 * 路径从正上方端点出发，顺时针经右、下、左回到起点。
 */
export function starburstPath(ry: number, rx: number, concavity: number = STAR_CONCAVITY): PathSpec {
  const cx = rx * concavity;
  const cy = ry * concavity;
  return {
    start: { x: 0, y: -ry },
    curves: [
      { control: { x: cx, y: -cy }, to: { x: rx, y: 0 } },
      { control: { x: cx, y: cy }, to: { x: 0, y: ry } },
      { control: { x: -cx, y: cy }, to: { x: -rx, y: 0 } },
      { control: { x: -cx, y: -cy }, to: { x: 0, y: -ry } },
    ],
  };
}

/**
 * `size`（纵向半长）是占画布高度的百分数，`aspect`（横向半宽）是相对纵向半长的
 * 百分数。绘制和命中测试共用这一份换算，否则虚线框会和图形对不上。
 */
export function starRadii(
  size: number,
  aspect: number,
  canvasHeight: number,
): { rx: number; ry: number } {
  const ry = (size / 100) * canvasHeight;
  return { ry, rx: (ry * aspect) / 100 };
}

/**
 * 星芒的外接框。`minRxRatio` 给横向半宽兜一个下限（占画布宽度）：默认那根长芒
 * 只有几十像素宽却上百像素高，按实际宽度画框会细成一条线、按实际宽度做命中会
 * 抓不住。旋转不计入 —— 框是给手感用的，不追求紧贴图形。
 */
export function starRect(
  star: StarState,
  canvasWidth: number,
  canvasHeight: number,
  minRxRatio: number,
): Rect {
  const { rx, ry } = starRadii(star.size, star.aspect, canvasHeight);
  const halfW = Math.max(rx, canvasWidth * minRxRatio);
  return {
    x: star.x * canvasWidth - halfW,
    y: star.y * canvasHeight - ry,
    width: halfW * 2,
    height: ry * 2,
  };
}
