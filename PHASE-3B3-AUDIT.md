# Phase 3B.3 initial audit (before application changes)

Baseline: `4c565e2`. Working tree initially clean.

- Uploads stream to private 0600 files in a 0700 OS temporary directory, outside public routes. Default cap 64 MiB, aggregate 256 MiB, four files, one-hour TTL. Configuration already allows up to 512 MiB; raising the default without measurements is not justified.
- MNE uses lazy reads, grouped by native sampling frequency. Header/annotation validation and first/last probes occur at upload. Annotation payload is capped at 2 MiB, source channels at 256, unique EEG rates at eight, duration at 24 hours. No data preprocessing is enabled.
- Raw windows are bounded to 30 seconds / 250,000 values / 32 channels. The frontend nonetheless issues one raw request per channel, followed by one-channel display scans for wide views. A 64-channel initial view with all channels selected requires 65 calls including metadata. This is a concrete avoidable request pattern to benchmark.
- Each wide display scans the requested native channel again. A browser abort stops fetching, but does not currently stop the server's scan. The single-operation gate can therefore block newer work for up to the scan deadline. Overview scans compete with interactive reads.
- Frontend cache is bounded to 128 windows, but request serialization can queue uncanceled lifecycle operations; fetch has no deadline. A stale focus-validation response can clear a newly replaced recording. Upload UI disables replacement while processing but offers no cancel control.
- Every rendered sample searches the channel list again for its rate. A 256-channel canvas at DPR 2 can approach 180 MiB of pixel storage at desktop width; actual memory/responsiveness must be measured. This is separate from JS heap.
- Cross-rate sample ranges use floating-point ceil; raw decimal time conversion can round an exact boundary upward. This requires regression tests using non-binary and rational rates.
- Existing browser tests cover 61-second public EEG and a 4-second mixed-rate fixture, not hours, cap-size files, or high channel counts. No prior measured peak RSS or browser timing table exists.

Priority: establish baseline measurements with deterministic fixtures and licensed public data; then address observed latency, correctness, cancellation/lifecycle issues and bounded rendering. Keep all existing endpoints and scientific units; add compatible capabilities only where justified. Local-origin checks are not authentication and must never be represented as safe multi-user access control.

## Baseline measured before application edits

Apple M3 Pro, 12 logical CPUs, 18 GiB memory, Chrome 155; real loopback HTTP, fresh backend per file, 50 ms RSS sampling. Full raw results are retained with the phase report.

- 256-channel fixture: 256 wide-view HTTP calls, 3.83 s wide navigation, 1.00 s select-all, 1.11–1.22 s pan including the harness's 200 ms settle wait; 524,288 rendered extrema and 114.15 MiB canvas backing store at DPR 2.
- Six-hour / 22,118,400-sample fixture: successful upload/parse in 0.197 s, 84.3 MiB sampled backend RSS; 32 ms full overview scan of one channel. Ingestion is not the primary bottleneck on this hardware.
- 96.02 MiB fixture with explicit 128 MiB cap: successful upload/parse in 0.240 s, 91.2 MiB sampled RSS. Keep the 64 MiB default and document an opt-in 128 MiB profile.
- Repeating full display requests repeats every source read. A bounded exact-result cache can avoid repeated scans without altering bin boundaries or extrema.
- CHB-MIT chb04_01 header and publisher channel list contain duplicate `T8-P8` labels. The current parser deliberately rejects duplicates. Only the 8 KiB header was downloaded; the full four-hour file was not imported or benchmarked. Do not rename channels or claim support for this source.
