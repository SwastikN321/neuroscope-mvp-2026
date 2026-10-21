import { useState } from 'react';
export function AnnotationPreview() {
  const [exporting, setExporting] = useState(false);
  return (
    <figure className="capability-image">
      <div
        className="product-demo__controls"
        role="group"
        aria-label="Annotation and export screenshots"
      >
        <button aria-pressed={!exporting} onClick={() => setExporting(false)}>
          Annotate an interval
        </button>
        <button aria-pressed={exporting} onClick={() => setExporting(true)}>
          Explore exports
        </button>
      </div>
      <img
        src={
          exporting
            ? '/product/export-detail.webp'
            : '/product/annotation-focus.webp'
        }
        alt={
          exporting
            ? 'Actual workspace export panel offering PNG, annotation JSON and native-sample CSV, with explicit export limits.'
            : 'Actual synthetic workspace with an interval for review marked on C3 from 2.25 to 4.5 seconds.'
        }
        width="968"
        height={exporting ? 493 : 554}
        loading="lazy"
        decoding="async"
      />
      <div className="export-formats" aria-label="Available export formats">
        <span>
          PNG <small>Visualization</small>
        </span>
        <span>
          CSV <small>Measurements</small>
        </span>
        <span>
          JSON <small>Annotations</small>
        </span>
      </div>
      <figcaption>
        03—04 / CAPTURED FROM THE WORKSPACE <span>Synthetic EEG</span>
      </figcaption>
    </figure>
  );
}
