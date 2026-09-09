# 老家 · 院落里的时光

在网页里旋转、缩放、平移查看老家院落，支持电脑和手机。所有运行所需的模型、贴图和查看器代码均随站点托管，无需个人服务器。

**打开模型：<https://zhouguangyuan0718.github.io/hometown-3d/>**

![分享二维码](public/qr.png)

## 操作

- 电脑：左键拖动旋转，滚轮缩放，右键拖动平移；聚焦三维视图后可用方向键平移。
- 手机：单指旋转，双指缩放和平移。
- 工具栏：全景复位、俯视、自动旋转、全屏。
- 右上角分享按钮：显示二维码、复制链接。

## 模型来源

网页模型来自「老家_上下院自然地面_v41.glb」，依据老家照片复原。部分地面、老化与未拍摄区域的细节为推测还原，并非测绘成果。

本仓库只包含浏览用的优化模型；Blender 工程、原始照片和原始 GLB 保留在本地。优化包括网格合并、有限误差简化、Meshopt 压缩、最长边 2048 像素的 WebP 贴图。精度参数和文件校验值见 `model-info.json`。

## 本地开发

使用 Node.js 24 与 pnpm 11.19.0：

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm build
pnpm preview
```

重新生成浏览模型：

```sh
pnpm exec gltf-transform optimize /path/to/source.glb public/model.glb \
  --compress meshopt --texture-compress webp --texture-size 2048 \
  --simplify-error 0.0002 --simplify-ratio 0.5 \
  --simplify-lock-border true --instance false
```

推送 `main` 后，GitHub Actions 自动构建并发布 GitHub Pages。`revision.txt` 记录线上站点对应的源代码提交。

网页公开访问，浏览用 GLB 也可通过网址获取。模型未另行授予转载或商用许可；依赖库遵循各自的开源许可证。
