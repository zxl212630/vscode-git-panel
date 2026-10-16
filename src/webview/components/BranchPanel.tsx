import React, { useState, useMemo, useRef, useEffect } from 'react';
import { GitBranch, RepoInfo } from '../../common/types';
import { vscode } from '../utils/vscode';
import { ContextMenu, MenuItem } from './ContextMenu';
import {
  GitBranch as GitBranchIcon,
  Search,
  ChevronRight,
  ChevronDown,
  FolderGit2,
  Folder,
  FolderOpen,
  Star,
  Check,
} from 'lucide-react';

interface BranchPanelProps {
  repos: RepoInfo[];
  activeRepo: RepoInfo | null;
  branches: GitBranch[];
  selectedBranchName: string | null;
  onSelectBranch: (branch: GitBranch) => void;
  onSwitchRepo: (repoPath: string) => void;
}

interface BranchTreeNode {
  name: string;
  path: string;
  isFolder: boolean;
  branch?: GitBranch;
  children: BranchTreeNode[];
  totalBranches: number;
}

export const BranchPanel: React.FC<BranchPanelProps> = ({
  repos,
  activeRepo,
  branches,
  selectedBranchName,
  onSelectBranch,
  onSwitchRepo,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isLocalExpanded, setIsLocalExpanded] = useState(true);
  const [isRemoteExpanded, setIsRemoteExpanded] = useState(true);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [isRepoDropdownOpen, setIsRepoDropdownOpen] = useState(false);
  const repoDropdownRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);

  // 点击外部关闭仓库选择下拉框
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (repoDropdownRef.current && !repoDropdownRef.current.contains(e.target as Node)) {
        setIsRepoDropdownOpen(false);
      }
    };
    if (isRepoDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isRepoDropdownOpen]);

  // 当前 HEAD 分支
  const currentHeadBranch = useMemo(() => {
    return branches.find((b) => b.isHead);
  }, [branches]);

  // 本地分支
  const localBranches = useMemo(() => {
    const list = branches.filter((b) => !b.isRemote);
    if (!searchQuery.trim()) return list;
    return list.filter((b) => b.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [branches, searchQuery]);

  // 远程分支
  const remoteBranches = useMemo(() => {
    const list = branches.filter((b) => b.isRemote);
    if (!searchQuery.trim()) return list;
    return list.filter((b) => b.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [branches, searchQuery]);

  // 构建树形结构函数
  const buildBranchTree = (branchList: GitBranch[], prefix: string): BranchTreeNode[] => {
    const root: BranchTreeNode = {
      name: '',
      path: prefix,
      isFolder: true,
      children: [],
      totalBranches: 0,
    };

    for (const b of branchList) {
      const parts = b.name.split('/');
      let current = root;

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const isLast = i === parts.length - 1;
        const currentPath = `${current.path}/${part}`;

        if (isLast) {
          current.children.push({
            name: part,
            path: currentPath,
            isFolder: false,
            branch: b,
            children: [],
            totalBranches: 1,
          });
        } else {
          let folder = current.children.find((c) => c.isFolder && c.name === part);
          if (!folder) {
            folder = {
              name: part,
              path: currentPath,
              isFolder: true,
              children: [],
              totalBranches: 0,
            };
            current.children.push(folder);
          }
          current = folder;
        }
      }
    }

    const sortNodes = (nodes: BranchTreeNode[]): number => {
      nodes.sort((a, b) => {
        if (a.isFolder && !b.isFolder) return -1;
        if (!a.isFolder && b.isFolder) return 1;
        if (!a.isFolder && !b.isFolder) {
          if (a.branch?.isHead) return -1;
          if (b.branch?.isHead) return 1;
        }
        return a.name.localeCompare(b.name);
      });

      let count = 0;
      for (const node of nodes) {
        if (node.isFolder) {
          node.totalBranches = sortNodes(node.children);
        }
        count += node.totalBranches;
      }
      return count;
    };

    sortNodes(root.children);
    return root.children;
  };

  const localTree = useMemo(() => buildBranchTree(localBranches, 'local'), [localBranches]);
  const remoteTree = useMemo(() => buildBranchTree(remoteBranches, 'remote'), [remoteBranches]);

  // 展开与折叠判定：搜索时默认自动展开匹配路径，否则根据用户显式状态
  const isFolderExpanded = (nodePath: string): boolean => {
    if (searchQuery.trim()) return true;
    return expandedFolders.has(nodePath);
  };

  const toggleFolder = (nodePath: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(nodePath)) {
        next.delete(nodePath);
      } else {
        next.add(nodePath);
      }
      return next;
    });
  };

  // 处理分支右键菜单
  const handleContextMenu = (e: React.MouseEvent, branch: GitBranch) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      items: getMenuItems(branch),
    });
  };

  // 处理目录与非分支节点的右键菜单（展示 Nothing here）
  const handleFolderContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      items: [{ label: 'Nothing here', disabled: true }],
    });
  };

  const getMenuItems = (branch: GitBranch): MenuItem[] => {
    const currentHeadName = currentHeadBranch?.name || 'HEAD';

    // 远程分支菜单
    if (branch.isRemote) {
      return [
        {
          label: 'Checkout',
          onClick: () => {
            vscode.postMessage({
              type: 'checkoutBranch',
              branchName: branch.name,
              isRemote: true,
            });
          },
        },
        {
          label: `New Branch from '${branch.name}'...`,
          onClick: () => {
            vscode.postMessage({
              type: 'promptCreateBranch',
              baseBranch: branch.name,
              targetHash: branch.commitHash,
            });
          },
        },
        { isSeparator: true },
        {
          label: `Compare with '${currentHeadName}'`,
          onClick: () => {
            vscode.postMessage({
              type: 'compareBranchWithHead',
              branchName: branch.name,
            });
          },
        },
        { isSeparator: true },
        {
          label: `Rebase '${currentHeadName}' onto '${branch.name}'`,
          onClick: () => {
            vscode.postMessage({
              type: 'rebaseBranch',
              branchName: branch.name,
            });
          },
        },
        {
          label: `Merge '${branch.name}' into '${currentHeadName}'`,
          onClick: () => {
            vscode.postMessage({
              type: 'mergeBranch',
              branchName: branch.name,
            });
          },
        },
        { isSeparator: true },
        {
          label: 'Delete',
          danger: true,
          onClick: () => {
            if (confirm(`确认要删除远程分支 '${branch.name}' 吗？`)) {
              vscode.postMessage({
                type: 'deleteBranch',
                branchName: branch.name,
                isRemote: true,
              });
            }
          },
        },
      ];
    }

    // 当前分支菜单（参考图 4）
    if (branch.isHead) {
      return [
        {
          label: 'Checkout',
          disabled: true,
        },
        {
          label: `New Branch from '${branch.name}'...`,
          onClick: () => {
            vscode.postMessage({
              type: 'promptCreateBranch',
              baseBranch: branch.name,
              targetHash: branch.commitHash,
            });
          },
        },
        { isSeparator: true },
        {
          label: 'Update',
          onClick: () => {
            vscode.postMessage({ type: 'updateBranch' });
          },
        },
        {
          label: 'Push...',
          onClick: () => {
            vscode.postMessage({
              type: 'pushBranch',
              branchName: branch.name,
            });
          },
        },
        { isSeparator: true },
        {
          label: 'Rename...',
          shortcut: 'F2',
          onClick: () => {
            vscode.postMessage({
              type: 'promptRenameBranch',
              branchName: branch.name,
            });
          },
        },
      ];
    }

    // 非当前分支菜单（参考图 3）
    return [
      {
        label: 'Checkout',
        onClick: () => {
          vscode.postMessage({
            type: 'checkoutBranch',
            branchName: branch.name,
            isRemote: false,
          });
        },
      },
      {
        label: `New Branch from '${branch.name}'...`,
        onClick: () => {
          vscode.postMessage({
            type: 'promptCreateBranch',
            baseBranch: branch.name,
            targetHash: branch.commitHash,
          });
        },
      },
      {
        label: `Checkout and Rebase onto '${currentHeadName}'`,
        onClick: () => {
          vscode.postMessage({
            type: 'checkoutAndRebase',
            branchName: branch.name,
            ontoBranch: currentHeadName,
          });
        },
      },
      { isSeparator: true },
      {
        label: `Compare with '${currentHeadName}'`,
        onClick: () => {
          vscode.postMessage({
            type: 'compareBranchWithHead',
            branchName: branch.name,
          });
        },
      },
      {
        label: 'Show Diff with Working Tree',
        onClick: () => {
          vscode.postMessage({
            type: 'compareWithWorkingTree',
            branchName: branch.name,
          });
        },
      },
      { isSeparator: true },
      {
        label: `Rebase '${currentHeadName}' onto '${branch.name}'`,
        onClick: () => {
          vscode.postMessage({
            type: 'rebaseBranch',
            branchName: branch.name,
          });
        },
      },
      {
        label: `Merge '${branch.name}' into '${currentHeadName}'`,
        onClick: () => {
          vscode.postMessage({
            type: 'mergeBranch',
            branchName: branch.name,
          });
        },
      },
      { isSeparator: true },
      {
        label: 'Update',
        disabled: true,
      },
      {
        label: 'Push...',
        onClick: () => {
          vscode.postMessage({
            type: 'pushBranch',
            branchName: branch.name,
          });
        },
      },
      { isSeparator: true },
      {
        label: 'Rename...',
        shortcut: 'F2',
        onClick: () => {
          vscode.postMessage({
            type: 'promptRenameBranch',
            branchName: branch.name,
          });
        },
      },
      {
        label: 'Delete',
        danger: true,
        onClick: () => {
          if (confirm(`确认要删除分支 '${branch.name}' 吗？`)) {
            vscode.postMessage({
              type: 'deleteBranch',
              branchName: branch.name,
              isRemote: false,
            });
          }
        },
      },
    ];
  };

  const renderTreeNode = (node: BranchTreeNode, depth: number = 0) => {
    if (node.isFolder) {
      const expanded = isFolderExpanded(node.path);
      return (
        <div key={node.path}>
          <div
            style={{ paddingLeft: `${depth * 14 + 6}px` }}
            className="flex items-center py-0.5 pr-2 gap-1 cursor-pointer hover:bg-vscode-hoverBg rounded-sm text-vscode-fg"
            onClick={() => toggleFolder(node.path)}
            onContextMenu={handleFolderContextMenu}
          >
            {expanded ? (
              <ChevronDown className="w-3 h-3 opacity-60 flex-shrink-0" />
            ) : (
              <ChevronRight className="w-3 h-3 opacity-60 flex-shrink-0" />
            )}
            {expanded ? (
              <FolderOpen className="w-3.5 h-3.5 text-blue-400 opacity-80 flex-shrink-0" />
            ) : (
              <Folder className="w-3.5 h-3.5 text-blue-400 opacity-80 flex-shrink-0" />
            )}
            <span className="truncate flex-1 font-medium">{node.name}</span>
            <span className="text-[10px] opacity-40 ml-1 flex-shrink-0">{node.totalBranches}</span>
          </div>
          {expanded && (
            <div>{node.children.map((child) => renderTreeNode(child, depth + 1))}</div>
          )}
        </div>
      );
    }

    if (!node.branch) return null;
    const branch = node.branch;
    const isSelected = selectedBranchName === branch.name;

    return (
      <div
        key={branch.name}
        style={{ paddingLeft: `${depth * 14 + (depth > 0 ? 18 : 8)}px` }}
        className={`flex items-center py-0.5 pr-2 gap-1.5 cursor-pointer rounded-sm hover:bg-vscode-hoverBg ${
          isSelected ? 'bg-vscode-activeBg text-vscode-activeFg' : 'text-vscode-fg'
        }`}
        onClick={() => onSelectBranch(branch)}
        onDoubleClick={() => {
          if (!branch.isHead) {
            vscode.postMessage({
              type: 'checkoutBranch',
              branchName: branch.name,
              isRemote: branch.isRemote,
            });
          }
        }}
        onContextMenu={(e) => handleContextMenu(e, branch)}
        title={
          branch.isRemote
            ? `双击检出为本地分支, 右键更多操作: ${branch.name}`
            : `双击检出, 右键更多操作: ${branch.name}`
        }
      >
        <GitBranchIcon
          className={`w-3.5 h-3.5 flex-shrink-0 ${
            branch.isHead ? 'text-yellow-500' : branch.isRemote ? 'text-cyan-400' : 'text-blue-400'
          }`}
        />
        <span className={`truncate flex-1 ${branch.isHead ? 'font-bold' : ''}`}>
          {node.name}
        </span>
        {branch.isHead && (
          <span className="text-[9px] px-1 bg-yellow-500/20 text-yellow-400 rounded">
            current
          </span>
        )}
      </div>
    );
  };

  return (
    <div
      className="flex flex-col h-full bg-vscode-sideBg select-none text-[11px]"
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* 顶部多仓库切换（自定义下拉组件，完美适配主题与精准层级缩进，防止右边被遮挡） */}
      {repos.length > 0 && (
        <div className="p-1.5 border-b border-vscode-border flex items-center gap-1.5 bg-vscode-sideBg">
          <FolderGit2 className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
          <div className="relative min-w-0 flex-1" ref={repoDropdownRef}>
            <button
              type="button"
              onClick={() => setIsRepoDropdownOpen(!isRepoDropdownOpen)}
              className="w-full flex items-center justify-between bg-vscode-inputBg text-vscode-inputFg border border-vscode-inputBorder hover:border-vscode-activeBorder rounded px-2 py-0.5 text-[11px] outline-none"
              title={activeRepo ? `${activeRepo.name} (${activeRepo.path})` : '选择仓库'}
            >
              <span className="truncate flex-1 text-left font-mono">
                {activeRepo?.name || '选择仓库...'}
              </span>
              <ChevronDown className="w-3 h-3 opacity-60 ml-1 flex-shrink-0" />
            </button>

            {isRepoDropdownOpen && (
              <div className="absolute left-0 top-full mt-1 w-full min-w-[200px] max-w-[320px] max-h-64 overflow-y-auto bg-vscode-sideBg border border-vscode-border rounded shadow-2xl z-50 py-1 text-xs select-none">
                {repos.map((r) => {
                  const isSelected = r.path === activeRepo?.path;
                  const depth = r.depth || 0;
                  return (
                    <div
                      key={r.path}
                      style={{ paddingLeft: `${depth * 14 + 6}px` }}
                      className={`flex items-center gap-1.5 px-2 py-1 cursor-pointer hover:bg-vscode-hoverBg text-[11px] truncate ${
                        isSelected ? 'bg-vscode-activeBg text-vscode-activeFg font-semibold' : 'text-vscode-fg'
                      }`}
                      onClick={() => {
                        onSwitchRepo(r.path);
                        setIsRepoDropdownOpen(false);
                      }}
                      title={r.subRelPath ? `${r.name} (${r.subRelPath})` : r.name}
                    >
                      {isSelected ? (
                        <Check className="w-3 h-3 text-blue-400 flex-shrink-0" />
                      ) : (
                        <span className="w-3 flex-shrink-0" />
                      )}
                      <span className="truncate font-mono">{r.name}</span>
                      {r.isSubmodule && r.subRelPath && (
                        <span className="text-[9px] opacity-40 truncate max-w-[110px] font-mono">
                          ({r.subRelPath})
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 搜索过滤框 */}
      <div className="p-1.5 border-b border-vscode-border flex items-center gap-1.5">
        <div className="flex items-center w-full bg-vscode-inputBg text-vscode-inputFg border border-vscode-inputBorder rounded px-1.5 py-0.5">
          <Search className="w-3 h-3 opacity-50 mr-1 flex-shrink-0" />
          <input
            type="text"
            className="w-full bg-transparent outline-none text-[11px] placeholder:opacity-50"
            placeholder="搜索分支..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* 分支树形列表 */}
      <div className="flex-1 overflow-y-auto py-1">
        {/* HEAD (Current Branch) */}
        {currentHeadBranch && (
          <div className="mb-1">
            <div
              className="px-2 py-1 text-[10px] font-semibold tracking-wider text-gray-400 uppercase"
              onContextMenu={handleFolderContextMenu}
            >
              HEAD (Current Branch)
            </div>
            <div
              className={`flex items-center px-3 py-1 gap-1.5 cursor-pointer hover:bg-vscode-hoverBg ${
                selectedBranchName === currentHeadBranch.name
                  ? 'bg-vscode-activeBg text-vscode-activeFg'
                  : 'text-vscode-fg'
              }`}
              onClick={() => onSelectBranch(currentHeadBranch)}
              onContextMenu={(e) => handleContextMenu(e, currentHeadBranch)}
            >
              <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500 flex-shrink-0" />
              <span className="font-semibold truncate">{currentHeadBranch.name}</span>
            </div>
          </div>
        )}

        {/* Local 分支分类 */}
        <div className="mb-1">
          <div
            className="flex items-center px-2 py-1 gap-1 cursor-pointer text-[10px] font-semibold tracking-wider text-gray-400 hover:text-vscode-fg uppercase"
            onClick={() => setIsLocalExpanded(!isLocalExpanded)}
            onContextMenu={handleFolderContextMenu}
          >
            {isLocalExpanded ? (
              <ChevronDown className="w-3 h-3 opacity-70" />
            ) : (
              <ChevronRight className="w-3 h-3 opacity-70" />
            )}
            <span>Local</span>
            <span className="ml-auto text-[10px] opacity-50">{localBranches.length}</span>
          </div>

          {isLocalExpanded && (
            <div className="pl-1">
              {localTree.map((node) => renderTreeNode(node, 0))}
              {localBranches.length === 0 && (
                <div className="px-3 py-1 text-gray-500 italic text-[10px]">无匹配分支</div>
              )}
            </div>
          )}
        </div>

        {/* Remote 分支分类 */}
        <div className="mb-1">
          <div
            className="flex items-center px-2 py-1 gap-1 cursor-pointer text-[10px] font-semibold tracking-wider text-gray-400 hover:text-vscode-fg uppercase"
            onClick={() => setIsRemoteExpanded(!isRemoteExpanded)}
            onContextMenu={handleFolderContextMenu}
          >
            {isRemoteExpanded ? (
              <ChevronDown className="w-3 h-3 opacity-70" />
            ) : (
              <ChevronRight className="w-3 h-3 opacity-70" />
            )}
            <span>Remote</span>
            <span className="ml-auto text-[10px] opacity-50">{remoteBranches.length}</span>
          </div>

          {isRemoteExpanded && (
            <div className="pl-1">
              {remoteTree.map((node) => renderTreeNode(node, 0))}
              {remoteBranches.length === 0 && (
                <div className="px-3 py-1 text-gray-500 italic text-[10px]">无远程分支</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 右键上下文菜单 */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
};
