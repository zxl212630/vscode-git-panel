import React from 'react';
import { RefreshCw, Search, ArrowDownCircle, Loader2 } from 'lucide-react';
import { GitBranch } from '../../common/types';

interface ToolbarProps {
  searchText: string;
  onSearchChange: (text: string) => void;
  isRegex: boolean;
  onToggleRegex: () => void;
  isCaseSensitive: boolean;
  onToggleCaseSensitive: () => void;
  selectedBranch: string | null;
  onSelectBranch: (branch: string | null) => void;
  branches: GitBranch[];
  authors: string[];
  selectedAuthor: string | null;
  onSelectAuthor: (author: string | null) => void;
  onRefresh: () => void;
  onJumpToHead: () => void;
  commitCount: number;
  hasMore?: boolean;
  isLoadingMore?: boolean;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  searchText,
  onSearchChange,
  isRegex,
  onToggleRegex,
  isCaseSensitive,
  onToggleCaseSensitive,
  selectedBranch,
  onSelectBranch,
  branches,
  authors,
  selectedAuthor,
  onSelectAuthor,
  onRefresh,
  onJumpToHead,
  commitCount,
  hasMore,
  isLoadingMore,
}) => {
  return (
    <div className="flex items-center px-2 py-1 gap-2 border-b border-vscode-border bg-vscode-panelBg text-gp overflow-x-auto select-none">
      {/* 搜索框组 */}
      <div className="flex items-center bg-vscode-inputBg text-vscode-inputFg border border-vscode-inputBorder rounded px-1.5 py-0.5 max-w-[240px] flex-shrink-0">
        <Search className="w-3 h-3 opacity-50 mr-1 flex-shrink-0" />
        <input
          type="text"
          className="w-full bg-transparent outline-none text-gp placeholder:opacity-50"
          placeholder="Text or hash"
          value={searchText}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        <button
          className={`ml-1 px-1 rounded text-gp-sm font-mono leading-none ${
            isRegex ? 'bg-vscode-buttonBg text-white' : 'opacity-40 hover:opacity-100'
          }`}
          onClick={onToggleRegex}
          title="使用正则表达式"
        >
          .*
        </button>
        <button
          className={`ml-0.5 px-1 rounded text-gp-sm font-mono leading-none ${
            isCaseSensitive ? 'bg-vscode-buttonBg text-white' : 'opacity-40 hover:opacity-100'
          }`}
          onClick={onToggleCaseSensitive}
          title="匹配大小写"
        >
          Cc
        </button>
      </div>

      {/* 分支筛选 */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <span className="opacity-60 text-gp-sm">Branch:</span>
        <select
          className="bg-vscode-inputBg text-vscode-inputFg border border-vscode-inputBorder rounded px-1.5 py-0.5 text-gp outline-none max-w-[140px] truncate"
          value={selectedBranch || ''}
          onChange={(e) => onSelectBranch(e.target.value || null)}
        >
          <option value="">全部 (All)</option>
          {branches.map((b) => (
            <option key={b.fullName} value={b.name}>
              {b.isHead ? `* ${b.name}` : b.name}
            </option>
          ))}
        </select>
      </div>

      {/* 用户筛选 */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <span className="opacity-60 text-gp-sm">User:</span>
        <select
          className="bg-vscode-inputBg text-vscode-inputFg border border-vscode-inputBorder rounded px-1.5 py-0.5 text-gp outline-none max-w-[130px] truncate"
          value={selectedAuthor || ''}
          onChange={(e) => onSelectAuthor(e.target.value || null)}
        >
          <option value="">全部 (All)</option>
          {authors.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>

      {/* 快捷按钮 */}
      <div className="flex items-center gap-1 ml-auto flex-shrink-0">
        <button
          className="p-1 hover:bg-vscode-hoverBg rounded text-vscode-fg opacity-80 hover:opacity-100 flex items-center gap-1"
          onClick={onJumpToHead}
          title="定位到 HEAD"
        >
          <ArrowDownCircle className="w-3.5 h-3.5" />
          <span className="text-gp-sm hidden sm:inline">Jump to HEAD</span>
        </button>

        <button
          className="p-1 hover:bg-vscode-hoverBg rounded text-vscode-fg opacity-80 hover:opacity-100"
          onClick={onRefresh}
          title="刷新提交历史"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>

        <span className="text-gp-sm opacity-60 px-1 border-l border-vscode-border flex items-center gap-1">
          {isLoadingMore && <Loader2 className="w-2.5 h-2.5 animate-spin text-blue-400" />}
          <span>{commitCount}{hasMore ? '+' : ''} commits</span>
        </span>
      </div>
    </div>
  );
};
