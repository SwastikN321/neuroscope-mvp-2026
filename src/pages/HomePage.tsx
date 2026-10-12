import { Hero } from '../features/hero/Hero';
import { ButtonLink } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Icon } from '../components/ui/Icon';
import { SectionLabel } from '../components/ui/SectionLabel';

const colors = [
  { name: 'Midnight', value: '#06080D', className: 'swatch--midnight' },
  { name: 'Charcoal', value: '#111722', className: 'swatch--charcoal' },
  { name: 'Electric cyan', value: '#49DCEB', className: 'swatch--cyan' },
  { name: 'Neural blue', value: '#4278FF', className: 'swatch--blue' },
  { name: 'Muted violet', value: '#8E77FF', className: 'swatch--violet' },
  { name: 'Off-white', value: '#F2F3F5', className: 'swatch--white' },
] as const;

export function HomePage() {
  return (
    <>
      <Hero />

      <section
        id="design-system"
        className="foundation page-container"
        tabIndex={-1}
        aria-labelledby="foundation-heading"
      >
        <div className="foundation-intro">
          <SectionLabel number="02">THE DESIGN FOUNDATION</SectionLabel>
          <div className="foundation-intro__grid">
            <h2 id="foundation-heading">Clarity, by design.</h2>
            <p>
              Quiet surfaces. Deliberate contrast. Room to think. <br />A visual
              language built to make complex information feel approachable.
            </p>
          </div>
        </div>
        <div className="design-row design-row--palette">
          <div className="design-caption">
            <span className="technical-label">01 / PALETTE</span>
            <h3>
              Darkness. <br />
              With a purpose.
            </h3>
            <p>
              Near-black grounds the experience. Cool accents bring focus,
              without overwhelming the view.
            </p>
          </div>
          <ul className="palette" aria-label="NeuroScope color palette">
            {colors.map((color) => (
              <li key={color.name}>
                <div className={`swatch ${color.className}`} />
                <span>{color.name}</span>
                <code>{color.value}</code>
              </li>
            ))}
          </ul>
        </div>
        <div className="design-row design-row--type">
          <div className="design-caption">
            <span className="technical-label">02 / TYPOGRAPHY</span>
            <h3>
              Precision. <br />
              With personality.
            </h3>
            <p>
              Manrope pairs an expressive scale with clear, readable details.
              One family. A considered rhythm.
            </p>
          </div>
          <div className="type-specimen">
            <p className="type-specimen__large">See beyond.</p>
            <div className="type-specimen__details">
              <span>Manrope Variable</span>
              <span>Aa / 0123456789</span>
              <span>400 — 700</span>
            </div>
          </div>
        </div>
        <div className="design-row design-row--controls">
          <div className="design-caption">
            <span className="technical-label">03 / INTERACTION</span>
            <h3>
              Every detail. <br />
              Intentional.
            </h3>
            <p>
              Clear actions, visible focus, and subtle feedback. An interface
              that leaves space for the work.
            </p>
          </div>
          <div className="control-specimen">
            <div className="control-specimen__actions">
              <ButtonLink to="/app">
                Open workspace <Icon name="arrow" />
              </ButtonLink>
              <ButtonLink to="/" variant="secondary">
                Back to overview <Icon name="arrow" />
              </ButtonLink>
            </div>
            <div className="control-specimen__note">
              <Badge>Considered interaction</Badge>
              <span>Designed for keyboard, pointer, and touch.</span>
            </div>
          </div>
        </div>
      </section>
      <section
        className="next-step page-container"
        aria-labelledby="next-heading"
      >
        <div>
          <SectionLabel number="03">A SPACE TO BUILD ON</SectionLabel>
          <h2 id="next-heading">
            The beginning of <br />
            <span>something clearer.</span>
          </h2>
        </div>
        <div className="next-step__action">
          <p>
            A space for curiosity.
            <br />A foundation for discovery.
          </p>
          <ButtonLink to="/app" variant="secondary">
            Visit the workspace <Icon name="corner" />
          </ButtonLink>
        </div>
      </section>
    </>
  );
}
