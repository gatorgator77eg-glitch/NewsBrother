import { useEffect, useCallback, useState } from 'react';

export interface MenuItem {
  id: string;
  label: string;
  icon: string;
  action: string;
  disabled?: boolean;
}

export interface MenuGroup {
  id: string;
  label: string;
  icon: string;
  children: (MenuItem | MenuGroup)[];
}

type MenuEntry = MenuItem | MenuGroup | { divider: string };

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onAction: (action: string) => void;
  aiEnabled?: boolean;
}

function isGroup(item: MenuEntry): item is MenuGroup {
  return 'children' in item && !('action' in item);
}

function isDivider(item: MenuEntry): item is { divider: string } {
  return 'divider' in item;
}

function SubGroup({ group, depth, onAction, expanded, onToggle }: {
  group: MenuGroup;
  depth: number;
  onAction: (action: string) => void;
  expanded: Set<string>;
  onToggle: (id: string) => void;
}) {
  const isExpanded = expanded.has(group.id);
  const indent = depth * 16;

  return (
    <div>
      <button
        onClick={() => onToggle(group.id)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/60 hover:text-gray-900 dark:hover:text-gray-200"
        style={{ paddingLeft: `${indent + 12}px` }}
      >
        <span className="text-sm w-5 text-center flex-shrink-0">{group.icon}</span>
        <span className="flex-1 text-left font-medium">{group.label}</span>
        <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
             fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
      {isExpanded && (
        <div className="border-l border-gray-200 dark:border-gray-700">
          {group.children.map(child => {
            if (isGroup(child)) {
              return (
                <SubGroup key={child.id} group={child} depth={depth + 1}
                  onAction={onAction} expanded={expanded} onToggle={onToggle} />
              );
            }
            return (
              <button
                key={child.id}
                onClick={() => { if (!child.disabled) { onAction(child.action); } }}
                disabled={child.disabled}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm transition-all ${
                  child.disabled
                    ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/60 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
                style={{ paddingLeft: `${indent + 28}px` }}
                title={child.disabled ? 'Coming soon' : undefined}
              >
                <span className="text-xs w-5 text-center flex-shrink-0">{child.icon}</span>
                <span className="flex-1 text-left">{child.label}</span>
                {child.disabled && (
                  <span className="text-[9px] text-gray-300 dark:text-gray-600 bg-gray-50 dark:bg-gray-700 px-1.5 py-0.5 rounded-full">Soon</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function Sidebar({ isOpen, onClose, onAction, aiEnabled }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const menu: MenuEntry[] = [
    { id: 'home', label: 'Home', icon: '🏠', action: 'home' },
    {
      id: 'news', label: 'News & Analysis', icon: '📰',
      children: [
        { id: 'briefing', label: 'Daily Briefing', icon: '📋', action: 'briefing' },
        { id: 'search', label: 'Search', icon: '🔍', action: 'search' },
        { id: 'feeds', label: 'RSS Sources', icon: '📡', action: 'feeds' },
        {
          id: 'news-analysis', label: 'Analysis', icon: '📊',
          children: [
            { id: 'coverage', label: 'Coverage', icon: '📊', action: 'coverage' },
            { id: 'events', label: 'Event Radar', icon: '🎯', action: 'events' },
            { id: 'timeline', label: 'Timeline', icon: '🕐', action: 'timeline' },
            { id: 'bias-compare', label: 'Bias Comparator', icon: '⚖️', action: 'bias-compare' },
          ],
        },
        {
          id: 'news-data', label: 'Data', icon: '📈',
          children: [
            { id: 'news-vs-price', label: 'News vs Price', icon: '📈', action: 'news-vs-price' },
            { id: 'news-archive', label: 'News Archive', icon: '🗄️', action: 'news-archive' },
            { id: 'sentiment', label: 'Sentiment', icon: '🎭', action: 'sentiment' },
          ],
        },
      ],
    },
    {
      id: 'market', label: 'Market', icon: '💰',
      children: [
        { id: 'stocks', label: 'Stock Library', icon: '📊', action: 'stocks' },
        { id: 'market-analytics', label: 'Analytics', icon: '📈', action: 'analytics' },
        { id: 'stock-advisor', label: 'Stock Advisor', icon: '🏦', action: 'stock-advisor' },
        { id: 'deep-research', label: 'Deep Research', icon: '🔬', action: 'deep-research' },
      ],
    },
    {
      id: 'intelligence', label: 'Intelligence', icon: '🔮',
      children: [
        { id: 'janus', label: 'Janus Intelligence', icon: '👁️', action: 'janus-command' },
        { id: 'correlation', label: 'Correlation', icon: '🔗', action: 'correlation' },
        {
          id: 'smart', label: 'Smart Analytics', icon: '⚡',
          children: [
            { id: 'smart-velocity', label: 'Velocity Scanner', icon: '🚀', action: 'smart-velocity' },
            { id: 'smart-impact', label: 'Impact Dashboard', icon: '💥', action: 'smart-impact' },
            { id: 'smart-leadlag', label: 'Lead-Lag', icon: '🔄', action: 'smart-leadlag' },
            { id: 'smart-heatmap', label: 'Heatmap', icon: '🌡️', action: 'smart-heatmap' },
          ],
        },
        {
          id: 'math', label: 'Math Lab', icon: '🧮',
          children: [
            { id: 'math-regression', label: 'Regression', icon: '📉', action: 'math-regression' },
            { id: 'math-correlation', label: 'Correlation', icon: '🔗', action: 'math-correlation' },
            { id: 'math-distribution', label: 'Distribution', icon: '📊', action: 'math-distribution' },
            { id: 'math-volatility', label: 'Volatility', icon: '📈', action: 'math-volatility' },
            { id: 'math-timeseries', label: 'Time Series', icon: '🕐', action: 'math-timeseries' },
            { id: 'math-advanced', label: 'Advanced', icon: '🔬', action: 'math-advanced' },
          ],
        },
        { id: 'world-map', label: 'World Map', icon: '🗺️', action: 'world-map' },
        { id: 'experimentation', label: 'Experimentation', icon: '🧪', action: 'experimentation' },
      ],
    },
    {
      id: 'srs', label: 'SRS Products', icon: '💼',
      children: [
        { id: 'srs-overview', label: 'Overview', icon: '📋', action: 'srs' },
        { id: 'srs-products', label: 'Fund Catalog', icon: '💰', action: 'srs' },
        { id: 'srs-additional', label: 'Other Products', icon: '🔗', action: 'srs' },
        { id: 'srs-dashboard', label: 'Dashboard', icon: '📊', action: 'srs-dashboard' },
        { id: 'srs-advisor', label: 'Advisor', icon: '🤖', action: 'srs-advisor' },
        { id: 'srs-signals', label: 'Signals', icon: '⚡', action: 'srs-signals' },
      ],
    },
    { divider: 'd1' },
    {
      id: 'ai', label: 'AI Intelligence', icon: '🧠',
      children: [
        { id: 'ai-chat', label: 'Analyst Chat', icon: '💬', action: 'ai-chat', disabled: !aiEnabled },
        { id: 'ai-chatbot', label: 'MCP Chatbot', icon: '🤖', action: 'ai-chatbot', disabled: !aiEnabled },
        { id: 'ai-doc', label: 'Smart Doc', icon: '📄', action: 'ai-doc', disabled: !aiEnabled },
        { id: 'ai-risk', label: 'Risk Radar', icon: '⚠️', action: 'ai-risk', disabled: !aiEnabled },
        { id: 'ai-narrative', label: 'Narrative Decoder', icon: '📰', action: 'ai-narrative', disabled: !aiEnabled },
        { id: 'ai-catalyst', label: 'Catalyst Engine', icon: '⚡', action: 'ai-catalyst', disabled: !aiEnabled },
        { id: 'ai-forecast', label: 'Sentiment Forecast', icon: '🔮', action: 'ai-forecast', disabled: !aiEnabled },
      ],
    },
    { divider: 'd2' },
    { id: 'settings', label: 'Settings', icon: '⚙️', action: 'settings' },
    { id: 'help', label: 'Help Guide', icon: '❓', action: 'help' },
  ];

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape' && isOpen) onClose();
  }, [isOpen, onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/40 z-50 transition-opacity duration-300 ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      <aside
        className={`fixed top-0 left-0 h-full w-72 bg-white dark:bg-gray-800 shadow-2xl z-50 transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 tracking-tight">Menu</h2>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-500 dark:text-gray-400"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto py-3 px-3">
            {menu.map((item) => {
              if (isDivider(item)) {
                return <div key={item.divider} className="my-2 border-t border-gray-100 dark:border-gray-700" />;
              }

              if (isGroup(item)) {
                const isExpanded = expanded.has(item.id);
                const hasOnlyGroups = item.children.every(c => isGroup(c));
                const hasOnlyActions = item.children.every(c => !isGroup(c));

                if (hasOnlyActions && item.children.length <= 4) {
                  return (
                    <div key={item.id}>
                      <button
                        onClick={() => toggle(item.id)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/60 active:scale-[0.98]"
                      >
                        <span className="text-base w-6 text-center">{item.icon}</span>
                        <span className="flex-1 text-left">{item.label}</span>
                        <svg className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                      {isExpanded && (
                        <div className="ml-4 mt-0.5 mb-1 border-l border-gray-200 dark:border-gray-700 pl-1">
                          {item.children.map(child => {
                            if (isGroup(child)) {
                              return (
                                <SubGroup key={child.id} group={child} depth={1}
                                  onAction={onAction} expanded={expanded} onToggle={toggle} />
                              );
                            }
                            return (
                              <button
                                key={child.id}
                                onClick={() => { if (!child.disabled) { onAction(child.action); onClose(); } }}
                                disabled={child.disabled}
                                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${
                                  child.disabled
                                    ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/60 hover:text-gray-900 dark:hover:text-gray-200'
                                }`}
                                title={child.disabled ? 'Coming soon' : undefined}
                              >
                                <span className="text-sm w-5 text-center">{child.icon}</span>
                                <span className="flex-1 text-left">{child.label}</span>
                                {child.disabled && (
                                  <span className="text-[10px] text-gray-300 dark:text-gray-600 bg-gray-50 dark:bg-gray-700 px-1.5 py-0.5 rounded-full">Soon</span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                }

                return (
                  <div key={item.id}>
                    <button
                      onClick={() => toggle(item.id)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/60 active:scale-[0.98]"
                    >
                      <span className="text-base w-6 text-center">{item.icon}</span>
                      <span className="flex-1 text-left">{item.label}</span>
                      <svg className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                    {isExpanded && (
                      <div className="ml-4 mt-0.5 mb-1 border-l border-gray-200 dark:border-gray-700 pl-1">
                        {item.children.map(child => {
                          if (isGroup(child)) {
                            return (
                              <SubGroup key={child.id} group={child} depth={1}
                                onAction={(a) => { onAction(a); onClose(); }}
                                expanded={expanded} onToggle={toggle} />
                            );
                          }
                          return (
                            <button
                              key={child.id}
                              onClick={() => { if (!child.disabled) { onAction(child.action); onClose(); } }}
                              disabled={child.disabled}
                              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${
                                child.disabled
                                  ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/60 hover:text-gray-900 dark:hover:text-gray-200'
                              }`}
                              title={child.disabled ? 'Coming soon' : undefined}
                            >
                              <span className="text-sm w-5 text-center">{child.icon}</span>
                              <span className="flex-1 text-left">{child.label}</span>
                              {child.disabled && (
                                <span className="text-[10px] text-gray-300 dark:text-gray-600 bg-gray-50 dark:bg-gray-700 px-1.5 py-0.5 rounded-full">Soon</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <button
                  key={item.id}
                  onClick={() => {
                    if (!item.disabled) {
                      onAction(item.action);
                      onClose();
                    }
                  }}
                  disabled={item.disabled}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    item.disabled
                      ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/60 active:scale-[0.98]'
                  }`}
                  title={item.disabled ? 'Coming soon' : undefined}
                >
                  <span className="text-base w-6 text-center">{item.icon}</span>
                  <span className="flex-1 text-left">{item.label}</span>
                  {item.disabled && (
                    <span className="text-[10px] text-gray-300 dark:text-gray-600 bg-gray-50 dark:bg-gray-700 px-1.5 py-0.5 rounded-full">Soon</span>
                  )}
                </button>
              );
            })}
          </nav>

          <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-700">
            <p className="text-[11px] text-gray-300 dark:text-gray-600">
              Analytical | Map News v1.0
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}
