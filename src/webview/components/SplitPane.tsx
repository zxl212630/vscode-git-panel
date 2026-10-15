import React, { useState, useRef, useEffect, ReactNode } from 'react';

interface SplitPaneProps {
  left: ReactNode;
  center: ReactNode;
  right: ReactNode;
  defaultLeftWidth?: number;
  defaultRightWidth?: number;
  minLeftWidth?: number;
  minRightWidth?: number;
}

export const SplitPane: React.FC<SplitPaneProps> = ({
  left,
  center,
  right,
  defaultLeftWidth = 220,
  defaultRightWidth = 320,
  minLeftWidth = 140,
  minRightWidth = 180,
}) => {
  const [leftWidth, setLeftWidth] = useState<number>(() => {
    const saved = localStorage.getItem('git_panel_left_width');
    return saved ? parseInt(saved, 10) : defaultLeftWidth;
  });

  const [rightWidth, setRightWidth] = useState<number>(() => {
    const saved = localStorage.getItem('git_panel_right_width');
    return saved ? parseInt(saved, 10) : defaultRightWidth;
  });

  const isDraggingLeft = useRef(false);
  const isDraggingRight = useRef(false);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingLeft.current) {
        const newWidth = Math.max(minLeftWidth, Math.min(e.clientX, 500));
        setLeftWidth(newWidth);
        localStorage.setItem('git_panel_left_width', newWidth.toString());
      } else if (isDraggingRight.current) {
        const newWidth = Math.max(minRightWidth, Math.min(window.innerWidth - e.clientX, 750));
        setRightWidth(newWidth);
        localStorage.setItem('git_panel_right_width', newWidth.toString());
      }
    };

    const handleMouseUp = () => {
      isDraggingLeft.current = false;
      isDraggingRight.current = false;
      document.body.style.cursor = 'default';
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [minLeftWidth, minRightWidth]);

  return (
    <div className="flex h-full w-full overflow-hidden select-none bg-vscode-bg text-vscode-fg">
      {/* 左栏 */}
      <div style={{ width: leftWidth }} className="flex-shrink-0 h-full overflow-hidden flex flex-col border-r border-vscode-border">
        {left}
      </div>

      {/* 左侧分栏拖拽条 */}
      <div
        className="w-[3px] hover:w-[4px] bg-vscode-border hover:bg-vscode-buttonBg cursor-col-resize flex-shrink-0 transition-colors z-10"
        onMouseDown={(e) => {
          e.preventDefault();
          isDraggingLeft.current = true;
          document.body.style.cursor = 'col-resize';
        }}
      />

      {/* 中栏 */}
      <div className="flex-1 h-full min-w-0 overflow-hidden flex flex-col">
        {center}
      </div>

      {/* 右侧分栏拖拽条 */}
      <div
        className="w-[3px] hover:w-[4px] bg-vscode-border hover:bg-vscode-buttonBg cursor-col-resize flex-shrink-0 transition-colors z-10"
        onMouseDown={(e) => {
          e.preventDefault();
          isDraggingRight.current = true;
          document.body.style.cursor = 'col-resize';
        }}
      />

      {/* 右栏 */}
      <div style={{ width: rightWidth }} className="flex-shrink-0 h-full overflow-hidden flex flex-col border-l border-vscode-border">
        {right}
      </div>
    </div>
  );
};
