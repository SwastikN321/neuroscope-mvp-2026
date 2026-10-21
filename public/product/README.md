# NeuroScope product captures

These images are genuine screenshots of the existing NeuroScope synthetic EEG workspace, captured through browser interactions. They are not generated dashboards or patient recordings.

- Recording: `NS-DEMO-001`, deterministic synthetic EEG, 12 channels, 256 Hz, 120 seconds.
- `overview`: all channels, 0–10 seconds.
- `channels`: Fp1, F3, C3, P3, O1 and T7, 0–10 seconds.
- `zoom`: the same six channels, 2.5–7.5 seconds.
- `inspect`: C3 sample at 4.125 seconds, in the same five-second window.
- `timeline`: final five seconds, 115–120 seconds.
- Mobile variants are captured from the actual responsive workspace, cropped to the viewer and timeline.
- `inspect-focus` and `annotation-focus` are contiguous crops of real desktop captures. The interval for review is a test observation at 2.25–4.5 seconds on C3, not a diagnosis.
- `export-detail` is the actual export panel.

No underlying samples, labels, application controls or styles were changed for these captures. Images are encoded as lossless WebP. Reproduce from the repository with `scripts/capture-product.cjs`, then `scripts/prepare-product.py` using the existing backend environment (Pillow). Original PNG captures remain in the ignored QA directory.

## Reading crops

`*-detail.webp` preserves the contiguous desktop viewer, axes, sample inspector and timeline (x=200–1168, y=168–893). `*-detail-mobile.webp` removes only the mobile toolbar above the plot (x=0–368, y=238–1040). The homepage defaults to the six-channel capture and lets visitors switch between detail and full framing without changing the selected example. `study-detail.webp` is the C3/P3 excerpt of the genuine zoom capture (x=200–1168, y=337–483); its caption supplies the 2.5–7.5-second window because this crop excludes the time axis. None of these crops changes measured values or adds UI elements.
