import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { GitBranch, GitCommit, GitCommitDetail, RepoInfo, ExtensionMessage, CompareDetail, RepoOperationState } from '../common/types';
import { vscode } from './utils/vscode';
import { SplitPane } from './components/SplitPane';
import { BranchPanel } from './components/BranchPanel';
import { Toolbar } from './components/Toolbar';
import { GraphPanel } from './components/GraphPanel';
import { DiffPanel } from './components/DiffPanel';
import { Loader2 } from 'lucide-react';

// 应用配置的面板字体大小；fontSize <= 0 时跟随 VS Code 面板字体
const applyFontSize = (fontSize: number) => {
  const root = document.documentElement;
  if (fontSize > 0) {
    root.style.setProperty('--gp-font-size', `${fontSize}px`);
  } else {
    root.style.removeProperty('--gp-font-size');
  }
};

export const App: React.FC = () => {
  const [repos, setRepos] = useState<RepoInfo[]>([]);
  const [activeRepo, setActiveRepo] = useState<RepoInfo | null>(null);
  const [branches, setBranches] = useState<GitBranch[]>([]);
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [selectedCommit, setSelectedCommit] = useState<GitCommit | null>(null);
  const [selectedCommitDetail, setSelectedCommitDetail] = useState<GitCommitDetail | null>(null);
  const [compareDetail, setCompareDetail] = useState<CompareDetail | null>(null);
  const [repoState, setRepoState] = useState<RepoOperationState>({
    isCherryPicking: false,
    isMerging: false,
    isRebasing: false,
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);

  // 过滤状态
  const [searchFilter, setSearchFilter] = useState('');
  const [isRegex, setIsRegex] = useState(false);
  const [isCaseSensitive, setIsCaseSensitive] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [selectedAuthor, setSelectedAuthor] = useState<string | null>(null);

  // 所有作者列表（去重）
  const authors = useMemo(() => {
    const set = new Set<string>();
    for (const c of commits) {
      if (c.authorName) set.add(c.authorName);
    }
    return Array.from(set).sort();
  }, [commits]);

  // 监听来自扩展端的消息
  useEffect(() => {
    const handleMessage = (event: MessageEvent<ExtensionMessage>) => {
      const msg = event.data;
      switch (msg.type) {
        case 'initialState':
          setRepos(msg.repos);
          setActiveRepo(msg.activeRepo);
          setBranches(msg.branches);
          setCommits(msg.commits);
          setCompareDetail(null);
          setHasMore(msg.hasMore ?? false);
          setIsLoadingMore(false);
          if (msg.commits.length > 0) {
            setSelectedCommit(msg.commits[0]);
          }
          if (msg.selectedCommitDetail) {
            setSelectedCommitDetail(msg.selectedCommitDetail);
          }
          if (msg.repoState) {
            setRepoState(msg.repoState);
          }
          setIsLoading(false);
          setErrorMessage(null);
          break;

        case 'repoStateUpdate':
          setRepoState(msg.repoState);
          break;

        case 'fontSizeUpdate':
          applyFontSize(msg.fontSize);
          break;

        case 'commitDetails':
          setSelectedCommitDetail(msg.detail);
          setIsLoading(false);
          break;

        case 'compareResult':
          setCompareDetail(msg.detail);
          setIsLoading(false);
          break;

        case 'clearCompare':
          setCompareDetail(null);
          break;

        case 'commitsUpdate':
          setCommits(msg.commits);
          setHasMore(msg.hasMore ?? false);
          setIsLoadingMore(false);
          if (msg.commits.length > 0) {
            setSelectedCommit(msg.commits[0]);
            vscode.postMessage({ type: 'selectCommit', commitHash: msg.commits[0].hash });
          } else {
            setSelectedCommit(null);
            setSelectedCommitDetail(null);
          }
          setIsLoading(false);
          break;

        case 'appendCommits':
          setCommits((prev) => {
            const existing = new Set(prev.map((c) => c.hash));
            const fresh = msg.commits.filter((c) => !existing.has(c.hash));
            return [...prev, ...fresh];
          });
          setHasMore(msg.hasMore);
          setIsLoadingMore(false);
          break;

        case 'loading':
          setIsLoading(msg.isLoading);
          break;

        case 'error':
          setErrorMessage(msg.message);
          setIsLoading(false);
          setIsLoadingMore(false);
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    vscode.postMessage({ type: 'ready' });

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  const handleSelectCommit = useCallback((commit: GitCommit) => {
    setSelectedCommit(commit);
    vscode.postMessage({ type: 'selectCommit', commitHash: commit.hash });
  }, []);

  const handleSwitchRepo = useCallback((repoPath: string) => {
    setIsLoading(true);
    setCompareDetail(null);
    vscode.postMessage({ type: 'switchRepo', repoPath });
  }, []);

  const handleRefresh = useCallback(() => {
    setIsLoading(true);
    setHasMore(true);
    setIsLoadingMore(false);
    vscode.postMessage({ type: 'refresh' });
  }, []);

  const [toolbarBranchFilter, setToolbarBranchFilter] = useState<string | null>(null);

  const handleToolbarFilterBranch = useCallback((branch: string | null) => {
    setToolbarBranchFilter(branch);
    setIsLoading(true);
    setHasMore(true);
    setIsLoadingMore(false);
    setCompareDetail(null);
    vscode.postMessage({ type: 'filterBranch', branch });
  }, []);

  const handleBranchClick = useCallback(
    (branch: GitBranch) => {
      setSelectedBranch(branch.name);
      // 查找该分支最新的 Commit 并跳转定位，而不是过滤提交列表
      let targetCommit = commits.find((c) => c.hash === branch.commitHash);
      if (!targetCommit) {
        targetCommit = commits.find((c) =>
          c.refs.some(
            (r) =>
              r === branch.name ||
              r === `HEAD -> ${branch.name}` ||
              r === `origin/${branch.name}` ||
              r.includes(`/${branch.name}`)
          )
        );
      }
      if (targetCommit) {
        handleSelectCommit(targetCommit);
      } else if (branch.commitHash) {
        vscode.postMessage({ type: 'selectCommit', commitHash: branch.commitHash });
      }
    },
    [commits, handleSelectCommit]
  );

  const handleExitCompare = useCallback(() => {
    setCompareDetail(null);
    vscode.postMessage({ type: 'exitCompare' });
  }, []);

  const handleLoadMore = useCallback(() => {
    if (isLoading || isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    vscode.postMessage({
      type: 'loadMoreCommits',
      skip: commits.length,
      limit: 500,
      branch: toolbarBranchFilter,
    });
  }, [isLoading, isLoadingMore, hasMore, commits.length, toolbarBranchFilter]);

  const handleJumpToHead = useCallback(() => {
    const headCommit = commits.find((c) => c.refs.some((r) => r.includes('HEAD')));
    if (headCommit) {
      handleSelectCommit(headCommit);
    }
  }, [commits, handleSelectCommit]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-vscode-bg text-vscode-fg relative">
      {/* 顶部轻量加载指示条（绝对定位，绝不改变布局高度，杜绝抖动） */}
      <div
        className={`absolute top-0 left-0 right-0 h-[2px] z-50 pointer-events-none overflow-hidden transition-opacity duration-200 ${
          isLoading ? 'opacity-100 bg-blue-500/20' : 'opacity-0'
        }`}
      >
        {isLoading && <div className="h-full bg-vscode-buttonBg animate-pulse w-full" />}
      </div>

      {/* 顶部错误提示条 */}
      {errorMessage && (
        <div className="bg-red-900/60 text-red-200 px-3 py-1 text-gp border-b border-red-700 flex items-center justify-between z-40">
          <span>{errorMessage}</span>
          <button
            className="text-red-400 hover:text-white ml-2 text-gp-sm"
            onClick={() => setErrorMessage(null)}
          >
            ✕
          </button>
        </div>
      )}

      {/* 主三栏分栏 */}
      <div className="flex-1 overflow-hidden relative">
        <SplitPane
          left={
            <BranchPanel
              repos={repos}
              activeRepo={activeRepo}
              branches={branches}
              selectedBranchName={selectedBranch}
              onSelectBranch={handleBranchClick}
              onSwitchRepo={handleSwitchRepo}
              isLoading={isLoading}
            />
          }
          center={
            <div className="flex flex-col h-full overflow-hidden">
              <Toolbar
                searchText={searchFilter}
                onSearchChange={setSearchFilter}
                isRegex={isRegex}
                onToggleRegex={() => setIsRegex(!isRegex)}
                isCaseSensitive={isCaseSensitive}
                onToggleCaseSensitive={() => setIsCaseSensitive(!isCaseSensitive)}
                selectedBranch={toolbarBranchFilter}
                onSelectBranch={handleToolbarFilterBranch}
                branches={branches}
                authors={authors}
                selectedAuthor={selectedAuthor}
                onSelectAuthor={setSelectedAuthor}
                onRefresh={handleRefresh}
                onJumpToHead={handleJumpToHead}
                commitCount={commits.length}
                hasMore={hasMore}
                isLoadingMore={isLoadingMore}
              />
              <div className="flex-1 min-h-0">
                <GraphPanel
                  commits={commits}
                  branches={branches}
                  selectedHash={selectedCommit?.hash || null}
                  onSelectCommit={handleSelectCommit}
                  filteredBranch={toolbarBranchFilter}
                  filteredAuthor={selectedAuthor}
                  searchFilter={searchFilter}
                  isRegex={isRegex}
                  isCaseSensitive={isCaseSensitive}
                  onLoadMore={handleLoadMore}
                  hasMore={hasMore}
                  isLoadingMore={isLoadingMore}
                  repoState={repoState}
                />
              </div>
            </div>
          }
          right={
            <DiffPanel
              commitDetail={selectedCommitDetail}
              compareDetail={compareDetail}
              isLoading={isLoading}
              onExitCompare={handleExitCompare}
            />
          }
        />
      </div>
    </div>
  );
};
