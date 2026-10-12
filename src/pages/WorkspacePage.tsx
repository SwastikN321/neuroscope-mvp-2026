import { Badge } from '../components/ui/Badge';
import { ButtonLink } from '../components/ui/Button';
import { Icon } from '../components/ui/Icon';
import { Logo } from '../components/brand/Logo';
import { SectionLabel } from '../components/ui/SectionLabel';

const futureTools = [
  {
    number: '01',
    title: 'Visualize',
    text: 'A precise view of multichannel EEG recordings.',
  },
  {
    number: '02',
    title: 'Explore',
    text: 'Time navigation, channel controls, and close inspection.',
  },
  {
    number: '03',
    title: 'Organize',
    text: 'Annotations and a place to continue your work.',
  },
] as const;

export default function WorkspacePage() {
  return (
    <section
      className="workspace page-container"
      aria-labelledby="workspace-heading"
    >
      <div className="workspace-bar">
        <SectionLabel number="NS">WORKSPACE</SectionLabel>
        <Badge>Phase 1 placeholder</Badge>
      </div>
      <div className="workspace-empty">
        <span className="workspace-emblem" aria-hidden="true">
          <Logo compact />
        </span>
        <p className="technical-label">THE FOUNDATION IS IN PLACE</p>
        <h1 id="workspace-heading">
          Your workspace <br />
          starts here<span className="text-cyan">.</span>
        </h1>
        <p className="workspace-description">
          A considered space for exploring neural data. <br />
          This route is ready for the EEG tools we’ll build in future phases.
        </p>
        <ButtonLink to="/#design-system" variant="secondary">
          Explore the design foundation <Icon name="arrow" />
        </ButtonLink>
        <p className="workspace-limit">
          No recordings, uploads, or account connections are available in this
          phase.
        </p>
      </div>
      <div className="workspace-future">
        <div className="workspace-future__label">
          <span className="technical-label">ON THE HORIZON</span>
          <span>Planned capabilities</span>
        </div>
        <ol>
          {futureTools.map((tool) => (
            <li key={tool.number}>
              <span className="future-number">{tool.number}</span>
              <div>
                <h2>{tool.title}</h2>
                <p>{tool.text}</p>
              </div>
              <Icon name="plus" />
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
