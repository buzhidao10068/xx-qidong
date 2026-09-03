/**
 * 导出。唯一约定见 design.md 第 6 节：取图之前先画一帧不带辅助线的，取完再恢复
 * 常规帧 —— 所以导出的 PNG 里不可能出现选中虚线框。这一层只管取图，画什么由
 * 调用方通过 hooks 决定。
 */

export interface FrameHooks {
  /** 画一帧成品（overlay 关掉） */
  drawClean(): void;
  /** 恢复常规帧（可能带辅助线） */
  restore(): void;
}

export function toPngDataUrl(canvas: HTMLCanvasElement, hooks: FrameHooks): string {
  hooks.drawClean();
  try {
    return canvas.toDataURL('image/png');
  } finally {
    hooks.restore();
  }
}

export async function toPngBlob(canvas: HTMLCanvasElement, hooks: FrameHooks): Promise<Blob> {
  hooks.drawClean();
  try {
    // 先拿到 blob 再恢复：toBlob 是异步编码的，恢复得等它取完那一帧
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/png');
    });
    if (!blob) throw new Error('canvas 没能生成 PNG');
    return blob;
  } finally {
    hooks.restore();
  }
}

/**
 * 写剪贴板。沙箱 iframe、非 HTTPS、以及部分浏览器不给脚本这个权限，
 * 失败时抛出去，由调用方提示「右键另存」—— 不静默失败。
 */
export async function copyPngToClipboard(
  canvas: HTMLCanvasElement,
  hooks: FrameHooks,
): Promise<void> {
  const blob = await toPngBlob(canvas, hooks);
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}

/** Windows 下这些字符不能进文件名，标题里出现就去掉 */
const ILLEGAL_IN_FILENAME = /[\\/:*?"<>|]/g;

/** 「原神」→「原神启动.png」；标题为空时退回 qidong，不生成「启动.png」这种名字 */
export function downloadName(title: string): string {
  const base = title.replace(ILLEGAL_IN_FILENAME, '').trim() || 'qidong';
  return `${base}启动.png`;
}
