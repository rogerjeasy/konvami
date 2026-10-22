import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import type {
  ApiClient,
  Costs,
  PersonaDraft,
  PersonaVoice,
  Recordings,
  VoiceAllowance,
} from '@konvami/api-client';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/auth';
import { formatDayLine } from '@/lib/format';
import type { ClipPlayer } from '@/lib/clip-player';
import {
  createResourceStore,
  type ResourceState,
  type ResourceStore,
} from '@/practice/resource-store';
import { createAccountStore, type AccountState, type AccountStore } from './account-store';
import { createMemoryStore, type MemoryState, type MemoryStore } from './memory-store';
import { createPartnersStore, type PartnersState, type PartnersStore } from './partners-store';
import type { PictureDevice } from './pictures';

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
  /** Whether the audio of conversations is kept (6.7). */
  recordings: ResourceStore<Recordings>;
  /**
   * Keeps recordings or stops; stopping deletes every recording kept so far. Rejects with an
   * `ApiError`, and then what is shown stays as it was.
   */
  keepRecordings: (kept: boolean) => Promise<Recordings>;
  /** The learner's voice minutes this week (spec §6.19). */
  allowance: ResourceStore<VoiceAllowance>;
  /**
   * A month's estimated spending, for the owner only (`month` is its first day, this month when
   * left out). Rejects with an `ApiError` (`not_owner` for anyone else).
   */
  costs: (month?: string) => Promise<Costs>;
  pictures: PictureDevice;
  samples: ClipPlayer;
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
    samples: ClipPlayer;
    /** Called after partners changed, so Today and Talk read theirs again. */
    onPartnersChanged: () => void;
  },
): ProfileServices {
  let studioStart: PersonaDraft | null = null;
  const recordings = createResourceStore(() => api.getRecordings(), Date.now);
  const allowance = createResourceStore(() => api.getVoiceAllowance(), Date.now);
  return {
    account: createAccountStore(api, device.pictures.send),
    partners: createPartnersStore(api, device.onPartnersChanged),
    memory: createMemoryStore(api, Date.now),
    recordings,
    keepRecordings: (kept) =>
      recordings.mutate(
        () => api.configureRecordings(kept),
        (_, answer) => answer,
      ),
    allowance,
    costs: (month) => api.getCosts(month),
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
    services.recordings.reset();
    services.allowance.reset();
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

/** Whether the audio of conversations is kept; re-renders when it changes. */
export function useRecordings(): ResourceState<Recordings> {
  const { recordings } = useProfileServices();
  return useSyncExternalStore(recordings.subscribe, recordings.getState, recordings.getState);
}

/** The learner's voice minutes this week; re-renders when they change. */
export function useAllowance(): ResourceState<VoiceAllowance> {
  const { allowance } = useProfileServices();
  return useSyncExternalStore(allowance.subscribe, allowance.getState, allowance.getState);
}

/**
 * When the learner's voice minutes come back, as a sentence ("They come back on Monday
 * 12 October."), once `wanted`: the minutes are read again then (on the Profile, or after a
 * call was refused for them). Null until they are known.
 */
export function useMinutesBack(wanted: boolean): string | null {
  const { t, i18n } = useTranslation();
  const { allowance } = useProfileServices();
  const state = useAllowance();
  useEffect(() => {
    if (wanted) void allowance.refresh();
  }, [wanted, allowance]);
  if (!wanted || state.phase !== 'ready') return null;
  return t('call.minutesBack', {
    day: formatDayLine(i18n.language, new Date(state.data.resetsAt)),
  });
}
