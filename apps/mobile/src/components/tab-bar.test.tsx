import { fireEvent, screen } from '@testing-library/react-native';
import { renderScreen } from '@/test/render';
import { TabBar, TabButton } from './tab-bar';

describe('TabBar', () => {
  it('is announced as the list of tabs', async () => {
    await renderScreen(
      <TabBar label="Main navigation" side={false}>
        <TabButton icon="home" label="Today" />
      </TabBar>,
    );

    // The bar is a container, not one control: its tabs stay reachable one by one.
    expect(screen.getByLabelText('Main navigation').props.accessibilityRole).toBe('tablist');
  });

  it('shows each tab by its name and marks the one that is open', async () => {
    await renderScreen(
      <TabBar label="Main navigation" side={false}>
        <TabButton icon="home" label="Today" isFocused />
        <TabButton icon="message" label="Talk" isFocused={false} />
      </TabBar>,
    );

    expect(screen.getByRole('tab', { name: 'Today' }).props.accessibilityState).toMatchObject({
      selected: true,
    });
    expect(screen.getByRole('tab', { name: 'Talk' }).props.accessibilityState).toMatchObject({
      selected: false,
    });
  });

  it('opens a tab when it is pressed', async () => {
    const onPress = jest.fn();
    await renderScreen(
      <TabBar label="Main navigation" side>
        <TabButton icon="message" label="Talk" onPress={onPress} />
      </TabBar>,
    );

    await fireEvent.press(screen.getByRole('tab', { name: 'Talk' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
