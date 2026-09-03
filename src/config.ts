import type { FontKey, FontSpec, NumRange, RatioKey } from './types';

/** localStorage 键；改这个会让老用户的配置失效，改之前先想清楚 */
export const STORAGE_KEY = 'xx-qidong-v1';

/**
 * 画面比例 → 渲染像素。内部一律按这个尺寸渲染，显示时才 CSS 缩放，
 * 所以预览和导出的 PNG 是同一份像素。
 */
export const RATIOS: Record<RatioKey, readonly [number, number]> = {
  '16:9': [1920, 1080],
  '4:3': [1440, 1080],
  '1:1': [1080, 1080],
  '9:16': [1080, 1920],
};

export const RATIO_KEYS = Object.keys(RATIOS) as RatioKey[];

/**
 * 标题可选字体。宋体·明朝最接近原版那种尖锐明体，是默认值。
 * Google Fonts 的 CJK 按 unicode-range 切片，所以每种字体只在真正用到时
 * 才下载对应切片；断网时退到系统字体，形状不同但不会崩。
 * HoYo 字体来自 https://github.com/SpeedyOrc-C/HoYo-Glyphs
 */
export const FONTS: Record<FontKey, FontSpec> = {
  song: {
    label: '宋体 · 明朝（原版感）',
    stack: '"Noto Serif SC","Source Han Serif SC","SimSun",serif',
    weight: 900,
  },
  hei: {
    label: '黑体 · 特粗',
    stack: '"Noto Sans SC","Microsoft YaHei","PingFang SC",sans-serif',
    weight: 900,
  },
  kai: {
    label: '楷体',
    stack: '"KaiTi","STKaiti","Noto Serif SC",serif',
    weight: 700,
  },
  shu: {
    label: '手书体',
    stack: '"Ma Shan Zheng","KaiTi",cursive',
    weight: 400,
  },
  teyvat: {
    label: '提瓦特文（原神·蒙德）',
    stack: '"Teyvat Black","Noto Serif SC",serif',
    weight: 400,
  },
  inazuma: {
    label: '稻妻文（原神·稻妻）',
    stack: '"Inazuma Brush","Noto Serif SC",serif',
    weight: 400,
  },
  sumeru: {
    label: '须弥文（原神·须弥）',
    stack: '"Sumeru Scribe","Noto Serif SC",serif',
    weight: 400,
  },
  khaenriah: {
    label: '坎瑞亚文（原神）',
    stack: '"Khaenriah Sun","Noto Serif SC",serif',
    weight: 400,
  },
  starrail: {
    label: '星穹铁道文（崩铁·空间站）',
    stack: '"Star Rail Neue Sans","Noto Sans SC",sans-serif',
    weight: 400,
  },
  xianzhou: {
    label: '罗浮文（崩铁·仙舟）',
    stack: '"Xianzhou Seal","Noto Serif SC",serif',
    weight: 400,
  },
};

export const FONT_KEYS = Object.keys(FONTS) as FontKey[];

/** 底部版号文字块固定用粗黑体，和原图一致 */
export const BODY_FONT_STACK = '"Noto Sans SC","Microsoft YaHei","PingFang SC",sans-serif';
export const BODY_FONT_WEIGHT = 700;

/** 忠告行相对信息行的字号系数 */
export const EMPHASIS_SCALE = 1.1;

/** 版号文字块允许占用的画布宽度比例，超出就逐行缩放 */
export const BLOCK_MAX_WIDTH_RATIO = 0.945;

/** 四芒星控制点向中心收拢的系数，决定芒的凹陷程度 */
export const STAR_CONCAVITY = 0.11;

export const MAX_STARS = 3;

/**
 * 滑块区间。**状态归一化的 clamp 和 UI 上的 min/max/step 都读这一份**，
 * 避免两处数字不一致导致「拖到底还能再变」之类的怪现象。
 */
export const RANGES = {
  logoSize: { min: 6, max: 46, step: 0.5 },
  tracking: { min: -12, max: 40, step: 1 },
  starSize: { min: 1, max: 60, step: 0.5 },
  starAspect: { min: 4, max: 100, step: 1 },
  starRot: { min: 0, max: 90, step: 1 },
  infoSize: { min: 1.2, max: 5, step: 0.05 },
  lineGap: { min: 1.8, max: 8, step: 0.1 },
  bottom: { min: 1, max: 20, step: 0.2 },
  dim: { min: 0, max: 100, step: 1 },
} satisfies Record<string, NumRange>;

/** 拖动时允许把元素移出画面多远（比例），留一点余量方便做出血效果 */
export const DRAG_BOUND = 0.15;

/**
 * 命中测试的手感参数。星芒可以细到只有几像素宽，按图形实际宽度做命中就等于
 * 抓不住 —— 所以横向命中半宽有下限，另外四周再加一圈容差。
 */
export const HIT = {
  /** 横向命中半宽下限，占画布宽度 */
  starMinRx: 0.012,
  /** 四周容差，占画布宽 / 高 */
  tolerance: 0.006,
  /** 标题左右额外容差（像素，画布坐标系） */
  titlePadX: 12,
} as const;

/** 选中虚线框的样式。只在悬停/拖动时画，导出帧里没有 */
export const MARK = {
  /** 框离图形的间距（像素） */
  pad: 10,
  /** 框的横向半宽下限，占画布宽度 */
  starMinRx: 0.007,
  dash: [10, 8],
  color: 'rgba(201,164,92,.95)',
  minLineWidth: 1.6,
  /** 线宽取 max(minLineWidth, 画布宽 / lineWidthDivisor)，换比例时粗细观感一致 */
  lineWidthDivisor: 1000,
} as const;

export const BG_SWATCHES = ['#ffffff', '#f4f1e8', '#0b0b0d', '#101a2e', '#2a0f12'] as const;
export const FG_SWATCHES = ['#111111', '#000000', '#ffffff', '#c9a45c', '#b21b1b'] as const;
