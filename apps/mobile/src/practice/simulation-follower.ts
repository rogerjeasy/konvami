import type { ApiClient, Simulation } from '@konvami/api-client';
import {
  createWrittenFollower,
  DEVICE_TIMERS,
  type Timers,
  type WrittenFollower,
  type WrittenView,
} from './written-follower';

/** An exam simulation's score, as the result screen shows it. */
export type SimulationView = WrittenView<Simulation>;
export type SimulationFollower = WrittenFollower<Simulation, Simulation>;

/** How often (ms) a score being written is asked for again. */
export const POLL_MS = 4000;
/**
 * After this many times it counts as lost: four minutes, before the server itself gives it up
 * (services/api: `STALE_AFTER` in domain/exam_centre.py) and it can be asked for again.
 */
export const MAX_POLLS = 60;

/**
 * The server scores a simulation in the background after the call, in about half a minute, so
 * the result screen follows it until it is there.
 */
export function createSimulationFollower(
  api: Pick<ApiClient, 'getSimulation' | 'rescoreSimulation'>,
  callId: string,
  timers: Timers = DEVICE_TIMERS,
): SimulationFollower {
  return createWrittenFollower<Simulation, Simulation>(
    {
      read: () => api.getSimulation(callId),
      request: () => api.rescoreSimulation(callId),
      view: (simulation) =>
        simulation.status === 'ready'
          ? { phase: 'ready', value: simulation }
          : simulation.status === 'pending'
            ? { phase: 'writing' }
            : { phase: 'failed', code: simulation.status },
    },
    { pollMs: POLL_MS, maxPolls: MAX_POLLS },
    timers,
  );
}
