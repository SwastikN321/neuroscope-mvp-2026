import type { EEGAnnotation } from './annotations';
import {
  channelClock,
  peakSamples,
  sampleAt,
  timeTicks,
  type EEGRecording,
  type EEGWindow,
  type TimeRange,
} from './recording';
export type VisualizationSnapshot = {
  recording: EEGRecording;
  data: EEGWindow;
  ids: string[];
  range: TimeRange;
  amplitude: number;
  annotations: EEGAnnotation[];
};
/** Redraw the actual visible data window, not a DOM screenshot or unrelated illustration. */
export async function visualizationPNG(
  view: VisualizationSnapshot,
): Promise<Blob> {
  const { recording, data, ids, range, annotations } = view;
  if (!ids.length || ids.length > 32 || ids.some((id) => !data.channels[id]))
    throw new Error('Load 1–32 visible channels before exporting the image.');
  const visible = annotations.filter(
    (a) =>
      a.recordingId === recording.id &&
      (!a.channelId || ids.includes(a.channelId)) &&
      a.startTime <= range.end &&
      (a.endTime ?? a.startTime) >= range.start,
  );
  const width = 1200,
    left = 150,
    right = 40,
    top = 120,
    row = 72,
    plotHeight = ids.length * row;
  const height = top + plotHeight + 100 + visible.length * 24;
  if (width * height * 4 > 16_000_000)
    throw new Error(
      'Image exceeds 16 megapixels. Choose fewer channels or a shorter interval with fewer visible annotations.',
    );
  const canvas = document.createElement('canvas');
  canvas.width = width * 2;
  canvas.height = height * 2;
  const ctx = canvas.getContext('2d');
  if (!ctx)
    throw new Error('Canvas image export is unavailable in this browser.');
  ctx.scale(2, 2);
  ctx.fillStyle = '#09121b';
  ctx.fillRect(0, 0, width, height);
  const plotWidth = width - left - right,
    span = range.end - range.start;
  const x = (t: number) => left + ((t - range.start) / span) * plotWidth;
  let peak = 0;
  for (const id of ids) {
    const rate = channelClock(recording, id).sampleRateHz;
    data.channels[id]!.forEach((v, index) => {
      const t = sampleAt(data, id, index) / rate;
      if (!Number.isFinite(v))
        throw new Error('Nonfinite waveform data cannot be exported.');
      if (t >= range.start && t <= range.end)
        peak = Math.max(peak, Math.abs(v));
    });
  }
  // Fit peaks with one common calibrated scale; explicitly report expansion.
  const amplitude = Math.max(view.amplitude, Math.ceil(peak * 1.05));
  ctx.font = '600 22px sans-serif';
  ctx.fillStyle = '#e2eff5';
  ctx.fillText('NEUROSCOPE  /  Signal visualization', 32, 38);
  ctx.font = '13px sans-serif';
  ctx.fillStyle = '#a7bfce';
  ctx.fillText(
    `${recording.source === 'synthetic' ? 'SYNTHETIC DEMO · no patient data' : 'LOCAL EDF · original measurements'}   |   ${range.start}–${range.end} s   |   ${ids.length} visible channels`,
    32,
    65,
  );
  ctx.fillText(
    `Amplitude: ±${amplitude} µV per lane${amplitude > view.amplitude ? ` (expanded from ±${view.amplitude} µV to avoid clipping)` : ''} · Positive voltage upward`,
    32,
    88,
  );
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, plotWidth, plotHeight);
  ctx.clip();
  for (const a of visible) {
    const lane = a.channelId ? ids.indexOf(a.channelId) : 0;
    const y = top + lane * row,
      h = a.channelId ? row : plotHeight;
    ctx.fillStyle = '#d7ad4526';
    ctx.strokeStyle = '#e7c37a';
    ctx.lineWidth = 1;
    if (a.type === 'interval')
      ctx.fillRect(x(a.startTime), y, x(a.endTime!) - x(a.startTime), h);
    ctx.beginPath();
    ctx.moveTo(x(a.startTime), y);
    ctx.lineTo(x(a.startTime), y + h);
    ctx.stroke();
    if (a.endTime !== undefined) {
      ctx.beginPath();
      ctx.moveTo(x(a.endTime), y);
      ctx.lineTo(x(a.endTime), y + h);
      ctx.stroke();
    }
  }
  ctx.restore();
  for (const t of timeTicks(range, plotWidth)) {
    ctx.strokeStyle = '#263b48';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(x(t), top);
    ctx.lineTo(x(t), top + plotHeight);
    ctx.stroke();
    ctx.fillStyle = '#bad0dd';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${Number(t.toFixed(6))} s`, x(t), top + plotHeight + 23);
  }
  ids.forEach((id, lane) => {
    const c = recording.channels.find((c) => c.id === id)!,
      rate = channelClock(recording, id).sampleRateHz,
      center = top + row * (lane + 0.5);
    ctx.textAlign = 'left';
    ctx.fillStyle = c.color;
    ctx.font = '14px monospace';
    ctx.fillText(c.label, 24, center - 2, left - 38);
    ctx.font = '10px monospace';
    ctx.fillStyle = '#96afbd';
    ctx.fillText(
      `${id} · ${Number(rate.toPrecision(8))} Hz`,
      24,
      center + 15,
      left - 38,
    );
    ctx.save();
    ctx.beginPath();
    ctx.rect(left, top + lane * row, plotWidth, row);
    ctx.clip();
    ctx.strokeStyle = c.color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    peakSamples(data.channels[id]!, plotWidth).forEach((index, i) => {
      const px = x(sampleAt(data, id, index) / rate),
        py = center - (data.channels[id]![index]! / amplitude) * row * 0.42;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = '#a4bac6';
    ctx.beginPath();
    ctx.moveTo(width - 20, center);
    ctx.lineTo(width - 20, center - row * 0.42);
    ctx.stroke();
  });
  visible.forEach((a, i) => {
    const lane = a.channelId ? ids.indexOf(a.channelId) : 0;
    ctx.fillStyle = '#e7c37a';
    ctx.font = '12px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(
      `${i + 1}`,
      Math.max(left, Math.min(width - right - 20, x(a.startTime))) + 3,
      top + lane * row + 14,
    );
  });
  ctx.textAlign = 'left';
  ctx.fillStyle = '#a7bfce';
  ctx.font = '12px sans-serif';
  ctx.fillText(
    `${data.reduced ? 'Peak-preserving display envelope' : 'Visible original-sample window, peak-preserving rasterization'} · Image is not a raw-data export.`,
    32,
    top + plotHeight + 52,
  );
  ctx.fillText(
    'Time relative to first sample · User annotations only · Research visualization, not for clinical use.',
    32,
    top + plotHeight + 74,
  );
  visible.forEach((a, i) => {
    ctx.fillStyle = '#e7c37a';
    ctx.font = '12px sans-serif';
    ctx.fillText(
      `${i + 1}. ${a.type} · ${a.startTime}${a.endTime !== undefined ? `–${a.endTime}` : ''} s · ${a.channelId ?? 'all channels'} · ${a.label}`,
      32,
      top + plotHeight + 100 + i * 24,
      width - 64,
    );
  });
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => {
      canvas.width = canvas.height = 0;
      if (blob) resolve(blob);
      else
        reject(
          new Error('PNG encoding failed. Reduce visible channels and retry.'),
        );
    }, 'image/png'),
  );
}
