import { useState } from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderScreen } from '@/test/render';
import { Button } from './button';
import { CodeInput } from './code-input';
import { PasswordStrength } from './password-strength';
import { StepHeader } from './step-header';
import { Switch } from './switch';
import { PasswordField, TextField } from './text-field';
import { WheelPicker, wheelRowHeight } from './wheel-picker';

describe('Button', () => {
  it('cannot be pressed and reads as busy while loading', async () => {
    const onPress = jest.fn();
    await renderScreen(<Button label="Create account" loading onPress={onPress} />);
    const button = screen.getByRole('button', { name: 'Create account' });
    expect(button).toBeDisabled();
    expect(button).toBeBusy();
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('StepHeader', () => {
  it('shows the step, reads it as progress and goes back', async () => {
    const onBack = jest.fn();
    await renderScreen(<StepHeader step={2} total={4} onBack={onBack} />);
    expect(screen.getByText('2 of 4')).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Step 2 of 4' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

describe('TextField', () => {
  it('is found by its label and reports what is typed', async () => {
    const onChangeText = jest.fn();
    await renderScreen(<TextField label="First name" value="" onChangeText={onChangeText} />);
    await fireEvent.changeText(screen.getByLabelText('First name'), 'Amara');
    expect(onChangeText).toHaveBeenCalledWith('Amara');
  });

  it('announces its error', async () => {
    await renderScreen(
      <TextField
        label="Email"
        value="x"
        onChangeText={() => {}}
        error="This email already has an account."
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('This email already has an account.');
  });
});

describe('PasswordField', () => {
  it('hides the password until the user asks to see it', async () => {
    await renderScreen(
      <PasswordField label="Password" value="Sommer2026!" onChangeText={() => {}} />,
    );
    expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(true);

    await fireEvent.press(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(false);

    await fireEvent.press(screen.getByRole('button', { name: 'Hide password' }));
    expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(true);
  });
});

describe('PasswordStrength', () => {
  it('names the strength and says which rules are met', async () => {
    await renderScreen(<PasswordStrength password="Sommer26!" />);
    expect(screen.getByLabelText('Password strength: Strong')).toBeTruthy();
    expect(screen.getByLabelText('8+ characters: done')).toBeTruthy();
    expect(screen.getByLabelText('A number: done')).toBeTruthy();
    expect(screen.getByLabelText('A symbol: done')).toBeTruthy();
  });

  it('says which rules are still needed', async () => {
    await renderScreen(<PasswordStrength password="abcdefgh" />);
    expect(screen.getByLabelText('Password strength: Weak')).toBeTruthy();
    expect(screen.getByLabelText('A number: still needed')).toBeTruthy();
  });

  it('shows no strength before anything is typed', async () => {
    await renderScreen(<PasswordStrength password="" />);
    expect(screen.queryByLabelText(/Password strength/)).toBeNull();
  });
});

describe('Switch', () => {
  function Tips() {
    const [on, setOn] = useState(false);
    return <Switch label="Learning tips by email" value={on} onValueChange={setOn} />;
  }

  it('turns on and off when pressed', async () => {
    await renderScreen(<Tips />);
    const control = screen.getByRole('switch', { name: 'Learning tips by email' });
    expect(control).not.toBeChecked();
    await fireEvent.press(control);
    expect(screen.getByRole('switch', { name: 'Learning tips by email' })).toBeChecked();
  });

  it('stays on and cannot be changed when locked', async () => {
    const onValueChange = jest.fn();
    await renderScreen(
      <Switch label="OpenAI, required" value locked onValueChange={onValueChange} />,
    );
    const control = screen.getByRole('switch', { name: 'OpenAI, required' });
    expect(control).toBeChecked();
    expect(control).toBeDisabled();
    await fireEvent.press(control);
    expect(onValueChange).not.toHaveBeenCalled();
  });
});

describe('CodeInput', () => {
  it('keeps only the digits of what is typed or pasted', async () => {
    const onChangeText = jest.fn();
    await renderScreen(
      <CodeInput label="Verification code" value="" onChangeText={onChangeText} />,
    );
    await fireEvent.changeText(screen.getByLabelText('Verification code'), 'Code: 482 915 77');
    expect(onChangeText).toHaveBeenCalledWith('482915');
  });

  it('shows each digit in its own box', async () => {
    await renderScreen(<CodeInput label="Verification code" value="482" onChangeText={() => {}} />);
    // The boxes are a drawing of the input's value: hidden from screen readers, which read the input.
    const drawn = { includeHiddenElements: true };
    expect(screen.getByText('4', drawn)).toBeTruthy();
    expect(screen.getByText('8', drawn)).toBeTruthy();
    expect(screen.getByText('2', drawn)).toBeTruthy();
    expect(screen.getByLabelText('Verification code').props.value).toBe('482');
  });

  it('asks the system to offer the code from Mail or Messages', async () => {
    await renderScreen(<CodeInput label="Verification code" value="" onChangeText={() => {}} />);
    const input = screen.getByLabelText('Verification code');
    expect(input.props.textContentType).toBe('oneTimeCode');
    expect(input.props.autoComplete).toBe('one-time-code');
  });
});

describe('WheelPicker', () => {
  const items = [13, 14, 15].map((value) => ({ value, label: String(value) }));

  it('makes its rows taller as the OS text size grows, so labels are never clipped', () => {
    expect(wheelRowHeight(1)).toBe(40);
    expect(wheelRowHeight(2)).toBe(80);
  });

  it('steps to the next and previous value for screen readers', async () => {
    const onChange = jest.fn();
    await renderScreen(<WheelPicker label="Day" items={items} value={14} onChange={onChange} />);
    const wheel = screen.getByRole('adjustable', { name: 'Day' });
    expect(wheel.props.accessibilityValue).toEqual({ text: '14' });

    await fireEvent(wheel, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(onChange).toHaveBeenLastCalledWith(15);
    await fireEvent(wheel, 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    expect(onChange).toHaveBeenLastCalledWith(13);
  });

  it('does not step past the first or last value', async () => {
    const onChange = jest.fn();
    await renderScreen(<WheelPicker label="Day" items={items} value={15} onChange={onChange} />);
    await fireEvent(screen.getByRole('adjustable', { name: 'Day' }), 'accessibilityAction', {
      nativeEvent: { actionName: 'increment' },
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('picks the value under the centre line when the wheel is scrolled', async () => {
    const onChange = jest.fn();
    await renderScreen(<WheelPicker label="Day" items={items} value={13} onChange={onChange} />);
    // Two rows down. The test environment reports an OS text scale of 2.
    await fireEvent.scroll(screen.getByTestId('wheel-Day'), {
      nativeEvent: { contentOffset: { y: 2 * wheelRowHeight(2) } },
    });
    expect(onChange).toHaveBeenLastCalledWith(15);
  });

  it('picks a value when its row is tapped', async () => {
    const onChange = jest.fn();
    await renderScreen(<WheelPicker label="Day" items={items} value={13} onChange={onChange} />);
    await fireEvent.press(screen.getByText('14'));
    expect(onChange).toHaveBeenLastCalledWith(14);
  });
});
