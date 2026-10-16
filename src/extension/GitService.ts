import * as cp from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { GitBranch, GitChangedFile, GitCommit, GitCommitDetail, GitFileStatus, RepoInfo } from '../common/types';

export class GitService {
  private activeRepoPath: string | null = null;
  private repoList: RepoInfo[] = [];

  constructor() {}

  public getActiveRepoPath(): string | null {
    return this.activeRepoPath;
  }

  public setActiveRepoPath(repoPath: string) {
    this.activeRepoPath = repoPath;
  }

  public async scanRepositories(): Promise<RepoInfo[]> {
    let folders: readonly vscode.WorkspaceFolder[] | undefined;
    try {
      folders = vscode.workspace?.workspaceFolders;
    } catch {
      folders = undefined;
    }

    if (!folders || folders.length === 0) {
      // 如果没有 vscode 工作区或在单测环境，尝试使用 cwd
      const cwd = process.cwd();
      if (this.isGitRepo(cwd)) {
        const branch = await this.getCurrentBranch(cwd);
        const singleRepo: RepoInfo = {
          name: path.basename(cwd),
          displayName: path.basename(cwd),
          path: cwd,
          currentBranch: branch,
          depth: 0,
          isSubmodule: false,
        };
        const repos = [singleRepo];
        await this.scanSubmodules(cwd, repos);
        this.repoList = repos;
        this.activeRepoPath = cwd;
        return repos;
      }
      this.repoList = [];
      this.activeRepoPath = null;
      return [];
    }

    const repos: RepoInfo[] = [];

    for (const folder of folders) {
      const folderPath = folder.uri.fsPath;
      if (this.isGitRepo(folderPath)) {
        const branch = await this.getCurrentBranch(folderPath);
        repos.push({
          name: folder.name,
          displayName: folder.name,
          path: folderPath,
          currentBranch: branch,
          depth: 0,
          isSubmodule: false,
        });
        await this.scanSubmodules(folderPath, repos);
      } else {
        // 查找一级子目录是否有 git 仓库（monorepo 场景）
        try {
          const entries = await fs.promises.readdir(folderPath, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory()) {
              const subPath = path.join(folderPath, entry.name);
              if (this.isGitRepo(subPath)) {
                const branch = await this.getCurrentBranch(subPath);
                repos.push({
                  name: `${folder.name}/${entry.name}`,
                  displayName: `${folder.name}/${entry.name}`,
                  path: subPath,
                  currentBranch: branch,
                  depth: 0,
                  isSubmodule: false,
                });
                await this.scanSubmodules(subPath, repos);
              }
            }
          }
        } catch {
          // 忽略无权限或已删除目录
        }
      }
    }

    this.repoList = repos;
    if (repos.length > 0 && (!this.activeRepoPath || !repos.some((r) => r.path === this.activeRepoPath))) {
      this.activeRepoPath = repos[0].path;
    }

