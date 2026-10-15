import * as vscode from 'vscode';
import { GitService } from './GitService';
import { GitContentProvider } from './GitContentProvider';
import { GitPanelWebviewProvider } from './GitPanelWebviewProvider';

export function activate(context: vscode.ExtensionContext) {
  const gitService = new GitService();

  // 1. 注册虚拟文档提供者（用于主编辑区对比差异）
  const contentProvider = new GitContentProvider(gitService);
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(
      GitContentProvider.scheme,
      contentProvider
    )
  );

  // 2. 注册底部 Panel 中的 Webview View Provider
  const panelProvider = new GitPanelWebviewProvider(context.extensionUri, gitService);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      GitPanelWebviewProvider.viewType,
      panelProvider,
      {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
      }
    )
  );

  // 3. 注册命令
  context.subscriptions.push(
    vscode.commands.registerCommand('git-panel.refresh', () => {
      panelProvider.refreshData();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('git-panel.openInPanel', () => {
      vscode.commands.executeCommand('git-panel.view.focus');
    })
  );
}

export function deactivate() {}
