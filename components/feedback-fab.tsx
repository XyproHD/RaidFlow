export function FeedbackFab() {
  return (
    <button
      type="button"
      aria-label="Feedback und Bugreport"
      className="rf-feedback-fab fixed bottom-5 right-5 z-[70] inline-flex items-center gap-2 rounded-full border border-border bg-card/95 backdrop-blur-sm px-4 py-2.5 text-xs font-medium text-muted-foreground shadow-lg transition-all duration-200 hover:bg-card hover:text-foreground hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      data-tally-open="7R9KVa"
      data-tally-width="350"
      data-tally-hide-title="1"
      data-tally-emoji-text="🪲"
      data-tally-emoji-animation="none"
    >
      <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      Bug · Feedback
    </button>
  );
}
