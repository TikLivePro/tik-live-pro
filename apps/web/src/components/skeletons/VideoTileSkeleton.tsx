/** Thumbnail + title/subtitle loading placeholder for a stream session row. */
export function VideoTileSkeleton(): React.ReactElement {
  return (
    <div className="flex items-center gap-3">
      <div className="skeleton h-9 w-16 shrink-0 rounded-md" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="skeleton h-3.5 w-3/4 rounded" />
        <div className="skeleton h-3 w-1/2 rounded" />
      </div>
    </div>
  );
}
