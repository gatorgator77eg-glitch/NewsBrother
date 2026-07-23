import { useState, useEffect } from 'react';

interface ToastProps {
  message: string;
  type: 'error' | 'success' | 'info';
  onClose: () => void;
}

export default function Toast({ message, type, onClose }: ToastProps) {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setExiting(true);
      setTimeout(onClose, 300);
    }, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const colors = {
    error: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/30 dark:border-red-800 dark:text-red-300',
    success: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/30 dark:border-green-800 dark:text-green-300',
    info: 'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-300',
  };

  return (
    <div className={`fixed top-4 right-4 z-[60] max-w-sm border rounded-xl px-4 py-3 shadow-lg ${colors[type]} ${exiting ? 'toast-exit' : 'toast-enter'}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">{message}</p>
        <button onClick={() => { setExiting(true); setTimeout(onClose, 300); }} className="flex-shrink-0 opacity-60 hover:opacity-100">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
