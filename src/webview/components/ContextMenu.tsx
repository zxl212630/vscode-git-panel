import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

export interface MenuItem {
  label?: string;
  icon?: React.ReactNode;
  shortcut?: string;
  isSeparator?: boolean;
  disabled?: boolean;
  danger?: boolean;
  onClick?: () => void;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, items, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; maxHeight: number }>({
    top: Math.max(6, Math.min(y, window.innerHeight - 200)),
    left: Math.max(6, Math.min(x, window.innerWidth - 220)),
    maxHeight: Math.max(80, window.innerHeight - 12),
  });

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // 精准自适应视口定位：优先向下，放不下则向上；窗口极矮时贴顶并不超出视口，开启平滑滚动
  useLayoutEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const menuWidth = rect.width;
    const menuHeight = rect.height;
    const vh = window.innerHeight;
    const vw = window.innerWidth;

    // 默认向下弹
    let top = y;
    if (top + menuHeight > vh - 6) {
      // 底部放不下，尝试向上弹
      const topUp = y - menuHeight;
      if (topUp >= 6) {
        top = topUp;
      } else {
        // 上下都放不下（窗口比菜单矮），贴顶 6px 显示
        top = 6;
      }
    }

    // 水平方向防溢出
    let left = x;
    if (left + menuWidth > vw - 6) {
      left = Math.max(6, vw - menuWidth - 6);
    }
    if (left < 6) {
      left = 6;
    }

    // 最大高度限制，确保永不溢出底部可视区
    const maxHeight = Math.max(80, vh - top - 6);

    setCoords({ top, left, maxHeight });
  }, [x, y, items]);

  const isNothingHere = items.length === 1 && items[0].label === 'Nothing here';
  const hasAnyIcon = items.some((item) => !item.isSeparator && !!item.icon);

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        top: coords.top,
        left: coords.left,
        maxHeight: coords.maxHeight,
        zIndex: 9999,
      }}
      className={
        isNothingHere
          ? 'px-4 py-1.5 rounded-lg bg-[#2b2d30] border border-[#393b40] shadow-2xl text-gp text-gray-200 font-medium select-none text-center min-w-[90px]'
          : 'min-w-[200px] max-w-[320px] overflow-y-auto bg-vscode-sideBg border border-vscode-border rounded shadow-xl py-1 text-gp select-none'
      }
    >
      {isNothingHere ? (
        <span>{items[0].label}</span>
      ) : (
        items.map((item, index) => {
          if (item.isSeparator) {
            return <div key={index} className="my-1 border-t border-vscode-border opacity-60" />;
          }

          return (
            <div
              key={index}
              className={`flex items-center px-3 py-1.5 cursor-pointer gap-2 transition-colors ${
                item.disabled
                  ? 'opacity-40 cursor-not-allowed'
                  : item.danger
                  ? 'hover:bg-red-600 hover:text-white text-red-400'
                  : 'hover:bg-vscode-activeBg hover:text-vscode-activeFg text-vscode-fg'
              }`}
              onClick={() => {
                if (!item.disabled && item.onClick) {
                  item.onClick();
                  onClose();
                }
              }}
            >
              {item.icon ? (
                <span className="w-4 h-4 flex items-center justify-center flex-shrink-0">{item.icon}</span>
              ) : hasAnyIcon ? (
                <span className="w-4 h-4 flex-shrink-0" />
              ) : null}
              <span className="flex-1 truncate">{item.label}</span>
              {item.shortcut && (
                <span className="text-gp-sm opacity-40 ml-4 font-mono font-normal flex-shrink-0">
                  {item.shortcut}
                </span>
              )}
            </div>
          );
        })
      )}
    </div>
  );
};