    return repos;
  }

  private async scanSubmodules(rootRepoPath: string, repos: RepoInfo[]) {
    try {
      const output = await this.exec(['submodule', 'status', '--recursive'], rootRepoPath);
      const lines = output.trim().split('\n').filter(Boolean);
      const subPaths: string[] = [];

      for (const line of lines) {
        const match = line.trim().match(/^[+-U]?([0-9a-fA-F]{40})\s+(.+?)(?:\s+\(.*\))?$/);
        if (match) {
          subPaths.push(match[2].trim());
        }
      }

      for (const subRelPath of subPaths) {
        const subFullPath = path.join(rootRepoPath, subRelPath);
        if (this.isGitRepo(subFullPath)) {
          // 计算嵌套层级
          let depth = 1;
          for (const other of subPaths) {
            if (subRelPath !== other && subRelPath.startsWith(other + '/')) {
              depth++;
            }
          }
          const baseName = path.basename(subRelPath);
          const indent = '  '.repeat(depth);
          const branch = await this.getCurrentBranch(subFullPath);

          repos.push({
            name: baseName,
            displayName: `${indent}${baseName} (${subRelPath})`,
            depth,
            subRelPath,
            path: subFullPath,
            currentBranch: branch,
            isSubmodule: true,
          });
        }
      }
    } catch {
      // 忽略无子模块或命令失败的情况
    }
  }

  private isGitRepo(dirPath: string): boolean {
    const gitDir = path.join(dirPath, '.git');
    try {
      const stat = fs.statSync(gitDir);
      return stat.isDirectory() || stat.isFile(); // submodule 的 .git 是文件
    } catch {
      return false;
    }
  }

  public async exec(args: string[], cwd?: string): Promise<string> {
    const targetCwd = cwd || this.activeRepoPath;
    if (!targetCwd) {
      throw new Error('未选择任何 Git 仓库');
    }

    return new Promise((resolve, reject) => {
      cp.execFile('git', args, { cwd: targetCwd, maxBuffer: 30 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) {
          reject(new Error(stderr.trim() || stdout.trim() || err.message));
        } else {
          resolve(stdout);
        }
      });
    });
  }

  public async getCurrentBranch(cwd?: string): Promise<string> {
    try {
      const branch = await this.exec(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
      const trimmed = branch.trim();
      if (trimmed === 'HEAD') {
        try {
          const shortHash = await this.exec(['rev-parse', '--short', 'HEAD'], cwd);
          return `HEAD (${shortHash.trim()})`;
        } catch {
          return 'HEAD';
        }
      }
      return trimmed;
    } catch {
      return '';
    }
  }

  private static readonly GP_SEP = '<|GP_SEP|>';

  public async getBranches(): Promise<GitBranch[]> {
    if (!this.activeRepoPath) return [];

    const sep = GitService.GP_SEP;
    const format = `%(refname)${sep}%(objectname)${sep}%(upstream:short)${sep}%(HEAD)`;
    const output = await this.exec(['for-each-ref', `--format=${format}`, 'refs/heads', 'refs/remotes']);
    const lines = output.trim().split('\n').filter(Boolean);

    const branches: GitBranch[] = [];

    for (const line of lines) {
      const [refname, commitHash, upstream, headFlag] = line.split(sep);
      if (!refname) continue;

      const isRemote = refname.startsWith('refs/remotes/');
      let name = '';
      let remoteName: string | undefined = undefined;

      if (isRemote) {
        // refs/remotes/origin/main -> origin/main
        const remoteSub = refname.replace('refs/remotes/', '');
        if (remoteSub.includes('/HEAD')) {
          continue; // 过滤 origin/HEAD
        }
        const slashIdx = remoteSub.indexOf('/');
        remoteName = slashIdx !== -1 ? remoteSub.substring(0, slashIdx) : undefined;
        name = remoteSub;
      } else {
        // refs/heads/main -> main
        name = refname.replace('refs/heads/', '');
      }

      branches.push({
        name,
        fullName: refname,
        isHead: headFlag?.trim() === '*',
        isRemote,
        remoteName,
        upstream: upstream?.trim() || undefined,
        commitHash: commitHash?.trim() || '',
      });
    }

    return branches;
  }

  public async getCommits(maxCount: number = 500, branchTarget?: string, skip: number = 0): Promise<GitCommit[]> {
    if (!this.activeRepoPath) return [];

    const sep = GitService.GP_SEP;
    // Format: Hash, Parents, AuthorName, AuthorEmail, Timestamp, RefNames, Subject
    const format = `%H${sep}%P${sep}%an${sep}%ae${sep}%at${sep}%D${sep}%s`;
    const refArg = branchTarget && branchTarget.trim() ? branchTarget.trim() : '--all';
    const args = [
      'log',
      refArg,
      '--date-order',
      `--format=${format}`,
      `-n`,
      maxCount.toString(),
    ];
    if (skip > 0) {
      args.push(`--skip=${skip}`);
    }
    const output = await this.exec(args);

    const lines = output.split('\n');
    const commits: GitCommit[] = [];

    for (const line of lines) {
      if (!line.trim()) continue;
      const parts = line.split(sep);
      if (parts.length < 7) continue;

      const [hash, parentsStr, authorName, authorEmail, atStr, refNamesStr, subject] = parts;
      const parents = parentsStr.trim() ? parentsStr.trim().split(' ') : [];
      const timestamp = parseInt(atStr.trim(), 10) || 0;

      const rawRefs = refNamesStr.trim()
        ? refNamesStr
            .split(',')
            .map((r) => r.trim())
            .filter(Boolean)
        : [];

      commits.push({
        hash: hash.trim(),
        shortHash: hash.trim().substring(0, 7),
        parents,
        authorName: authorName.trim(),
        authorEmail: authorEmail.trim(),
        timestamp,
        subject: subject.trim(),
        refs: rawRefs,
      });
    }

    return commits;
  }

  public async getCommitDetail(commitHash: string): Promise<GitCommitDetail> {
    if (!this.activeRepoPath) throw new Error('未选择仓库');

    const sep = GitService.GP_SEP;
    // 1. 获取基础 commit 信息与 body
    const format = `%H${sep}%P${sep}%an${sep}%ae${sep}%at${sep}%D${sep}%s${sep}%B`;
    const infoOut = await this.exec(['show', '-s', `--format=${format}`, commitHash]);
    const parts = infoOut.split(sep);

    const hash = parts[0]?.trim() || commitHash;
    const parents = parts[1]?.trim() ? parts[1].trim().split(' ') : [];
    const authorName = parts[2]?.trim() || '';
    const authorEmail = parts[3]?.trim() || '';
    const timestamp = parseInt(parts[4]?.trim(), 10) || 0;
    const refNamesStr = parts[5]?.trim() || '';
    const subject = parts[6]?.trim() || '';
    const body = parts[7]?.trim() || '';

    const refs = refNamesStr ? refNamesStr.split(',').map((r) => r.trim()).filter(Boolean) : [];

    // 2. 获取改动文件列表
    // 使用 diff-tree 比对该 commit 与其 parent（merge commit 默认对比 parent[0]）
    const baseCommit = parents.length > 0 ? parents[0] : '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
    const diffArgs = ['diff-tree', '--no-commit-id', '--name-status', '-r', '-M', baseCommit, commitHash];

    const filesOut = await this.exec(diffArgs);
    const files = this.parseDiffNameStatus(filesOut);

    return {
      hash,
      shortHash: hash.substring(0, 7),
      parents,
      authorName,
      authorEmail,
      timestamp,
      subject,
      refs,
      body,
      files,
    };
  }

  public parseDiffNameStatus(output: string): GitChangedFile[] {
    const fileLines = output.trim().split('\n').filter(Boolean);
    const files: GitChangedFile[] = [];

    for (const fl of fileLines) {
      const tokens = fl.split('\t');
      if (tokens.length < 2) continue;

      const rawStatus = tokens[0].trim();
      const statusCode = rawStatus[0].toUpperCase() as GitFileStatus;

      if (statusCode === 'R' || statusCode === 'C') {
        files.push({
          status: statusCode,
          oldPath: tokens[1].trim(),
          path: tokens[2]?.trim() || tokens[1].trim(),
        });
      } else {
        files.push({
          status: statusCode,
          path: tokens[1].trim(),
        });
      }
    }

    return files;
  }

  public async getBranchDiffFiles(baseBranch: string, targetBranch: string): Promise<GitChangedFile[]> {
    const output = await this.exec(['diff', '--name-status', '-M', baseBranch, targetBranch]);
    return this.parseDiffNameStatus(output);
  }

  public async getWorkingTreeDiffFiles(branchName: string): Promise<GitChangedFile[]> {
    const output = await this.exec(['diff', '--name-status', '-M', branchName]);
    return this.parseDiffNameStatus(output);
  }

  // 读取指定 commit 或 ref 的文件内容（供 Diff 使用）
  public async getFileContentAtCommit(commitHash: string, filePath: string): Promise<string> {
    if (!this.activeRepoPath) return '';
    try {
      return await this.exec(['show', `${commitHash}:${filePath}`]);
    } catch {
      return '';
    }
  }

  // Git 操作
  public async checkout(branchName: string, isRemote: boolean = false): Promise<void> {
    if (isRemote) {
      // 例如检出 origin/feature-a 到本地 feature-a
      const localName = branchName.includes('/') ? branchName.substring(branchName.indexOf('/') + 1) : branchName;
      await this.exec(['checkout', '-b', localName, '--track', branchName]);
    } else {
      await this.exec(['checkout', branchName]);
    }
  }

  public async checkoutAndRebase(branchName: string, ontoBranch: string): Promise<string> {
    await this.checkout(branchName);
    return await this.rebase(ontoBranch);
  }

  public async createBranch(branchName: string, targetHash: string): Promise<void> {
    await this.exec(['checkout', '-b', branchName, targetHash]);
  }

  public async renameBranch(oldName: string, newName: string): Promise<string> {
    return await this.exec(['branch', '-m', oldName, newName]);
  }

  public async update(): Promise<string> {
    return await this.exec(['pull']);
  }

  public async deleteBranch(branchName: string, isRemote: boolean = false, force: boolean = false): Promise<void> {
    if (isRemote) {
      const [remote, ...rest] = branchName.split('/');
      await this.exec(['push', remote, '--delete', rest.join('/')]);
    } else {
      const flag = force ? '-D' : '-d';
      await this.exec(['branch', flag, branchName]);
    }
  }

  public async merge(branchName: string): Promise<string> {
    return await this.exec(['merge', branchName]);
  }

  public async rebase(branchName: string): Promise<string> {
    return await this.exec(['rebase', branchName]);
  }

  public async push(branchName: string, remote: string = 'origin'): Promise<string> {
    return await this.exec(['push', remote, branchName]);
  }

  public async cherryPick(commitHash: string): Promise<string> {
    return await this.exec(['cherry-pick', commitHash]);
  }

  public async abortCherryPick(): Promise<string> {
    return await this.exec(['cherry-pick', '--abort']);
  }

  public async reset(commitHash: string, mode: 'soft' | 'mixed' | 'hard'): Promise<string> {
    return await this.exec(['reset', `--${mode}`, commitHash]);
  }

  public async revert(commitHash: string): Promise<string> {
    return await this.exec(['revert', '--no-edit', commitHash]);
  }

  public async checkoutRevision(commitHash: string): Promise<string> {
    return await this.exec(['checkout', commitHash]);
  }

  public async createTag(tagName: string, targetHash: string): Promise<string> {
    return await this.exec(['tag', tagName, targetHash]);
  }

  public async undoCommit(): Promise<string> {
    return await this.exec(['reset', '--soft', 'HEAD~1']);
  }

  public async editCommitMessage(newMessage: string): Promise<string> {
    return await this.exec(['commit', '--amend', '-m', newMessage]);
  }

  public async getRepoOperationState(): Promise<{
    isCherryPicking: boolean;
    isMerging: boolean;
    isRebasing: boolean;
  }> {
    if (!this.activeRepoPath) {
      return { isCherryPicking: false, isMerging: false, isRebasing: false };
    }
    try {
      const checkPath = async (gitName: string): Promise<boolean> => {
        try {
          const gitPath = (await this.exec(['rev-parse', '--git-path', gitName])).trim();
          if (!gitPath) return false;
          const fullPath = path.isAbsolute(gitPath) ? gitPath : path.join(this.activeRepoPath!, gitPath);
          return fs.existsSync(fullPath);
        } catch {
          return false;
        }
      };

      const [isCherryPicking, isMerging, isRebasingMerge, isRebasingApply] = await Promise.all([
        checkPath('CHERRY_PICK_HEAD'),
        checkPath('MERGE_HEAD'),
        checkPath('rebase-merge'),
        checkPath('rebase-apply'),
      ]);

      return {
        isCherryPicking,
        isMerging,
        isRebasing: isRebasingMerge || isRebasingApply,
      };
    } catch {
      return { isCherryPicking: false, isMerging: false, isRebasing: false };
    }
  }
}
