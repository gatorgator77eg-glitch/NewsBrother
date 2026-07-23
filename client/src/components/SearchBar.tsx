import { useState } from 'react';

interface Props {
  onSearch: (query: string) => void;
  onBreaking: () => void;
  loading: boolean;
}

export default function SearchBar({ onSearch, onBreaking, loading }: Props) {
  const [value, setValue] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim()) {
      onSearch(value.trim());
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-3 items-center flex-wrap sm:flex-nowrap">
      <div className="flex-1 relative min-w-0">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Search topics: elections, economy, foreign policy..."
          className="w-full px-5 py-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base transition-all"
        />
        <svg className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>
      <button
        type="submit"
        disabled={loading || !value.trim()}
        className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-base whitespace-nowrap"
      >
        {loading ? 'Mapping...' : 'Map the News'}
      </button>
      <button
        type="button"
        onClick={onBreaking}
        disabled={loading}
        className="px-5 py-3 bg-red-500 text-white font-semibold rounded-xl hover:bg-red-600 disabled:opacity-50 transition-colors text-base whitespace-nowrap"
      >
        Breaking News
      </button>
    </form>
  );
}
