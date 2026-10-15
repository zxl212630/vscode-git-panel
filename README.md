# VS Code Git Panel (IntelliJ IDEA 风格)

参考 IntelliJ IDEA 经典的 Git 底部面板，为 VS Code 打造的三栏一体化 Git 控制台。

## ✨ 核心特性

- **底部面板无缝集成**：默认注册在 VS Code 底部面板区域（与 Terminal / Output 平级），随时便捷调出。
- **三栏可自由拖拽布局 (SplitPane)**：
  - **左栏：分支管理 (Branch Tree)**
    - 多 Git 仓库自动扫描与快速切换。
    - HEAD 当前分支高亮置顶。
    - Local / Remote 分支树折叠展开与即时搜索过滤。
    - 双击快速检出（Checkout）。
    - 完整右键菜单：检出、新建分支、合并到当前分支、变基、推送到远程、删除分支。
  - **中栏：Git Graph 提交图谱与历史**
    - 高效车道拓扑分配算法，SVG 绘制平滑贝塞尔曲线连线与提交圆点。
    - 虚拟滚动优化，数万条 Commit 流畅滑动。
    - IDEA 风格过滤工具栏：文本/Hash 检索（支持正则表达式 `.*` 与大小写 `Cc`）、分支筛选、作者筛选、一键 Jump to HEAD 与刷新。
    - 提交右键菜单：Cherry-pick、新建分支、打标签、Reset (Soft/Hard)、Revert、复制 Commit Hash。
  - **右栏：Commit Diff 详情与变更文件**
    - 变更文件树支持“树形结构 (Tree)”与“平铺列表 (Flat List)”双模式切换。
    - 文件状态图标（A 新增、M 修改、D 删除、R 重命名）。
    - **主编辑区 Diff 联动**：点击文件即在 VS Code 主编辑区调起内置 `vscode.diff` 比较历史快照。
    - 完整提交详情卡片：Commit Message、Author、Email、Date、Commit Hash、所属分支及 Tag 徽章。

## 🚀 开发与调试

```bash
# 1. 安装依赖
pnpm install

# 2. 构建扩展与 Webview 前端
npm run build

# 3. 在 VS Code 中按 F5 启动扩展调试窗口
```

在打开的扩展宿主窗口底部的 Panel 面板中，即可看到 **Git** 选项卡（图标为提交圆点），点击即可使用！
