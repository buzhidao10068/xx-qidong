import { defineConfig } from 'vitest/config';

export default defineConfig({
  // 相对路径：dist/ 可以直接丢到 GitHub Pages 的任意子路径下
  base: './',
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
  },
  test: {
    // 刻意用 node 环境：布局与状态逻辑不依赖浏览器，
    // 装 jsdom 只会掩盖「渲染纯逻辑真的不碰 DOM」这条约束。
    environment: 'node',
    include: ['tests/**/*.spec.ts'],
  },
});
