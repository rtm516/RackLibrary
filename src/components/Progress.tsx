/** Thin progress bar; omit `fraction` (0..1) for an indeterminate one. */
export function Progress({ fraction }: { fraction?: number }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-sm bg-surface-3">
      {fraction === undefined ? (
        <div className="h-full w-[35%] animate-indeterminate bg-accent" />
      ) : (
        <div className="h-full bg-accent transition-[width] duration-200" style={{ width: `${Math.min(1, fraction) * 100}%` }} />
      )}
    </div>
  );
}
