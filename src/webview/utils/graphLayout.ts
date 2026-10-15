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

export function computeGraphLayout(commits: GitCommit[], baseBranch?: string): GraphNode[] {
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
      refs: string[];
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
      refs: c.refs || [],
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

  // 建立反向引用索引：commitHash -> 引用它的上级 commit 索引列表
  const referrersMap = new Map<string, number[]>();
  commits.forEach((c, idx) => {
    c.parents.forEach((p) => {
      if (!referrersMap.has(p)) {
        referrersMap.set(p, []);
      }
      referrersMap.get(p)!.push(idx);
    });
  });

  // 扩展计算每条骨干链的真实生命周期区间 [startRow, endRow]
  chains.forEach((ch) => {
    let minRow = ch.nodes[0].index;
    let maxRow = ch.nodes[ch.nodes.length - 1].index;

    // 上界：所有在上方引用了本链任意节点的提交行号（提前开辟通道）
    for (const n of ch.nodes) {
      const refs = referrersMap.get(n.hash);
      if (refs) {
        for (const rRow of refs) {
          if (rRow < minRow) {
            minRow = rRow;
          }
        }
      }
    }

    // 下界：最后一个节点所连向的所有父节点行号
    const lastNode = ch.nodes[ch.nodes.length - 1];
    for (const p of lastNode.parents) {
      if (commitMap.has(p)) {
        const pRow = commitMap.get(p)!.index;
        if (pRow > maxRow) {
          maxRow = pRow;
        }
      }
    }

    ch.startRow = minRow;
    ch.endRow = maxRow;
  });

  // 3. 识别主干/基准分支，计算已合并祖先集合 (Base Reachable Commits)
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

  const baseReachable = new Set<string>();
  const queue: string[] = [baseCommitHash];
  while (queue.length > 0) {
    const h = queue.shift()!;
    if (!baseReachable.has(h)) {
      baseReachable.add(h);
      const n = commitMap.get(h);
      if (n && n.parents) {
        for (const p of n.parents) {
          if (!baseReachable.has(p)) {
            queue.push(p);
          }
        }
      }
    }
  }

  // 为每条链判定是否已合并到主干 (isMerged)
  const chainsWithStatus = chains.map((ch) => {
    const isMerged = ch.nodes.some((n) => baseReachable.has(n.hash));
    return { ...ch, isMerged };
  });

  // 4. 两批泳道区间分配与复用 (Two-Phase Lane Allocation)
  // 第一批：已合并的链 (isMerged === true) 优先分配在左侧 (Lane 0, 1...)
  const mergedChains = chainsWithStatus.filter((c) => c.isMerged);
  mergedChains.sort((a, b) => a.startRow - b.startRow || b.nodes.length - a.nodes.length);

  const laneEndRow: number[] = [];
  for (const ch of mergedChains) {
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

  // 未合并分支从已合并分支的最大泳道右侧起步，绝不进入已合并分支中间！
  const minUnmergedLane = laneEndRow.length;

  // 第二批：未合并的链 (isMerged === false) 排在最右侧
  const unmergedChains = chainsWithStatus.filter((c) => !c.isMerged);
  unmergedChains.sort((a, b) => a.startRow - b.startRow || b.nodes.length - a.nodes.length);

  for (const ch of unmergedChains) {
    let chosenLane = -1;
    for (let l = minUnmergedLane; l < laneEndRow.length; l++) {
      if (laneEndRow[l] <= ch.startRow) {
        chosenLane = l;
        break;
      }
    }
    if (chosenLane === -1) {
      chosenLane = Math.max(minUnmergedLane, laneEndRow.length);
      laneEndRow[chosenLane] = ch.endRow;
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
    // 目标不是当前 commit 的线在各自泳道继续向下穿行
    topState.forEach((state, lane) => {
      if (state.targetHash !== commit.hash) {
        routes.push({
          fromLane: lane,
          toLane: lane,
          fromY: 'top',
          toY: 'bottom',
          color: state.color,
        });
        nextBottomState.set(lane, state);
      }
    });

    // 4.3 出线 (center -> bottom)
    // 仅对存在于当前列表中的有效父节点连线，消除外部长距幽灵线
    const validParents = commit.parents.filter((p) => commitMap.has(p));
    if (validParents.length > 0) {
      // First Parent: 沿着自身泳道向下垂直延伸，守恒直连！
      const p0 = validParents[0];
      routes.push({
        fromLane: currentLane,
        toLane: currentLane,
        fromY: 'center',
        toY: 'bottom',
        color: nodeColor,
      });
      nextBottomState.set(currentLane, { targetHash: p0, color: nodeColor });

      // Merge Parents (parents[1...]): 直接分叉连向被合并分支的真实泳道
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
