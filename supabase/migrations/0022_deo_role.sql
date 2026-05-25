-- 0022_deo_role.sql
-- Adds the Data Entry Operator role. Commits standalone before 0023's
-- policies reference it (Postgres won't let you reference a new enum value
-- in the same transaction as ADD VALUE — same pattern as 0008/0009).

alter type user_role add value if not exists 'deo';
