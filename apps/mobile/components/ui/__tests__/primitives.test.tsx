import { fireEvent, render } from '@testing-library/react-native';

import { Button } from '@/components/ui/button';
import { ErrorMessage, FieldLabel, FormInput } from '@/components/ui/form';
import { colors, touchTarget } from '@/components/ui/tokens';

function linearChannel(hex: string, start: number): number {
  const encoded = Number.parseInt(hex.slice(start, start + 2), 16) / 255;

  return encoded <= 0.04045
    ? encoded / 12.92
    : ((encoded + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number {
  const red = linearChannel(hex, 1);
  const green = linearChannel(hex, 3);
  const blue = linearChannel(hex, 5);

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
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
