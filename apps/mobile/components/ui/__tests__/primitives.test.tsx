import { fireEvent, render } from '@testing-library/react-native';

import { Button } from '@/components/ui/button';
import { ErrorMessage, FieldLabel, FormInput } from '@/components/ui/form';
import { colors, touchTarget } from '@/components/ui/tokens';

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map(
    (start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255,
  );
  const linear = channels.map((channel) =>
    channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4,
  );

  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(first: string, second: string): number {
  const lighter = Math.max(relativeLuminance(first), relativeLuminance(second));
  const darker = Math.min(relativeLuminance(first), relativeLuminance(second));
  return (lighter + 0.05) / (darker + 0.05);
}

describe('visual foundation primitives', () => {
  it('renders a touch-friendly primary button and invokes its action', async () => {
    const onPress = jest.fn();
    const { getByRole } = await render(
      <Button label="Start training" onPress={onPress} />,
    );

    fireEvent.press(getByRole('button', { name: 'Start training' }));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(touchTarget).toBeGreaterThanOrEqual(48);
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

  it('keeps accent text and controls at WCAG AA contrast', () => {
    const controlContrast = contrastRatio(colors.accent, colors.onAccent);
    const textContrast = contrastRatio(colors.accent, colors.background);

    expect(controlContrast).toBeGreaterThanOrEqual(4.5);
    expect(textContrast).toBeGreaterThanOrEqual(4.5);
  });
});
