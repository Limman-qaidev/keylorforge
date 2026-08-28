import { render } from '@testing-library/react-native';

import { DevelopmentStatus } from '../development-status';

describe('DevelopmentStatus', () => {
  it('shows the mobile foundation status', async () => {
    const { getByText } = await render(<DevelopmentStatus />);

    expect(getByText('Keylornet mobile')).toBeTruthy();
    expect(getByText('Development foundation is ready.')).toBeTruthy();
  });
});
