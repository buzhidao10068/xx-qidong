/**
 * 全工程的类型定义。这个文件只有类型，没有值 —— 任何模块 import 它都不会
 * 产生运行时依赖。
 *
 * 坐标与尺寸的单位约定（贯穿整个渲染层）：
 * - 位置类字段（titleX/titleY、star.x/y）是 **画布比例 0–1**
 * - 尺寸类字段（logoSize、star.size、infoSize、lineGap、bottom）是
 *   **占画布高度的百分数**
 * 这样切换画面比例时版面自动跟着走，不会因为绝对像素而错位。
 */

export type RatioKey = '16:9' | '4:3' | '1:1' | '9:16';

export type FontKey = 'song' | 'hei' | 'kai' | 'shu' | 'teyvat' | 'inazuma' | 'sumeru' | 'khaenriah' | 'khaenriah-chasm' | 'deshret' | 'starrail' | 'xianzhou' | 'zzz-system' | 'zzz-a' | 'endfield';

/** 四芒星的一个实例 */
export interface StarState {
  /** 水平位置，画布宽度比例 */
  x: number;
  /** 垂直位置，画布高度比例 */
  y: number;
  /** 纵向半长（长芒），占画布高度的百分数 */
  size: number;
  /** 横向半宽相对纵向半长的百分数，越小越细长 */
  aspect: number;
  /** 旋转角度，度 */
  rot: number;
}

export interface AppState {
  /** 当前选中的模板 key，仅用于高亮，不影响渲染 */
  preset: string;
  ratio: RatioKey;
  /** 底色，#rrggbb */
  bg: string;
  /** 墨色（标题 + 星芒 + 版号文字共用），#rrggbb */
  fg: string;
  /** 背景图上盖一层底色的不透明度，0–100 */
  dim: number;

  title: string;
  font: FontKey;
  logoSize: number;
  /** 字距，占字号的百分数，可负 */
  tracking: number;
  titleX: number;
  titleY: number;

  starCount: number;
  /** 恒为 3 项；只有前 starCount 项参与渲染，其余保留用户调过的值 */
  stars: StarState[];

  /** 健康游戏忠告，可多行；渲染时字号略大于信息行 */
  warn: string;
  /** 版号信息行，一项一行 */
  lines: string[];
  infoSize: number;
  lineGap: number;
  /** 最后一行到画布底边的距离 */
  bottom: number;
}

/**
 * 量一段文字在给定 font 简写下的宽度（像素）。
 *
 * 这是整个渲染层唯一的浏览器依赖，被抽成参数传入而不是直接调
 * `ctx.measureText`。排版函数因此变成纯函数，可以在 node 下用等宽假测量器
 * 断言算术结果 —— 见 design.md 第 2 节。
 */
export type Measure = (text: string, font: string) => number;

export interface GlyphBox {
  char: string;
  /** 字形左边缘的绘制 x（配合 textAlign='left'） */
  x: number;
  width: number;
  /** 字形中心 x，星芒吸附用 */
  centerX: number;
}

export interface TitleLayout {
  glyphs: GlyphBox[];
  /** 整行左边缘 */
  left: number;
  /** 含字距的总宽 */
  width: number;
}

/** 像素矩形，用于命中测试与虚线框 */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 可拖动的目标：标题，或第 index 个星芒 */
export type DragTarget = { type: 'title' } | { type: 'star'; index: number };

export interface Pt {
  x: number;
  y: number;
}

export interface QuadSeg {
  control: Pt;
  to: Pt;
}

/** 一条闭合路径，起点 + 若干二次贝塞尔段 */
export interface PathSpec {
  start: Pt;
  curves: QuadSeg[];
}

export interface Row {
  text: string;
  /** true = 忠告行，字号按系数放大 */
  emphasis: boolean;
}

export interface FittedRow {
  text: string;
  /** 为撑进可用宽度而缩放后的最终字号 */
  fontSize: number;
  /** 基线 y（像素） */
  y: number;
}

export interface FontSpec {
  label: string;
  /** CSS font-family 列表 */
  stack: string;
  weight: number;
}

export interface NumRange {
  min: number;
  max: number;
  step: number;
}

/** 模板只覆盖文案与配色，几何参数保留用户当前调好的值 */
export interface PresetPatch {
  title: string;
  font: FontKey;
  bg: string;
  fg: string;
  warn: string;
  lines: string[];
}

export interface Preset {
  key: string;
  /** 控制面板上的按钮文字 */
  chip: string;
  patch: PresetPatch;
}
