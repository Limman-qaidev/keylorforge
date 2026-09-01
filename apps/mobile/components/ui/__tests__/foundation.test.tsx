import { fireEvent, render } from '@testing-library/react-native';

import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ErrorMessage, PasswordInput } from '@/components/ui/form';
import { LoadingState, Skeleton } from '@/components/ui/feedback';

describe('visual foundation primitives', () => {
  it('exposes disabled and loading button semantics', async () => {
    const onPress = jest.fn();
    const { getByRole } = await render(
      <Button loading onPress={onPress}>
        Continue
      </Button>,
    );
    fireEvent.press(getByRole('button'));
    expect(onPress).not.toHaveBeenCalled();
    expect(getByRole('button').props.accessibilityState).toMatchObject({
      busy: true,
      disabled: true,
    });
  });

  it('provides accessible input and error treatments', async () => {
    const { getByLabelText, getByText } = await render(
      <>
        <PasswordInput accessibilityLabel="Password" value="secret" />
        <ErrorMessage>Use a stronger password.</ErrorMessage>
      </>,
    );
    expect(getByLabelText('Password')).toBeTruthy();
    fireEvent.press(getByLabelText('Show password'));
    expect(
      getByText('Use a stronger password.').props.accessibilityLiveRegion,
    ).toBe('polite');
  });

  it('renders a branded initials fallback and loading primitives', async () => {
    const { getByLabelText } = await render(
      <>
        <Avatar name="Taylor Jordan" />
        <LoadingState label="Loading profile" />
        <Skeleton width="50%" />
      </>,
    );
    expect(getByLabelText('Taylor Jordan avatar')).toBeTruthy();
    expect(getByLabelText('Loading profile')).toBeTruthy();
    expect(getByLabelText('Loading content')).toBeTruthy();
  });
});
