import { useEffect, useCallback } from 'react';

export interface MenuItem {
  id: string;
  label: string;
  icon: string;
  action: string;
  disabled?: boolean;
  divider?: boolean;
}

const MENU_ITEMS: MenuItem[] = [
  { id: 'home', label: 'Home', icon: '🏠', action: 'home' },
  { id: 'search', label: 'Search', icon: '🔍', action: 'search' },
  { id: 'feeds', label: 'RSS Sources', icon: '📡', action: 'feeds' },
  { id: 'coverage', label: 'Coverage', icon: '📊', action: 'coverage' },
  { id: 'events', label: 'Event Radar', icon: '🎯', action: 'events' },
  { id: 'stocks', label: 'Stock Library', icon: '📈', action: 'stocks' },
  { id: 'analytics', label: 'Market Analytics', icon: '🔍', action: 'analytics' },
  { id: 'news-vs-price', label: 'News vs Price', icon: '📰', action: 'news-vs-price' },
  { id: 'divider-1', label: '', icon: '', action: '', divider: true },
  { id: 'bookmarks', label: 'Bookmarks', icon: '🔖', action: 'bookmarks', disabled: true },
  { id: 'history', label: 'History', icon: '🕐', action: 'history', disabled: true },
  { id: 'saved-searches', label: 'Saved Searches', icon: '💾', action: 'saved-searches', disabled: true },
  { id: 'divider-2', label: '', icon: '', action: '', divider: true },
  { id: 'settings', label: 'Settings', icon: '⚙️', action: 'settings' },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onAction: (action: string) => void;
}

export default function Sidebar({ isOpen, onClose, onAction }: Props) {
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
            {MENU_ITEMS.map((item) => {
              if (item.divider) {
                return <div key={item.id} className="my-2 border-t border-gray-100 dark:border-gray-700" />;
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
                    <span className="text-[10px] text-gray-300 dark:text-gray-600 bg-gray-50 dark:bg-gray-700 px-1.5 py-0.5 rounded-full">
                      Soon
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-700">
            <p className="text-[11px] text-gray-300 dark:text-gray-600">
              Political | Map News v1.0
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}
