import { fireEvent, render } from '@testing-library/react-native';

import { Button } from '@/components/ui/button';
import { ErrorMessage, FieldLabel, FormInput } from '@/components/ui/form';

describe('visual foundation primitives', () => {
  it('renders a touch-friendly primary button and invokes its action', async () => {
    const onPress = jest.fn();
    const { getByRole } = await render(
      <Button label="Start training" onPress={onPress} />,
    );

    fireEvent.press(getByRole('button', { name: 'Start training' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('exposes labels, input semantics, and live validation feedback', async () => {
    const { getByLabelText, getByText } = await render(
      <>
        <FieldLabel>Email</FieldLabel>
        <FormInput accessibilityLabel="Email" />
        <ErrorMessage>Enter a valid email address.</ErrorMessage>
      </>,
    );

    expect(getByLabelText('Email')).toBeTruthy();
    expect(
      getByText('Enter a valid email address.').props.accessibilityLiveRegion,
    ).toBe('polite');
  });
});
