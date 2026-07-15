interface Props {
  /** Number of pill-shaped action placeholders in the footer row; 0 omits the row. */
  pills?: number;
}

/** Title + body block + action-pills loading placeholder for a dashboard/settings card. */
export function DashboardCardSkeleton({ pills = 2 }: Props): React.ReactElement {
  return (
    <div className="card-surface space-y-3 p-4">
      <div className="skeleton h-4 w-1/3 rounded" />
      <div className="skeleton h-28 w-full rounded-lg" />
      {pills > 0 && (
        <div className="flex gap-2">
          {Array.from({ length: pills }).map((_, i) => (
            <div key={i} className="skeleton h-8 w-20 rounded-full" />
          ))}
        </div>
      )}
    </div>
  );
}
