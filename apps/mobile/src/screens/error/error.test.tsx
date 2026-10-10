import { Text } from 'react-native';
import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { renderScreen } from '@/test/render';
import { ScreenBoundary } from '.';

jest.mock('expo-router', () => ({
  router: { replace: jest.fn() },
}));

const SECRET = 'undefined is not a function';

function Screen({ broken }: { broken: { current: boolean } }) {
  if (broken.current) throw new TypeError(SECRET);
  return <Text>The screen</Text>;
}

describe('a screen that breaks', () => {
  let logged: jest.SpyInstance;
  beforeEach(() => {
    jest.clearAllMocks();
    // React reports every caught error to the console; that is expected here.
    logged = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => logged.mockRestore());

  it('says so in plain words, with no error text or trace', async () => {
    await renderScreen(
      <ScreenBoundary>
        <Screen broken={{ current: true }} />
      </ScreenBoundary>,
    );

    expect(screen.getByRole('header', { name: 'Something went wrong' })).toBeTruthy();
    expect(screen.getByText('This screen couldn’t be shown. Please try again.')).toBeTruthy();
    expect(screen.queryByText(new RegExp(SECRET))).toBeNull();
    expect(screen.queryByText(/TypeError|\.tsx?|at /)).toBeNull();
  });

  it('shows the screen again on "Try again"', async () => {
    const broken = { current: true };
    await renderScreen(
      <ScreenBoundary>
        <Screen broken={broken} />
      </ScreenBoundary>,
    );

    broken.current = false;
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

    expect(screen.getByText('The screen')).toBeTruthy();
  });

  it('offers the way back to the start of the app', async () => {
    await renderScreen(
      <ScreenBoundary>
        <Screen broken={{ current: true }} />
      </ScreenBoundary>,
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Back to the start' }));

    expect(router.replace).toHaveBeenCalledWith('/home');
  });

  it('offers only "Try again" where the screen has its own way out (inside the tabs)', async () => {
    await renderScreen(
      <ScreenBoundary leave={false}>
        <Screen broken={{ current: true }} />
      </ScreenBoundary>,
    );

    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Back to the start' })).toBeNull();
  });
});
