# Mayfly 序列帧工作台

Mayfly 序列帧工作台是一个本地优先的中文网页工具，用来把视频素材整理成游戏可用的序列帧资源。

## 功能

- 本地上传或拖拽上传视频
- 裁剪角色区域，移除留白与无关背景
- 点击背景取色，进行色键抠图
- 预览抠图结果、Alpha 蒙版与纯底色效果
- 按时间范围和抽帧频率生成序列帧
- 预览序列图和动画播放效果
- 导出 PNG 序列图与透明单帧 ZIP

## 本地开发

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build
```

## 部署

项目使用相对路径 `base`，可以直接部署到 GitHub Pages、Netlify 或其他静态托管平台。

### GitHub Pages

1. 把项目推送到你自己的 GitHub 仓库。
2. 在 `Settings -> Pages` 中把来源设为 `GitHub Actions`。
3. 推送到 `main` 分支后，仓库中的工作流会自动构建并发布 `dist` 目录。
