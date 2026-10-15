import React, { useState, useMemo } from 'react';
import { GitBranch, RepoInfo } from '../../common/types';
import { vscode } from '../utils/vscode';
import { ContextMenu, MenuItem } from './ContextMenu';
import {
  GitBranch as GitBranchIcon,
  Search,
  ChevronRight,
  ChevronDown,
  FolderGit2,
  GitPullRequest,
  Trash2,
  Plus,
  GitMerge,
  ArrowUpRight,
  Star,
} from 'lucide-react';

interface BranchPanelProps {
  repos: RepoInfo[];
  activeRepo: RepoInfo | null;
  branches: GitBranch[];
  selectedBranchName: string | null;
  onSelectBranch: (branchName: string | null) => void;
  onSwitchRepo: (repoPath: string) => void;
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
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; branch: GitBranch } | null>(null);

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

  // 处理右键菜单
  const handleContextMenu = (e: React.MouseEvent, branch: GitBranch) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      branch,
    });
  };

  const getMenuItems = (branch: GitBranch): MenuItem[] => {
    const isCurrent = branch.isHead;
    const items: MenuItem[] = [
      {
        label: `检出 (Checkout) '${branch.name}'`,
        icon: <GitBranchIcon className="w-3.5 h-3.5 text-blue-400" />,
        disabled: isCurrent,
        onClick: () => {
          vscode.postMessage({
            type: 'checkoutBranch',
            branchName: branch.name,
            isRemote: branch.isRemote,
          });
        },
      },
      {
        label: `新建分支 (New Branch from '${branch.name}')...`,
        icon: <Plus className="w-3.5 h-3.5 text-green-400" />,
        onClick: () => {
          const newName = prompt(`请输入基于 '${branch.name}' 创建的新分支名称:`);
          if (newName && newName.trim()) {
            vscode.postMessage({
              type: 'createBranch',
              branchName: newName.trim(),
              targetHash: branch.commitHash,
            });
          }
        },
      },
      { isSeparator: true },
      {
        label: `合并到当前分支 (Merge '${branch.name}' into Current)`,
        icon: <GitMerge className="w-3.5 h-3.5 text-purple-400" />,
        disabled: isCurrent,
        onClick: () => {
          if (confirm(`确认将分支 '${branch.name}' 合并到当前分支吗？`)) {
            vscode.postMessage({
              type: 'mergeBranch',
              branchName: branch.name,
            });
          }
        },
      },
      {
        label: `变基到此分支 (Rebase Current onto '${branch.name}')`,
        icon: <GitPullRequest className="w-3.5 h-3.5 text-amber-400" />,
        disabled: isCurrent,
        onClick: () => {
          if (confirm(`确认将当前分支变基到 '${branch.name}' 吗？`)) {
            vscode.postMessage({
              type: 'rebaseBranch',
              branchName: branch.name,
            });
          }
        },
      },
      {
        label: `推送到远程 (Push '${branch.name}')...`,
        icon: <ArrowUpRight className="w-3.5 h-3.5 text-cyan-400" />,
        disabled: branch.isRemote,
        onClick: () => {
          vscode.postMessage({
            type: 'pushBranch',
            branchName: branch.name,
          });
        },
      },
      { isSeparator: true },
      {
        label: `删除分支 (Delete '${branch.name}')`,
        icon: <Trash2 className="w-3.5 h-3.5 text-red-400" />,
        danger: true,
        disabled: isCurrent,
        onClick: () => {
          if (confirm(`确认要删除分支 '${branch.name}' 吗？`)) {
            vscode.postMessage({
              type: 'deleteBranch',
              branchName: branch.name,
              isRemote: branch.isRemote,
            });
          }
        },
      },
    ];
    return items;
  };

  return (
    <div className="flex flex-col h-full bg-vscode-sideBg select-none text-[11px]">
      {/* 顶部多仓库切换 */}
      {repos.length > 0 && (
        <div className="p-1.5 border-b border-vscode-border flex items-center gap-1.5 bg-vscode-sideBg">
          <FolderGit2 className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
          <select
            className="flex-1 bg-vscode-inputBg text-vscode-inputFg border border-vscode-inputBorder rounded px-1.5 py-0.5 outline-none cursor-pointer text-[11px] truncate"
            value={activeRepo?.path || ''}
            onChange={(e) => onSwitchRepo(e.target.value)}
          >
            {repos.map((r) => (
              <option key={r.path} value={r.path}>
                {r.name}
              </option>
            ))}
          </select>
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
            <div className="px-2 py-1 text-[10px] font-semibold tracking-wider text-gray-400 uppercase">
              HEAD (Current Branch)
            </div>
            <div
              className={`flex items-center px-3 py-1 gap-1.5 cursor-pointer hover:bg-vscode-hoverBg ${
                selectedBranchName === currentHeadBranch.name
                  ? 'bg-vscode-activeBg text-vscode-activeFg'
                  : 'text-vscode-fg'
              }`}
              onClick={() =>
                onSelectBranch(selectedBranchName === currentHeadBranch.name ? null : currentHeadBranch.name)
              }
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
            <div className="pl-2">
              {localBranches.map((branch) => {
                const isSelected = selectedBranchName === branch.name;
                return (
                  <div
                    key={branch.name}
                    className={`flex items-center px-2 py-0.5 gap-1.5 cursor-pointer rounded-sm hover:bg-vscode-hoverBg ${
                      isSelected ? 'bg-vscode-activeBg text-vscode-activeFg' : 'text-vscode-fg'
                    }`}
                    onClick={() => onSelectBranch(isSelected ? null : branch.name)}
                    onDoubleClick={() => {
                      if (!branch.isHead) {
                        vscode.postMessage({
                          type: 'checkoutBranch',
                          branchName: branch.name,
                          isRemote: false,
                        });
                      }
                    }}
                    onContextMenu={(e) => handleContextMenu(e, branch)}
                    title={`双击检出, 右键查看操作: ${branch.name}`}
                  >
                    <GitBranchIcon
                      className={`w-3.5 h-3.5 flex-shrink-0 ${
                        branch.isHead ? 'text-yellow-500' : 'text-blue-400'
                      }`}
                    />
                    <span className={`truncate flex-1 ${branch.isHead ? 'font-bold' : ''}`}>
                      {branch.name}
                    </span>
                    {branch.isHead && (
                      <span className="text-[9px] px-1 bg-yellow-500/20 text-yellow-400 rounded">
                        current
                      </span>
                    )}
                  </div>
                );
              })}
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
            <div className="pl-2">
              {remoteBranches.map((branch) => {
                const isSelected = selectedBranchName === branch.name;
                return (
                  <div
                    key={branch.name}
                    className={`flex items-center px-2 py-0.5 gap-1.5 cursor-pointer rounded-sm hover:bg-vscode-hoverBg ${
                      isSelected ? 'bg-vscode-activeBg text-vscode-activeFg' : 'text-vscode-fg'
                    }`}
                    onClick={() => onSelectBranch(isSelected ? null : branch.name)}
                    onDoubleClick={() => {
                      vscode.postMessage({
                        type: 'checkoutBranch',
                        branchName: branch.name,
                        isRemote: true,
                      });
                    }}
                    onContextMenu={(e) => handleContextMenu(e, branch)}
                    title={`双击基于此检出本地分支: ${branch.name}`}
                  >
                    <GitBranchIcon className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                    <span className="truncate flex-1">{branch.name}</span>
                  </div>
                );
              })}
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
          items={getMenuItems(contextMenu.branch)}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
};
