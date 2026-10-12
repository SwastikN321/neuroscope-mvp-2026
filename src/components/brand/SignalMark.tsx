// A flat, decorative brand study. This is not an EEG trace or a data visualization.
export function SignalMark() {
  return (
    <div className="signal-study" aria-hidden="true">
      <div className="signal-study__top">
        <span>NS / 001</span>
        <span>IDENTITY STUDY</span>
      </div>
      <svg className="signal-study__art" viewBox="0 0 480 480" fill="none">
        <defs>
          <linearGradient
            id="signal-stroke"
            x1="50"
            y1="400"
            x2="430"
            y2="60"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#4278ff" />
            <stop offset="1" stopColor="#49dceb" />
          </linearGradient>
        </defs>
        <circle cx="240" cy="240" r="192" className="signal-ring" />
        <circle
          cx="240"
          cy="240"
          r="150"
          className="signal-ring signal-ring--inner"
        />
        <circle cx="240" cy="240" r="108" className="signal-ring" />
        <path
          d="M240 25v26M240 429v26M25 240h26M429 240h26"
          stroke="#788393"
          strokeWidth="1"
        />
        <path
          d="M77 267h97l38-124 50 204 34-104h107"
          stroke="url(#signal-stroke)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="212" cy="143" r="5" fill="#49dceb" />
        <circle cx="262" cy="347" r="4" fill="#4278ff" />
      </svg>
      <div className="signal-study__bottom">
        <span>PRECISION IN PERSPECTIVE</span>
        <span>+</span>
      </div>
    </div>
  );
}
