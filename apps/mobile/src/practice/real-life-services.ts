import type {
  ApiClient,
  OwnScenario,
  RealLife,
  Scene,
  SceneDraft,
  SpokenRecording,
  TeacherReport,
} from '@konvami/api-client';
import { calendarDateOf, toIsoDate } from '@/lib/dates';
import type { SentenceRecording } from '@/voice/sentence-recorder';
import { createResourceStore, type ResourceStore } from './resource-store';

/** The periods a report for the learner's teacher covers, in days (6.23). */
export const TEACHER_REPORT_DAYS = [7, 30, 90] as const;
export type TeacherReportDays = (typeof TEACHER_REPORT_DAYS)[number];

/**
 * Real life: the learner's own role-plays (5.31), the events of their life to rehearse before
 * and talk over after (5.13, Today), and the report for their teacher (6.23).
 */
export interface RealLifeServices {
  /** The learner's own role-plays, the latest first. */
  ownScenarios: ResourceStore<{ scenarios: OwnScenario[] }>;
  /** Events to rehearse and to talk over, as of today on this device. */
  realLife: ResourceStore<RealLife>;
  /** A scene written from what the learner described; nothing is kept. Rejects with an `ApiError`. */
  draftScene: (description: string) => Promise<Scene>;
  /** What a description said out loud says. Rejects with an `ApiError`. */
  hearScene: (recording: SentenceRecording) => Promise<string>;
  /** Keeps a scene: a new role-play, or `id` changed. Rejects with an `ApiError`. */
  saveScene: (scene: SceneDraft, id?: string) => Promise<OwnScenario>;
  removeScene: (id: string) => Promise<void>;
  /** The role-play that rehearses an event. Rejects with an `ApiError`. */
  rehearseEvent: (memoryId: string) => Promise<OwnScenario>;
  /** What the last days showed, for the learner's teacher. Rejects with an `ApiError`. */
  readTeacherReport: (days: TeacherReportDays) => Promise<TeacherReport>;
}

const spoken = (recording: SentenceRecording): SpokenRecording => ({
  audio: recording.base64,
  format: recording.format,
  durationMs: recording.durationMs,
});

export function createRealLifeServices(
  api: Pick<
    ApiClient,
    | 'getOwnScenarios'
    | 'draftOwnScenario'
    | 'hearScenarioDescription'
    | 'saveOwnScenario'
    | 'changeOwnScenario'
    | 'removeOwnScenario'
    | 'getRealLife'
    | 'rehearseEvent'
    | 'getTeacherReport'
  >,
  now: () => number,
): RealLifeServices {
  const ownScenarios = createResourceStore(() => api.getOwnScenarios(), now);
  const realLife = createResourceStore(
    () => api.getRealLife(toIsoDate(calendarDateOf(new Date(now())))),
    now,
  );
  return {
    ownScenarios,
    realLife,
    draftScene: (description) => api.draftOwnScenario(description),
    hearScene: async (recording) => (await api.hearScenarioDescription(spoken(recording))).text,
    saveScene: (scene, id) =>
      ownScenarios.mutate(
        () => (id ? api.changeOwnScenario(id, scene) : api.saveOwnScenario(scene)),
        (shown, kept) => ({
          scenarios: [kept, ...shown.scenarios.filter((one) => one.id !== kept.id)],
        }),
      ),
    async removeScene(id) {
      await ownScenarios.mutate(
        () => api.removeOwnScenario(id),
        (_, answer) => answer,
      );
      void realLife.refresh();
    },
    async rehearseEvent(memoryId) {
      const rehearsal = await api.rehearseEvent(memoryId);
      void ownScenarios.refresh();
      void realLife.refresh();
      return rehearsal;
    },
    readTeacherReport: (days) => api.getTeacherReport(days),
  };
}
