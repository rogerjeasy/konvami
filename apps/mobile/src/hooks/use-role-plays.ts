import type { TFunction } from 'i18next';
import { useEffect, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import type { OwnScenario, Scenario } from '@konvami/api-client';
import { usePracticeServices, useScenarios } from '@/practice/services';

/** One goal of a role-play, as the screens name it. */
export interface RolePlayGoal {
  id: string;
  label: string;
}

/**
 * A role-play as the screens show it, whether the language pack has it (named by the app's own
 * strings, by id) or the learner made it (5.31, worded by the learner or the server).
 */
export interface RolePlayView {
  /** How a call names it (`scenario`). */
  id: string;
  level: string;
  title: string;
  situation: string;
  /** Whom the partner plays; only an own role-play says. */
  character: string | null;
  goals: RolePlayGoal[];
  /** The learner's own role-play, for one they made. */
  own: OwnScenario | null;
}

type Translate = TFunction;

export function catalogRolePlay(t: Translate, scenario: Scenario): RolePlayView {
  return {
    id: scenario.id,
    level: scenario.level,
    title: t(`scenarios.${scenario.id}.title` as 'scenarios.bakery.title'),
    situation: t(`scenarios.${scenario.id}.situation` as 'scenarios.bakery.situation'),
    character: null,
    goals: scenario.goals.map((goal) => ({
      id: goal,
      label: t(`scenarios.${scenario.id}.goals.${goal}` as 'scenarios.bakery.goals.order'),
    })),
    own: null,
  };
}

/** An own role-play; a part left empty (a rehearsal written without the model) has the app's words. */
export function ownRolePlay(t: Translate, own: OwnScenario): RolePlayView {
  const { scene } = own;
  return {
    id: own.scenario,
    level: scene.level,
    title: scene.title,
    situation: scene.situation || t('realLife.standardSituation'),
    character: scene.character || t('realLife.standardCharacter'),
    goals: scene.goals.map((goal) => ({
      id: goal.id,
      label: goal.text || t(`realLife.goals.${goal.id}` as 'realLife.goals.explain'),
    })),
    own,
  };
}

/** The learner's own role-plays; loads them once. */
export function useOwnScenarios() {
  const { ownScenarios } = usePracticeServices();
  useEffect(() => {
    void ownScenarios.load();
  }, [ownScenarios]);
  return useSyncExternalStore(ownScenarios.subscribe, ownScenarios.getState, ownScenarios.getState);
}

/**
 * Every role-play the learner can play: the language pack's and their own. `find` names the one
 * a call or a conversation has, once both are read.
 */
export function useRolePlays() {
  const { t } = useTranslation();
  const catalog = useScenarios();
  const own = useOwnScenarios();
  const packs = catalog.scenarios?.map((scenario) => catalogRolePlay(t, scenario)) ?? null;
  const mine =
    own.phase === 'ready' ? own.data.scenarios.map((scenario) => ownRolePlay(t, scenario)) : null;
  return {
    phase: catalog.phase,
    catalog: packs,
    own: mine,
    ownFailed: own.phase === 'failed',
    retry: catalog.retry,
    find: (id: string) =>
      packs?.find((play) => play.id === id) ?? mine?.find((play) => play.id === id),
  };
}
