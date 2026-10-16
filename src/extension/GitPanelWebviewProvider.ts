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

    // 配置变更时实时更新面板字体大小
    vscode.workspace.onDidChangeConfiguration(
      (e) => {
        if (e.affectsConfiguration('git-panel.fontSize')) {
          this.postMessage({ type: 'fontSizeUpdate', fontSize: this._getConfiguredFontSize() });
        }
      },
      undefined,
      this._disposables
    );

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
    this._gitWatcher = vscode.workspace.createFileSystemWatcher(
      '**/.git/{HEAD,refs/heads/**,refs/remotes/**,CHERRY_PICK_HEAD,MERGE_HEAD,rebase-merge/**,rebase-apply/**}'
    );
    
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

        case 'deleteBranch': {
          if (msg.isRemote) {
            try {
              await this.gitService.deleteBranch(msg.branchName, true);
              vscode.window.showInformationMessage(`已删除远程分支: ${msg.branchName}`);
              await this.refreshData();
            } catch (err: any) {
              vscode.window.showErrorMessage(`删除远程分支失败: ${err.message}`);
            }
            break;
          }

          try {
            // 已合并的分支直接安全删除 (git branch -d)
            await this.gitService.deleteBranch(msg.branchName, false);
            vscode.window.showInformationMessage(`已删除分支: ${msg.branchName}`);
            await this.refreshData();
          } catch (err: any) {
            if (!/not fully merged|未完全合并/i.test(err.message || '')) {
              vscode.window.showErrorMessage(`删除分支失败: ${err.message}`);
              break;
            }
            const force = await vscode.window.showWarningMessage(
              `分支 '${msg.branchName}' 尚未完全合并，其中的提交将无法通过该分支找回。确认强制删除吗？`,
              { modal: true },
              '强制删除 (-D)'
            );
            if (force !== '强制删除 (-D)') break;
            try {
              await this.gitService.deleteBranch(msg.branchName, false, true);
              vscode.window.showInformationMessage(`已强制删除分支: ${msg.branchName}`);
              await this.refreshData();
            } catch (forceErr: any) {
              vscode.window.showErrorMessage(`删除分支失败: ${forceErr.message}`);
            }
          }
          break;
        }

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

        case 'copyToClipboard': {
          await vscode.env.clipboard.writeText(msg.text);
          vscode.window.showInformationMessage(msg.message || `已复制到剪贴板: ${msg.text}`);
          break;
        }

        case 'cherryPickCommit': {
          const short = msg.commitHash.substring(0, 7);
          try {
            await this.gitService.cherryPick(msg.commitHash);
            vscode.window.showInformationMessage(`成功 Cherry-pick 提交: ${short}`);
          } catch (err: any) {
            const opState = await this.gitService.getRepoOperationState();
            if (opState.isCherryPicking) {
              const choice = await vscode.window.showWarningMessage(
                `Cherry-pick 提交 ${short} 时产生代码冲突，是否继续？`,
                {
                  modal: true,
                  detail:
                    '• 选择【继续】：保留冲突文件，您可在编辑器中手动解决冲突并提交。\n• 选择【中止 (Abort)】：将自动执行 git cherry-pick --abort 取消本次操作并回滚。',
                },
                '继续',
                '中止 (Abort)'
              );
              if (choice === '中止 (Abort)') {
                try {
                  await this.gitService.abortCherryPick();
                  vscode.window.showInformationMessage('已中止 Cherry-pick，工作区已恢复原状。');
                } catch (abortErr: any) {
                  vscode.window.showErrorMessage(`中止 Cherry-pick 失败: ${abortErr.message}`);
                }
              } else {
                vscode.window.showInformationMessage(
                  '已保留冲突现场，请在解决冲突后完成提交或执行 git cherry-pick --continue。'
                );
              }
            } else {
              vscode.window.showErrorMessage(`Cherry-pick 失败: ${err.message}`);
            }
          }
          await this.refreshData();
          break;
        }

        case 'checkoutRevision': {
          const short = msg.commitHash.substring(0, 7);
          const confirm = await vscode.window.showWarningMessage(
            `确认检出提交 ${short} 吗？\n当前工作副本将进入 Detached HEAD（分离头指针）状态。`,
            { modal: true },
            '检出 (Checkout)'
          );
          if (confirm === '检出 (Checkout)') {
            try {
              await this.gitService.checkoutRevision(msg.commitHash);
              vscode.window.showInformationMessage(`已检出到提交: ${short}`);
              await this.refreshData();
            } catch (err: any) {
              vscode.window.showErrorMessage(`检出失败: ${err.message}`);
            }
          }
          break;
        }

        case 'promptResetCommit': {
          const short = msg.commitHash.substring(0, 7);
          const pick = await vscode.window.showQuickPick(
            [
              {
                label: 'Soft',
                description: '保留所有未提交改动并放入暂存区 (git reset --soft)',
                mode: 'soft' as const,
              },
              {
                label: 'Mixed',
                description: '保留工作区改动，清空暂存区 (git reset --mixed，默认模式)',
                mode: 'mixed' as const,
              },
              {
                label: 'Hard',
                description: '【高危警告】丢弃所有工作区和暂存区的未提交改动 (git reset --hard)',
                mode: 'hard' as const,
              },
            ],
            {
              placeHolder: `选择重置当前分支到提交 ${short} 的方式`,
              title: `Reset Current Branch to Here (${short})`,
            }
          );

          if (!pick) break;

          if (pick.mode === 'hard') {
            const confirmHard = await vscode.window.showWarningMessage(
              `【危险】Hard 重置将永久丢弃所有未提交的本地代码修改！确认重置到 ${short} 吗？`,
              { modal: true },
              '确认 Hard 重置'
            );
            if (confirmHard !== '确认 Hard 重置') break;
          }

          try {
            await this.gitService.reset(msg.commitHash, pick.mode);
            vscode.window.showInformationMessage(`已将当前分支重置到 ${short} (${pick.mode})`);
            await this.refreshData();
          } catch (err: any) {
            vscode.window.showErrorMessage(`重置失败: ${err.message}`);
          }
          break;
        }

        case 'resetCommit':
          try {
            await this.gitService.reset(msg.commitHash, msg.mode);
            vscode.window.showInformationMessage(`已重置当前分支到 ${msg.commitHash.slice(0, 7)} (${msg.mode})`);
          } catch (err: any) {
            vscode.window.showErrorMessage(`重置失败: ${err.message}`);
          }
          await this.refreshData();
          break;

        case 'revertCommit': {
          const short = msg.commitHash.substring(0, 7);
          try {
            await this.gitService.revert(msg.commitHash);
            vscode.window.showInformationMessage(`已撤销提交: ${short}`);
            await this.refreshData();
          } catch (err: any) {
            vscode.window.showErrorMessage(`撤销失败: ${err.message}`);
          }
          break;
        }

        case 'undoCommit': {
          const opState = await this.gitService.getRepoOperationState();
          if (opState.isCherryPicking || opState.isMerging || opState.isRebasing) {
            vscode.window.showWarningMessage('当前正处于 Cherry-pick / Merge / Rebase 过程中，无法撤销提交。请先完成或中止当前操作 (如 git cherry-pick --abort)。');
            break;
          }

          const short = msg.commitHash.substring(0, 7);
          try {
            await this.gitService.undoCommit();
            vscode.window.showInformationMessage(`已撤销提交: ${short}，代码变更已保留在暂存区`);
            await this.refreshData();
          } catch (err: any) {
            vscode.window.showErrorMessage(`撤销提交失败: ${err.message}`);
          }
          break;
        }

        case 'promptEditCommitMessage': {
          const opState = await this.gitService.getRepoOperationState();
          if (opState.isCherryPicking || opState.isMerging || opState.isRebasing) {
            vscode.window.showWarningMessage('当前正处于 Cherry-pick / Merge / Rebase 过程中，无法修改提交信息 (Cannot amend)。请先完成或中止当前操作 (如 git cherry-pick --abort)。');
            break;
          }

          const newMsg = await vscode.window.showInputBox({
            title: '编辑提交信息 (Edit Commit Message)',
            prompt: '请输入新的提交描述 (git commit --amend)',
            value: msg.currentMessage,
            validateInput: (value) => {
              if (!value || !value.trim()) return '提交描述不能为空';
              return null;
            },
          });
          if (newMsg !== undefined && newMsg.trim()) {
            try {
              await this.gitService.editCommitMessage(newMsg.trim());
              vscode.window.showInformationMessage('提交信息已成功更新');
              await this.refreshData();
            } catch (err: any) {
              vscode.window.showErrorMessage(`修改提交信息失败: ${err.message}`);
            }
          }
          break;
        }

        case 'promptCreateTag': {
          const short = msg.targetHash.substring(0, 7);
          const tagName = await vscode.window.showInputBox({
            title: `基于提交 ${short} 创建标签 (New Tag)`,
            prompt: '请输入新标签名称 (如 v1.0.0)',
            placeHolder: '例如 v1.0.0',
            validateInput: (value) => {
              if (!value || !value.trim()) return '标签名称不能为空';
              if (/\s/.test(value)) return '标签名称不能包含空格';
              return null;
            },
          });
          if (tagName && tagName.trim()) {
            try {
              await this.gitService.createTag(tagName.trim(), msg.targetHash);
              vscode.window.showInformationMessage(`成功创建标签: ${tagName.trim()}`);
              await this.refreshData();
            } catch (err: any) {
              vscode.window.showErrorMessage(`创建标签失败: ${err.message}`);
            }
          }
          break;
        }

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
      const [branches, commits, repoState] = await Promise.all([
        this.gitService.getBranches(),
        this.gitService.getCommits(pageSize, undefined, 0),
        this.gitService.getRepoOperationState(),
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
        repoState,
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

  private _getConfiguredFontSize(): number {
    return vscode.workspace.getConfiguration('git-panel').get<number>('fontSize', 0) || 0;
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
    const fontSize = this._getConfiguredFontSize();
    const fontStyleOverride =
      fontSize > 0 ? `\n  <style>:root { --gp-font-size: ${fontSize}px; }</style>` : '';

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};">
  <link rel="stylesheet" href="${styleUri}">${fontStyleOverride}
  <title>Git Panel</title>
</head>
<body class="bg-vscode-bg text-vscode-fg overflow-hidden select-none m-0 p-0 font-sans">
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
