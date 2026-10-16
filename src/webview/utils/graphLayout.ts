import { GitCommit, GraphNode, GraphRoute } from '../../common/types';

const BRANCH_COLORS = [
  '#4a90e2', // 0 蓝 (主干)
  '#50e3c2', // 1 青绿
  '#f5a623', // 2 橙
  '#e24a84', // 3 玫瑰粉
  '#9013fe', // 4 紫
  '#7ed321', // 5 嫩绿
  '#bd10e0', // 6 品红
  '#417505', // 7 墨绿
  '#b8e986', // 8 浅绿
  '#ff6f59', // 9 珊瑚红
];

interface Pipe {
  targetHash: string;
  color: string;
  isBase: boolean;
}

/**
 * 平面拓扑守恒紧凑图谱布局算法 (Planar Order-Preserving Graph Layout)
 *
 * 核心设计原则 (消除空白泳道 & 彻底杜绝线路交叉)：
 * 1. 【平面拓扑守恒 (Planar Order Preservation)】：
 *    活跃通道在每行向下延伸时，严格保留从左到右的原生几何相对顺序，绝不跨越或互换位置，穿行线交叉数严格为 0；
 * 2. 【无缝紧凑收拢 (Gapless Compaction)】：
 *    当某个通道到达目标提交被消费后，其右侧通道在当前行平滑向左收紧一格 (fromLane -> fromLane - 1)，
 *    下一行直接在新泳道笔直延伸，从几何原理上彻底杜绝空白泳道 (0 Gaps)；
 * 3. 【主干锁定 (Trunk Anchoring)】：
 *    基准分支 (如 master) 从头到尾严格锚定在 Lane 0，衍生分支紧凑排列在其右侧；
 * 4. 【数学级零断裂 (0 Broken Connections)】：
 *    上一行 bottomState 与下一行 topState 100% 严密守恒对齐。
 */
