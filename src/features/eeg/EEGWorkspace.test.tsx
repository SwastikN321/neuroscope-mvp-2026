import { beforeAll, describe, expect, it } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { EEGWorkspace } from './EEGWorkspace';
import { createSyntheticSource } from './synthetic';
import type { EEGDataSource } from './recording';
let source: EEGDataSource;
beforeAll(() => {
  source = createSyntheticSource();
});
function renderViewer(dataSource = source) {
  return render(
    <MemoryRouter>
      <EEGWorkspace source={dataSource} />
    </MemoryRouter>,
  );
}
describe('Functional EEG workspace', () => {
  it('changes real channel visibility, handles no selection, and restores all channels', async () => {
    const user = userEvent.setup();
    renderViewer();
    const plot = await screen.findByRole('group', {
      name: 'Interactive EEG waveform viewer',
    });
    expect(plot).toHaveAttribute(
      'data-channels',
      'Fp1,Fp2,F3,F4,C3,C4,P3,P4,O1,O2,T7,T8',
    );
    await user.click(screen.getByRole('checkbox', { name: 'Fp1 Frontopolar' }));
    await waitFor(() =>
      expect(plot.getAttribute('data-channels')!.split(',')).not.toContain(
        'Fp1',
      ),
    );
    await user.click(screen.getByRole('button', { name: 'Deselect all' }));
    expect(screen.getByText('No channels selected')).toBeInTheDocument();
    expect(screen.getByLabelText('Inspect time in seconds')).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Select all' }));
    expect(plot.getAttribute('data-channels')!.split(',')).toHaveLength(12);
  });
  it('zooms, pans, navigates the timeline, resets and inspects the original samples', async () => {
    const user = userEvent.setup();
    renderViewer();
    const plot = await screen.findByRole('group', {
      name: 'Interactive EEG waveform viewer',
    });
    await user.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(plot).toHaveAttribute('data-start', '2.500000');
    await user.click(screen.getByRole('button', { name: 'Pan later' }));
    expect(plot).toHaveAttribute('data-start', '5.000000');
    fireEvent.change(screen.getByLabelText('Recording position'), {
      target: { value: '60' },
    });
    expect(plot).toHaveAttribute('data-start', '60.000000');
    await user.click(screen.getByRole('button', { name: 'Reset view' }));
    expect(plot).toHaveAttribute('data-start', '0.000000');
    expect(plot).toHaveAttribute('data-end', '10.000000');
    await user.selectOptions(screen.getByLabelText('Inspect channel'), 'C3');
    fireEvent.change(screen.getByLabelText('Inspect time in seconds'), {
      target: { value: '1.25' },
    });
    const expected = (await source.readWindow(320, 321, ['C3'])).channels
      .C3![0]!;
    await waitFor(() =>
      expect(screen.getByTestId('amplitude-readout')).toHaveTextContent(
        `${expected >= 0 ? '+' : ''}${expected.toFixed(2)} µV`,
      ),
    );
    plot.focus();
    await user.keyboard('{ArrowRight}');
    expect(plot).toHaveAttribute('data-start', '2.500000');
    await user.keyboard('{Home}');
    expect(plot).toHaveAttribute('data-start', '0.000000');
  });
  it('offers a working retry when reading a window fails', async () => {
    let fail = true;
    renderViewer({
      ...source,
      readWindow: (...args) =>
        fail
          ? Promise.reject(new Error('Read failed'))
          : source.readWindow(...args),
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('Read failed');
    fail = false;
    await userEvent.click(
      screen.getByRole('button', { name: 'Retry recording' }),
    );
    expect(
      await screen.findByRole('group', {
        name: 'Interactive EEG waveform viewer',
      }),
    ).toBeInTheDocument();
  });
});
