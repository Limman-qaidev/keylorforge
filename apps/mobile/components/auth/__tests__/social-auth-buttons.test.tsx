import { render } from '@testing-library/react-native';

import { SocialAuthButtons } from '../social-auth-buttons';

const originalAppleAuthFlag = process.env.EXPO_PUBLIC_APPLE_AUTH_ENABLED;
const originalGoogleAuthFlag = process.env.EXPO_PUBLIC_GOOGLE_AUTH_ENABLED;

beforeEach(() => {
  delete process.env.EXPO_PUBLIC_APPLE_AUTH_ENABLED;
  delete process.env.EXPO_PUBLIC_GOOGLE_AUTH_ENABLED;
});

afterAll(() => {
  if (originalAppleAuthFlag === undefined) {
    delete process.env.EXPO_PUBLIC_APPLE_AUTH_ENABLED;
  } else {
    process.env.EXPO_PUBLIC_APPLE_AUTH_ENABLED = originalAppleAuthFlag;
  }

  if (originalGoogleAuthFlag === undefined) {
    delete process.env.EXPO_PUBLIC_GOOGLE_AUTH_ENABLED;
  } else {
    process.env.EXPO_PUBLIC_GOOGLE_AUTH_ENABLED = originalGoogleAuthFlag;
  }
});

describe('SocialAuthButtons', () => {
  it('renders no social provider controls while the UI kill switch is disabled', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_AUTH_ENABLED = 'true';
    process.env.EXPO_PUBLIC_APPLE_AUTH_ENABLED = 'true';

    const { queryByRole } = await render(
      <SocialAuthButtons onSignIn={jest.fn()} />,
    );

    expect(queryByRole('button', { name: 'Continue with Google' })).toBeNull();
    expect(queryByRole('button', { name: 'Continue with Apple' })).toBeNull();
  });
});
