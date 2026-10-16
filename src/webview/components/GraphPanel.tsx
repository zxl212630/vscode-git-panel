import React, { useState, useMemo, useRef, useEffect } from 'react';
import type { GitBranch, GitCommit, GraphNode } from '../../common/types';
import { computeGraphLayout } from '../utils/graphLayout';
import { vscode } from '../utils/vscode';
import { ContextMenu, MenuItem } from './ContextMenu';
import {
  GitCommit as GitCommitIcon,
  Tag,
  Copy,
  GitBranch as GitBranchIcon,
  RotateCcw,
  Undo2,
  Check,
  Loader2,
} from 'lucide-react';

interface GraphPanelProps {
  commits: GitCommit[];
  branches: GitBranch[];
  selectedHash: string | null;
  onSelectCommit: (commit: GitCommit) => void;
  filteredBranch: string | null;
  filteredAuthor: string | null;
  searchFilter: string;
  isRegex: boolean;
  isCaseSensitive: boolean;
  onLoadMore?: () => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
}

const ROW_HEIGHT = 26;
const LANE_WIDTH = 14;

export const GraphPanel: React.FC<GraphPanelProps> = ({
  commits,
  branches,
  selectedHash,
  onSelectCommit,
  filteredBranch,
  filteredAuthor,
  searchFilter,
  isRegex,
  isCaseSensitive,
  onLoadMore,
  hasMore,
  isLoadingMore,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(600);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; commit: GitCommit } | null>(null);

  // 1. 过滤 commits（分支筛选采用图的可达性算法，展示该分支全部祖先历史）
  const filteredCommits = useMemo(() => {
    let list = commits;

    if (filteredBranch) {
      // 找到该分支对应的 Tip Commit
      const targetBranch = branches.find(
        (b) => b.name === filteredBranch || b.name === `origin/${filteredBranch}`
      );
      let tipHash = targetBranch?.commitHash;

      if (!tipHash) {
        const tipCommit = commits.find((c) =>
          c.refs.some(
            (r) =>
              r === filteredBranch ||
              r === `HEAD -> ${filteredBranch}` ||
              r.includes(`/${filteredBranch}`)
          )
        );
        tipHash = tipCommit?.hash;
      }

      if (tipHash) {
        // 从 tipHash 开始做广度优先搜索 (BFS)，收集属于该分支的全部祖先提交
        const reachable = new Set<string>();
        const queue: string[] = [tipHash];
        const commitMap = new Map<string, GitCommit>();
        for (const c of commits) {
          commitMap.set(c.hash, c);
        }

        while (queue.length > 0) {
          const current = queue.shift()!;
          if (!reachable.has(current)) {
            reachable.add(current);
            const node = commitMap.get(current);
            if (node && node.parents) {
              for (const p of node.parents) {
                if (!reachable.has(p)) {
                  queue.push(p);
                }
              }
            }
          }
        }

        list = list.filter((c) => reachable.has(c.hash));
      }
    }

    if (filteredAuthor) {
      list = list.filter((c) => c.authorName === filteredAuthor);
    }

    if (searchFilter.trim()) {
      const q = searchFilter.trim();
      let regex: RegExp | null = null;
      if (isRegex) {
        try {
          regex = new RegExp(q, isCaseSensitive ? '' : 'i');
        } catch {
          regex = null;
        }
      }

      list = list.filter((c) => {
        if (regex) {
          return regex.test(c.subject) || regex.test(c.hash) || regex.test(c.authorName);
        }
        const subject = isCaseSensitive ? c.subject : c.subject.toLowerCase();
        const hash = isCaseSensitive ? c.hash : c.hash.toLowerCase();
        const author = isCaseSensitive ? c.authorName : c.authorName.toLowerCase();
        const target = isCaseSensitive ? q : q.toLowerCase();
        return subject.includes(target) || hash.includes(target) || author.includes(target);
      });
    }

    return list;
  }, [commits, filteredBranch, filteredAuthor, searchFilter, isRegex, isCaseSensitive]);

  // 2. 计算图谱节点拓扑
  const graphNodes = useMemo(() => {
    return computeGraphLayout(filteredCommits, filteredBranch || undefined);
  }, [filteredCommits, filteredBranch]);

  // 最大泳道数，用于确定 SVG 区域宽度
  const maxLanes = useMemo(() => {
    let max = 1;
    for (const node of graphNodes) {
      if (node.lane + 1 > max) max = node.lane + 1;
      for (const r of node.routes) {
        if (r.fromLane + 1 > max) max = r.fromLane + 1;
        if (r.toLane + 1 > max) max = r.toLane + 1;
      }
    }
    return Math.min(max, 15);
  }, [graphNodes]);

  const svgWidth = Math.max(28, maxLanes * LANE_WIDTH + 14);

  // 3. 监听容器高度与滚动
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateHeight = () => {
      setContainerHeight(el.clientHeight);
    };

    updateHeight();
    const ro = new ResizeObserver(updateHeight);
    ro.observe(el);

    const onScroll = () => {
      setScrollTop(el.scrollTop);
    };
    el.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      ro.disconnect();
      el.removeEventListener('scroll', onScroll);
    };
  }, []);

  // 4. 虚拟滚动可视区域切片
  const totalCount = graphNodes.length;
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 5);
  const visibleCount = Math.ceil(containerHeight / ROW_HEIGHT) + 10;
  const endIndex = Math.min(totalCount, startIndex + visibleCount);

  const topPadding = startIndex * ROW_HEIGHT;
  const bottomPadding = Math.max(0, (totalCount - endIndex) * ROW_HEIGHT);

  const visibleNodes = useMemo(() => {
    return graphNodes.slice(startIndex, endIndex);
  }, [graphNodes, startIndex, endIndex]);

  // 5. 触底加载更多：当滚动位置接近总列表末尾（相差 25 行以内）时触发
  useEffect(() => {
    if (hasMore && !isLoadingMore && totalCount > 0 && endIndex >= totalCount - 25) {
      onLoadMore?.();
    }
  }, [endIndex, totalCount, hasMore, isLoadingMore, onLoadMore]);

  const handleRowContextMenu = (e: React.MouseEvent, commit: GitCommit) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      commit,
    });
  };

  const getMenuItems = (commit: GitCommit): MenuItem[] => {
    return [
      {
        label: `新建分支 (New Branch Here)...`,
        icon: <GitBranchIcon className="w-3.5 h-3.5 text-green-400" />,
        onClick: () => {
          const name = prompt(`基于提交 ${commit.shortHash} 创建新分支:`);
          if (name && name.trim()) {
            vscode.postMessage({
              type: 'createBranch',
              branchName: name.trim(),
              targetHash: commit.hash,
            });
          }
        },
      },
      {
        label: `新建标签 (Create Tag)...`,
        icon: <Tag className="w-3.5 h-3.5 text-yellow-400" />,
        onClick: () => {
          alert('功能提示: 可以通过终端打标签或直接基于此分支创建');
        },
      },
      { isSeparator: true },
      {
        label: `摘取提交 (Cherry-pick)`,
        icon: <Check className="w-3.5 h-3.5 text-blue-400" />,
        onClick: () => {
          if (confirm(`确认要 Cherry-pick 提交 ${commit.shortHash} 吗？`)) {
            vscode.postMessage({
              type: 'cherryPickCommit',
              commitHash: commit.hash,
            });
          }
        },
      },
      {
        label: `重置分支到此处 (Reset Head Here - Soft)`,
        icon: <RotateCcw className="w-3.5 h-3.5 text-amber-400" />,
        onClick: () => {
          if (confirm(`确认要以 soft 方式重置分支到 ${commit.shortHash} 吗？`)) {
            vscode.postMessage({
              type: 'resetCommit',
              commitHash: commit.hash,
              mode: 'soft',
            });
          }
        },
      },
      {
        label: `重置分支到此处 (Reset Head Here - Hard)`,
        icon: <RotateCcw className="w-3.5 h-3.5 text-red-500" />,
        danger: true,
        onClick: () => {
          if (confirm(`【警告】Hard 重置将丢弃未提交的文件变更！确定重置到 ${commit.shortHash} 吗？`)) {
            vscode.postMessage({
              type: 'resetCommit',
              commitHash: commit.hash,
              mode: 'hard',
            });
          }
        },
      },
      {
        label: `撤销提交 (Revert Commit)`,
        icon: <Undo2 className="w-3.5 h-3.5 text-purple-400" />,
        onClick: () => {
          if (confirm(`确认要撤销提交 ${commit.shortHash} 吗？`)) {
            vscode.postMessage({
              type: 'revertCommit',
              commitHash: commit.hash,
            });
          }
        },
      },
      { isSeparator: true },
      {
        label: `复制 Commit Hash (${commit.shortHash})`,
        icon: <Copy className="w-3.5 h-3.5 text-gray-400" />,
        onClick: () => {
          navigator.clipboard.writeText(commit.hash);
        },
      },
    ];
  };

  const formatDate = (ts: number) => {
    if (!ts) return '';
    const d = new Date(ts * 1000);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const hours = d.getHours().toString().padStart(2, '0');
    const minutes = d.getMinutes().toString().padStart(2, '0');
    return `${year}/${month}/${day} ${hours}:${minutes}`;
  };

  return (
    <div className="flex flex-col h-full bg-vscode-bg select-none text-[11px] overflow-hidden">
      {/* 表格头 */}
      <div className="flex items-center h-[26px] bg-vscode-sideBg border-b border-vscode-border font-semibold text-gray-400 px-2 flex-shrink-0 text-[10px]">
        <div style={{ width: svgWidth }} className="flex-shrink-0">
          Graph
        </div>
        <div className="flex-1 min-w-0 px-2">Description</div>
        <div className="w-[120px] flex-shrink-0 px-2">Author</div>
        <div className="w-[110px] flex-shrink-0 px-2 text-right">Date</div>
      </div>

      {/* 虚拟滚动列表区 */}
      <div ref={containerRef} className="flex-1 overflow-y-auto relative">
        <div style={{ height: topPadding }} />

        {visibleNodes.map((node) => {
          const { commit, lane, color, routes } = node;
          const isSelected = selectedHash === commit.hash;
          const cx = lane * LANE_WIDTH + 8;
          const cy = ROW_HEIGHT / 2;

          return (
            <div
              key={commit.hash}
              style={{ height: ROW_HEIGHT }}
              className={`flex items-center cursor-pointer hover:bg-vscode-hoverBg px-2 group ${
                isSelected ? 'bg-vscode-activeBg text-vscode-activeFg font-medium' : 'text-vscode-fg'
              }`}
              onClick={() => onSelectCommit(commit)}
              onContextMenu={(e) => handleRowContextMenu(e, commit)}
            >
              {/* SVG 拓扑图谱列 */}
              <div style={{ width: svgWidth, height: ROW_HEIGHT }} className="flex-shrink-0 relative">
                <svg
                  width={svgWidth}
                  height={ROW_HEIGHT}
                  className="overflow-visible pointer-events-none block"
                >
                  {/* 绘制各种分支路由连线（穿行线、入线、出线，行间连续无缝） */}
                  {routes.map((route, rIdx) => {
                    const fromX = route.fromLane * LANE_WIDTH + 8;
                    const toX = route.toLane * LANE_WIDTH + 8;

                    // 1. 穿行线 (top -> bottom)
                    if (route.fromY === 'top' && route.toY === 'bottom') {
                      return (
                        <line
                          key={rIdx}
                          x1={fromX}
                          y1={0}
                          x2={toX}
                          y2={ROW_HEIGHT}
                          stroke={route.color}
                          strokeWidth="1.8"
                        />
                      );
                    }

                    // 2. 入线 (top -> center)
                    if (route.fromY === 'top' && route.toY === 'center') {
                      if (fromX === toX) {
                        return (
                          <line
                            key={rIdx}
                            x1={fromX}
                            y1={0}
                            x2={toX}
                            y2={cy}
                            stroke={route.color}
                            strokeWidth="1.8"
                          />
                        );
                      } else {
                        const cpY = cy * 0.5;
                        return (
                          <path
                            key={rIdx}
                            d={`M ${fromX} 0 C ${fromX} ${cpY}, ${toX} ${cpY}, ${toX} ${cy}`}
                            fill="none"
                            stroke={route.color}
                            strokeWidth="1.8"
                          />
                        );
                      }
                    }

                    // 3. 出线 (center -> bottom)
                    if (route.fromY === 'center' && route.toY === 'bottom') {
                      if (fromX === toX) {
                        return (
                          <line
                            key={rIdx}
                            x1={fromX}
                            y1={cy}
                            x2={toX}
                            y2={ROW_HEIGHT}
                            stroke={route.color}
                            strokeWidth="1.8"
                          />
                        );
                      } else {
                        const cpY = cy + (ROW_HEIGHT - cy) * 0.5;
                        return (
                          <path
                            key={rIdx}
                            d={`M ${fromX} ${cy} C ${fromX} ${cpY}, ${toX} ${cpY}, ${toX} ${ROW_HEIGHT}`}
                            fill="none"
                            stroke={route.color}
                            strokeWidth="1.8"
                          />
                        );
                      }
                    }

                    return null;
                  })}

                  {/* 提交圆点节点：HEAD 带光晕，Merge 提交带同心圆环，普通提交实心圆（对齐原版 Git 图谱风格） */}
                  {commit.refs.some((r) => r.includes('HEAD')) && (
                    <circle cx={cx} cy={cy} r={6.5} fill={color} fillOpacity="0.35" />
                  )}
                  {commit.parents.length > 1 ? (
                    <g>
                      <circle
                        cx={cx}
                        cy={cy}
                        r={4.5}
                        fill="var(--vscode-bg, #1e1e1e)"
                        stroke={color}
                        strokeWidth="1.8"
                      />
                      <circle cx={cx} cy={cy} r={2} fill={color} />
                    </g>
                  ) : (
                    <circle cx={cx} cy={cy} r={3.2} fill={color} />
                  )}
                </svg>
              </div>

              {/* Commit 提交描述与分支胶囊标签 */}
              <div className="flex-1 min-w-0 px-2 flex items-center gap-1.5 overflow-hidden">
                {/* 分支与 Tag 胶囊 */}
                {commit.refs.map((ref, idx) => {
                  const isHead = ref.includes('HEAD');
                  const isTag = ref.includes('tag:');
                  return (
                    <span
                      key={idx}
                      className={`px-1.5 py-0.2 rounded text-[10px] flex-shrink-0 flex items-center gap-0.5 leading-none ${
                        isHead
                          ? 'bg-blue-600/30 text-blue-300 border border-blue-500/50 font-medium'
                          : isTag
                          ? 'bg-yellow-600/30 text-yellow-300 border border-yellow-500/50'
                          : 'bg-green-600/30 text-green-300 border border-green-500/50'
                      }`}
                    >
                      {isTag ? <Tag className="w-2.5 h-2.5" /> : <GitBranchIcon className="w-2.5 h-2.5" />}
                      <span className="truncate max-w-[120px]">{ref.replace('tag: ', '')}</span>
                    </span>
                  );
                })}

                <span className="truncate font-sans">{commit.subject}</span>
              </div>

              {/* 作者 */}
              <div className="w-[120px] flex-shrink-0 px-2 truncate opacity-80 font-mono text-[10px]">
                {commit.authorName}
              </div>

              {/* 日期 */}
              <div className="w-[110px] flex-shrink-0 px-2 text-right opacity-60 font-mono text-[10px]">
                {formatDate(commit.timestamp)}
              </div>
            </div>
          );
        })}

        <div style={{ height: bottomPadding }} />

        {isLoadingMore && (
          <div className="flex items-center justify-center py-2.5 text-xs text-vscode-fg opacity-70 gap-2 border-t border-vscode-border/30 bg-vscode-panelBg/30 select-none">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
            <span>正在加载更多提交记录...</span>
          </div>
        )}

        {!hasMore && totalCount > 0 && (
          <div className="py-2 text-center text-[10px] text-gray-500 italic select-none">
            已到达提交历史起点 (共 {totalCount} 条)
          </div>
        )}

        {graphNodes.length === 0 && (
          <div className="p-8 text-center text-gray-500 italic">没有匹配的提交记录</div>
        )}
      </div>

      {/* 右键菜单 */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={getMenuItems(contextMenu.commit)}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
};
