import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import type { ApiClient, PersonaDraft, PersonaVoice } from '@konvami/api-client';
import { useSession } from '@/auth';
import { createAccountStore, type AccountState, type AccountStore } from './account-store';
import { createMemoryStore, type MemoryState, type MemoryStore } from './memory-store';
import { createPartnersStore, type PartnersState, type PartnersStore } from './partners-store';
import type { PictureDevice } from './pictures';
import type { SamplePlayer } from './sample-player';

/**
 * Everything the Profile screens (section 6) need beyond the session and the learner's
 * answers: the photo, the partners as Persona Studio edits them, what those partners know
 * about the learner, and the device's photo picker and audio player.
 */
export interface ProfileServices {
  account: AccountStore;
  partners: PartnersStore;
  /** What the learner's partners know about them from earlier conversations. */
  memory: MemoryStore;
  pictures: PictureDevice;
  samples: SamplePlayer;
  /**
   * What Persona Studio starts a new partner from: set by the screen that offers the ways to
   * begin (a description, a template), read by the studio when it opens. In memory only.
   */
  studioStart: {
    get(): PersonaDraft | null;
    set(draft: PersonaDraft | null): void;
  };
  /** A partner written from a description; nothing is saved. Rejects with an `ApiError`. */
  draftPartner: (description: string) => Promise<PersonaDraft>;
  /** Ready-made partners of the language being learned. */
  partnerTemplates: () => Promise<PersonaDraft[]>;
  /** A short-lived address of a voice's sample. */
  voiceSample: (voice: PersonaVoice) => Promise<string>;
  /** Deletes the account and everything stored for it. */
  deleteAccount: () => Promise<void>;
}

export function createProfileServices(
  api: ApiClient,
  device: {
    pictures: PictureDevice;
    samples: SamplePlayer;
    /** Called after partners changed, so Today and Talk read theirs again. */
    onPartnersChanged: () => void;
  },
): ProfileServices {
  let studioStart: PersonaDraft | null = null;
  return {
    account: createAccountStore(api, device.pictures.send),
    partners: createPartnersStore(api, device.onPartnersChanged),
    memory: createMemoryStore(api, Date.now),
    pictures: device.pictures,
    samples: device.samples,
    studioStart: {
      get: () => studioStart,
      set: (draft) => void (studioStart = draft),
    },
    draftPartner: (description) => api.draftPersona(description),
    partnerTemplates: () => api.getPersonaTemplates(),
    voiceSample: (voice) => api.getVoiceSample(voice),
    deleteAccount: () => api.deleteAccount(),
  };
}

const ProfileContext = createContext<ProfileServices | null>(null);

/**
 * Provides the profile services to every screen. It reads the learner's photo once they are
 * signed in (the header shows it everywhere) and empties the stores when they sign out, so one
 * account never sees another's photo, partners or memories on a shared device.
 */
export function ProfileProvider({
  services,
  children,
}: {
  services: ProfileServices;
  children: ReactNode;
}) {
  const { status } = useSession();
  useEffect(() => {
    if (status === 'signedIn') void services.account.load();
    if (status !== 'signedOut') return;
    services.samples.stop();
    services.studioStart.set(null);
    services.account.reset();
    services.partners.reset();
    services.memory.reset();
  }, [status, services]);
  return <ProfileContext.Provider value={services}>{children}</ProfileContext.Provider>;
}

export function useProfileServices(): ProfileServices {
  const services = useContext(ProfileContext);
  if (!services) throw new Error('useProfileServices must be used inside ProfileProvider');
  return services;
}

/** The learner's photo; re-renders when it changes. */
export function useAccount(): AccountState {
  const { account } = useProfileServices();
  return useSyncExternalStore(account.subscribe, account.getState, account.getState);
}

/** The learner's partners as Persona Studio shows them; re-renders when they change. */
export function usePartnerList(): PartnersState {
  const { partners } = useProfileServices();
  return useSyncExternalStore(partners.subscribe, partners.getState, partners.getState);
}

/** What the learner's partners know about them; re-renders when it changes. */
export function useMemories(): MemoryState {
  const { memory } = useProfileServices();
  return useSyncExternalStore(memory.subscribe, memory.getState, memory.getState);
}
