import { Hero } from '../features/hero/Hero';
import { ButtonLink } from '../components/ui/Button';
import { Icon } from '../components/ui/Icon';
import { AnnotationPreview } from '../features/marketing/AnnotationPreview';
import { ProductPreview } from '../features/marketing/ProductPreview';
import { WorkflowMark } from '../features/marketing/WorkflowMark';
import { Documentation } from '../features/marketing/Documentation';
import '../features/marketing/marketing.css';

const steps = [
  [
    'Upload',
    'Open an EDF recording with the local backend, or start with the built-in synthetic demo.',
  ],
  [
    'Explore',
    'Choose channels, navigate the timeline and inspect the samples that matter.',
  ],
  [
    'Annotate',
    'Mark a point or an interval. Give your observation a label and context.',
  ],
  [
    'Export',
    'Take away a figure, original measurements or portable annotations.',
  ],
] as const;
const audiences = [
  [
    'Neuroscience researchers',
    'Move from a recording to a closer look at a moment worth investigating.',
  ],
  [
    'Computational neuroscientists',
    'Check native samples and timing before taking data into your own analysis.',
  ],
  [
    'Biomedical engineers',
    'Inspect channel behavior, amplitude ranges and recording characteristics.',
  ],
  [
    'Students & educators',
    'Explore a reproducible synthetic recording without accounts or patient data.',
  ],
  [
    'EEG & BCI developers',
    'Examine recorded inputs and export bounded windows for your development workflow.',
  ],
] as const;

