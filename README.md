# XX启动生成器

仿中国大陆游戏版号启动画面的定制工具——改标题、调星芒、导出 PNG。

## 这是什么

《原神》等游戏在国内启动时会显示一个白底画面：明体标题、四芒星装饰、底部的健康游戏忠告与版号信息。这个工具把那套视觉做成可高度定制的模板：换文字、调位置、选字体、改配色，最后导出成 1920×1080（或其他比例）的 PNG。

内置 6 个预设模板供参考，也可以从空白开始做自己的。

## 运行

```bash
npm install
npm run dev
```

在浏览器里打开 `http://localhost:5173`，右侧控制面板调整参数，画面上直接拖动标题和星芒改位置，完成后点「导出 PNG」。

构建生产版本（静态文件，可直接部署到 GitHub Pages）：

```bash
npm run build
npm run preview  # 预览 dist/ 产物
```

## 部署

### Cloudflare Pages

**方式 1：GitHub 自动部署（推荐）**

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 进入 **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**
3. 选择此仓库并配置：
   - **Framework preset**: Vite
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
4. 保存后自动部署，之后每次推送 main 分支自动更新

**方式 2：本地构建 + Wrangler CLI**

```bash
npm run build
npx wrangler pages deploy dist --project-name=xx-qidong
```

首次部署需先创建项目：`npx wrangler pages project create xx-qidong --production-branch=main`

### GitHub Pages

```bash
npm run build
# 将 dist/ 目录推送到 gh-pages 分支，或在仓库 Settings → Pages 配置 GitHub Actions 自动部署
```

## 技术栈

- **Vite** + **TypeScript** (strict)
- **Canvas 2D** 渲染（预览和导出同一条路径，WYSIWYG）
- **vitest** 单元测试（纯逻辑层，6 文件 93 测试）
- 零运行时依赖

## 模板来源

6 个预置模板的文案：

- **原神（原版）**：复刻 miHoYo 原版画面的标题、忠告与版号格式
- **上班** / **考研** / **摸鱼** / **健身**：同人恶搞，把版号那套视觉套到生活场景
- **空白**：只有默认标题「启动」，其余留空，适合从头定制

它们只是演示这套视觉的适用范围，不代表对任何真实游戏或组织的指涉。

## 许可

MIT
