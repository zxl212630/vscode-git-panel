import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

export interface MenuItem {
  label?: string;
  icon?: React.ReactNode;
  shortcut?: string;
  isSeparator?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

// 与 VS Code 原生菜单（含源代码管理面板右键菜单）保持一致的主题变量与尺寸
const MENU_STYLE: React.CSSProperties = {
  backgroundColor: 'var(--vscode-menu-background, #252526)',
  color: 'var(--vscode-menu-foreground, #cccccc)',
  border: '1px solid var(--vscode-menu-border, #454545)',
  boxShadow: 'var(--vscode-menu-shadow, 0 0 8px 2px rgba(0, 0, 0, 0.36))',
  borderRadius: 'var(--vscode-cornerRadius-large, 5px)',
  fontFamily: 'var(--vscode-font-family)',
  fontSize: 'var(--vscode-font-size, 13px)',
  fontWeight: 400,
};

export const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, items, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; maxHeight: number }>({
    top: Math.max(6, Math.min(y, window.innerHeight - 200)),
    left: Math.max(6, Math.min(x, window.innerWidth - 220)),
    maxHeight: Math.max(80, window.innerHeight - 12),
  });

  // 隐藏机制与 VS Code 原生菜单一致：点击菜单外部、按 Esc、窗口失焦时关闭
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    const handleBlur = () => {
      onClose();
    };

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('blur', handleBlur);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('blur', handleBlur);
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

  const hasAnyIcon = items.some((item) => !item.isSeparator && !!item.icon);

  return (
    <div
      ref={menuRef}
      role="menu"
      style={{
        ...MENU_STYLE,
        position: 'fixed',
        top: coords.top,
        left: coords.left,
        maxHeight: coords.maxHeight,
        zIndex: 9999,
      }}
      className="min-w-[200px] max-w-[320px] overflow-y-auto p-1 select-none"
    >
      {items.map((item, index) => {
        if (item.isSeparator) {
          return (
            <div
              key={index}
              className="mx-2 my-1 h-px bg-[var(--vscode-menu-separatorBackground)]"
            />
          );
        }

        return (
          <div
            key={index}
            role="menuitem"
            aria-disabled={item.disabled}
            style={item.disabled ? { color: 'var(--vscode-disabledForeground, #8c8c8c)' } : undefined}
            className={`flex items-center h-6 pl-2 pr-3 gap-2 rounded-[3px] ${
              item.disabled
                ? 'cursor-default'
                : 'cursor-pointer hover:bg-[var(--vscode-menu-selectionBackground)] hover:text-[var(--vscode-menu-selectionForeground)]'
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
              <span className="ml-auto pl-5 flex-shrink-0 opacity-70">{item.shortcut}</span>
            )}
          </div>
        );
      })}
    </div>
  );
};
