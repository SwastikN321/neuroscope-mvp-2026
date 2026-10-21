# Internal design foundation

The palette and typography showcase was removed from the public homepage in Phase 2B. This document is internal repository documentation, not a public route. Existing components and design tokens remain available.

- Tokens: `src/styles/global.css`, including midnight `#06080D`, charcoal `#111722`, cyan `#49DCEB`, neural blue `#4278FF`, violet `#8E77FF`, off-white `#F2F3F5` and the Manrope variable typeface.
- Shared controls: `src/components/ui/` (Button, Badge, Icon, SectionLabel).
- Brand marks: `src/components/brand/`.
- Cinematic composition: `src/features/hero/hero.css`; 3D geometry, shaders, lighting and scroll choreography remain in their existing modules.
- Product marketing: `src/features/marketing/marketing.css`; styles are scoped to the marketing layout and do not alter the EEG workspace.
- Scientific workspace: `src/features/eeg/` remains the source of actual product behavior. Marketing captures must come from this application, using synthetic data unless a separately licensed reference is explicitly documented.

There is no public style-guide route or navigation destination. Git history preserves the original showcase implementation.
