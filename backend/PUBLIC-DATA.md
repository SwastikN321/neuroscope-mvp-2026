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
