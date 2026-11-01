export function AccountSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-28 rounded-[1.5rem] bg-muted" />
      ))}
    </div>
  );
}
