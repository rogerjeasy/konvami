import { screen } from '@testing-library/react-native';
import { renderScreen } from '@/test/render';
import { ExamVisual } from './exam-visual';

it('renders the requested scene as a labelled image', async () => {
  await renderScreen(<ExamVisual picture="waiting_room" />);
  expect(screen.getByRole('image', { name: 'A family waiting at a doctor’s office' })).toBeTruthy();
});

it('shows two photos, A and B, for a task that compares them', async () => {
  await renderScreen(<ExamVisual picture="waiting_pair" />);
  expect(screen.getByText('Photo A')).toBeTruthy();
  expect(screen.getByText('Photo B')).toBeTruthy();
  expect(
    screen.getByRole('image', { name: 'People waiting at a bus stop in the rain' }),
  ).toBeTruthy();
});

it('renders every chart label and value as accessible data', async () => {
  await renderScreen(
    <ExamVisual figure={{ title: 'Fiktive Daten', labels: ['Bus', 'Rad'], values: [60, 40] }} />,
  );
  expect(screen.getByText('Fiktive Daten')).toBeTruthy();
  expect(screen.getByRole('progressbar', { name: 'Bus: 60%' })).toBeTruthy();
  expect(screen.getByRole('progressbar', { name: 'Rad: 40%' })).toBeTruthy();
});
