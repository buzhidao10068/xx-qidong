import {
  BODY_FONT_STACK,
  BODY_FONT_WEIGHT,
  FONTS,
  MARK,
  RATIOS,
} from '../config';
import { blockMaxWidth, collectRows, layoutBlock } from './block';
import { layoutGlyphs, titleBox } from './logotype';
import { starburstPath, starRadii, starRect } from './starburst';
import type { AppState, DragTarget, GlyphBox, Measure, PathSpec, Rect, StarState } from '../types';

/**
 * canvas 适配层：唯一一处碰 `CanvasRenderingContext2D` 的渲染代码。
 * 比例→像素的换算、纯函数的调用、路径喂给 canvas API 都集中在这里，
 * 上面三个 render 子模块因此保持可测。
 */

/** 尺寸类字段一律是「占画布高度的百分数」，这是唯一换算点 */
function px(pct: number, canvasHeight: number): number {
  return (pct / 100) * canvasHeight;
}

/** 一帧画完后留下的几何信息，交给命中测试用，避免再量一遍文字 */
export interface SceneLayout {
  width: number;
  height: number;
  /** 标题命中框 */
  title: Rect;
  /** 每个字的盒子，星芒吸附用 */
  glyphs: GlyphBox[];
}

export interface SceneOptions {
  /**
   * 画选中虚线框。导出路径固定传 `false`，所以导出的 PNG 里不可能有辅助线
   * （见 design.md 第 6 节）。
   */
  overlay?: boolean;
  /** 虚线框套在谁身上；null 表示不画框。选谁由 UI 决定，这里不猜 */
  focus?: DragTarget | null;
  /** 背景图，null 时只填底色 */
  background?: HTMLImageElement | null;
}

export function drawScene(
  ctx: CanvasRenderingContext2D,
  state: AppState,
  opts: SceneOptions = {},
): SceneLayout {
  const [width, height] = RATIOS[state.ratio];

  // 改 canvas 尺寸会清空上下文状态，所以必须在任何绘制之前
  if (ctx.canvas.width !== width || ctx.canvas.height !== height) {
    ctx.canvas.width = width;
    ctx.canvas.height = height;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  const measure: Measure = (text, font) => {
    ctx.font = font;
    return ctx.measureText(text).width;
  };

  ctx.fillStyle = state.bg;
  ctx.fillRect(0, 0, width, height);
  if (opts.background) drawCover(ctx, opts.background, state, width, height);

  const layout = drawTitle(ctx, state, width, height, measure);
  for (let i = 0; i < state.starCount; i++) {
    const star = state.stars[i];
    if (star) drawStar(ctx, star, state.fg, width, height);
  }
  drawBlock(ctx, state, width, height, measure);

  if (opts.overlay && opts.focus) drawMarks(ctx, state, layout, opts.focus, width, height);
  return layout;
}

/** 背景图按 cover 铺满并居中，再按 dim 盖一层底色压暗 */
function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  state: AppState,
  width: number,
  height: number,
): void {
  if (!img.naturalWidth || !img.naturalHeight) return;
  const scale = Math.max(width / img.naturalWidth, height / img.naturalHeight);
  const w = img.naturalWidth * scale;
  const h = img.naturalHeight * scale;
  ctx.drawImage(img, (width - w) / 2, (height - h) / 2, w, h);
  if (state.dim > 0) {
    ctx.globalAlpha = state.dim / 100;
    ctx.fillStyle = state.bg;
    ctx.fillRect(0, 0, width, height);
    ctx.globalAlpha = 1;
  }
}

function drawTitle(
  ctx: CanvasRenderingContext2D,
  state: AppState,
  width: number,
  height: number,
  measure: Measure,
): SceneLayout {
  const spec = FONTS[state.font];
  const fontSize = px(state.logoSize, height);
  const font = `${spec.weight} ${fontSize}px ${spec.stack}`;
  const centerY = state.titleY * height;
  const layout = layoutGlyphs(state.title, fontSize, state.tracking, state.titleX * width, font, measure);

  ctx.font = font;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = state.fg;
  for (const glyph of layout.glyphs) ctx.fillText(glyph.char, glyph.x, centerY);

  return {
    width,
    height,
    title: titleBox(layout, fontSize, centerY),
    glyphs: layout.glyphs,
  };
}

function drawStar(
  ctx: CanvasRenderingContext2D,
  star: StarState,
  fg: string,
  width: number,
  height: number,
): void {
  const { rx, ry } = starRadii(star.size, star.aspect, height);
  ctx.save();
  ctx.translate(star.x * width, star.y * height);
  if (star.rot) ctx.rotate((star.rot * Math.PI) / 180);
  tracePath(ctx, starburstPath(ry, rx));
  ctx.fillStyle = fg;
  ctx.fill();
  ctx.restore();
}

/** design.md 第 5 节说的那个适配器：PathSpec → canvas 路径 */
function tracePath(ctx: CanvasRenderingContext2D, path: PathSpec): void {
  ctx.beginPath();
  ctx.moveTo(path.start.x, path.start.y);
  for (const seg of path.curves) {
    ctx.quadraticCurveTo(seg.control.x, seg.control.y, seg.to.x, seg.to.y);
  }
  ctx.closePath();
}

/** 底部版号文字块：居中，逐行按算好的字号和基线画 */
function drawBlock(
  ctx: CanvasRenderingContext2D,
  state: AppState,
  width: number,
  height: number,
  measure: Measure,
): void {
  const rows = collectRows(state.warn, state.lines);
  if (rows.length === 0) return;

  const fontAt = (size: number): string => `${BODY_FONT_WEIGHT} ${size}px ${BODY_FONT_STACK}`;
  const fitted = layoutBlock(
    rows,
    {
      baseSize: px(state.infoSize, height),
      gap: px(state.lineGap, height),
      maxWidth: blockMaxWidth(width),
      lastBaselineY: height - px(state.bottom, height),
    },
    fontAt,
    measure,
  );

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = state.fg;
  for (const row of fitted) {
    ctx.font = fontAt(row.fontSize);
    ctx.fillText(row.text, width / 2, row.y);
  }
}

function drawMarks(
  ctx: CanvasRenderingContext2D,
  state: AppState,
  layout: SceneLayout,
  focus: DragTarget,
  width: number,
  height: number,
): void {
  const rect = focusRect(state, layout, focus, width, height);
  if (!rect) return;
  ctx.save();
  ctx.setLineDash([...MARK.dash]);
  ctx.lineWidth = Math.max(MARK.minLineWidth, width / MARK.lineWidthDivisor);
  ctx.strokeStyle = MARK.color;
  ctx.strokeRect(
    rect.x - MARK.pad,
    rect.y - MARK.pad,
    rect.width + MARK.pad * 2,
    rect.height + MARK.pad * 2,
  );
  ctx.restore();
}

function focusRect(
  state: AppState,
  layout: SceneLayout,
  focus: DragTarget,
  width: number,
  height: number,
): Rect | null {
  if (focus.type === 'title') return layout.title;
  // starCount 调小后选中项可能已经不画了，退到最后一个可见的
  const star = state.stars[Math.min(focus.index, state.starCount - 1)];
  return star ? starRect(star, width, height, MARK.starMinRx) : null;
}
