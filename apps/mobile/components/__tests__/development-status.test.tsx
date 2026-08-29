import { render, waitFor } from '@testing-library/react-native';

import { DevelopmentStatus } from '../development-status';

describe('DevelopmentStatus', () => {
  it('shows a loading API state while the health check is pending', async () => {
    const { getByText, unmount } = await render(
      <DevelopmentStatus loadHealth={() => new Promise(() => undefined)} />,
    );

    expect(getByText('Checking API health…')).toBeTruthy();
    await unmount();
  });

  it('shows a healthy API state', async () => {
    const { getByText } = await render(
      <DevelopmentStatus loadHealth={async () => ({ status: 'ok' })} />,
    );

    expect(getByText('Keylornet mobile')).toBeTruthy();

    await waitFor(() => {
      expect(getByText('API is healthy.')).toBeTruthy();
    });
  });

  it('shows a readable error when the API cannot be reached', async () => {
    const { getByText } = await render(
      <DevelopmentStatus
        loadHealth={async () => {
          throw new Error('Network request failed');
        }}
      />,
    );

    await waitFor(() => {
      expect(
        getByText('API health check failed: Network request failed'),
      ).toBeTruthy();
    });
  });
});
