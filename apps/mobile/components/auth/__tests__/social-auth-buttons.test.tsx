import { fireEvent, render } from '@testing-library/react-native';

import { SocialAuthButtons } from '../social-auth-buttons';
import { useAuth } from '@/lib/auth/auth-provider';

jest.mock('@/lib/auth/auth-provider', () => ({
  useAuth: jest.fn(),
}));

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

describe('SocialAuthButtons', () => {
  const signInWithSocial = jest.fn().mockResolvedValue({});

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({
      signInWithSocial,
      socialAuthCapabilities: { apple: false, google: false },
    } as ReturnType<typeof useAuth>);
  });

  it('renders no dead provider controls when providers are unavailable', async () => {
    const { queryByText } = await render(<SocialAuthButtons />);

    expect(queryByText('Continue with Google')).toBeNull();
    expect(queryByText('Continue with Apple')).toBeNull();
  });

  it('renders and invokes only enabled providers', async () => {
    mockUseAuth.mockReturnValue({
      signInWithSocial,
      socialAuthCapabilities: { apple: false, google: true },
    } as ReturnType<typeof useAuth>);

    const { getByText, queryByText } = await render(<SocialAuthButtons />);

    expect(queryByText('Continue with Apple')).toBeNull();
    await fireEvent.press(getByText('Continue with Google'));

    expect(signInWithSocial).toHaveBeenCalledWith('google');
  });

  it('supports Apple when its capability is enabled', async () => {
    mockUseAuth.mockReturnValue({
      signInWithSocial,
      socialAuthCapabilities: { apple: true, google: false },
    } as ReturnType<typeof useAuth>);

    const { getByText, queryByText } = await render(<SocialAuthButtons />);

    expect(queryByText('Continue with Google')).toBeNull();
    await fireEvent.press(getByText('Continue with Apple'));

    expect(signInWithSocial).toHaveBeenCalledWith('apple');
  });
});
