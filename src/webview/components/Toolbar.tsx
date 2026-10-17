import React, { useState, useRef, useEffect, useMemo } from 'react';
import { RefreshCw, Search, ChevronRight, Calendar as CalendarIcon, ChevronLeft } from 'lucide-react';
import { GitBranch, DateRangeFilter } from '../../common/types';

interface ToolbarProps {
  searchText: string;
  onSearchChange: (text: string) => void;
  isRegex: boolean;
  onToggleRegex: () => void;
  isCaseSensitive: boolean;
  onToggleCaseSensitive: () => void;
  selectedBranch: string | null;
  onSelectBranch: (branch: string | null) => void;
  branches: GitBranch[];
  authors: string[];
  selectedAuthor: string | null;
  onSelectAuthor: (author: string | null) => void;
  dateFilter: DateRangeFilter;
  onDateFilterChange: (filter: DateRangeFilter) => void;
  onRefresh: () => void;
  isLoadingMore?: boolean;
}

// 格式化日期为 YYYY/MM/DD
const formatDateToSlash = (d: Date): string => {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}/${m}/${day}`;
};

// 解析 YYYY/MM/DD 为 Date
const parseSlashDate = (str: string): Date | null => {
  if (!str) return null;
  const parts = str.split('/');
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    const date = new Date(y, m, d);
    if (!isNaN(date.getTime())) return date;
  }
  return null;
};

export const computeDateRangeTimestamps = (
  preset: DateRangeFilter['preset'],
  customAfter?: { enabled: boolean; date: string },
  customBefore?: { enabled: boolean; date: string }
): { since?: number; until?: number } => {
  const now = new Date();
  if (preset === 'today') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0).getTime() / 1000;
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).getTime() / 1000;
    return { since: Math.floor(start), until: Math.floor(end) };
  }
  if (preset === '7d') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0).getTime() / 1000;
    return { since: Math.floor(start) };
  }
  if (preset === '30d') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29, 0, 0, 0).getTime() / 1000;
    return { since: Math.floor(start) };
  }
  if (preset === '90d') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 89, 0, 0, 0).getTime() / 1000;
    return { since: Math.floor(start) };
  }
  if (preset === 'custom') {
    let since: number | undefined;
    let until: number | undefined;
    if (customAfter?.enabled && customAfter.date) {
      const s = new Date(customAfter.date.replace(/\//g, '-') + 'T00:00:00');
      if (!isNaN(s.getTime())) since = Math.floor(s.getTime() / 1000);
    }
    if (customBefore?.enabled && customBefore.date) {
      const e = new Date(customBefore.date.replace(/\//g, '-') + 'T23:59:59');
      if (!isNaN(e.getTime())) until = Math.floor(e.getTime() / 1000);
    }
    return { since, until };
  }
  return {};
};

// 内置轻量级月历组件，100% 规避 Webview 沙箱权限限制
interface MiniCalendarProps {
  currentDateStr: string;
  onSelect: (dateStr: string) => void;
  onClose: () => void;
  align?: 'left' | 'right';
}

const MiniCalendar: React.FC<MiniCalendarProps> = ({ currentDateStr, onSelect, onClose, align = 'left' }) => {
  const initialDate = parseSlashDate(currentDateStr) || new Date();
  const [viewYear, setViewYear] = useState<number>(initialDate.getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(initialDate.getMonth()); // 0-11

  const today = new Date();
  const todayStr = formatDateToSlash(today);

  // 计算当月天数及第一天星期几
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay(); // 0 is Sunday

  const prevMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (viewMonth === 0) {
      setViewYear(viewYear - 1);
      setViewMonth(11);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const nextMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (viewMonth === 11) {
      setViewYear(viewYear + 1);
      setViewMonth(0);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  const monthNames = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];

  return (
    <>
      <div className="fixed inset-0 z-[75]" onClick={onClose} />
      <div
        className={`absolute top-full mt-1.5 ${
          align === 'right' ? 'right-0' : 'left-0'
        } z-[80] bg-[#2b2b2b] border border-[#555] rounded-md shadow-2xl p-2.5 w-[210px] text-gp select-none`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部：切换年月 */}
        <div className="flex items-center justify-between mb-2 px-1">
          <button
            className="p-1 hover:bg-[#383838] rounded text-gray-300 hover:text-white"
            onClick={prevMonth}
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <span className="font-semibold text-gray-200 text-gp">
            {monthNames[viewMonth]} {viewYear}
          </span>
          <button
            className="p-1 hover:bg-[#383838] rounded text-gray-300 hover:text-white"
            onClick={nextMonth}
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* 星期标题 */}
        <div className="grid grid-cols-7 gap-1 text-center text-gray-400 text-[11px] mb-1 font-mono">
          <span>Su</span>
          <span>Mo</span>
          <span>Tu</span>
          <span>We</span>
          <span>Th</span>
          <span>Fr</span>
          <span>Sa</span>
        </div>

        {/* 日期格子 */}
        <div className="grid grid-cols-7 gap-1 text-center text-gp-sm">
          {Array.from({ length: firstDayOfWeek }).map((_, i) => (
            <div key={`empty-${i}`} />
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const dayNum = i + 1;
            const itemDate = new Date(viewYear, viewMonth, dayNum);
            const itemStr = formatDateToSlash(itemDate);
            const isSelected = itemStr === currentDateStr;
            const isToday = itemStr === todayStr;

            return (
              <button
                key={dayNum}
                className={`w-6 h-6 rounded flex items-center justify-center font-mono leading-none transition-colors ${
                  isSelected
                    ? 'bg-blue-600 text-white font-bold'
                    : isToday
                    ? 'border border-blue-500/60 text-blue-400 hover:bg-[#383838]'
                    : 'text-gray-300 hover:bg-[#383838] hover:text-white'
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(itemStr);
                }}
              >
                {dayNum}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
};

export const Toolbar: React.FC<ToolbarProps> = ({
  searchText,
  onSearchChange,
  isRegex,
  onToggleRegex,
  isCaseSensitive,
  onToggleCaseSensitive,
  selectedBranch,
  onSelectBranch,
  branches,
  authors,
  selectedAuthor,
  onSelectAuthor,
  dateFilter,
  onDateFilterChange,
  onRefresh,
  isLoadingMore,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // 阶梯式渐进折叠（从右往左依次收起：Date -> User -> Branch）：
  // 0: 全部平铺展示 (>= 560px)
  // 1: 收起 Date (440px ~ 559px)
  // 2: 收起 User 和 Date (330px ~ 439px)
  // 3: 收起 Branch、User、Date，主行仅保留搜索框与刷新 (< 330px)
  const [collapseLevel, setCollapseLevel] = useState<0 | 1 | 2 | 3>(0);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  // 跨平台识别（macOS vs Windows）
  const isMac = useMemo(() => {
    return typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent || navigator.platform);
  }, []);

  // 自定义日期选择弹窗（Select Period）
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const todayStr = formatDateToSlash(new Date());
  const [afterChecked, setAfterChecked] = useState<boolean>(dateFilter.afterEnabled ?? false);
  const [afterDateStr, setAfterDateStr] = useState<string>(dateFilter.afterDate || todayStr);
  const [beforeChecked, setBeforeChecked] = useState<boolean>(dateFilter.beforeEnabled ?? false);
  const [beforeDateStr, setBeforeDateStr] = useState<string>(dateFilter.beforeDate || todayStr);

  // 弹窗拖拽位置
  const [modalPos, setModalPos] = useState<{ x: number; y: number } | null>(null);
  const isDraggingModal = useRef<{ startX: number; startY: number; initPosX: number; initPosY: number } | null>(null);

  // 当前展开的月历选择器
  const [activePicker, setActivePicker] = useState<'after' | 'before' | null>(null);

  // 监听容器宽度，精准做从右往左的阶梯折叠
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        if (w >= 680) {
          setCollapseLevel(0);
        } else if (w >= 520) {
          setCollapseLevel(1);
        } else if (w >= 360) {
          setCollapseLevel(2);
        } else {
          setCollapseLevel(3);
        }
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // 当弹窗打开时居中
  const openCustomModal = () => {
    setAfterChecked(dateFilter.afterEnabled ?? false);
    setAfterDateStr(dateFilter.afterDate || todayStr);
    setBeforeChecked(dateFilter.beforeEnabled ?? false);
    setBeforeDateStr(dateFilter.beforeDate || todayStr);
    setActivePicker(null);

    // 默认居中
    const initX = Math.max(20, Math.floor((window.innerWidth - 440) / 2));
    const initY = Math.max(40, Math.floor((window.innerHeight - 200) / 3));
    setModalPos({ x: initX, y: initY });
    setIsModalOpen(true);
  };

  // 监听 ESC 键关闭月历或弹窗
  useEffect(() => {
    if (!isModalOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (activePicker) {
          setActivePicker(null);
        } else {
          setIsModalOpen(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isModalOpen, activePicker]);

  // 弹窗标题栏拖拽处理
  const handleTitleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    const currentX = modalPos ? modalPos.x : Math.max(20, Math.floor((window.innerWidth - 440) / 2));
    const currentY = modalPos ? modalPos.y : Math.max(40, Math.floor((window.innerHeight - 200) / 3));

    isDraggingModal.current = {
      startX: e.clientX,
      startY: e.clientY,
      initPosX: currentX,
      initPosY: currentY,
    };
    document.body.style.cursor = 'move';
    document.body.style.userSelect = 'none';
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingModal.current) return;
      const dx = e.clientX - isDraggingModal.current.startX;
      const dy = e.clientY - isDraggingModal.current.startY;
      const maxX = Math.max(0, window.innerWidth - 440);
      const maxY = Math.max(0, window.innerHeight - 150);
      const nextX = Math.max(0, Math.min(isDraggingModal.current.initPosX + dx, maxX));
      const nextY = Math.max(0, Math.min(isDraggingModal.current.initPosY + dy, maxY));
      setModalPos({ x: nextX, y: nextY });
    };

    const handleMouseUp = () => {
      if (isDraggingModal.current) {
        isDraggingModal.current = null;
        document.body.style.cursor = 'default';
        document.body.style.userSelect = 'auto';
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const handlePresetSelect = (val: string) => {
    if (val === 'custom') {
      openCustomModal();
      return;
    }
    const preset = val as DateRangeFilter['preset'];
    const { since, until } = computeDateRangeTimestamps(preset);
    onDateFilterChange({
      preset,
      since,
      until,
      afterEnabled: false,
      beforeEnabled: false,
    });
  };

  const handleModalConfirm = () => {
    // 两个日期都是可选，不是必选
    if (!afterChecked && !beforeChecked) {
      onDateFilterChange({ preset: 'all' });
      setIsModalOpen(false);
      return;
    }

    const { since, until } = computeDateRangeTimestamps('custom', {
      enabled: afterChecked,
      date: afterDateStr,
    }, {
      enabled: beforeChecked,
      date: beforeDateStr,
    });

    onDateFilterChange({
      preset: 'custom',
      since,
      until,
      afterEnabled: afterChecked,
      afterDate: afterDateStr,
      beforeEnabled: beforeChecked,
      beforeDate: beforeDateStr,
    });
    setIsModalOpen(false);
  };

  // 搜索框组
  const searchGroup = (
    <div className="flex items-center bg-vscode-inputBg text-vscode-inputFg border border-vscode-inputBorder rounded px-1.5 py-0.5 flex-1 min-w-[90px] max-w-[220px]">
      <Search className="w-3 h-3 opacity-50 mr-1 flex-shrink-0" />
      <input
        type="text"
        className="w-full bg-transparent outline-none text-gp placeholder:opacity-50 min-w-0"
        placeholder="Text or hash"
        value={searchText}
        onChange={(e) => onSearchChange(e.target.value)}
      />
      <button
        className={`ml-1 px-1 rounded text-gp-sm font-mono leading-none flex-shrink-0 ${
          isRegex ? 'bg-vscode-buttonBg text-white' : 'opacity-40 hover:opacity-100'
        }`}
        onClick={onToggleRegex}
        title="使用正则表达式"
      >
        .*
      </button>
      <button
        className={`ml-0.5 px-1 rounded text-gp-sm font-mono leading-none flex-shrink-0 ${
          isCaseSensitive ? 'bg-vscode-buttonBg text-white' : 'opacity-40 hover:opacity-100'
        }`}
        onClick={onToggleCaseSensitive}
        title="匹配大小写"
      >
        Cc
      </button>
    </div>
  );

  // 分支筛选
  const branchGroup = (
    <div className="flex items-center gap-1 flex-shrink-0">
      <span className="opacity-60 text-gp-sm">Branch:</span>
      <select
        className="bg-vscode-inputBg text-vscode-inputFg border border-vscode-inputBorder rounded px-1.5 py-0.5 text-gp outline-none max-w-[130px] truncate cursor-pointer"
        value={selectedBranch || ''}
        onChange={(e) => onSelectBranch(e.target.value || null)}
      >
        <option value="">All</option>
        {branches.map((b) => (
          <option key={b.fullName} value={b.name}>
            {b.isHead ? `* ${b.name}` : b.name}
          </option>
        ))}
      </select>
    </div>
  );

  // 用户筛选
  const userGroup = (
    <div className="flex items-center gap-1 flex-shrink-0">
      <span className="opacity-60 text-gp-sm">User:</span>
      <select
        className="bg-vscode-inputBg text-vscode-inputFg border border-vscode-inputBorder rounded px-1.5 py-0.5 text-gp outline-none max-w-[120px] truncate cursor-pointer"
        value={selectedAuthor || ''}
        onChange={(e) => onSelectAuthor(e.target.value || null)}
      >
        <option value="">All</option>
        {authors.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>
    </div>
  );

  // 自定义生效时的文字（参考图3）
  const renderCustomDateText = () => {
    if (dateFilter.afterEnabled && dateFilter.beforeEnabled) {
      return `${dateFilter.afterDate}-${dateFilter.beforeDate}`;
    }
    if (dateFilter.afterEnabled) {
      return `After ${dateFilter.afterDate}`;
    }
    if (dateFilter.beforeEnabled) {
      return `Before ${dateFilter.beforeDate}`;
    }
    return '';
  };

  const isCustomActive = dateFilter.preset === 'custom' && (dateFilter.afterEnabled || dateFilter.beforeEnabled);

  // 日期范围过滤
  const dateGroup = (
    <div className="flex items-center gap-1 flex-shrink-0">
      {isCustomActive ? (
        // 选完后按图3显示：Date: 2026/10/15-2026/10/17 ✕
        <div className="flex items-center gap-1 text-gp">
          <span className="opacity-60 text-gp-sm">Date:</span>
          <span
            className="cursor-pointer font-medium hover:underline text-vscode-fg"
            onClick={openCustomModal}
            title="点击修改日期范围"
          >
            {renderCustomDateText()}
          </span>
          <button
            className="opacity-50 hover:opacity-100 hover:text-red-400 px-0.5 leading-none"
            onClick={() => onDateFilterChange({ preset: 'all' })}
            title="清除日期范围过滤"
          >
            ✕
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <span className="opacity-60 text-gp-sm">Date:</span>
          <select
            className="bg-vscode-inputBg text-vscode-inputFg border border-vscode-inputBorder rounded px-1.5 py-0.5 text-gp outline-none cursor-pointer max-w-[120px]"
            value={dateFilter.preset}
            onChange={(e) => handlePresetSelect(e.target.value)}
          >
            <option value="all">All</option>
            <option value="today">Today</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="90d">Last 3 Months</option>
            <option value="custom">Custom...</option>
          </select>
        </div>
      )}
    </div>
  );

  return (
    <div ref={containerRef} className="border-b border-vscode-border bg-vscode-panelBg text-gp select-none flex-shrink-0">
      {/* 主栏行 */}
      <div className="flex items-center px-2 py-1 gap-2">
        {searchGroup}

        {/* Level 0: 全部平铺展示 */}
        {collapseLevel === 0 && (
          <>
            {branchGroup}
            {userGroup}
            {dateGroup}
          </>
        )}

        {/* Level 1: 收起 Date */}
        {collapseLevel === 1 && (
          <>
            {branchGroup}
            {userGroup}
          </>
        )}

        {/* Level 2: 收起 User 和 Date */}
        {collapseLevel === 2 && (
          <>
            {branchGroup}
          </>
        )}

        {/* Level 3 (< 360px 极窄): Branch、User、Date 全部收起进二级行 */}

        {/* 右侧固定操作区：折叠按钮 + 刷新按钮，靠右且绝不收缩丢失 */}
        <div className="flex items-center gap-1.5 flex-shrink-0 ml-auto">
          {collapseLevel > 0 && (
            <button
              className={`flex items-center justify-center border border-vscode-inputBorder rounded px-1.5 py-1 text-vscode-fg opacity-80 hover:opacity-100 hover:bg-vscode-hoverBg transition-colors ${
                isExpanded ? 'bg-vscode-hoverBg border-vscode-buttonBg' : 'bg-vscode-inputBg'
              }`}
              onClick={() => setIsExpanded(!isExpanded)}
              title={isExpanded ? '收起附加筛选' : '展开更多筛选'}
            >
              <ChevronRight
                className={`w-3.5 h-3.5 transition-transform duration-150 ${
                  isExpanded ? 'rotate-90' : ''
                }`}
              />
            </button>
          )}

          <button
            className="p-1 hover:bg-vscode-hoverBg rounded text-vscode-fg opacity-80 hover:opacity-100 flex-shrink-0"
            onClick={onRefresh}
            title="刷新提交历史"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingMore ? 'animate-spin text-blue-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* 展开的次级工具栏：从右往左收起的项在此展示 */}
      {collapseLevel > 0 && isExpanded && (
        <div className="flex items-center px-2 py-1 gap-3 border-t border-vscode-border/50 bg-vscode-sideBg/50 flex-wrap">
          {collapseLevel === 3 && branchGroup}
          {collapseLevel >= 2 && userGroup}
          {dateGroup}
        </div>
      )}

      {/* 自定义日期选择弹窗（Select Period，支持按住标题栏拖动，兼容 Mac & Windows 样式） */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 select-none">
          <div
            style={{
              position: 'fixed',
              left: modalPos ? `${modalPos.x}px` : 'calc(50vw - 220px)',
              top: modalPos ? `${modalPos.y}px` : '120px',
            }}
            className="bg-[#252526] text-vscode-fg border border-[#454545] rounded-lg shadow-2xl w-[440px] max-w-[95vw]"
          >
            {/* 顶栏：可按住拖动；Mac/Windows 风格适配 */}
            <div
              className="relative flex items-center justify-between px-3 h-8 bg-[#2d2d2d] border-b border-[#3c3c3c] rounded-t-lg cursor-move select-none"
              onMouseDown={handleTitleMouseDown}
            >
              {isMac ? (
                // macOS 风格：左侧三圆点，居中标题
                <>
                  <div className="flex items-center gap-1.5 z-10">
                    <button
                      className="w-3 h-3 rounded-full bg-[#ff5f56] hover:opacity-80 transition-opacity"
                      onClick={() => setIsModalOpen(false)}
                      title="Close"
                    />
                    <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
                    <div className="w-3 h-3 rounded-full bg-[#27c93f]" />
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none font-semibold text-gp text-gray-200">
                    Select Period
                  </div>
                </>
              ) : (
                // Windows 风格：居左标题，右上角控制按钮
                <>
                  <div className="font-semibold text-gp text-gray-200 pointer-events-none">
                    Select Period
                  </div>
                  <div className="flex items-center h-full -mr-3">
                    <div className="w-9 h-full flex items-center justify-center text-gray-500 text-xs">─</div>
                    <div className="w-9 h-full flex items-center justify-center text-gray-500 text-xs">□</div>
                    <button
                      className="w-10 h-full flex items-center justify-center text-gray-300 hover:bg-[#e81123] hover:text-white transition-colors"
                      onClick={() => setIsModalOpen(false)}
                      title="Close"
                    >
                      ✕
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* 表单内容区：After 与 Before */}
            <div className="p-4 flex items-center justify-center gap-5 text-gp">
              {/* After */}
              <div className="flex items-center gap-1.5 relative">
                <input
                  type="checkbox"
                  id="after-checkbox"
                  className="cursor-pointer"
                  checked={afterChecked}
                  onChange={(e) => setAfterChecked(e.target.checked)}
                />
                <label htmlFor="after-checkbox" className="cursor-pointer text-gp font-medium text-gray-300">
                  After
                </label>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    className="bg-[#1e1e1e] border border-[#3c3c3c] rounded px-2 py-0.5 text-gp text-center w-[100px] outline-none font-mono"
                    value={afterDateStr}
                    onChange={(e) => {
                      setAfterDateStr(e.target.value);
                      setAfterChecked(true);
                    }}
                    onClick={() => setActivePicker(activePicker === 'after' ? null : 'after')}
                  />
                  <button
                    className="border border-[#3c3c3c] bg-[#2a2a2a] hover:bg-[#383838] rounded px-1.5 py-1 ml-1 text-gray-400 hover:text-white"
                    title="选择日期"
                    onClick={() => setActivePicker(activePicker === 'after' ? null : 'after')}
                  >
                    <CalendarIcon className="w-3 h-3" />
                  </button>

                  {/* 内置日历选择器 */}
                  {activePicker === 'after' && (
                    <MiniCalendar
                      currentDateStr={afterDateStr}
                      align="left"
                      onSelect={(newDate) => {
                        setAfterDateStr(newDate);
                        setAfterChecked(true);
                        setActivePicker(null);
                      }}
                      onClose={() => setActivePicker(null)}
                    />
                  )}
                </div>
              </div>

              {/* Before */}
              <div className="flex items-center gap-1.5 relative">
                <input
                  type="checkbox"
                  id="before-checkbox"
                  className="cursor-pointer"
                  checked={beforeChecked}
                  onChange={(e) => setBeforeChecked(e.target.checked)}
                />
                <label htmlFor="before-checkbox" className="cursor-pointer text-gp font-medium text-gray-300">
                  Before
                </label>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    className="bg-[#1e1e1e] border border-[#3c3c3c] rounded px-2 py-0.5 text-gp text-center w-[100px] outline-none font-mono"
                    value={beforeDateStr}
                    onChange={(e) => {
                      setBeforeDateStr(e.target.value);
                      setBeforeChecked(true);
                    }}
                    onClick={() => setActivePicker(activePicker === 'before' ? null : 'before')}
                  />
                  <button
                    className="border border-[#3c3c3c] bg-[#2a2a2a] hover:bg-[#383838] rounded px-1.5 py-1 ml-1 text-gray-400 hover:text-white"
                    title="选择日期"
                    onClick={() => setActivePicker(activePicker === 'before' ? null : 'before')}
                  >
                    <CalendarIcon className="w-3 h-3" />
                  </button>

                  {/* 内置日历选择器 */}
                  {activePicker === 'before' && (
                    <MiniCalendar
                      currentDateStr={beforeDateStr}
                      align="right"
                      onSelect={(newDate) => {
                        setBeforeDateStr(newDate);
                        setBeforeChecked(true);
                        setActivePicker(null);
                      }}
                      onClose={() => setActivePicker(null)}
                    />
                  )}
                </div>
              </div>
            </div>

            {/* 底部按钮区 */}
            <div className="flex justify-end px-4 py-2 bg-[#2d2d2d] border-t border-[#3c3c3c] rounded-b-lg">
              <button
                className="bg-[#0e639c] hover:bg-[#1177bb] text-white px-5 py-1 rounded text-gp font-medium shadow transition-colors"
                onClick={handleModalConfirm}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
