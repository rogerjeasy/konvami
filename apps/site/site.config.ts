import type { Settings } from './src/pages.ts';

/**
 * Who is responsible for learners' data (the "controller" of GDPR art. 4(7) and revFADP art. 5(j))
 * and how to reach them. The privacy policy prints these; the build refuses to run while one is
 * empty. They are published on the site, so they are not secrets.
 *
 * Change `updated` whenever the content of a page changes.
 */
export const config: Settings = {
  controller: {
    /** A person's full name, or a company's registered name. */
    name: '',
    /** A postal address where letters reach the controller. */
    address: '',
    /** The address learners write to about their data. */
    email: '',
  },
  updated: '2026-10-23',
};
