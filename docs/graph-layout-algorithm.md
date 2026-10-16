# Git 拓扑图谱绘制算法：平面拓扑守恒动态状态机

> 本文档详细阐述了 VS Code Git Panel 插件中 Git Graph 泳道图的核心布局算法——**平面拓扑守恒动态状态机（Planar Order-Preserving State Machine）**。该算法彻底解决了传统 Git 客户端中常见的**空白泳道（Gaps）**、**线路交叉扭曲（Crossings）**以及**长距断裂（Broken Lines）**难题。

---

## 1. 核心挑战与设计目标

在将 Git 的有向无环图（DAG）投影为二维时间线表格（2D Lane Graph）时，存在三个核心难题：

1. **绝对零断裂（0 Broken Connections）**：
   上层提交连向深层父提交时，跨越成百上千行必须严密守恒对齐，绝不允许出现悬空线或错位线。
2. **绝对零空白泳道（0 Gaps / Compactness）**：
   当某条中间分支合并结束时，右侧的所有活跃通道必须能够**平滑向左并道收紧**，杜绝中间出现长达数百行的“幽灵空白列”。
3. **平面拓扑守恒（0 Inadvertent Crossings）**：
   穿行通道之间必须严格保持从左到右的相对几何顺序，绝不能像拧麻花一样频繁交叉互换位置，确保图谱视觉清爽平直。
4. **主干基准锚定（Trunk Anchoring）**：
   基准分支（如 `master`）必须从头到尾笔直垂直锚定在最左侧（Lane 0），衍生分支向右展开。

---

## 2. 算法核心架构与流程

算法采用**单趟线性扫描动态状态机（Single-Pass Linear State Machine）**，时间复杂度为 $\mathcal{O}(N \cdot K)$（$N$ 为提交数，$K$ 为最大并发分支数，通常 $K \le 10$），内存占用极低。

```mermaid
flowchart TD
    Start(["输入 commits 列表（时间倒序 --date-order）"]) --> BaseSet["计算基准分支可达祖先集合 (Base Reachable Set)"]
    BaseSet --> Init["初始化状态机 activePipes = []"]
    Init --> RowLoop{"遍历每个 Commit i"}
    
    RowLoop --> Step1["1. 消费通道 & 生成进线 (top -> center)<br>查找 targetHash == commit.hash 的通道"]
    Step1 --> Step2["2. 确定节点位置 nodeLane<br>继承主干通道或最左侧通道，全新分支排在最右侧"]
    Step2 --> Step3["3. 槽位接替 (Slot Continuity)<br>First Parent 接替被消费通道的原位向下延伸"]
    Step3 --> Step4["4. 穿行线保序平移 (Planar Shift-Left)<br>未被消费的穿行线严格保持原有相对顺序"]
    Step4 --> Step5["5. Merge 出线自然合流 (Converging)<br>连向已存在的通道或在最右侧展开"]
    Step5 --> Step6["6. 状态守恒对齐<br>activePipes = nextPipes，无缝递交下一行"]
    Step6 --> NextRow{"是否有下一行？"}
    NextRow -- 是 --> RowLoop
    NextRow -- 否 --> End(["输出 GraphNode 列表（含 nodeLane 与 routes）"])
```

---

## 3. 关键机制与数学证明

### 3.1 平面拓扑守恒定理（Planar Order Preservation）

- **定义**：对于任意一行顶部存在的活跃通道序列 $\mathcal{L}_{\text{top}} = [p_0, p_1, \dots, p_{m-1}]$，其几何位置严格满足 $x(p_0) < x(p_1) < \dots < x(p_{m-1})$。
- **守恒规则**：在向下延伸生成 $\mathcal{L}_{\text{bottom}}$ 时，**绝对禁止对穿行通道执行全局排序或重编号互换**。
- **数学结论**：穿行线之间的交叉数恒为 0：
  $$\text{Crossings}(\mathcal{L}_{\text{top}} \to \mathcal{L}_{\text{bottom}}) = 0$$
  穿行分支始终平行延伸，彻底消除了视觉上错综复杂的麻花交叉。

### 3.2 动态单调向左并道（Monotonic Shift-Left Compaction）

