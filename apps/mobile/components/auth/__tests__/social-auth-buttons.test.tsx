import { fireEvent, render } from '@testing-library/react-native';

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
  it('renders no dead provider controls when capabilities are unavailable', async () => {
    const { queryByRole } = await render(
      <SocialAuthButtons onSignIn={jest.fn()} />,
    );

    expect(queryByRole('button', { name: 'Continue with Google' })).toBeNull();
    expect(queryByRole('button', { name: 'Continue with Apple' })).toBeNull();
  });

  it('renders only Google when Google capability is enabled', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_AUTH_ENABLED = 'true';
    const { getByRole, queryByRole } = await render(
      <SocialAuthButtons onSignIn={jest.fn()} />,
    );

    expect(getByRole('button', { name: 'Continue with Google' })).toBeTruthy();
    expect(queryByRole('button', { name: 'Continue with Apple' })).toBeNull();
  });

  it('invokes Apple only when the Apple capability is enabled', async () => {
    process.env.EXPO_PUBLIC_APPLE_AUTH_ENABLED = 'true';
    const onSignIn = jest.fn().mockResolvedValue(undefined);
    const { getByRole, queryByRole } = await render(
      <SocialAuthButtons onSignIn={onSignIn} />,
    );

    fireEvent.press(getByRole('button', { name: 'Continue with Apple' }));

    expect(onSignIn).toHaveBeenCalledWith('apple');
    expect(queryByRole('button', { name: 'Continue with Google' })).toBeNull();
  });
});