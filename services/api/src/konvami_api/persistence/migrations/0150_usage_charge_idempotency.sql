-- Logical call finalization can safely retry after an ambiguous write response (§6.19).
-- NULL keeps ordinary independent requests independent, even when their usage is identical.
ALTER TABLE usage_charge ADD COLUMN request_key text UNIQUE;
