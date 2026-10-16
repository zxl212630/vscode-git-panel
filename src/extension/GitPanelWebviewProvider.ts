import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { GitService } from './GitService';
import { GitContentProvider } from './GitContentProvider';
import { ExtensionMessage, GitFileStatus, WebviewMessage } from '../common/types';

export class GitPanelWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'git-panel.view';
  private _view?: vscode.WebviewView;
  private _disposables: vscode.Disposable[] = [];
  private _gitWatcher?: vscode.FileSystemWatcher;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly gitService: GitService
  ) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        this._extensionUri,
        vscode.Uri.joinPath(this._extensionUri, 'dist'),
      ],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(
      (message: WebviewMessage) => this._handleWebviewMessage(message),
      undefined,
      this._disposables
    );

    // 监控工作区变动
    this._setupGitWatcher();

    webviewView.onDidDispose(() => {
      this.dispose();
    });
  }

  private _setupGitWatcher() {
    this._gitWatcher?.dispose();
    this._gitWatcher = vscode.workspace.createFileSystemWatcher('**/.git/{HEAD,refs/heads/**,refs/remotes/**}');
    
    const refreshDebounced = this._debounce(() => {
      this.refreshData();
    }, 400);

    this._gitWatcher.onDidChange(refreshDebounced);
    this._gitWatcher.onDidCreate(refreshDebounced);
    this._gitWatcher.onDidDelete(refreshDebounced);
  }

  private _debounce(fn: () => void, delay: number) {
    let timer: NodeJS.Timeout;
    return () => {
      clearTimeout(timer);
      timer = setTimeout(fn, delay);
    };
  }

  public postMessage(message: ExtensionMessage) {
    this._view?.webview.postMessage(message);
  }

  private async _handleWebviewMessage(msg: WebviewMessage) {
    try {
      switch (msg.type) {
        case 'ready':
        case 'refresh':
          await this.refreshData();
          break;

        case 'switchRepo':
          this.gitService.setActiveRepoPath(msg.repoPath);
          await this.refreshData();
          break;

        case 'selectCommit':
          await this._loadCommitDetail(msg.commitHash);
          break;

        case 'openDiff':
          await this._openDiff(msg.commitHash, msg.filePath, msg.oldPath, msg.status);
          break;

        case 'checkoutBranch':
          await this.gitService.checkout(msg.branchName, msg.isRemote);
          vscode.window.showInformationMessage(`已切换分支到: ${msg.branchName}`);
          await this.refreshData();
          break;

        case 'checkoutAndRebase':
          try {
            await this.gitService.checkoutAndRebase(msg.branchName, msg.ontoBranch);
            vscode.window.showInformationMessage(`成功检出 '${msg.branchName}' 并变基到 '${msg.ontoBranch}'`);
          } catch (err: any) {
            vscode.window.showErrorMessage(`检出并变基失败: ${err.message}`);
          }
          await this.refreshData();
          break;

        case 'createBranch':
          await this.gitService.createBranch(msg.branchName, msg.targetHash);
          vscode.window.showInformationMessage(`成功创建并检出分支: ${msg.branchName}`);
          await this.refreshData();
          break;

        case 'promptCreateBranch': {
          const newName = await vscode.window.showInputBox({
            title: `基于 '${msg.baseBranch}' 创建新分支`,
            prompt: '请输入新分支名称',
            placeHolder: '例如 feature/my-feature',
            validateInput: (value) => {
              if (!value || !value.trim()) return '分支名称不能为空';
              if (/\s/.test(value)) return '分支名称不能包含空格';
              return null;
            },
          });
          if (newName && newName.trim()) {
            try {
              await this.gitService.createBranch(newName.trim(), msg.targetHash);
              vscode.window.showInformationMessage(`成功创建并检出分支: ${newName.trim()}`);
              await this.refreshData();
            } catch (err: any) {
              vscode.window.showErrorMessage(`创建分支失败: ${err.message}`);
            }
          }
          break;
        }

        case 'promptRenameBranch': {
          const newName = await vscode.window.showInputBox({
            title: `重命名分支 '${msg.branchName}'`,
            prompt: '请输入新的分支名称',
            value: msg.branchName,
            validateInput: (value) => {
              if (!value || !value.trim()) return '分支名称不能为空';
              if (/\s/.test(value)) return '分支名称不能包含空格';
              if (value.trim() === msg.branchName) return '新分支名称与原名称相同';
              return null;
            },
          });
          if (newName && newName.trim()) {
            try {
              await this.gitService.renameBranch(msg.branchName, newName.trim());
              vscode.window.showInformationMessage(`分支已重命名为: ${newName.trim()}`);
              await this.refreshData();
            } catch (err: any) {
              vscode.window.showErrorMessage(`重命名分支失败: ${err.message}`);
            }
          }
          break;
        }

        case 'deleteBranch':
          await this.gitService.deleteBranch(msg.branchName, msg.isRemote, msg.force);
          vscode.window.showInformationMessage(`已删除分支: ${msg.branchName}`);
          await this.refreshData();
          break;

        case 'mergeBranch':
          try {
            await this.gitService.merge(msg.branchName);
            vscode.window.showInformationMessage(`成功合并分支: ${msg.branchName}`);
          } catch (err: any) {
            vscode.window.showErrorMessage(`合并分支失败: ${err.message}`);
          }
          await this.refreshData();
          break;

        case 'rebaseBranch':
          try {
            await this.gitService.rebase(msg.branchName);
            vscode.window.showInformationMessage(`成功变基到: ${msg.branchName}`);
          } catch (err: any) {
            vscode.window.showErrorMessage(`变基失败: ${err.message}`);
          }
          await this.refreshData();
          break;

        case 'pushBranch':
          try {
            await this.gitService.push(msg.branchName, msg.remote);
            vscode.window.showInformationMessage(`推送成功: ${msg.branchName}`);
          } catch (err: any) {
            vscode.window.showErrorMessage(`推送失败: ${err.message}`);
          }
          await this.refreshData();
          break;

        case 'updateBranch':
          try {
            const out = await this.gitService.update();
            vscode.window.showInformationMessage(`更新分支成功: ${out.trim() || 'Already up to date.'}`);
          } catch (err: any) {
            vscode.window.showErrorMessage(`更新分支失败: ${err.message}`);
          }
          await this.refreshData();
          break;

        case 'compareBranchWithHead': {
          try {
            const currentHead = await this.gitService.getCurrentBranch();
            const files = await this.gitService.getBranchDiffFiles(currentHead, msg.branchName);
            this.postMessage({
              type: 'compareResult',
              detail: {
                compareType: 'branch',
                baseBranch: currentHead,
                targetBranch: msg.branchName,
                files,
              },
            });
          } catch (err: any) {
            vscode.window.showErrorMessage(`对比分支失败: ${err.message}`);
          }
          break;
        }

        case 'compareWithWorkingTree': {
          try {
            const files = await this.gitService.getWorkingTreeDiffFiles(msg.branchName);
            this.postMessage({
              type: 'compareResult',
              detail: {
                compareType: 'workingTree',
                baseBranch: msg.branchName,
                files,
              },
            });
          } catch (err: any) {
            vscode.window.showErrorMessage(`比对工作区差异失败: ${err.message}`);
          }
          break;
        }

        case 'openCompareDiff':
          await this._openCompareDiff(
            msg.compareType,
            msg.baseBranch,
            msg.targetBranch,
            msg.filePath,
            msg.oldPath,
            msg.status
          );
          break;

        case 'exitCompare':
          this.postMessage({ type: 'clearCompare' });
          break;

        case 'cherryPickCommit':
          try {
            await this.gitService.cherryPick(msg.commitHash);
            vscode.window.showInformationMessage(`成功 Cherry-pick 提交: ${msg.commitHash.slice(0, 7)}`);
          } catch (err: any) {
            vscode.window.showErrorMessage(`Cherry-pick 失败: ${err.message}`);
          }
          await this.refreshData();
          break;

        case 'resetCommit':
          try {
            await this.gitService.reset(msg.commitHash, msg.mode);
            vscode.window.showInformationMessage(`已重置当前分支到 ${msg.commitHash.slice(0, 7)} (${msg.mode})`);
          } catch (err: any) {
            vscode.window.showErrorMessage(`重置失败: ${err.message}`);
          }
          await this.refreshData();
          break;

        case 'revertCommit':
          try {
            await this.gitService.revert(msg.commitHash);
            vscode.window.showInformationMessage(`已撤销提交: ${msg.commitHash.slice(0, 7)}`);
          } catch (err: any) {
            vscode.window.showErrorMessage(`撤销失败: ${err.message}`);
          }
          await this.refreshData();
          break;

        case 'filterBranch':
          try {
            const pageSize = 500;
            const commits = await this.gitService.getCommits(pageSize, msg.branch || undefined, 0);
            this.postMessage({
              type: 'commitsUpdate',
              commits,
              hasMore: commits.length >= pageSize,
            });
          } catch (err: any) {
            this.postMessage({ type: 'error', message: `筛选分支失败: ${err.message}` });
          }
          break;

        case 'loadMoreCommits':
          try {
            const limit = msg.limit || 500;
            const skip = msg.skip || 0;
            const commits = await this.gitService.getCommits(limit, msg.branch || undefined, skip);
            this.postMessage({
              type: 'appendCommits',
              commits,
              hasMore: commits.length >= limit,
            });
          } catch (err: any) {
            this.postMessage({ type: 'error', message: `加载更多提交失败: ${err.message}` });
          }
          break;
      }
    } catch (err: any) {
      this.postMessage({ type: 'error', message: err.message || String(err) });
    }
  }

  public async refreshData() {
    this.postMessage({ type: 'loading', isLoading: true });
    try {
      const repos = await this.gitService.scanRepositories();
      const activePath = this.gitService.getActiveRepoPath();
      const activeRepo = repos.find((r) => r.path === activePath) || (repos.length > 0 ? repos[0] : null);

      if (!activeRepo) {
        this.postMessage({
          type: 'initialState',
          repos: [],
          activeRepo: null,
          branches: [],
          commits: [],
          selectedCommitDetail: null,
          hasMore: false,
        });
        return;
      }

      const pageSize = 500;
      const [branches, commits] = await Promise.all([
        this.gitService.getBranches(),
        this.gitService.getCommits(pageSize, undefined, 0),
      ]);

      let selectedCommitDetail = null;
      if (commits.length > 0) {
        selectedCommitDetail = await this.gitService.getCommitDetail(commits[0].hash);
      }

      this.postMessage({
        type: 'initialState',
        repos,
        activeRepo,
        branches,
        commits,
        selectedCommitDetail,
        hasMore: commits.length >= pageSize,
      });
    } catch (err: any) {
      this.postMessage({ type: 'error', message: err.message || '加载 Git 数据失败' });
    } finally {
      this.postMessage({ type: 'loading', isLoading: false });
    }
  }

  private async _loadCommitDetail(commitHash: string) {
    try {
      const detail = await this.gitService.getCommitDetail(commitHash);
      this.postMessage({ type: 'commitDetails', detail });
    } catch (err: any) {
      this.postMessage({ type: 'error', message: `获取提交详情失败: ${err.message}` });
    }
  }

  private async _openDiff(
    commitHash: string,
    filePath: string,
    oldPath: string | undefined,
    status: GitFileStatus
  ) {
    try {
      const detail = await this.gitService.getCommitDetail(commitHash);
      const parentHash = detail.parents.length > 0 ? detail.parents[0] : 'empty';

      let leftUri: vscode.Uri;
      let rightUri: vscode.Uri;
      const fileName = path.basename(filePath);

      if (status === 'A') {
        // 新增文件：左侧空，右侧为当前 commit
        leftUri = GitContentProvider.createUri('empty', filePath);
        rightUri = GitContentProvider.createUri(commitHash, filePath);
      } else if (status === 'D') {
        // 删除文件：左侧为 parent，右侧空
        leftUri = GitContentProvider.createUri(parentHash, filePath);
        rightUri = GitContentProvider.createUri('empty', filePath);
      } else {
        // 修改或重命名
        const leftFilePath = oldPath || filePath;
        leftUri = GitContentProvider.createUri(parentHash, leftFilePath);
        rightUri = GitContentProvider.createUri(commitHash, filePath);
      }

      const leftLabel = parentHash === 'empty' ? '空' : parentHash.slice(0, 7);
      const rightLabel = commitHash.slice(0, 7);
      const title = `${fileName} (${leftLabel} ↔ ${rightLabel})`;

      // 在主编辑区打开 VS Code 内置 Diff 窗口
      await vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, title, {
        preview: true,
        preserveFocus: false,
      });
    } catch (err: any) {
      vscode.window.showErrorMessage(`无法打开差异对比: ${err.message}`);
    }
  }

  private async _openCompareDiff(
    compareType: 'branch' | 'workingTree',
    baseBranch: string,
    targetBranch: string | undefined,
    filePath: string,
    oldPath: string | undefined,
    status: GitFileStatus
  ) {
    try {
      const activeRepoPath = this.gitService.getActiveRepoPath();
      if (!activeRepoPath) return;

      let leftUri: vscode.Uri;
      let rightUri: vscode.Uri;
      const fileName = path.basename(filePath);
      const leftFilePath = oldPath || filePath;

      if (compareType === 'branch') {
        const rightRef = targetBranch || 'HEAD';
        const leftRef = baseBranch;

        if (status === 'A') {
          leftUri = GitContentProvider.createUri('empty', filePath);
          rightUri = GitContentProvider.createUri(rightRef, filePath);
        } else if (status === 'D') {
          leftUri = GitContentProvider.createUri(leftRef, leftFilePath);
          rightUri = GitContentProvider.createUri('empty', filePath);
        } else {
          leftUri = GitContentProvider.createUri(leftRef, leftFilePath);
          rightUri = GitContentProvider.createUri(rightRef, filePath);
        }

        const title = `${fileName} (${leftRef} ↔ ${rightRef})`;
        await vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, title, {
          preview: true,
          preserveFocus: false,
        });
      } else {
        // workingTree
        const branchRef = baseBranch;
        const diskFileUri = vscode.Uri.file(path.join(activeRepoPath, filePath));

        if (status === 'A') {
          leftUri = GitContentProvider.createUri('empty', filePath);
          rightUri = diskFileUri;
        } else if (status === 'D') {
          leftUri = GitContentProvider.createUri(branchRef, leftFilePath);
          rightUri = GitContentProvider.createUri('empty', filePath);
        } else {
          leftUri = GitContentProvider.createUri(branchRef, leftFilePath);
          rightUri = diskFileUri;
        }

        const title = `${fileName} (${branchRef} ↔ Working Tree)`;
        await vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, title, {
          preview: true,
          preserveFocus: false,
        });
      }
    } catch (err: any) {
      vscode.window.showErrorMessage(`无法打开差异对比: ${err.message}`);
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const isProd = fs.existsSync(path.join(this._extensionUri.fsPath, 'dist/webview/assets/index.js'));

    let scriptUri: vscode.Uri;
    let styleUri: vscode.Uri;

    if (isProd) {
      scriptUri = webview.asWebviewUri(
        vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'assets', 'index.js')
      );
      styleUri = webview.asWebviewUri(
        vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'assets', 'index.css')
      );
    } else {
      // 降级或者开发时尝试载入构建物
      scriptUri = webview.asWebviewUri(
        vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'assets', 'index.js')
      );
      styleUri = webview.asWebviewUri(
        vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'assets', 'index.css')
      );
    }

    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};">
  <link rel="stylesheet" href="${styleUri}">
  <title>Git Panel</title>
</head>
<body class="bg-vscode-bg text-vscode-fg overflow-hidden select-none m-0 p-0 font-sans text-xs">
  <div id="root" class="h-screen w-screen overflow-hidden flex flex-col"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  public dispose() {
    this._gitWatcher?.dispose();
    while (this._disposables.length) {
      const d = this._disposables.pop();
      if (d) d.dispose();
    }
  }
}

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
