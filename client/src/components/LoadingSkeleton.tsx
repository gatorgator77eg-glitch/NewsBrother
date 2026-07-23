export default function LoadingSkeleton() {
  return (
    <div className="grid grid-5-col gap-3">
      {['Progressive / Left', 'Lean Left', 'Neutral / Wire', 'Lean Right', 'Conservative / Right'].map((label, i) => (
        <div
          key={i}
          className={`rounded-2xl p-3 min-h-[400px] ${
            i === 0 ? 'bg-blue-50/70 dark:bg-blue-950/20' :
            i === 1 ? 'bg-green-50/50 dark:bg-green-950/20' :
            i === 2 ? 'bg-gray-50/70 dark:bg-gray-800/30' :
            i === 3 ? 'bg-orange-50/50 dark:bg-orange-950/20' :
            'bg-red-50/70 dark:bg-red-950/20'
          }`}
        >
          <div className="text-center mb-4 pb-3">
            <div className="skeleton h-4 w-32 mx-auto mb-2" />
            <div className="skeleton h-3 w-16 mx-auto" />
          </div>
          <div className="space-y-3">
            {[1, 2, 3].map((j) => (
              <div key={j} className="bg-white dark:bg-gray-800 rounded-xl p-3 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <div className="skeleton h-4 w-16 rounded-full" />
                  <div className="skeleton h-3 w-12" />
                </div>
                <div className="skeleton h-4 w-full mb-1.5" />
                <div className="skeleton h-4 w-3/4 mb-2" />
                <div className="skeleton h-3 w-full mb-1" />
                <div className="skeleton h-3 w-2/3 mb-2" />
                <div className="flex items-center justify-between">
                  <div className="skeleton h-3 w-20" />
                  <div className="skeleton h-2 w-12 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
