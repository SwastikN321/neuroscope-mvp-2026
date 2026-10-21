import { useState } from 'react';
import { Link } from 'react-router';
import { Icon } from '../../components/ui/Icon';

const views = [
  {
    id: 'overview',
    title: 'Overview',
    detail:
      'Twelve synthetic channels. One shared time axis. A full recording overview.',
    alt: 'Twelve labeled synthetic EEG channels sharing a time axis and recording timeline.',
  },
  {
    id: 'channels',
    title: 'Select channels',
    detail:
      'Six channels selected from the same recording. Keep the signals relevant to your question in view.',
    alt: 'Actual workspace with Fp1, F3, C3, P3, O1 and T7 selected.',
  },
  {
    id: 'zoom',
    title: 'Zoom in',
    detail:
      'A five-second window reveals more detail without changing the underlying samples.',
    alt: 'Actual workspace zoomed from a ten-second to a five-second window.',
  },
  {
    id: 'inspect',
    title: 'Inspect a sample',
    detail:
      'C3 at 4.125 seconds. Read the original sample amplitude in microvolts.',
    alt: 'Actual workspace inspecting a C3 sample at 4.125 seconds with a microvolt readout.',
  },
  {
    id: 'timeline',
    title: 'Navigate time',
    detail:
      'The final five seconds of the two-minute demo, reached using the recording timeline.',
    alt: 'Actual workspace at 115 to 120 seconds, with its timeline at the end of the recording.',
  },
] as const;

export function ProductPreview() {
  const [selected, setSelected] = useState(1);
  const [detail, setDetail] = useState(true);
  const view = views[selected]!;
  return (
    <div className="product-demo">
      <div className="product-demo__bar">
        <span>
          <i aria-hidden="true" /> THE RESEARCH WORKSPACE
        </span>
        <span>SYNTHETIC DEMO / 256 Hz</span>
      </div>
      <div
        className="product-demo__controls"
        role="group"
        aria-label="Workspace screenshot examples"
      >
        {views.map((item, index) => (
          <button
            key={item.id}
            aria-pressed={selected === index}
            onClick={() => setSelected(index)}
          >
            <span aria-hidden="true">0{index + 1}</span>
            {item.title}
          </button>
        ))}
      </div>
      <div className="product-demo__reading-bar">
        <p>
          Actual workspace captures <span>· Synthetic EEG</span>
        </p>
        <div role="group" aria-label="Preview framing">
          <button aria-pressed={detail} onClick={() => setDetail(true)}>
            Signal detail
          </button>
          <button aria-pressed={!detail} onClick={() => setDetail(false)}>
            Full workspace
          </button>
        </div>
      </div>
      <figure>
        <div
          className={`product-demo__image${detail ? ' product-demo__image--detail' : ''}`}
        >
          <picture>
            <source
              media="(max-width: 600px)"
              srcSet={`/product/${view.id}${detail ? '-detail' : ''}-mobile.webp`}
            />
            <img
              src={`/product/${view.id}${detail ? '-detail' : ''}.webp`}
              alt={view.alt}
              width={detail ? 968 : 1392}
              height={detail ? 725 : 893}
              loading="lazy"
              decoding="async"
            />
          </picture>
        </div>
        <figcaption>
          <p aria-live="polite">{view.detail}</p>
          <a href={`/product/${view.id}.webp`} target="_blank" rel="noreferrer">
            View full-size capture <Icon name="corner" />
          </a>
        </figcaption>
      </figure>
      <div className="product-demo__footer">
        <p className="product-demo__disclosure">
          {detail
            ? 'A closer crop of the real viewer.'
            : 'The complete desktop workspace, with a responsive viewer capture on mobile.'}{' '}
          These are screenshots. Open the workspace to interact with the
          signals.
        </p>
        <Link className="marketing-link" to="/app">
          Try it yourself <Icon name="arrow" />
        </Link>
      </div>
    </div>
  );
}
