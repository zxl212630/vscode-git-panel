/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/webview/index.html",
    "./src/webview/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        vscode: {
          bg: 'var(--vscode-editor-background, #1e1e1e)',
          fg: 'var(--vscode-editor-foreground, #cccccc)',
          sideBg: 'var(--vscode-sideBar-background, #252526)',
          panelBg: 'var(--vscode-panel-background, #1e1e1e)',
          panelBorder: 'var(--vscode-panel-border, #333333)',
          border: 'var(--vscode-widget-border, #3c3c3c)',
          hoverBg: 'var(--vscode-list-hoverBackground, #2a2d2e)',
          activeBg: 'var(--vscode-list-activeSelectionBackground, #094771)',
          activeFg: 'var(--vscode-list-activeSelectionForeground, #ffffff)',
          inputBg: 'var(--vscode-input-background, #3c3c3c)',
          inputFg: 'var(--vscode-input-foreground, #cccccc)',
          inputBorder: 'var(--vscode-input-border, #3c3c3c)',
          badgeBg: 'var(--vscode-badge-background, #4d4d4d)',
          badgeFg: 'var(--vscode-badge-foreground, #ffffff)',
          buttonBg: 'var(--vscode-button-background, #0e639c)',
          buttonHoverBg: 'var(--vscode-button-hoverBackground, #1177bb)',
          buttonFg: 'var(--vscode-button-foreground, #ffffff)',
        }
      }
    },
  },
  plugins: [],
}
