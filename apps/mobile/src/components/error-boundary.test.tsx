import { useState } from 'react';
import { Pressable, Text } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ErrorBoundary } from './error-boundary';

const SECRET = 'undefined is not a function';

/** A screen that breaks while `broken` is true. */
function Screen({ broken }: { broken: { current: boolean } }) {
  if (broken.current) throw new TypeError(SECRET);
  return <Text>The screen</Text>;
}

function fallback(retry: () => void) {
  return (
    <Pressable accessibilityRole="button" onPress={retry}>
      <Text>Start over</Text>
    </Pressable>
  );
}

describe('ErrorBoundary', () => {
  let logged: jest.SpyInstance;
  beforeEach(() => {
    // React reports every caught error to the console; that is expected here.
    logged = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => logged.mockRestore());

  it('shows its children while nothing is wrong', async () => {
    await render(
      <ErrorBoundary fallback={fallback}>
        <Screen broken={{ current: false }} />
      </ErrorBoundary>,
    );

    expect(screen.getByText('The screen')).toBeTruthy();
    expect(screen.queryByText('Start over')).toBeNull();
  });

  it('shows the fallback, and nothing of the error, when a child breaks', async () => {
    await render(
      <ErrorBoundary fallback={fallback}>
        <Screen broken={{ current: true }} />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Start over')).toBeTruthy();
    expect(screen.queryByText('The screen')).toBeNull();
    expect(screen.queryByText(new RegExp(SECRET))).toBeNull();
  });

  it('shows its children again when the fallback asks to retry', async () => {
    const broken = { current: true };
    await render(
      <ErrorBoundary fallback={fallback}>
        <Screen broken={broken} />
      </ErrorBoundary>,
    );

    broken.current = false;
    await fireEvent.press(screen.getByRole('button'));

    expect(screen.getByText('The screen')).toBeTruthy();
  });

  it('starts fresh when the reset key changes (another screen was opened)', async () => {
    const broken = { current: true };
    function Shell() {
      const [route, setRoute] = useState('/today');
      return (
        <>
          <Pressable accessibilityRole="tab" onPress={() => setRoute('/talk')}>
            <Text>Talk</Text>
          </Pressable>
          <ErrorBoundary fallback={fallback} resetKey={route}>
            <Screen broken={broken} />
          </ErrorBoundary>
        </>
      );
    }
    await render(<Shell />);
    expect(screen.getByText('Start over')).toBeTruthy();

    broken.current = false;
    await fireEvent.press(screen.getByRole('tab'));

    expect(screen.getByText('The screen')).toBeTruthy();
  });
});
