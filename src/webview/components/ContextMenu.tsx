import React, { useEffect, useRef } from 'react';

export interface MenuItem {
  label?: string;
  icon?: React.ReactNode;
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

  // 调整防溢出位置
  const style: React.CSSProperties = {
    position: 'fixed',
    top: Math.min(y, window.innerHeight - (items.length * 28 + 20)),
    left: Math.min(x, window.innerWidth - 220),
    zIndex: 9999,
  };

  return (
    <div
      ref={menuRef}
      style={style}
      className="min-w-[180px] bg-vscode-sideBg border border-vscode-border rounded shadow-xl py-1 text-xs select-none"
    >
      {items.map((item, index) => {
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
            {item.icon && <span className="w-4 h-4 flex items-center justify-center">{item.icon}</span>}
            <span className="flex-1 truncate">{item.label}</span>
          </div>
        );
      })}
    </div>
  );
};
