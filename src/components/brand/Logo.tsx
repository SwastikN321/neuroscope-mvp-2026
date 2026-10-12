export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="logo">
      <svg
        width="32"
        height="32"
        viewBox="0 0 40 40"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M3 23h9l5-15 6 25 5-14h9"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {!compact && (
        <span className="logo__wordmark">
          neuroscope<span className="logo__period">.</span>
        </span>
      )}
    </span>
  );
}
