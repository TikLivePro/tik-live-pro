/** Avatar + two-line loading placeholder for a comment/message row. */
export function CommentRowSkeleton(): React.ReactElement {
  return (
    <div className="flex items-start gap-3">
      <div className="skeleton h-8 w-8 shrink-0 rounded-full" />
      <div className="w-full space-y-1.5">
        <div className="skeleton h-3 w-24 rounded" />
        <div className="skeleton h-3 w-full rounded" />
      </div>
    </div>
  );
}
