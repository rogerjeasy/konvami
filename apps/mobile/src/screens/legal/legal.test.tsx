import { screen } from '@testing-library/react-native';
import { LEGAL_DOCUMENTS } from '@/legal/documents.generated';
import { renderScreen } from '@/test/render';
import { LegalScreen } from '.';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => false) },
}));

describe('LegalScreen', () => {
  it('shows the Terms of Use in the app language, without an account', async () => {
    await renderScreen(<LegalScreen page="terms" />);

    expect(screen.getByRole('header', { name: 'Terms of Use' })).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Your partners are AI' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
  });

  it('shows the Privacy Policy, with its sections as headings and its list items as text', async () => {
    await renderScreen(<LegalScreen page="privacy" />);

    expect(screen.getByRole('header', { name: 'Privacy Policy' })).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Your rights' })).toBeTruthy();
    expect(screen.getByText(/recordings of the turns, so you can listen again/)).toBeTruthy();
  });

  it('says it is a draft while the provider’s details are not filled in, and never shows a blank', async () => {
    await renderScreen(<LegalScreen page="privacy" />);

    expect(screen.getByText('Draft')).toBeTruthy();
    expect(screen.queryByText(/\{\{/)).toBeNull();
    expect(screen.getAllByText(/not set/).length).toBeGreaterThan(0);
  });

  it('has no placeholder the app cannot fill', () => {
    const known = new Set(['controller.name', 'controller.address', 'controller.email', 'updated']);
    for (const pages of Object.values(LEGAL_DOCUMENTS)) {
      for (const document of Object.values(pages)) {
        const text = JSON.stringify(document);
        for (const [, name] of text.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)) {
          expect(known.has(name as string)).toBe(true);
        }
      }
    }
  });
});
