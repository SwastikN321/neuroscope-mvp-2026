# Anatomical mesh attribution

**Brain for Blender — Anderson Winkler.**

- Original work: <https://brainder.org/brain-for-blender>
- Source and license statement: <https://brainder.org/research/brain-for-blender/>
- Download: <https://s3.us-east-2.amazonaws.com/brainder/software/brain4blender/smallfiles/pial_Full_obj.tar.bz2>
- License: **Creative Commons Attribution-ShareAlike 3.0 Unported (CC BY-SA 3.0)** — <https://creativecommons.org/licenses/by-sa/3.0/>
- Legal terms: <https://creativecommons.org/licenses/by-sa/3.0/legalcode.en>

The source page identifies Anderson Winkler as the models' author and explicitly licenses them under CC BY-SA 3.0. These are the full left and right pial cortical surfaces, reconstructed with FreeSurfer from MRI. They do not include the cerebellum, brainstem, or subcortical structures.

## Verification

Checked on **2026-10-12**. Both local OBJ files matched the corresponding members of a freshly downloaded publisher archive byte for byte. `scripts/anatomy-source.json` records the download URL and SHA-256 checksums; `manifest.json` repeats that provenance with the output checksums. This establishes file identity and the publisher's stated license; it is not an independent investigation of ownership.

## Adaptations for NeuroScope

`cortex-full.glb`, `cortex-compact.glb`, `cortex-still.png`, `neural-full.json`, `neural-compact.json`, and their derived screenshots/previews are adaptations for NeuroScope and are distributed under **CC BY-SA 3.0 Unported**.

Changes: shared centering, uniform normalization, rotation into Y-up coordinates, topology-preserving triangle reduction, recalculated vertex normals, a neutral material, and GLB conversion. The source OBJ files are unchanged. No geometry smoothing, mirroring, invented anatomy, or anatomical segmentation was added to the GLBs. Phase 2A.4 leaves these GLBs unchanged and adds separate decorative surface routes generated from their topology: shortest-edge routing, bounded route smoothing, surface projection, normal offsets, and bundle lanes. GPU particles, synthetic traveling pulses, and material illumination are artistic effects, not reconstructed axons or recorded neural activity. The Phase 2A.4 still and screenshots render these adapted assets with NeuroScope’s material and lighting.

## Notices to retain when sharing

Retain the work's title, author credit, source link, license link, and adaptation notice. Keep supplied copyright, license, and disclaimer notices intact. Distribute the adapted assets under the same license; do not add legal restrictions or technological measures that restrict the licensed freedoms. Credit must not suggest Anderson Winkler endorses NeuroScope. No endorsement is implied, and no warranties are given under the license.

Suggested display credit:

> Brain for Blender by Anderson Winkler, adapted for NeuroScope. CC BY-SA 3.0.

Link the title to the source and the license name to its URL. Preserve this document alongside downloads; add a visible linked credit when integrating the models into the application. This document licenses the anatomical assets and their adaptations, not unrelated application code.
