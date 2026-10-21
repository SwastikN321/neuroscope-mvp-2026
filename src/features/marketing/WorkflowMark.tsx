/** Static process illustrations, not signal plots or additional application controls. */
export function WorkflowMark({ step }: { step: number }) {
  return (
    <div className="workflow-mark" aria-hidden="true">
      <svg
        viewBox="0 0 220 96"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      >
        {step === 0 && (
          <>
            <path d="M77 12h45l21 21v51H77z" />
            <path d="M122 12v21h21M88 62h44M88 69h28" opacity=".4" />
            <text x="88" y="51">
              EDF
            </text>
            <path d="M39 48h22m-6-6 6 6-6 6M159 48h22" opacity=".5" />
          </>
        )}
        {step === 1 && (
          <>
            <rect x="38" y="15" width="144" height="66" rx="5" opacity=".4" />
            <path
              d="M53 32h12m10 0h60M53 48h12m10 0h60M53 64h12m10 0h60"
              opacity=".6"
            />
            <rect
              x="71"
              y="23"
              width="53"
              height="50"
              rx="3"
              fill="currentColor"
              fillOpacity=".1"
            />
            <circle cx="155" cy="46" r="10" />
            <path d="m162 54 9 10" />
          </>
        )}
        {step === 2 && (
          <>
            <path d="M32 58h156M57 52v12m106-12v12" opacity=".4" />
            <rect
              x="77"
              y="24"
              width="58"
              height="49"
              rx="3"
              fill="currentColor"
              fillOpacity=".1"
            />
            <path d="M77 20v57m58-57v57M78 15h56" />
            <circle cx="51" cy="58" r="4" fill="currentColor" stroke="none" />
            <text x="84" y="52">
              NOTE
            </text>
          </>
        )}
        {step === 3 && (
          <>
            {[
              ['PNG', 24],
              ['CSV', 85],
              ['JSON', 146],
            ].map(([label, x]) => (
              <g key={label} transform={`translate(${x}, 18)`}>
                <rect width="50" height="60" rx="4" />
                <path d="M10 12h30M10 46h20" opacity=".4" />
                <text x="25" y="34" textAnchor="middle">
                  {label}
                </text>
              </g>
            ))}
          </>
        )}
      </svg>
    </div>
  );
}
