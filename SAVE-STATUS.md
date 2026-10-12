# NeuroScope preservation checkpoint

Saved on 2026-10-12 to `/Users/swastiknanda/Documents/NeuroScope`.

The entire application source was copied unchanged from:
`/Users/swastiknanda/Documents/Codex/2026-10-12/this-is-the-complete-long-term/outputs/neuroscope`.

## Current development state

- The React/TypeScript/Vite application and existing procedural Three.js hero are preserved.
- `scripts/prepare-anatomy.py` is the unfinished pipeline from the interrupted session. It has not yet been executed or validated. It includes proposed pathway preparation that is outside the currently requested anatomy-only milestone; review before continuing.
- `public/models/` is currently empty. The anatomical model has not been integrated into the scene.
- Downloaded anatomical input files and prior offline geometry inspection work are preserved under `work/`.
- No development, package installation, build, or visual verification was performed during this save operation.

## Reopen

Open this folder in your editor, then use the Node version in `.nvmrc`.
Run `npm ci` and `npm run dev` from this folder when ready to resume.
`node_modules`, build output, caches, local environment files, and private credentials are excluded. The empty `.env.example` placeholders are preserved.
The original working folder was left unchanged.

## Anatomical asset provenance

`work/pial_Full_obj.tar.bz2` and its extracted `lh.pial.obj` / `rh.pial.obj`:
“Brain for Blender” by Anderson Winkler.
Source: https://brainder.org/research/brain-for-blender/
Download: https://s3.us-east-2.amazonaws.com/brainder/software/brain4blender/smallfiles/pial_Full_obj.tar.bz2
License: Creative Commons Attribution-ShareAlike 3.0 Unported — https://creativecommons.org/licenses/by-sa/3.0/
The archived input files are unmodified. Retain attribution, link the license, indicate adaptations, and distribute adapted anatomical assets under the same license. No endorsement is implied.

`SAVE-MANIFEST.json` records byte sizes and SHA-256 checksums for every copied file.
