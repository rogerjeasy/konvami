import { fireEvent, screen } from '@testing-library/react-native';
import { renderScreen } from '@/test/render';
import { ConfirmSheet } from './confirm-sheet';
import { ListGroup, ListRow } from './list';
import { Scale } from './scale';
import { UserPhoto } from './user-photo';

describe('ListRow', () => {
  it('is a button named by its title, with its detail as the hint', async () => {
    const onPress = jest.fn();
    await renderScreen(
      <ListGroup>
        <ListRow
          icon="user"
          title="Personal"
          detail="Name, photo and app language"
          onPress={onPress}
        />
        <ListRow icon="lock" title="Security" value="amara@mail.com" onPress={() => {}} />
      </ListGroup>,
    );

    const row = screen.getByRole('button', { name: 'Personal' });
    expect(row).toHaveProp('accessibilityHint', 'Name, photo and app language');
    await fireEvent.press(row);

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.getByText('amara@mail.com')).toBeTruthy();
  });

  it('cannot be pressed while disabled', async () => {
    const onPress = jest.fn();
    await renderScreen(<ListRow icon="user" title="Personal" disabled onPress={onPress} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Personal' }));

    expect(onPress).not.toHaveBeenCalled();
  });
});

// The photo is decorative (the control around it is what a screen reader meets), so the
// tests look at what is drawn.
const HIDDEN = { includeHiddenElements: true };

describe('UserPhoto', () => {
  it('shows the photo when there is one', async () => {
    await renderScreen(<UserPhoto uri="https://files.test/me.jpg" name="Amara" diameter={64} />);

    expect(screen.getByTestId('user-photo-image', HIDDEN)).toHaveProp('source', {
      uri: 'https://files.test/me.jpg',
    });
    expect(screen.queryByText('A', HIDDEN)).toBeNull();
  });

  it('shows the first letter of the name without a photo', async () => {
    await renderScreen(<UserPhoto uri={null} name=" amara" diameter={64} />);

    expect(screen.getByText('A', HIDDEN)).toBeTruthy();
  });

  it('falls back to the letter when the photo cannot be loaded', async () => {
    await renderScreen(<UserPhoto uri="https://files.test/gone.jpg" name="Amara" diameter={64} />);

    await fireEvent(screen.getByTestId('user-photo-image', HIDDEN), 'error');

    expect(screen.getByText('A', HIDDEN)).toBeTruthy();
  });
});

describe('Scale', () => {
  it('offers five positions between its two ends and reports the chosen one', async () => {
    const onChange = jest.fn();
    await renderScreen(
      <Scale label="Warmth" low="Reserved" high="Warm" value={3} onChange={onChange} />,
    );

    expect(screen.getByLabelText('Warmth: Reserved to Warm')).toHaveProp(
      'accessibilityRole',
      'radiogroup',
    );
    expect(screen.getAllByRole('radio')).toHaveLength(5);
    expect(screen.getByRole('radio', { name: '3 of 5' })).toBeChecked();

    await fireEvent.press(screen.getByRole('radio', { name: '5 of 5' }));

    expect(onChange).toHaveBeenCalledWith(5);
  });
});

describe('ConfirmSheet', () => {
  it('asks the question and reports the answer', async () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    await renderScreen(
      <ConfirmSheet
        visible
        title="Remove Lena?"
        body="Your conversations with Lena stay in your library."
        confirmLabel="Remove"
        cancelLabel="Keep"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByRole('header', { name: 'Remove Lena?' })).toBeTruthy();
    expect(screen.getByText('Your conversations with Lena stay in your library.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Keep' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Remove' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('shows nothing while it is closed', async () => {
    await renderScreen(
      <ConfirmSheet
        visible={false}
        title="Remove Lena?"
        body="…"
        confirmLabel="Remove"
        cancelLabel="Keep"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );

    expect(screen.queryByText('Remove Lena?')).toBeNull();
  });
});
