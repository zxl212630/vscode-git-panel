import * as vscode from 'vscode';
import { GitService } from './GitService';

export class GitContentProvider implements vscode.TextDocumentContentProvider {
  public static readonly scheme = 'git-panel-blob';
  private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
  public readonly onDidChange = this._onDidChange.event;

  constructor(private gitService: GitService) {}

  public static createUri(ref: string, filePath: string): vscode.Uri {
    // 构造 URI: git-panel-blob://encodeURIComponent(ref)/relativePath
    const safePath = filePath.startsWith('/') ? filePath : `/${filePath}`;
    return vscode.Uri.from({
      scheme: GitContentProvider.scheme,
      authority: encodeURIComponent(ref),
      path: safePath,
      query: `ref=${encodeURIComponent(ref)}`,
    });
  }

  public async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    const commitHash = decodeURIComponent(uri.authority);
    // 去掉开头的 /
    const filePath = uri.path.startsWith('/') ? uri.path.substring(1) : uri.path;

    if (!commitHash || commitHash === 'empty' || commitHash === '4b825dc642cb6eb9a060e54bf8d69288fbee4904') {
      return ''; // 空文件
    }

    try {
      const content = await this.gitService.getFileContentAtCommit(commitHash, filePath);
      return content;
    } catch (err: any) {
      return `// 无法读取历史提交内容: ${err?.message || err}`;
    }
  }

  public refresh(uri: vscode.Uri): void {
    this._onDidChange.fire(uri);
  }
}
