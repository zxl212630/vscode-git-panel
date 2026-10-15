import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { GitBranch, GitCommit, GitCommitDetail, RepoInfo, ExtensionMessage } from '../common/types';
import { vscode } from './utils/vscode';
import { SplitPane } from './components/SplitPane';
import { BranchPanel } from './components/BranchPanel';
import { Toolbar } from './components/Toolbar';
import { GraphPanel } from './components/GraphPanel';
import { DiffPanel } from './components/DiffPanel';
import { Loader2 } from 'lucide-react';

export const App: React.FC = () => {
  const [repos, setRepos] = useState<RepoInfo[]>([]);
  const [activeRepo, setActiveRepo] = useState<RepoInfo | null>(null);
  const [branches, setBranches] = useState<GitBranch[]>([]);
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [selectedCommit, setSelectedCommit] = useState<GitCommit | null>(null);
  const [selectedCommitDetail, setSelectedCommitDetail] = useState<GitCommitDetail | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
          if (msg.commits.length > 0) {
            setSelectedCommit(msg.commits[0]);
          }
          if (msg.selectedCommitDetail) {
            setSelectedCommitDetail(msg.selectedCommitDetail);
          }
          setIsLoading(false);
          setErrorMessage(null);
          break;

        case 'commitDetails':
          setSelectedCommitDetail(msg.detail);
          setIsLoading(false);
          break;

        case 'commitsUpdate':
          setCommits(msg.commits);
          if (msg.commits.length > 0) {
            setSelectedCommit(msg.commits[0]);
            vscode.postMessage({ type: 'selectCommit', commitHash: msg.commits[0].hash });
          } else {
            setSelectedCommit(null);
            setSelectedCommitDetail(null);
          }
          setIsLoading(false);
          break;

        case 'loading':
          setIsLoading(msg.isLoading);
          break;

        case 'error':
          setErrorMessage(msg.message);
          setIsLoading(false);
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
    vscode.postMessage({ type: 'switchRepo', repoPath });
  }, []);

  const handleRefresh = useCallback(() => {
    setIsLoading(true);
    vscode.postMessage({ type: 'refresh' });
  }, []);

  const handleSelectBranch = useCallback((branch: string | null) => {
    setSelectedBranch(branch);
    setIsLoading(true);
    vscode.postMessage({ type: 'filterBranch', branch });
  }, []);

  const handleJumpToHead = useCallback(() => {
    const headCommit = commits.find((c) => c.refs.some((r) => r.includes('HEAD')));
    if (headCommit) {
      handleSelectCommit(headCommit);
    }
  }, [commits, handleSelectCommit]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-vscode-bg text-vscode-fg">
      {/* 顶部轻量加载与错误提示条 */}
      {errorMessage && (
        <div className="bg-red-900/60 text-red-200 px-3 py-1 text-xs border-b border-red-700 flex items-center justify-between">
          <span>{errorMessage}</span>
          <button
            className="text-red-400 hover:text-white ml-2 text-[10px]"
            onClick={() => setErrorMessage(null)}
          >
            ✕
          </button>
        </div>
      )}

      {isLoading && (
        <div className="h-[2px] w-full bg-blue-500/20 overflow-hidden relative">
          <div className="h-full bg-vscode-buttonBg animate-pulse w-full" />
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
              onSelectBranch={handleSelectBranch}
              onSwitchRepo={handleSwitchRepo}
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
                selectedBranch={selectedBranch}
                onSelectBranch={handleSelectBranch}
                branches={branches}
                authors={authors}
                selectedAuthor={selectedAuthor}
                onSelectAuthor={setSelectedAuthor}
                onRefresh={handleRefresh}
                onJumpToHead={handleJumpToHead}
                commitCount={commits.length}
              />
              <div className="flex-1 min-h-0">
                <GraphPanel
                  commits={commits}
                  branches={branches}
                  selectedHash={selectedCommit?.hash || null}
                  onSelectCommit={handleSelectCommit}
                  filteredBranch={selectedBranch}
                  filteredAuthor={selectedAuthor}
                  searchFilter={searchFilter}
                  isRegex={isRegex}
                  isCaseSensitive={isCaseSensitive}
                />
              </div>
            </div>
          }
          right={<DiffPanel commitDetail={selectedCommitDetail} isLoading={isLoading} />}
        />
      </div>
    </div>
  );
};
