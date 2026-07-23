interface Props {
  active: string | null;
  onSelect: (filter: string | null) => void;
}

const FILTERS = [
  { id: 'economy', label: 'Economy' },
  { id: 'elections', label: 'Elections' },
  { id: 'foreign-policy', label: 'Foreign Policy' },
  { id: 'healthcare', label: 'Healthcare' },
  { id: 'climate', label: 'Climate' },
  { id: 'immigration', label: 'Immigration' },
  { id: 'technology', label: 'Technology' },
];

export default function FilterPills({ active, onSelect }: Props) {
  return (
    <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
      {FILTERS.map((filter) => (
        <button
          key={filter.id}
          onClick={() => onSelect(active === filter.id ? null : filter.id)}
          className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
            active === filter.id
              ? 'bg-blue-600 text-white shadow-md'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {filter.label}
        </button>
      ))}
    </div>
  );
}
