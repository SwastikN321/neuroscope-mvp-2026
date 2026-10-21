# Optional public research recording

The Phase 3B.1 validation uses **S001R01.edf** from **EEG Motor Movement/Imagery Dataset, version 1.0.0**, by Gerwin Schalk and colleagues, distributed by PhysioNet. This is the public coded-participant eyes-open baseline recording, not user/patient data supplied to NeuroScope. No identity inference or re-identification was performed. It is downloaded locally for testing only, not bundled or served by the frontend.

- Dataset/source and license statement: <https://www.physionet.org/content/eegmmidb/1.0.0/>
- File: <https://physionet.org/files/eegmmidb/1.0.0/S001/S001R01.edf>
- License: **Open Data Commons Attribution License v1.0** — <https://opendatacommons.org/licenses/by/1-0/>
- Citation: Schalk, G. (2009). EEG Motor Movement/Imagery Dataset (version 1.0.0). PhysioNet. <https://doi.org/10.13026/C28G6P>
- Original publication: Schalk, G., McFarland, D. J., Hinterberger, T., Birbaumer, N., & Wolpaw, J. R. (2004). BCI2000: A General-Purpose Brain-Computer Interface (BCI) System. IEEE Transactions on Biomedical Engineering, 51(6), 1034–1043. <https://pubmed.ncbi.nlm.nih.gov/15188875/>
- PhysioNet citation requested by the current dataset page: Pollard et al. (2026). PhysioNet as a global platform for biomedical research. Nature Health. <https://doi.org/10.1038/s44360-026-00096-z>

Download only this small file, not the full dataset:

```sh
mkdir -p work/backend
curl --fail --location \
  https://physionet.org/files/eegmmidb/1.0.0/S001/S001R01.edf \
  -o work/backend/S001R01.edf
```

Verified local file: **1,275,936 bytes**, SHA-256 **`4743b736131a7e147c150e8b37711029b6cda5e356c4b3e8261a03cdcaaf8b0c`**. This is the checksum computed for the downloaded file, not a claim of a separately signed publisher checksum. The optional test pins it for reproducibility.

Measured validation: EDF+C, 64 EEG channels, 160 Hz, 9,760 samples/channel, **61 seconds** (final sample at 60.99375 s). The actual file duration is authoritative despite the dataset's approximate one-minute baseline description. Tests compare all 64 original names and samples in beginning/middle/final windows with independent MNE reads. The generated fixture tests add known analytic calibration across V, mV, uV and mixed sampling frequencies. No changes are made to the public source file; server copies are temporary and deleted after validation. Retain attribution and license information if you later redistribute data or derived public results.

## Phase 3B.3 additional public validation

`S001/S001R03.edf` from the same EEG Motor Movement/Imagery Dataset v1.0.0 was downloaded unmodified from <https://physionet.org/files/eegmmidb/1.0.0/S001/S001R03.edf>. The same author, Open Data Commons Attribution v1.0 license and citations above apply. Local file: **2,596,896 bytes**, SHA-256 **`3427c8d01bff1380bc9ab9f27a35ece2af5dfadf3e291bbc05eb66e4dadbfe2e`**. Actual parsed duration: 125 seconds, 64 channels at 160 Hz. This task recording was exercised through the actual browser, including channel selection and wide/end-of-record navigation. It is stored only under ignored `work/phase-3b3/`.

A candidate longer public recording, **CHB-MIT v1.0.0, chb04/chb04_01.edf**, was checked using only its first 8,192 bytes and the publisher's channel summary. Both confirm duplicate `T8-P8` labels, which NeuroScope deliberately rejects. The full four-hour recording was **not downloaded, loaded, or benchmarked**; no channels were renamed to bypass validation. Thus the multi-hour measurements in Phase 3B.3 use explicitly synthetic deterministic fixtures, not a claim of multi-hour clinical-data validation.

- Source and de-identification statement: <https://physionet.org/content/chbmit/1.0.0/chb01/> (dataset description states protected health information was replaced with surrogate information).
- Exact candidate header: <https://physionet.org/files/chbmit/1.0.0/chb04/chb04_01.edf> (HTTP range 0–8191 only).
- Channel summary: <https://physionet.org/files/chbmit/1.0.0/chb04/chb04-summary.txt>.
- Author/citation: Guttag, J. (2010). CHB-MIT Scalp EEG Database (version 1.0.0). PhysioNet. <https://doi.org/10.13026/C2K01R>.
- License: Open Data Commons Attribution License v1.0, verified on the publisher's dataset page.
- Original publication: Shoeb, A. (2009). Application of Machine Learning to Epileptic Seizure Onset Detection and Treatment. MIT doctoral thesis. <http://hdl.handle.net/1721.1/54669>.

No re-identification was attempted. Keep these data out of `public/`, build output and Git; attribution does not authorize exposing private user recordings.

## Phase 3D.1 independent long-recording reference

One unchanged file, **SC4001E0-PSG.edf**, was downloaded from Bob Kemp's **Sleep-EDF Database Expanded v1.0.0**. The publisher states that patient headers are anonymized to age and gender. Validation does not print or retain those fields, infer identities, or use private recordings. The dataset contains acquisition-time filtering; NeuroScope preserves the stored measurements without additional filtering.

- Dataset and de-identification statement: <https://physionet.org/content/sleep-edfx/1.0.0/>
- Direct file: <https://physionet.org/files/sleep-edfx/1.0.0/sleep-cassette/SC4001E0-PSG.edf>
- Publisher-documented public S3 mirror used after a slow primary-server transfer: <https://physionet-open.s3.amazonaws.com/sleep-edfx/1.0.0/sleep-cassette/SC4001E0-PSG.edf>
- Publisher checksum list: <https://physionet.org/files/sleep-edfx/1.0.0/SHA256SUMS.txt>
- License: Open Data Commons Attribution v1.0, <https://opendatacommons.org/licenses/by/1-0/>.
- Dataset DOI: <https://doi.org/10.13026/C2X676>.
- Original publication: Kemp B, Zwinderman AH, Tuk B, Kamphuisen HAC, Oberyé JJL. Analysis of a sleep-dependent neuronal feedback loop: the slow-wave microcontinuity of the EEG. IEEE Transactions on Biomedical Engineering 47(9):1185–1194 (2000). <https://doi.org/10.1109/10.867928>.
- Retain the PhysioNet citation above (Pollard et al., 2026) with derived results.

Measured file: **48,338,048 bytes**, SHA-256 **`2b40a18adf76af69a42d6db1f30f31d26b369f6d27ca0050ef30147ef892b131`**, matched exactly against the publisher's checksum entry. Actual duration is **79,500 seconds (22:05:00)**. Seven source channels include two EEG channels, each with **7,950,000 samples at 100 Hz**; non-EEG channels are excluded from the EEG workspace. The full original remains in ignored `work/phase-3d1/`. Reviewed plots/screenshots in `docs/phase-3d1/` are attributed derivatives; added annotations are validation observations only.
