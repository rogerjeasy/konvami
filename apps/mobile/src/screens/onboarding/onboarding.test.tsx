import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { createFakeApi, ESSENTIAL_ANSWERS, type FakeApi } from '@/test/fake-api';
import { renderScreen } from '@/test/render';
import { CourseStep } from './course';
import { ExplanationsStep } from './explanations';
import { GoalsStep } from './goals';
import { LanguageStep } from './language';
import { LevelStep } from './level';
import { ReviewScreen } from './review';

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: jest.fn(() => ({})),
  Redirect: ({ href }: { href: string }) => {
    const { Text } = jest.requireActual('react-native');
    return <Text>{`redirect:${href}`}</Text>;
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useLocalSearchParams).mockReturnValue({});
  (SecureStore as unknown as { __reset: () => void }).__reset();
});

/** Renders a step for a signed-in learner and waits until their data has loaded. */
async function open(ui: React.ReactElement, api: FakeApi = createFakeApi()) {
  await renderScreen(ui, { api, signedIn: true });
  await waitFor(() => expect(screen.queryByText('Getting things ready')).toBeNull());
  return api;
}

const TODAY = new Date('2026-10-09T12:00:00');

/** An API whose learner has already answered the first `count` essential fields. */
function answered(count: number): FakeApi {
  const api = createFakeApi();
  api.answer(ESSENTIAL_ANSWERS.slice(0, count));
  return api;
}

const step = (wheel: string, action: 'increment' | 'decrement') =>
  fireEvent(screen.getByRole('adjustable', { name: wheel }), 'accessibilityAction', {
    nativeEvent: { actionName: action },
  });

const saved = (api: FakeApi) =>
  api.calls.filter(([method]) => method === 'updateProfile').map(([, changes]) => changes);

