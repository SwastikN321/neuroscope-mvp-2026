import { useState } from 'react';
import { Icon } from '../../components/ui/Icon';

const views = [
  {
    id: 'overview',
    title: 'Overview',
    detail:
      'Twelve synthetic channels. One shared time axis. A full recording overview.',
    alt: 'NeuroScope synthetic workspace with twelve labeled channels, metadata and a recording timeline.',
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
  const [selected, setSelected] = useState(0);
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
      <figure>
        <div className="product-demo__image">
          <picture>
            <source
              media="(max-width: 600px)"
              srcSet={`/product/${view.id}-mobile.webp`}
            />
            <img
              src={`/product/${view.id}.webp`}
              alt={view.alt}
              width="1392"
              height="893"
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
      <p className="product-demo__disclosure">
        Captured from the working application. Select an example above; open the
        workspace to interact with the signals.
      </p>
    </div>
  );
}