export function HomePage() {
  return (
    <>
      <Hero />
      <div className="marketing-home">
        <section
          id="product"
          tabIndex={-1}
          className="product-section page-container"
          aria-labelledby="product-heading"
        >
          <div className="product-handoff" aria-hidden="true">
            <span />
            FROM THE SIGNAL. INTO YOUR WORK.
          </div>
          <div className="marketing-section-heading">
            <div>
              <p className="marketing-eyebrow">01 / THE PLATFORM</p>
              <h2 id="product-heading">
                Your EEG.
                <br />
                <span>A clearer perspective.</span>
              </h2>
            </div>
            <div className="marketing-section-heading__aside">
              <p>
                A focused space to explore recordings, examine the details and
                keep your observations connected to the signal.
              </p>
              <ButtonLink to="/app">
                Open the EEG workspace <Icon name="arrow" />
              </ButtonLink>
              <small>No account needed · Start with synthetic EEG</small>
            </div>
          </div>
          <ProductPreview />
        </section>

        <section
          id="capabilities"
          tabIndex={-1}
          className="marketing-section page-container capabilities"
          aria-labelledby="capabilities-heading"
        >
          <p className="marketing-eyebrow">02 / BUILT FOR THE WORK</p>
          <h2 id="capabilities-heading">
            The whole picture.
            <br />
            <span>The smallest detail.</span>
          </h2>
          <div className="capability-row">
            <div className="capability-copy">
              <article>
                <span>01</span>
                <div>
                  <h3>Visualize.</h3>
                  <p>
                    Open an EDF and follow its native waveforms. Select
                    channels, zoom into a moment or move across the recording.
                    Peak-preserving views keep extrema visible as you zoom out.
                  </p>
                </div>
              </article>
              <article>
                <span>02</span>
                <div>
                  <h3>Investigate.</h3>
                  <p>
                    Go from a pattern to a specific sample. Inspect original
                    amplitudes in microvolts, with channel names and timing kept
                    in context.
                  </p>
                </div>
              </article>
              <a
                className="marketing-link"
                href="/docs/research-preview.html#signals"
              >
                How signals are represented <Icon name="arrow" />
              </a>
            </div>
            <figure className="capability-image">
              <img
                src="/product/inspect-focus.webp"
                alt="Genuine synthetic C3 waveform with the sample inspector set to 4.125 seconds."
                width="968"
                height="554"
                loading="lazy"
                decoding="async"
              />
              <figcaption>
                01—02 / ORIGINAL SAMPLES, IN CONTEXT <span>Synthetic EEG</span>
              </figcaption>
            </figure>
          </div>
          <div className="capability-row capability-row--reverse">
            <div className="capability-copy">
              <article>
                <span>03</span>
                <div>
                  <h3>Annotate.</h3>
                  <p>
                    Mark a point or interval without losing its place.
                    Channel-linked annotations anchor to native samples;
                    recording-wide annotations use recording-relative seconds.
                  </p>
                </div>
              </article>
              <article>
                <span>04</span>
                <div>
                  <h3>Export.</h3>
                  <p>
                    A PNG for a visual record. CSV for native measurements. JSON
                    to carry annotations into another session. Export before you
                    leave; sessions are temporary.
                  </p>
                </div>
              </article>
              <a
                className="marketing-link"
                href="/docs/research-preview.html#exports"
              >
                Understand the export formats <Icon name="arrow" />
              </a>
            </div>
            <AnnotationPreview />
          </div>
        </section>

        <section
          id="how-it-works"
          tabIndex={-1}
          className="workflow-section"
          aria-labelledby="workflow-heading"
        >
          <div className="page-container">
            <div className="marketing-section-heading">
              <div>
                <p className="marketing-eyebrow">03 / HOW IT WORKS</p>
                <h2 id="workflow-heading">From file to finding.</h2>
              </div>
              <p>
                One continuous workflow.
                <br />
                No account between you and the demo.
              </p>
            </div>
            <ol className="workflow-steps">
              {steps.map(([title, body], i) => (
                <li key={title}>
                  <span className="workflow-number">
                    0{i + 1}
                    <Icon name="arrow" />
                  </span>
                  <WorkflowMark step={i} />
                  <h3>{title}</h3>
                  <p>{body}</p>
                </li>
              ))}
            </ol>
            <a
              href="/docs/research-preview.html#start"
              className="marketing-link"
            >
              Local setup and first steps <Icon name="arrow" />
            </a>
          </div>
        </section>

        <section
          id="use-cases"
          tabIndex={-1}
          className="marketing-section page-container audience-section"
          aria-labelledby="audience-heading"
        >
          <div>
            <p className="marketing-eyebrow">04 / WHO IT’S FOR</p>
            <h2 id="audience-heading">
              Different questions.
              <br />
              <span>A shared curiosity.</span>
            </h2>
            <p className="audience-intro">
              For people working to understand neural signals—and people
              learning where to begin.
            </p>
            <figure className="audience-study">
              <figcaption>
                <span className="marketing-eyebrow">
                  A SHARED STARTING POINT
                </span>
                <strong>Start with a known example.</strong>
                <span>Twelve channels. Two minutes. Entirely synthetic.</span>
              </figcaption>
              <img
                src="/product/study-detail.webp"
                alt="C3 and P3 traces cropped from the actual synthetic workspace at 2.5–7.5 seconds."
                width="968"
                height="146"
                loading="lazy"
                decoding="async"
              />
              <div className="audience-study__footer">
                <span>256 Hz · 2.5–7.5 s excerpt</span>
                <a className="marketing-link" href="/app">
                  Explore the demo <Icon name="arrow" />
                </a>
              </div>
            </figure>
          </div>
          <dl>
            {audiences.map(([audience, benefit], i) => (
              <div key={audience}>
                <dt>
                  <span>0{i + 1}</span>
                  {audience}
                </dt>
                <dd>{benefit}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section
          id="scientific-integrity"
          tabIndex={-1}
          className="trust-section"
          aria-labelledby="trust-heading"
        >
          <div className="page-container trust-grid">
            <div>
              <p className="marketing-eyebrow">05 / SCIENTIFIC INTEGRITY</p>
              <h2 id="trust-heading">
                Closer to the data.
                <br />
                <span>Clear about the limits.</span>
              </h2>
              <p>
                Original measurements deserve careful handling. NeuroScope’s
                decoding, timing and exports have been checked against
                independent EDF byte calculations—not only against the library
                that reads them.
              </p>
              <a
                className="marketing-link"
                href="/docs/research-preview.html#validation"
              >
                Read the validation notes <Icon name="arrow" />
              </a>
            </div>
            <div className="trust-ledger">
              <p>DATA INTEGRITY / PHASE 3D.1</p>
              <dl>
                <div>
                  <dt>Native measurements</dt>
                  <dd>Channel-specific rates. Calibrated µV values.</dd>
                </div>
                <div>
                  <dt>Precise positions</dt>
                  <dd>Original sample indexes and native clocks.</dd>
                </div>
                <div>
                  <dt>Independent checks</dt>
                  <dd>Six valid cases, including public PhysioNet data.</dd>
                </div>
                <div>
                  <dt>Transparent boundaries</dt>
                  <dd>Supported EDF formats. Explicit resource limits.</dd>
                </div>
              </dl>
              <small>
                Research preview. These checks are not clinical validation or
                evidence of diagnostic accuracy.
              </small>
            </div>
          </div>
        </section>
        <Documentation />
        <section
          className="marketing-final page-container"
          aria-labelledby="final-heading"
        >
          <p className="marketing-eyebrow">A NEW PERSPECTIVE STARTS HERE</p>
          <h2 id="final-heading">
            The brain is complex.
            <span>Exploring it shouldn’t be.</span>
          </h2>
          <div>
            <ButtonLink to="/app">
              Start Exploring <Icon name="arrow" />
            </ButtonLink>
            <ButtonLink to="/#how-it-works" variant="text">
              Learn How It Works <Icon name="arrow" />
            </ButtonLink>
          </div>
          <p>Open the synthetic demo. Follow your curiosity.</p>
        </section>
      </div>
    </>
  );
}