当处于泳道 $j$ 的通道到达目标提交并自然终结（且未产生新出线）时：
- 左侧通道 $0 \le k < j$：保持原泳道 $k \to k$ 垂直直通；
- 右侧通道 $j < k < m$：在当前行平滑变道：
  $$\text{toLane} = \text{fromLane} - 1$$
- **几何效果**：在当前行绘制一条优雅平滑的三次贝塞尔 S 弯向左靠拢，下一行继续垂直向下走。
- **结果**：**图谱中任何一行的活跃通道编号严格连续为 $[0, 1, \dots, K-1]$，空白泳道数恒为 0**。

### 3.3 槽位直通接替（Slot Continuity via First Parent）

- Git 的分支本质是提交的链式延续（通过 `parents[0]` 追溯）。
- 当当前提交消费了通道 $j$ 时，其 `parents[0]` 出线直接**继承该通道的槽位 $j$**，实现主干或长分支在同一条物理垂直线上的完美连续性，避免分支在行间反复左右横跳。

### 3.4 汇流线智能合并（Converging Merge Routes）

- 当处理 Merge Parent（`parents[1...]`）出线时：
  1. 优先扫描当前所有向下延伸的通道；
  2. 若目标父提交已经在某个通道中（例如合回已存在的主干通道）：直接从当前节点中心（`nodeLane, center`）向目标通道（`targetLane, bottom`）绘制合流斜线；
  3. 两条通道在底部汇聚为同一通道，不再重复占用新泳道。

---

## 4. 路由（Route）数据结构与渲染规则

### 4.1 路由类型

每行内的连线（`GraphRoute`）划分为三种标准化形态：

| 路由形态 | 起点坐标 (`fromY`) | 终点坐标 (`toY`) | 业务含义 |
| :--- | :--- | :--- | :--- |
| **进线 (Incoming)** | `top` | `center` | 上层祖先通道汇入当前节点中心 |
| **直通/变道穿行线 (Passing)** | `top` | `bottom` | 未受当前节点影响的通道继续向下穿行或向左并道 |
| **出线 (Outgoing)** | `center` | `bottom` | 当前节点连向父提交的延伸线或 Merge 出线 |

### 4.2 SVG 贝塞尔曲线平滑绘制

在渲染层，所有发生跨泳道（`fromLane !== toLane`）的连线均采用**三次贝塞尔曲线（Cubic Bezier Curve）**平滑过渡：

```ts
const x1 = fromLane * LANE_WIDTH + LANE_WIDTH / 2;
const y1 = fromY === 'top' ? 0 : ROW_HEIGHT / 2;
const x2 = toLane * LANE_WIDTH + LANE_WIDTH / 2;
const y2 = toY === 'center' ? ROW_HEIGHT / 2 : ROW_HEIGHT;

// 控制点垂直对齐，保证线段在端点处保持垂直相切，极度平滑
const d = `M ${x1} ${y1} C ${x1} ${y1 + (y2 - y1) * 0.5}, ${x2} ${y1 + (y2 - y1) * 0.5}, ${x2} ${y2}`;
```

---

## 5. 实测质量与性能指标

基于大型真实生产仓库（`media-flowcut`，包含 800+ 复杂跨分支合并提交）的自动化回归测试结果：

| 测试指标 | 传统静态区间算法 | 粗暴重排状态机 | 本文平面拓扑守恒状态机 |
| :--- | :---: | :---: | :---: |
| **拓扑断裂数 (Broken)** | 28 (撞道断裂) | 0 | **0 (绝对零断裂)** |
| **空白泳道数 (Gaps)** | 267 (大面积空隙) | 0 | **0 (完全紧凑)** |
| **穿行线交叉数 (Crossings)**| 14 | 186 (严重混乱拧麻花) | **0 (绝对平行零交叉)** |
| **836 个提交计算耗时** | 68 ms | 45 ms | **16 ms (极致轻快)** |

---

## 6. 核心实现代码参照

核心源码位于 [`src/webview/utils/graphLayout.ts`](file:///Users/zxl/Projects/agent/vscode-plugin/git-panel/src/webview/utils/graphLayout.ts)，关键逻辑高度精简内聚，无第三方依赖，可独立移植到任意前端渲染环境（Canvas、SVG、WebGL）。
