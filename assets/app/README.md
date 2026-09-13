# FormaBot 应用图标

设计：三个带眼睛的 Bot 组合成 F。正式资源由 SVG 矢量母版生成。

- `icon.svg`：可缩放矢量母版，透明外部、深色圆角板、三位银白 Bot。
- `icon.png`：1024px RGBA 主图。
- `icon.icns`：macOS 16/32/128/256/512 与相应2x尺寸。

修改 SVG 后可用开发环境中的 sharp 渲染 PNG，再执行 `node scripts/build-app-icon.mjs` 转换多尺寸 ICNS。`electron-builder.yml` 的 mac.icon 引用该文件，用户安装使用不需要这些开发工具。

此版仍待用户视觉验收。
