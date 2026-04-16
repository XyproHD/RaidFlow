export function FeedbackFab() {
  return (
    <button
      type="button"
      aria-label="Feedback und Bugreport"
      className="rf-feedback-fab fixed bottom-4 right-4 z-[70] h-20 w-20 overflow-hidden rounded-full border border-amber-300/60 bg-black/90 shadow-xl transition-transform duration-300 ease-out hover:scale-110 focus-visible:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
      data-tally-open="7R9KVa"
      data-tally-width="350"
      data-tally-hide-title="1"
      data-tally-emoji-text="🪲"
      data-tally-emoji-animation="none"
    >
      <img
        src="/icons/feedback-fab.png"
        alt=""
        width={80}
        height={80}
        className="h-20 w-20 object-cover"
      />
    </button>
  );
}
