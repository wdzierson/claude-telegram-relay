export function App() {
  return (
    <div className="h-screen w-screen bg-base text-text-primary font-body">
      <div className="p-8 space-y-4">
        <h1 className="font-mono text-lg font-medium text-accent-amber">Bright OS</h1>
        <p className="text-text-secondary text-sm">Matte Industrial design system loaded.</p>
        <div className="flex gap-2">
          <span className="status-dot status-dot-live" />
          <span className="status-dot status-dot-error" />
          <span className="status-dot status-dot-idle" />
          <span className="status-dot status-dot-amber" />
        </div>
        <div className="p-3 border border-border bg-surface rounded-sm">
          <span className="font-mono text-xs text-accent-copper">Surface panel with border</span>
        </div>
      </div>
    </div>
  );
}
