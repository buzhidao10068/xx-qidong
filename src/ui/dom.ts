/** 取一个必须存在的元素。缺 id 就当场抛错 —— 静默 no-op 的界面更难查 */
export function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`index.html 里缺少 #${id}`);
  return node as T;
}
