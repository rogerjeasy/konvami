-- Motivation (spec §6.15; docs/superpowers/specs/2026-11-20-motivation-design.md).

-- The three speaking quests of a week (week = its Monday on the learner's calendar), chosen once
-- so they do not change under the learner; done_at when first found done, celebrated_at once the
-- app showed the moment.
CREATE TABLE IF NOT EXISTS weekly_quest (
    user_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    week date NOT NULL,
    quest text NOT NULL,
    position smallint NOT NULL,
    target smallint NOT NULL CHECK (target > 0),
    chosen_at timestamptz NOT NULL,
    done_at timestamptz,
    celebrated_at timestamptz,
    PRIMARY KEY (user_id, week, quest)
);

-- When each milestone was first reached. backfilled: written down when milestones were first
-- dated, for a learner who had reached it before; such a row has no date to show and no
-- celebration.
CREATE TABLE IF NOT EXISTS milestone_reached (
    user_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    milestone text NOT NULL,
    reached_at timestamptz NOT NULL,
    backfilled boolean NOT NULL DEFAULT false,
    celebrated_at timestamptz,
    PRIMARY KEY (user_id, milestone)
);

-- "Pause reminders for a month": no quiet-week nudge from the server until then.
CREATE TABLE IF NOT EXISTS reminder_pause (
    user_id uuid PRIMARY KEY REFERENCES app_user (id) ON DELETE CASCADE,
    paused_until timestamptz NOT NULL
);
