import { GitCommit, GraphNode, GraphRoute } from '../../common/types';

const BRANCH_COLORS = [
  '#4a90e2', // 蓝
  '#50e3c2', // 青绿
  '#f5a623', // 橙
  '#e24a84', // 玫瑰粉
  '#bd10e0', // 紫
  '#7ed321', // 嫩绿
  '#b8e986', // 浅绿
  '#9013fe', // 深紫
  '#ff6f59', // 珊瑚红
  '#2bc48a', // 薄荷绿
];

export function computeGraphLayout(commits: GitCommit[]): GraphNode[] {
  if (commits.length === 0) {
    return [];
  }

  // 1. 构建 Commit 映射表
  const commitMap = new Map<
    string,
    {
      index: number;
      hash: string;
      parents: string[];
      subject: string;
      chainId: number;
      lane: number;
    }
  >();

  commits.forEach((c, idx) => {
    commitMap.set(c.hash, {
      index: idx,
      hash: c.hash,
      parents: c.parents,
      subject: c.subject,
      chainId: -1,
      lane: -1,
    });
  });

  // 2. 骨干链分解 (First-Parent Chain Decomposition)
  // 按照提交列表的拓扑顺序，追踪 parents[0] 链条，划分为互不相交的骨干分支
  const chains: {
    id: number;
    nodes: typeof commitMap extends Map<any, infer V> ? V[] : never;
    startRow: number;
    endRow: number;
    lane: number;
  }[] = [];

  for (let i = 0; i < commits.length; i++) {
    const node = commitMap.get(commits[i].hash)!;
    if (node.chainId !== -1) {
      continue; // 已归入某条骨干链
    }

    const newChainId = chains.length;
    const chainNodes: (typeof node)[] = [];
    let curr: typeof node | undefined = node;

    while (curr && curr.chainId === -1) {
      curr.chainId = newChainId;
      chainNodes.push(curr);

      // 顺着 First-Parent (parents[0]) 向前溯源
      const p0Hash = curr.parents[0];
      if (p0Hash && commitMap.has(p0Hash)) {
        const nextNode = commitMap.get(p0Hash)!;
        if (nextNode.chainId === -1) {
          curr = nextNode;
        } else {
          break; // p0 已经属于另一条更早建立的主干
        }
      } else {
        break;
      }
    }

    // 确定此链的活跃生命周期范围 [startRow, endRow]
    let maxRow = chainNodes[chainNodes.length - 1].index;
    const lastNode = chainNodes[chainNodes.length - 1];
    for (const p of lastNode.parents) {
      if (commitMap.has(p)) {
        const pRow = commitMap.get(p)!.index;
        if (pRow > maxRow) {
          maxRow = pRow;
        }
      }
    }

    chains.push({
      id: newChainId,
      nodes: chainNodes,
      startRow: chainNodes[0].index,
      endRow: maxRow,
      lane: -1,
    });
  }

  // 3. 泳道区间分配与复用 (Lane Allocation & Reuse)
  // 按出现起始行排序，长度大的优先靠左（Lane 0, 1...）
  chains.sort((a, b) => a.startRow - b.startRow || b.nodes.length - a.nodes.length);

  const laneEndRow: number[] = [];
  for (const ch of chains) {
    let chosenLane = -1;
    for (let l = 0; l < laneEndRow.length; l++) {
      if (laneEndRow[l] <= ch.startRow) {
        chosenLane = l;
        break;
      }
    }
    if (chosenLane === -1) {
      chosenLane = laneEndRow.length;
      laneEndRow.push(ch.endRow);
    } else {
      laneEndRow[chosenLane] = ch.endRow;
    }
    ch.lane = chosenLane;
    ch.nodes.forEach((n) => {
      n.lane = chosenLane;
    });
  }

  // 4. 连线生成与行间不变性传递 (State-Machine Route Generation)
  const nodes: GraphNode[] = [];
  // bottomState 记录到达当前行底部的每个 lane 的目标 commit 与颜色
  // 确保上一行 bottom 与下一行 top 100% 严密对齐，绝对零断裂
  let bottomState = new Map<number, { targetHash: string; color: string }>();

  for (let i = 0; i < commits.length; i++) {
    const commit = commits[i];
    const nodeMeta = commitMap.get(commit.hash)!;
    const currentLane = nodeMeta.lane;
    const nodeColor = BRANCH_COLORS[currentLane % BRANCH_COLORS.length];
    const routes: GraphRoute[] = [];

    const topState = bottomState;
    const nextBottomState = new Map<number, { targetHash: string; color: string }>();

    // 4.1 入线 (top -> center)
    // 凡是在 topState 中目标为当前 commit 的泳道，平滑连入当前节点中心
    topState.forEach((state, lane) => {
      if (state.targetHash === commit.hash) {
        routes.push({
          fromLane: lane,
          toLane: currentLane,
          fromY: 'top',
          toY: 'center',
          color: state.color,
        });
      }
    });

    // 4.2 穿行线 (top -> bottom)
    // 目标不是当前 commit 的线继续向下穿行
    topState.forEach((state, lane) => {
      if (state.targetHash !== commit.hash) {
        if (lane !== currentLane) {
          routes.push({
            fromLane: lane,
            toLane: lane,
            fromY: 'top',
            toY: 'bottom',
            color: state.color,
          });
          nextBottomState.set(lane, state);
        } else {
          // 若穿行线与当前节点所在泳道冲突，平滑借道右侧避开节点圆圈
          let bypassLane = lane + 1;
          while (topState.has(bypassLane) || nextBottomState.has(bypassLane)) {
            bypassLane++;
          }
          routes.push({
            fromLane: lane,
            toLane: bypassLane,
            fromY: 'top',
            toY: 'bottom',
            color: state.color,
          });
          nextBottomState.set(bypassLane, state);
        }
      }
    });

    // 4.3 出线 (center -> bottom)
    // 仅对存在于当前列表中的有效父节点连线，消除外部长距幽灵线
    const validParents = commit.parents.filter((p) => commitMap.has(p));
    if (validParents.length > 0) {
      // First Parent: 沿着 First Parent 的泳道直通或弯向下行
      const p0 = validParents[0];
      const p0Meta = commitMap.get(p0)!;
      const p0Lane = p0Meta.lane;

      routes.push({
        fromLane: currentLane,
        toLane: p0Lane,
        fromY: 'center',
        toY: 'bottom',
        color: nodeColor,
      });
      nextBottomState.set(p0Lane, { targetHash: p0, color: nodeColor });

      // Merge Parents (parents[1...])
      for (let pIdx = 1; pIdx < validParents.length; pIdx++) {
        const pOther = validParents[pIdx];
        const pOtherMeta = commitMap.get(pOther)!;
        const pOtherLane = pOtherMeta.lane;
        const mergeColor = BRANCH_COLORS[pOtherLane % BRANCH_COLORS.length];

        routes.push({
          fromLane: currentLane,
          toLane: pOtherLane,
          fromY: 'center',
          toY: 'bottom',
          color: mergeColor,
        });
        nextBottomState.set(pOtherLane, { targetHash: pOther, color: mergeColor });
      }
    }

    bottomState = nextBottomState;

    nodes.push({
      commit,
      lane: currentLane,
      color: nodeColor,
      routes,
    });
  }

  return nodes;
}
