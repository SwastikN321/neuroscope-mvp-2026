import { ButtonLink } from '../components/ui/Button';
import { Icon } from '../components/ui/Icon';
import { SectionLabel } from '../components/ui/SectionLabel';

export function NotFoundPage() {
  return (
    <section className="not-found page-container">
      <SectionLabel number="404">OUTSIDE THE VIEW</SectionLabel>
      <h1>This signal leads elsewhere.</h1>
      <p>
        We couldn’t find that page. Return to the overview to continue exploring
        the foundation.
      </p>
      <ButtonLink to="/">
        Back to overview <Icon name="arrow" />
      </ButtonLink>
    </section>
  );
}
