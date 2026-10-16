import React, { useEffect, useRef } from 'react';

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

  const isNothingHere = items.length === 1 && items[0].label === 'Nothing here';

  // 调整防溢出位置
  const style: React.CSSProperties = {
    position: 'fixed',
    top: Math.min(y, window.innerHeight - (items.length * 28 + 20)),
    left: Math.min(x, window.innerWidth - (isNothingHere ? 120 : 240)),
    zIndex: 9999,
  };

  const hasAnyIcon = items.some((item) => !item.isSeparator && !!item.icon);

  return (
    <div
      ref={menuRef}
      style={style}
      className={
        isNothingHere
          ? 'px-4 py-1.5 rounded-lg bg-[#2b2d30] border border-[#393b40] shadow-2xl text-xs text-gray-200 font-medium select-none text-center min-w-[90px]'
          : 'min-w-[200px] bg-vscode-sideBg border border-vscode-border rounded shadow-xl py-1 text-xs select-none'
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
                <span className="text-[10px] opacity-40 ml-4 font-mono font-normal flex-shrink-0">
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
