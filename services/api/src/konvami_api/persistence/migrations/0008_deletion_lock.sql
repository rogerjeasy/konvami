-- A deletion and a write for the same account never overlap (profile design §4d, found in
-- review of 0007). Both take the same lock on the account's id first. A write that waited
-- for a deletion then finds the account deleted and fails as a whole; a deletion that waited
-- for a write then removes what it stored. Inside these functions every command sees what was
-- committed while the function waited, which a single plain statement would not.

-- Runs before any row of app_user is written, also when the row is already there (every
-- repository write begins with that insert): the place every write passes through.
CREATE OR REPLACE FUNCTION refuse_deleted_user() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended(CAST(NEW.id AS text), 0));
    IF EXISTS (SELECT 1 FROM deleted_user WHERE id = NEW.id) THEN
        RAISE EXCEPTION 'this account was deleted' USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS app_user_not_deleted ON app_user;

CREATE TRIGGER app_user_not_deleted BEFORE INSERT ON app_user
    FOR EACH ROW EXECUTE FUNCTION refuse_deleted_user();

-- Deletes an account's rows (every table refers to app_user with ON DELETE CASCADE), remembers
-- the deletion, and forgets deletions remembered since before forget_before.
CREATE OR REPLACE FUNCTION delete_app_user(target uuid, at timestamptz, forget_before timestamptz)
RETURNS integer LANGUAGE plpgsql AS $$
BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended(CAST(target AS text), 0));
    INSERT INTO deleted_user (id, deleted_at) VALUES (target, at)
        ON CONFLICT (id) DO UPDATE SET deleted_at = EXCLUDED.deleted_at;
    DELETE FROM app_user WHERE id = target;
    DELETE FROM deleted_user WHERE deleted_at < forget_before AND id <> target;
    RETURN 1;
END
$$;
