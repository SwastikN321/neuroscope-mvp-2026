import { channelNames, syntheticEEG } from './journey';

export function SignalCopy() {
  return (
    <>
      <p className="signal-eyebrow">03 / THE ELECTRICAL SIGNAL</p>
      <h2>
        Every signal
        <br />
        <span>tells a story.</span>
      </h2>
      <p className="signal-description">
        From electrical activity to meaningful exploration.
      </p>
      <p className="signal-disclosure">
        SYNTHETIC EXAMPLE EEG
        <br />
        <span>Illustrative signals. No patient recordings.</span>
      </p>
    </>
  );
}
export function SignalStill() {
  return (
    <section
      id="signal"
      className="signal-still page-container"
      aria-label="Synthetic example EEG"
    >
      <div>
        <SignalCopy />
      </div>
      <svg
        viewBox="0 0 760 420"
        role="img"
        aria-label="Six static synthetic EEG channels: Fp1, F3, C3, P3, O1 and F4"
      >
        {channelNames.map((name, channel) => (
          <g key={name}>
            <text x="8" y={48 + channel * 61}>
              {name}
            </text>
            <path
              className={`signal-trace signal-trace--${channel}`}
              d={Array.from(
                { length: 640 },
                (_, i) =>
                  `${i ? 'L' : 'M'}${(68 + (i / 639) * 685).toFixed(2)},${(44 + channel * 61 - syntheticEEG(channel, (i / 639) * 8) * 29).toFixed(2)}`,
              ).join(' ')}
            />
          </g>
        ))}
        <text x="68" y="412">
          0 s
        </text>
        <text x="712" y="412">
          8 s
        </text>
      </svg>
    </section>
  );
}
export function SignalPresentation() {
  return (
    <>
      <div className="network-caption">
        <span>02 / INSIDE THE SIGNAL</span>
        <p>A field of possibility.</p>
        <small>NEURAL ENVIRONMENT · A VISUAL METAPHOR</small>
      </div>
      <div className="signal-content page-container" inert>
        <SignalCopy />
      </div>
      <div className="signal-annotations" aria-hidden="true">
        <span className="signal-axis-label">
          6 CHANNELS / 8 SECONDS / NORMALIZED AMPLITUDE
        </span>
        {channelNames.map((name, i) => (
          <span key={name} className="signal-channel" data-signal-channel={i}>
            {name}
          </span>
        ))}
        <span className="signal-axis-end">SYNTHETIC SIGNAL STUDY — 001</span>
      </div>
      <div className="journey-meter" aria-hidden="true">
        <span>01 / SCULPTURE</span>
        <i />
        <span>03 / SIGNAL</span>
      </div>
    </>
  );
}