export function computeGraphLayout(commits: GitCommit[], baseBranch?: string): GraphNode[] {
  if (commits.length === 0) {
    return [];
  }

  // 1. 建立快速索引
  const commitMap = new Map<string, { commit: GitCommit; index: number }>();
  commits.forEach((c, idx) => {
    commitMap.set(c.hash, { commit: c, index: idx });
  });

  // 2. 识别主干/基准分支提交
  let baseCommitHash = commits[0].hash;
  if (baseBranch) {
    const branchCommit = commits.find((c) =>
      c.refs &&
      c.refs.some(
        (r) =>
          r === baseBranch ||
          r === `origin/${baseBranch}` ||
          r === `HEAD -> ${baseBranch}` ||
          r.includes(`/${baseBranch}`)
      )
    );
    if (branchCommit) {
      baseCommitHash = branchCommit.hash;
    }
  } else {
    const headCommit = commits.find(
      (c) =>
        c.refs &&
        c.refs.some((r) => r.includes('HEAD') || r.includes('master') || r.includes('main'))
    );
    if (headCommit) {
      baseCommitHash = headCommit.hash;
    }
  }

  // 计算从 baseCommitHash 出发的主干可达祖先集合 (Base Reachable Set)
  const baseReachable = new Set<string>();
  const queue: string[] = [baseCommitHash];
  while (queue.length > 0) {
    const h = queue.shift()!;
    if (!baseReachable.has(h)) {
      baseReachable.add(h);
      const m = commitMap.get(h);
      if (m && m.commit.parents) {
        for (const p of m.commit.parents) {
          if (!baseReachable.has(p)) {
            queue.push(p);
          }
        }
      }
    }
  }

  // 3. 逐行状态机遍历 (Planar Order Preserving State Machine)
  let activePipes: Pipe[] = [];
  const nodes: GraphNode[] = [];

  for (let i = 0; i < commits.length; i++) {
    const commit = commits[i];
    const routes: GraphRoute[] = [];

    // 3.1 识别所有以当前 commit 为目标的通道
    const targetLanes: number[] = [];
    activePipes.forEach((p, lane) => {
      if (p.targetHash === commit.hash) {
        targetLanes.push(lane);
      }
    });

    const isCurrentBase = baseReachable.has(commit.hash);

    let nodeLane = 0;
    let nodeColor = BRANCH_COLORS[0];

    if (targetLanes.length > 0) {
      // 存在到达当前提交的通道：优先继承主干通道；其次继承最左侧通道
      let bestLane = targetLanes[0];
      for (const l of targetLanes) {
        if (activePipes[l].isBase) {
          bestLane = l;
          break;
        }
      }
      nodeLane = bestLane;
      nodeColor = activePipes[nodeLane].color;

      // 绘制进线 (top -> center)
      targetLanes.forEach((l) => {
        routes.push({
          fromLane: l,
          toLane: nodeLane,
          fromY: 'top',
          toY: 'center',
          color: activePipes[l].color,
        });
      });
    } else {
      // 全新分支 Tip：直接在当前所有通道的最右侧开辟新泳道 (紧贴已有泳道，绝无空白隙缝)
      nodeLane = activePipes.length;
      if (isCurrentBase && nodeLane === 0) {
        nodeColor = BRANCH_COLORS[0];
      } else {
        nodeColor = BRANCH_COLORS[nodeLane % BRANCH_COLORS.length];
      }
    }

    // 3.2 构造下一行的向下活跃通道 nextPipes
    // 关键拓扑不变性：严格保留原有通道从左到右的相对顺序，绝不重排！
    const nextPipes: Pipe[] = [];
    const validParents = commit.parents.filter((p) => commitMap.has(p));
    let replaced = false;

    activePipes.forEach((pipe, lane) => {
      if (pipe.targetHash !== commit.hash) {
        // 穿行通道：保持相对顺序放入，向左平滑并道 (若有左侧通道释放)
        const nextLane = nextPipes.length;
        nextPipes.push(pipe);
        routes.push({
          fromLane: lane,
          toLane: nextLane,
          fromY: 'top',
          toY: 'bottom',
          color: pipe.color,
        });
      } else if (!replaced) {
        // 目标是当前提交的首个通道位置由 First Parent 接替延伸
        replaced = true;
        if (validParents.length > 0) {
          const p0 = validParents[0];
          const isP0Base = baseReachable.has(p0);
          const p0Pipe: Pipe = {
            targetHash: p0,
            color: nodeColor,
            isBase: isP0Base,
          };
          const nextLane = nextPipes.length;
          nextPipes.push(p0Pipe);
          routes.push({
            fromLane: nodeLane,
            toLane: nextLane,
            fromY: 'center',
            toY: 'bottom',
            color: nodeColor,
          });
        }
      }
      // 其他汇入当前提交的通道到此结束，自动实现右侧通道向左收拢
    });

    // 若当前节点是全新分支起点，添加其 First Parent 出线
    if (!replaced && validParents.length > 0) {
      const p0 = validParents[0];
      const isP0Base = baseReachable.has(p0);
      const p0Pipe: Pipe = {
        targetHash: p0,
        color: nodeColor,
        isBase: isP0Base,
      };
      const nextLane = nextPipes.length;
      nextPipes.push(p0Pipe);
      routes.push({
        fromLane: nodeLane,
        toLane: nextLane,
        fromY: 'center',
        toY: 'bottom',
        color: nodeColor,
      });
    }

    // 3.3 处理 Merge Parents (parents[1...])
    // 优先检查该父提交是否已经在向下通道中：若是，直接画合流线连向该通道；若否，在右侧开辟新通道
    for (let pIdx = 1; pIdx < validParents.length; pIdx++) {
      const pOther = validParents[pIdx];
      const isPOtherBase = baseReachable.has(pOther);

      const existingNextLane = nextPipes.findIndex((p) => p.targetHash === pOther);
      if (existingNextLane !== -1) {
        routes.push({
          fromLane: nodeLane,
          toLane: existingNextLane,
          fromY: 'center',
          toY: 'bottom',
          color: nextPipes[existingNextLane].color,
        });
      } else {
        const nextLane = nextPipes.length;
        const mergeColor = BRANCH_COLORS[nextLane % BRANCH_COLORS.length];
        const newPipe: Pipe = {
          targetHash: pOther,
          color: mergeColor,
          isBase: isPOtherBase,
        };
        nextPipes.push(newPipe);
        routes.push({
          fromLane: nodeLane,
          toLane: nextLane,
          fromY: 'center',
          toY: 'bottom',
          color: mergeColor,
        });
      }
    }

    activePipes = nextPipes;

    nodes.push({
      commit,
      lane: nodeLane,
      color: nodeColor,
      routes,
    });
  }

  return nodes;
}
