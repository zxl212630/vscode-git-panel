export interface GitCommit {
  hash: string;
  shortHash: string;
  parents: string[];
  authorName: string;
  authorEmail: string;
  timestamp: number; // Unix timestamp in seconds
  subject: string;
  refs: string[]; // e.g. ["HEAD -> main", "origin/main", "tag: v1.0.0"]
  branches?: string[];
  tags?: string[];
}

export interface GitBranch {
  name: string;
  fullName: string;
  isHead: boolean;
  isRemote: boolean;
  remoteName?: string;
  upstream?: string;
  commitHash: string;
  ahead?: number;
  behind?: number;
}

export type GitFileStatus = 'A' | 'M' | 'D' | 'R' | 'C' | 'U';

export interface GitChangedFile {
  path: string;
  oldPath?: string;
  status: GitFileStatus;
}

export interface GitCommitDetail extends GitCommit {
  body: string;
  files: GitChangedFile[];
}

export interface RepoInfo {
  name: string;
  path: string;
  currentBranch: string;
  displayName?: string;
  depth?: number;
  subRelPath?: string;
  isSubmodule?: boolean;
}

// Graph Lane and Visual Node types
export interface GraphNode {
  commit: GitCommit;
  lane: number;
  color: string;
  routes: GraphRoute[];
}

export interface GraphRoute {
  fromLane: number;
  toLane: number;
  fromY: 'top' | 'center';
  toY: 'center' | 'bottom';
  color: string;
}

export interface CompareDetail {
  compareType: 'branch' | 'workingTree';
  baseBranch: string;
  targetBranch?: string;
  files: GitChangedFile[];
}

// RPC Messages
export type WebviewMessage =
  | { type: 'ready' }
  | { type: 'refresh' }
  | { type: 'switchRepo'; repoPath: string }
  | { type: 'selectCommit'; commitHash: string }
  | { type: 'openDiff'; commitHash: string; filePath: string; oldPath?: string; status: GitFileStatus }
  | { type: 'checkoutBranch'; branchName: string; isRemote: boolean }
  | { type: 'checkoutAndRebase'; branchName: string; ontoBranch: string }
  | { type: 'createBranch'; branchName: string; targetHash: string }
  | { type: 'promptCreateBranch'; baseBranch: string; targetHash: string }
  | { type: 'promptRenameBranch'; branchName: string }
  | { type: 'deleteBranch'; branchName: string; isRemote: boolean; force?: boolean }
  | { type: 'mergeBranch'; branchName: string }
  | { type: 'rebaseBranch'; branchName: string }
  | { type: 'pushBranch'; branchName: string; remote?: string }
  | { type: 'updateBranch' }
  | { type: 'cherryPickCommit'; commitHash: string }
  | { type: 'resetCommit'; commitHash: string; mode: 'soft' | 'mixed' | 'hard' }
  | { type: 'promptResetCommit'; commitHash: string }
  | { type: 'revertCommit'; commitHash: string }
  | { type: 'undoCommit'; commitHash: string }
  | { type: 'promptEditCommitMessage'; commitHash: string; currentMessage: string }
  | { type: 'promptCreateTag'; targetHash: string }
  | { type: 'checkoutRevision'; commitHash: string }
  | { type: 'copyToClipboard'; text: string; message?: string }
  | { type: 'filterBranch'; branch: string | null }
  | { type: 'compareBranches'; baseBranch: string; compareBranch: string }
  | { type: 'compareBranchWithHead'; branchName: string }
  | { type: 'compareWithWorkingTree'; branchName: string }
  | {
      type: 'openCompareDiff';
      compareType: 'branch' | 'workingTree';
      baseBranch: string;
      targetBranch?: string;
      filePath: string;
      oldPath?: string;
      status: GitFileStatus;
    }
  | { type: 'exitCompare' }
  | { type: 'loadMoreCommits'; skip: number; limit?: number; branch?: string | null };

export interface RepoOperationState {
  isCherryPicking: boolean;
  isMerging: boolean;
  isRebasing: boolean;
}

export type ExtensionMessage =
  | {
      type: 'initialState';
      repos: RepoInfo[];
      activeRepo: RepoInfo | null;
      branches: GitBranch[];
      commits: GitCommit[];
      selectedCommitDetail?: GitCommitDetail | null;
      hasMore?: boolean;
      repoState?: RepoOperationState;
    }
  | { type: 'repoStateUpdate'; repoState: RepoOperationState }
  | { type: 'fontSizeUpdate'; fontSize: number }
  | { type: 'branchesUpdate'; branches: GitBranch[]; activeBranch: string }
  | { type: 'commitsUpdate'; commits: GitCommit[]; hasMore?: boolean }
  | { type: 'appendCommits'; commits: GitCommit[]; hasMore: boolean }
  | { type: 'commitDetails'; detail: GitCommitDetail }
  | { type: 'compareResult'; detail: CompareDetail }
  | { type: 'clearCompare' }
  | { type: 'loading'; isLoading: boolean; message?: string }
  | { type: 'error'; message: string }
  | { type: 'info'; message: string };
