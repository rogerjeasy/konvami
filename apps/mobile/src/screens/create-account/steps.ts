/** Where each screen sits in the "n of 4" progress header (2.2 and 2.3 share a step). */
export const SIGN_UP_STEPS = {
  total: 4,
  ageCheck: 1,
  account: 2,
  verify: 3,
  consent: 4,
} as const;
