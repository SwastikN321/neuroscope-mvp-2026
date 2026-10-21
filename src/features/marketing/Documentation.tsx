import { Icon } from '../../components/ui/Icon';

const questions = [
  [
    'What is NeuroScope?',
    'NeuroScope is a browser-based EEG research viewer. Explore channels and original samples, add point or interval annotations, and export your observations. The cinematic brain is an artistic introduction, not a visualization of your recording or a source-localization tool.',
  ],
  [
    'What EEG formats are supported?',
    'Classical EDF and continuous EDF+C with known recording lengths and recognized voltage units. Channels keep their native sampling rates. Discontinuous EDF+D, BDF, duplicate channel names and unsupported units are rejected rather than silently changed.',
  ],
  [
    'Can I try it without an account?',
    'Yes. Open the workspace for a deterministic, twelve-channel synthetic recording. It runs in your browser without registration or a backend. To load your own EDF, run the local NeuroScope backend alongside the development frontend. EDF uploads are disabled in production builds.',
  ],
  [
    'What can I export?',
    'PNG visualizations, CSV with original sample values in microvolts, and portable annotation JSON. CSV uses each channel’s native sample indexes and clock. Annotations are session-only: export JSON before refreshing, changing recordings or leaving the workspace.',
  ],
  [
    'What are the current upload limits?',
    'The default local limit is 64 MiB per EDF, with four temporary recordings and 256 MiB total storage. CSV exports are limited to 60 seconds, 32 channels, 250,000 sample rows and 16 MiB. Oversized requests are rejected, not silently truncated.',
  ],
  [
    'Is NeuroScope intended for clinical diagnosis?',
    'No. NeuroScope is a research preview. Data-integrity checks test whether supported files are represented faithfully; they do not establish diagnostic accuracy, clinical validation or medical-device suitability.',
  ],
  [
    'How is recording privacy handled?',
    'The synthetic demo contains no patient data. In the current local setup, EDF bytes go to a backend on the same computer and are stored outside public directories in temporary storage. The default expiry is one hour; you can also delete a recording. Deletion is not secure erasure; after a crash, files may remain until the backend restarts. There is no cloud storage or account system. A future hosted service would need its own reviewed privacy and security arrangements; these local guarantees must not be assumed for it.',
  ],
] as const;

export function Documentation() {
  return (
    <section
      id="documentation"
      tabIndex={-1}
      className="marketing-section page-container documentation"
      aria-labelledby="documentation-heading"
    >
      <div className="documentation__intro">
        <p className="marketing-eyebrow">06 / DOCUMENTATION</p>
        <h2 id="documentation-heading">
          A few things
          <br />
          worth knowing.
        </h2>
        <p>Clear answers before you open a recording.</p>
        <a className="marketing-link" href="/docs/research-preview.html">
          Read the research preview guide <Icon name="arrow" />
        </a>
      </div>
      <div className="faq-list">
        {questions.map(([question, answer]) => (
          <details key={question}>
            <summary>
              {question}
              <span aria-hidden="true">+</span>
            </summary>
            <p>{answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
