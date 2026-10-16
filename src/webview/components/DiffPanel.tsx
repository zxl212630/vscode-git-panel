import React, { useState, useMemo } from 'react';
import { GitCommitDetail, GitChangedFile, GitFileStatus, CompareDetail } from '../../common/types';
import { vscode } from '../utils/vscode';
import {
  FileText,
  Folder,
  FolderOpen,
  List,
  Network,
  ChevronDown,
  ChevronRight,
  GitCompare,
  User,
  Clock,
  Hash,
} from 'lucide-react';

interface DiffPanelProps {
  commitDetail: GitCommitDetail | null;
  compareDetail: CompareDetail | null;
  isLoading: boolean;
  onExitCompare: () => void;
}

interface TreeNode {
  name: string;
  fullPath: string;
  isDirectory: boolean;
  file?: GitChangedFile;
  children?: TreeNode[];
}

export const DiffPanel: React.FC<DiffPanelProps> = ({
  commitDetail,
  compareDetail,
  isLoading,
  onExitCompare,
}) => {
  const [viewMode, setViewMode] = useState<'tree' | 'flat'>('tree');
  const [collapsedDirs, setCollapsedDirs] = useState<Record<string, boolean>>({});

  const activeFiles = useMemo(() => {
    if (compareDetail) return compareDetail.files;
    if (commitDetail) return commitDetail.files;
    return [];
  }, [compareDetail, commitDetail]);

  // 构造文件树
  const fileTree = useMemo(() => {
    if (!activeFiles || activeFiles.length === 0) return [];

    const root: TreeNode = {
      name: 'root',
      fullPath: '',
      isDirectory: true,
      children: [],
    };

    for (const file of activeFiles) {
      const parts = file.path.split('/');
      let current = root;

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const isLast = i === parts.length - 1;
        const currentPath = parts.slice(0, i + 1).join('/');

        if (isLast) {
          current.children?.push({
            name: part,
            fullPath: file.path,
            isDirectory: false,
            file,
          });
        } else {
          let dirNode = current.children?.find((c) => c.isDirectory && c.name === part);
          if (!dirNode) {
            dirNode = {
              name: part,
              fullPath: currentPath,
              isDirectory: true,
              children: [],
            };
            current.children?.push(dirNode);
          }
          current = dirNode;
        }
      }
    }

    // 排序：文件夹在前，文件在后
    const sortNodes = (nodes?: TreeNode[]) => {
      if (!nodes) return;
      nodes.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });
      for (const node of nodes) {
        if (node.isDirectory) {
          sortNodes(node.children);
        }
      }
    };

    sortNodes(root.children);
    return root.children || [];
  }, [activeFiles]);

  const toggleDir = (dirPath: string) => {
    setCollapsedDirs((prev) => ({
      ...prev,
      [dirPath]: !prev[dirPath],
    }));
  };

  const handleOpenFileDiff = (file: GitChangedFile) => {
    if (compareDetail) {
      vscode.postMessage({
        type: 'openCompareDiff',
        compareType: compareDetail.compareType,
        baseBranch: compareDetail.baseBranch,
        targetBranch: compareDetail.targetBranch,
        filePath: file.path,
        oldPath: file.oldPath,
        status: file.status,
      });
      return;
    }

    if (!commitDetail) return;
    vscode.postMessage({
      type: 'openDiff',
      commitHash: commitDetail.hash,
      filePath: file.path,
      oldPath: file.oldPath,
      status: file.status,
    });
  };

  const renderStatusBadge = (status: GitFileStatus) => {
    switch (status) {
      case 'A':
        return <span className="text-green-400 font-mono text-[10px] font-bold">A</span>;
      case 'M':
        return <span className="text-blue-400 font-mono text-[10px] font-bold">M</span>;
      case 'D':
        return <span className="text-red-400 font-mono text-[10px] font-bold">D</span>;
      case 'R':
        return <span className="text-purple-400 font-mono text-[10px] font-bold">R</span>;
      default:
        return <span className="text-gray-400 font-mono text-[10px]">{status}</span>;
    }
  };

  const renderTreeNode = (node: TreeNode, depth: number = 0) => {
    const isCollapsed = collapsedDirs[node.fullPath];

    if (node.isDirectory) {
      return (
        <div key={node.fullPath}>
          <div
            style={{ paddingLeft: `${depth * 14 + 6}px` }}
            className="flex items-center py-0.5 gap-1.5 cursor-pointer hover:bg-vscode-hoverBg text-gray-300"
            onClick={() => toggleDir(node.fullPath)}
          >
            {isCollapsed ? (
              <ChevronRight className="w-3 h-3 opacity-60" />
            ) : (
              <ChevronDown className="w-3 h-3 opacity-60" />
            )}
            {isCollapsed ? (
              <Folder className="w-3.5 h-3.5 text-blue-400" />
            ) : (
              <FolderOpen className="w-3.5 h-3.5 text-blue-400" />
            )}
            <span className="font-medium truncate">{node.name}</span>
          </div>
          {!isCollapsed && node.children && (
            <div>{node.children.map((child) => renderTreeNode(child, depth + 1))}</div>
          )}
        </div>
      );
    }

    if (!node.file) return null;

    return (
      <div
        key={node.fullPath}
        style={{ paddingLeft: `${depth * 14 + 18}px` }}
        className="flex items-center py-0.5 pr-2 gap-1.5 cursor-pointer hover:bg-vscode-hoverBg group rounded-sm text-vscode-fg"
        onClick={() => handleOpenFileDiff(node.file!)}
        title={`点击在主编辑区查看差异: ${node.file.path}`}
      >
        <FileText className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
        <span className="truncate flex-1 font-mono text-[11px]">{node.name}</span>
        {node.file.oldPath && (
          <span className="text-[9px] text-gray-500 truncate max-w-[80px]">
            from {node.file.oldPath}
          </span>
        )}
        <span className="flex-shrink-0 ml-1">{renderStatusBadge(node.file.status)}</span>
      </div>
    );
  };

  const formatDate = (ts: number) => {
    if (!ts) return '';
    const d = new Date(ts * 1000);
    return d.toLocaleString('zh-CN', { hour12: false });
  };

  if (!compareDetail && !commitDetail) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500 italic p-4 text-[11px]">
        {isLoading ? '加载中...' : '请在中间列表中选择一个 Commit 或在左侧分支右键进行对比'}
      </div>
    );
  }

  const filesCount = activeFiles.length;

  return (
    <div className="flex flex-col h-full bg-vscode-sideBg select-none text-[11px] overflow-hidden">
      {/* 对比模式横幅 */}
      {compareDetail && (
        <div className="flex items-center justify-between px-2.5 py-1.5 bg-blue-950/40 border-b border-blue-500/40 text-blue-300 flex-shrink-0">
          <div className="flex items-center gap-1.5 truncate">
            <GitCompare className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
            <span className="font-semibold truncate">
              {compareDetail.compareType === 'branch'
                ? `对比: ${compareDetail.baseBranch} ↔ ${compareDetail.targetBranch}`
                : `工作区对比: ${compareDetail.baseBranch}`}
            </span>
          </div>
          <button
            onClick={onExitCompare}
            className="px-2 py-0.5 text-[10px] bg-vscode-inputBg hover:bg-vscode-hoverBg border border-vscode-border rounded text-vscode-fg flex-shrink-0 ml-2"
            title="退出对比模式并返回提交详情"
          >
            退出对比
          </button>
        </div>
      )}

      {/* 顶部标题与视图切换 */}
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-vscode-border bg-vscode-sideBg flex-shrink-0">
        <span className="font-semibold text-gray-300">
          Changes <span className="opacity-60 text-[10px]">({filesCount} files)</span>
        </span>
        <div className="flex items-center gap-1">
          <button
            className={`p-1 rounded hover:bg-vscode-hoverBg ${
              viewMode === 'tree' ? 'text-vscode-activeFg bg-vscode-activeBg' : 'opacity-60'
            }`}
            onClick={() => setViewMode('tree')}
            title="树形结构显示"
          >
            <Network className="w-3.5 h-3.5" />
          </button>
          <button
            className={`p-1 rounded hover:bg-vscode-hoverBg ${
              viewMode === 'flat' ? 'text-vscode-activeFg bg-vscode-activeBg' : 'opacity-60'
            }`}
            onClick={() => setViewMode('flat')}
            title="平铺列表显示"
          >
            <List className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 文件变更列表区 */}
      <div className="flex-1 overflow-y-auto py-1">
        {filesCount === 0 ? (
          <div className="p-3 text-gray-500 italic text-[10px]">没有检测到任何文件变更</div>
        ) : viewMode === 'tree' ? (
          <div>{fileTree.map((node) => renderTreeNode(node))}</div>
        ) : (
          <div className="px-1">
            {activeFiles.map((file) => (
              <div
                key={file.path}
                className="flex items-center px-2 py-0.5 gap-1.5 cursor-pointer hover:bg-vscode-hoverBg rounded-sm text-vscode-fg"
                onClick={() => handleOpenFileDiff(file)}
                title={`点击在主编辑区查看差异: ${file.path}`}
              >
                <FileText className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                <span className="truncate flex-1 font-mono text-[11px]">{file.path}</span>
                {file.oldPath && (
                  <span className="text-[9px] text-gray-500 truncate max-w-[100px]">
                    from {file.oldPath}
                  </span>
                )}
                <span className="flex-shrink-0">{renderStatusBadge(file.status)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 下部：元数据信息卡片 */}
      {compareDetail ? (
        <div className="border-t border-vscode-border p-2 bg-vscode-bg/40 flex-shrink-0 text-[10px] text-gray-400 font-mono">
          <div className="flex items-center gap-1.5 text-blue-300">
            <GitCompare className="w-3 h-3 flex-shrink-0" />
            <span className="font-semibold">
              {compareDetail.compareType === 'branch'
                ? `分支对比: ${compareDetail.baseBranch} ↔ ${compareDetail.targetBranch}`
                : `分支比对工作区: ${compareDetail.baseBranch} ↔ Working Tree`}
            </span>
          </div>
          <div className="pt-1 opacity-75">
            共 {filesCount} 个文件变动，点击上方文件在主编辑区对比差异。
          </div>
        </div>
      ) : commitDetail ? (
        <div className="border-t border-vscode-border p-2.5 bg-vscode-bg/50 flex-shrink-0 max-h-[45%] overflow-y-auto flex flex-col gap-1.5 text-[11px]">
          {/* Commit Message */}
          <div className="font-semibold text-vscode-fg whitespace-pre-wrap break-words leading-tight">
            {commitDetail.subject}
          </div>
          {commitDetail.body && (
            <div className="text-gray-400 text-[10px] whitespace-pre-wrap break-words font-mono bg-vscode-sideBg/50 p-1.5 rounded border border-vscode-border/50">
              {commitDetail.body}
            </div>
          )}

          {/* 元数据行 */}
          <div className="flex flex-col gap-1 text-[10px] text-gray-400 pt-1 border-t border-vscode-border/40 font-mono">
            <div className="flex items-center gap-1.5">
              <Hash className="w-3 h-3 opacity-60 flex-shrink-0" />
              <span
                className="text-blue-400 hover:underline cursor-pointer truncate"
                onClick={() => navigator.clipboard.writeText(commitDetail.hash)}
                title="点击复制完整哈希"
              >
                {commitDetail.hash}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <User className="w-3 h-3 opacity-60 flex-shrink-0" />
              <span className="truncate">
                {commitDetail.authorName} &lt;{commitDetail.authorEmail}&gt;
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <Clock className="w-3 h-3 opacity-60 flex-shrink-0" />
              <span>{formatDate(commitDetail.timestamp)}</span>
            </div>

            {commitDetail.refs && commitDetail.refs.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                <span className="opacity-60 text-[9px]">Branches/Tags:</span>
                {commitDetail.refs.map((r, i) => (
                  <span key={i} className="px-1 py-0.2 bg-blue-500/20 text-blue-300 rounded text-[9px]">
                    {r}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};