describe('4.2 Language to learn', () => {
  it('offers German and shows the other languages as coming soon', async () => {
    await open(<LanguageStep />);

    expect(
      screen.getByRole('header', { name: 'Which language do you want to learn?' }),
    ).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Step 1 of 5' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Deutsch, German' })).toBeEnabled();
    expect(screen.getByRole('radio', { name: 'Français, French, Coming soon' })).toBeDisabled();
  });

  it('does not repeat a language name that is the same in the app language', async () => {
    await open(<LanguageStep />);

    expect(screen.getByRole('radio', { name: 'English, Coming soon' })).toBeTruthy();
  });

  it('keeps Continue off until a language is chosen, then saves it and moves on', async () => {
    const api = await open(<LanguageStep />);
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();

    await fireEvent.press(screen.getByRole('radio', { name: 'Deutsch, German' }));
    expect(screen.getByRole('radio', { name: 'Deutsch, German' })).toBeChecked();
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/onboarding/explanations'));
    expect(saved(api)).toEqual([[{ field: 'target_language', value: 'de' }]]);
  });

  it('shows the answer given earlier', async () => {
    const api = createFakeApi();
    api.answer(ESSENTIAL_ANSWERS.slice(0, 1));

    await open(<LanguageStep />, api);

    expect(screen.getByRole('radio', { name: 'Deutsch, German' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  });

  it('says so when the answer cannot be saved, and stays so it can be sent again', async () => {
    const api = await open(<LanguageStep />);
    api.failNext('updateProfile', 'network');

    await fireEvent.press(screen.getByRole('radio', { name: 'Deutsch, German' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));

    expect(
      await screen.findByText('Can’t reach Konvami. Check your connection and try again.'),
    ).toBeTruthy();
    expect(router.push).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/onboarding/explanations'));
  });

  it('shows a loading state, then the choices', async () => {
    const api = createFakeApi();
    const release = api.hold();
    await renderScreen(<LanguageStep />, { api, signedIn: true });

    expect(screen.getByText('Getting things ready')).toBeTruthy();
    expect(screen.queryByRole('radio', { name: 'Deutsch, German' })).toBeNull();

    await act(async () => release());
    expect(await screen.findByRole('radio', { name: 'Deutsch, German' })).toBeTruthy();
  });

  it('names a missing connection when loading fails for that reason', async () => {
    const api = createFakeApi();
    api.failNext('getProfile', 'network');
    await renderScreen(<LanguageStep />, { api, signedIn: true });

    expect(
      await screen.findByText('Can’t reach Konvami. Check your connection and try again.'),
    ).toBeTruthy();
  });

  it('offers to try again when loading fails', async () => {
    const api = createFakeApi();
    api.failNext('getProfile', 'unknown');
    await renderScreen(<LanguageStep />, { api, signedIn: true });

    expect(await screen.findByText('Your setup couldn’t be loaded.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('radio', { name: 'Deutsch, German' })).toBeTruthy();
  });

  it('goes back to the review after an edit that started there', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ from: 'review' });
    const api = createFakeApi();
    api.answer(ESSENTIAL_ANSWERS);
    await open(<LanguageStep />, api);

    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(router.push).not.toHaveBeenCalled();
  });

  it('sends someone who is not signed in to the start', async () => {
    await renderScreen(<LanguageStep />, { api: createFakeApi() });

    expect(screen.getByText('redirect:/welcome')).toBeTruthy();
  });
});

describe('4.2 Explanation language', () => {
  it('lists the app language first and keeps Continue off until both questions are answered', async () => {
    await open(<ExplanationsStep />, answered(1));

    expect(screen.getByRole('progressbar', { name: 'Step 2 of 5' })).toBeTruthy();
    const languages = screen.getAllByRole('radio').slice(0, 4);
    expect(languages.map((radio) => radio.props.accessibilityLabel)).toEqual([
      'English, App language',
      'Deutsch',
      'Français',
      'Italiano',
    ]);

    await fireEvent.press(screen.getByRole('radio', { name: 'Français' }));
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    await fireEvent.press(screen.getByRole('radio', { name: /^Only when I’m stuck/ }));
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  });

  it('saves the language and how much to use it, then moves on to the goals', async () => {
    const api = await open(<ExplanationsStep />, answered(1));

    await fireEvent.press(screen.getByRole('radio', { name: 'English, App language' }));
    await fireEvent.press(screen.getByRole('radio', { name: /^For grammar/ }));
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/onboarding/goals'));
    expect(saved(api)).toEqual([
      [
        { field: 'explanation_language', value: 'en' },
        { field: 'explanation_usage', value: 'for_grammar' },
      ],
    ]);
  });

  it('offers every other language in a list', async () => {
    const api = await open(<ExplanationsStep />, answered(1));

    await fireEvent.press(screen.getByRole('button', { name: 'Another language' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Shqip' }));

    expect(screen.getByRole('radio', { name: 'Shqip' })).toBeChecked();
    await fireEvent.press(screen.getByRole('radio', { name: /^Whenever it helps/ }));
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(router.push).toHaveBeenCalled());
    expect(saved(api)[0]).toContainEqual({ field: 'explanation_language', value: 'sq' });
  });

  it('shows the answers given earlier', async () => {
    await open(<ExplanationsStep />, answered(3));

    expect(screen.getByRole('radio', { name: 'English, App language' })).toBeChecked();
    expect(screen.getByRole('radio', { name: /^Only when I’m stuck/ })).toBeChecked();
  });

  it('sends a learner without a language to learn back to that question', async () => {
    await open(<ExplanationsStep />);

    expect(screen.getByText('redirect:/onboarding/language')).toBeTruthy();
  });
});

describe('4.2 Goals and exam', () => {
  it('asks about the language being learned and needs at least one reason', async () => {
    await open(<GoalsStep today={TODAY} />, answered(3));

    expect(screen.getByRole('header', { name: 'Why are you learning German?' })).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Step 3 of 5' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });

  it('saves the reasons in the catalog’s order with the note, and no exam', async () => {
    const api = await open(<GoalsStep today={TODAY} />, answered(3));

    await fireEvent.press(screen.getByRole('checkbox', { name: 'Work' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Travel' }));
    await fireEvent.changeText(
      screen.getByLabelText('Anything else I should know? (optional)'),
      'Job interview in March',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/onboarding/level'));
    expect(saved(api)).toEqual([
      [
        { field: 'goals', value: { reasons: ['travel', 'work'], note: 'Job interview in March' } },
        { field: 'exam', value: null },
      ],
    ]);
  });

  it('removes a reason that is tapped again', async () => {
    await open(<GoalsStep today={TODAY} />, answered(3));

    await fireEvent.press(screen.getByRole('checkbox', { name: 'Work' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Work' }));

    expect(screen.getByRole('checkbox', { name: 'Work' })).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });

  it('asks which exam once an exam is a reason, and needs that answer', async () => {
    const api = await open(<GoalsStep today={TODAY} />, answered(3));
    expect(screen.queryByText('Which exam?')).toBeNull();

    await fireEvent.press(screen.getByRole('checkbox', { name: 'An exam' }));
    expect(screen.getByText('Which exam?')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();

    await fireEvent.press(screen.getByRole('radio', { name: 'Goethe-Zertifikat' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'B1' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(router.push).toHaveBeenCalled());
    expect(saved(api)[0]).toContainEqual({
      field: 'exam',
      value: { type: 'goethe', target_level: 'B1', date: null },
    });
  });

  it('offers only the levels the chosen exam has, and drops a level it does not have', async () => {
    await open(<GoalsStep today={TODAY} />, answered(3));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'An exam' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Goethe-Zertifikat' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'A2' }));

    await fireEvent.press(screen.getByRole('radio', { name: 'TestDaF' }));

    expect(screen.queryByRole('radio', { name: 'A2' })).toBeNull();
    expect(screen.getByRole('radio', { name: 'B2' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'C1' })).toBeTruthy();
  });

  it('takes an exam date from the wheels, and can remove it again', async () => {
    const api = await open(<GoalsStep today={TODAY} />, answered(3));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'An exam' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'telc Deutsch' }));

    await fireEvent.press(screen.getByRole('button', { name: 'Add the exam date' }));
    // The wheels open one month from today: 9 November 2026.
    await step('Year', 'increment');
    await fireEvent.press(screen.getByRole('button', { name: 'Set date' }));
    expect(screen.getByText('November 9, 2027')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(router.push).toHaveBeenCalled());
    expect(saved(api)[0]).toContainEqual({
      field: 'exam',
      value: { type: 'telc', target_level: null, date: '2027-11-09' },
    });

    await fireEvent.press(screen.getByRole('button', { name: 'Remove date' }));
    expect(screen.queryByText('November 9, 2027')).toBeNull();
  });

  it('never offers an exam date in the past', async () => {
    await open(<GoalsStep today={TODAY} />, answered(3));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'An exam' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'telc Deutsch' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Add the exam date' }));

    // 9 November 2026 → October keeps the day, which is today; September is not offered.
    await step('Month', 'decrement');
    await step('Month', 'decrement');
    await step('Day', 'decrement');

    // Jest's window has a large text size, at which the wheels show short month names.
    expect(screen.getByRole('adjustable', { name: 'Month' }).props.accessibilityValue).toEqual({
      text: 'Oct',
    });
    expect(screen.getByRole('adjustable', { name: 'Day' }).props.accessibilityValue).toEqual({
      text: '9',
    });
  });

  it('forgets the exam when it is no longer a reason', async () => {
    const api = await open(<GoalsStep today={TODAY} />, answered(3));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Work' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'An exam' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'ÖSD' }));

    await fireEvent.press(screen.getByRole('checkbox', { name: 'An exam' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(router.push).toHaveBeenCalled());
    expect(saved(api)).toEqual([
      [
        { field: 'goals', value: { reasons: ['work'], note: null } },
        { field: 'exam', value: null },
      ],
    ]);
  });

  it('shows the answers given earlier', async () => {
    const api = answered(3);
    api.answer([
      { field: 'goals', value: { reasons: ['exam', 'culture'], note: 'Films without subtitles' } },
      { field: 'exam', value: { type: 'goethe', target_level: 'B2', date: '2027-06-15' } },
    ]);

    await open(<GoalsStep today={TODAY} />, api);

    expect(screen.getByRole('checkbox', { name: 'Culture and media' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Goethe-Zertifikat' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'B2' })).toBeChecked();
    expect(screen.getByText('June 15, 2027')).toBeTruthy();
    expect(screen.getByDisplayValue('Films without subtitles')).toBeTruthy();
  });
});

describe('4.2 Level', () => {
  it('describes each level and saves the chosen one', async () => {
    const api = await open(<LevelStep />, answered(5));
    expect(screen.getByRole('header', { name: 'How’s your German today?' })).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Step 4 of 5' })).toBeTruthy();
    expect(screen.getAllByRole('radio')).toHaveLength(7);
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();

    await fireEvent.press(
      screen.getByRole('radio', {
        name: 'A2 · Elementary, I can handle everyday situations in simple sentences',
      }),
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/onboarding/course'));
    expect(saved(api)).toEqual([[{ field: 'self_assessed_level', value: 'A2' }]]);
  });

  it('shows the level given earlier', async () => {
    await open(<LevelStep />, answered(6));

    expect(screen.getByRole('radio', { name: /^A2 · Elementary/ })).toBeChecked();
  });
});

describe('4.2 Course or textbook', () => {
  it('saves "no course" and leads to the review', async () => {
    const api = await open(<CourseStep />, answered(6));
    expect(screen.getByRole('progressbar', { name: 'Step 5 of 5' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();

    await fireEvent.press(screen.getByRole('radio', { name: 'No, I’m learning on my own' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/onboarding/review'));
    expect(saved(api)).toEqual([[{ field: 'course', value: null }]]);
  });

  it('asks for the course name when there is one, and takes the chapter if given', async () => {
    const api = await open(<CourseStep />, answered(6));
    expect(screen.queryByLabelText('Course or textbook')).toBeNull();

    await fireEvent.press(screen.getByRole('radio', { name: 'Yes, I am' }));
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText('Course or textbook'), '  Menschen A2 ');
    await fireEvent.changeText(screen.getByLabelText('Chapter or unit (optional)'), '5');
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(router.push).toHaveBeenCalled());
    expect(saved(api)).toEqual([
      [{ field: 'course', value: { name: 'Menschen A2', chapter: '5' } }],
    ]);
  });

  it('shows the course given earlier', async () => {
    const api = answered(6);
    api.answer([{ field: 'course', value: { name: 'VHS Abendkurs', chapter: null } }]);

    await open(<CourseStep />, api);

    expect(screen.getByRole('radio', { name: 'Yes, I am' })).toBeChecked();
    expect(screen.getByDisplayValue('VHS Abendkurs')).toBeTruthy();
  });
});

describe('4.3 Review', () => {
  function complete(): FakeApi {
    const api = answered(7);
    api.answer([
      { field: 'goals', value: { reasons: ['work', 'exam'], note: 'Job in Zürich' } },
      { field: 'exam', value: { type: 'goethe', target_level: 'B1', date: '2027-06-15' } },
      { field: 'course', value: { name: 'Menschen A2', chapter: '5' } },
    ]);
    return api;
  }

  it('reads every answer back in words', async () => {
    await open(<ReviewScreen />, complete());

    expect(screen.getByRole('header', { name: 'Here’s what I noted, Amara' })).toBeTruthy();
    expect(screen.getByText('German')).toBeTruthy();
    expect(screen.getByText('English · Only when I’m stuck')).toBeTruthy();
    expect(screen.getByText('Work, An exam')).toBeTruthy();
    expect(screen.getByText('Job in Zürich')).toBeTruthy();
    expect(screen.getByText('Goethe-Zertifikat · B1 · June 15, 2027')).toBeTruthy();
    expect(screen.getByText('A2 · Elementary')).toBeTruthy();
    expect(screen.getByText('Menschen A2 · Chapter 5')).toBeTruthy();
    expect(screen.getAllByText('You told me')).toHaveLength(5);
  });

  it('says in words when there is no exam and no course', async () => {
    await open(<ReviewScreen />, answered(7));

    expect(screen.getByText('No exam planned')).toBeTruthy();
    expect(screen.getByText('Learning on my own')).toBeTruthy();
  });

  it('opens a question for editing and comes back afterwards', async () => {
    await open(<ReviewScreen />, complete());

    await fireEvent.press(screen.getByRole('button', { name: 'Edit: Goals' }));

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/onboarding/goals',
      params: { from: 'review' },
    });
  });

  it('confirms the answers and continues where onboarding goes next', async () => {
    const api = await open(<ReviewScreen />, complete());

    await fireEvent.press(screen.getByRole('button', { name: 'That’s right' }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/onboarding/placement'));
    expect(api.calls).toContainEqual(['confirmEssentials']);
  });

  it('says so when confirming fails, and can be tried again', async () => {
    const api = await open(<ReviewScreen />, complete());
    api.failNext('confirmEssentials', 'network');

    await fireEvent.press(screen.getByRole('button', { name: 'That’s right' }));

    expect(
      await screen.findByText('Can’t reach Konvami. Check your connection and try again.'),
    ).toBeTruthy();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('sends a learner with open questions back to the first one', async () => {
    await open(<ReviewScreen />, answered(4));

    expect(screen.getByText('redirect:/onboarding/goals')).toBeTruthy();
  });
});
