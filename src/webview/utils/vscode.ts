import { WebviewMessage } from '../../common/types';

declare function acquireVsCodeApi(): {
  postMessage(message: any): void;
  getState(): any;
  setState(state: any): void;
};

class VsCodeApiWrapper {
  private vscode: any;

  constructor() {
    if (typeof acquireVsCodeApi !== 'undefined') {
      this.vscode = acquireVsCodeApi();
    } else {
      // 浏览器本地调试降级
      this.vscode = {
        postMessage: (msg: any) => console.log('postMessage:', msg),
        getState: () => ({}),
        setState: (st: any) => console.log('setState:', st),
      };
    }
  }

  public postMessage(message: WebviewMessage) {
    this.vscode.postMessage(message);
  }

  public getState<T>(): T | undefined {
    return this.vscode.getState();
  }

  public setState<T>(state: T) {
    this.vscode.setState(state);
  }
}

export const vscode = new VsCodeApiWrapper();
