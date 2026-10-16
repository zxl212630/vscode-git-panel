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

// RPC Messages
export type WebviewMessage =
  | { type: 'ready' }
  | { type: 'refresh' }
  | { type: 'switchRepo'; repoPath: string }
  | { type: 'selectCommit'; commitHash: string }
  | { type: 'openDiff'; commitHash: string; filePath: string; oldPath?: string; status: GitFileStatus }
  | { type: 'checkoutBranch'; branchName: string; isRemote: boolean }
  | { type: 'createBranch'; branchName: string; targetHash: string }
  | { type: 'deleteBranch'; branchName: string; isRemote: boolean; force?: boolean }
  | { type: 'mergeBranch'; branchName: string }
  | { type: 'rebaseBranch'; branchName: string }
  | { type: 'pushBranch'; branchName: string; remote?: string }
  | { type: 'cherryPickCommit'; commitHash: string }
  | { type: 'resetCommit'; commitHash: string; mode: 'soft' | 'mixed' | 'hard' }
  | { type: 'revertCommit'; commitHash: string }
  | { type: 'filterBranch'; branch: string | null }
  | { type: 'compareBranches'; baseBranch: string; compareBranch: string }
  | { type: 'loadMoreCommits'; skip: number; limit?: number; branch?: string | null };

export type ExtensionMessage =
  | {
      type: 'initialState';
      repos: RepoInfo[];
      activeRepo: RepoInfo | null;
      branches: GitBranch[];
      commits: GitCommit[];
      selectedCommitDetail?: GitCommitDetail | null;
      hasMore?: boolean;
    }
  | { type: 'branchesUpdate'; branches: GitBranch[]; activeBranch: string }
  | { type: 'commitsUpdate'; commits: GitCommit[]; hasMore?: boolean }
  | { type: 'appendCommits'; commits: GitCommit[]; hasMore: boolean }
  | { type: 'commitDetails'; detail: GitCommitDetail }
  | { type: 'loading'; isLoading: boolean; message?: string }
  | { type: 'error'; message: string }
  | { type: 'info'; message: string };
