-- Key each expense event by its owning deduction.
--
-- The old PK (store_id, source_system_id, expense_date, expense_type,
-- expense_subtype) allowed only ONE event per product per day per subtype,
-- so two overlapping same-type deductions collided on insert (unique
-- violation, surfaced by the endpoint as 409 EXPENSE_CONFLICT). With
-- deduction_id in the key, each deduction owns its own rows: overlaps
-- coexist, a recompute stays idempotent, and the 409 class disappears.
-- The endpoint keeps its 23505 -> 409 mapping as defense for databases
-- that predate this change.
--
-- expense_subtype stays in the key: the seed stores several generic
-- expense lines per product-day (warehousing, storage, transport) that
-- differ only by subtype, and a deduction-scoped SELL_OUT event and a
-- generic line must not crowd each other out.
--
-- expense_date (the hypertable partition column) is part of the key, as
-- TimescaleDB requires for PK/unique constraints.
--
-- Backfill: rows with no owning deduction (the seeded generic expense
-- lines) take deduction_id = 0. The API rejects 0 as an id, so no real
-- deduction can ever collide with the sentinel.

ALTER TABLE vendor.expense_events
  DROP CONSTRAINT expense_events_pkey;

UPDATE vendor.expense_events
  SET deduction_id = 0
  WHERE deduction_id IS NULL;

ALTER TABLE vendor.expense_events
  ADD CONSTRAINT expense_events_pkey
  PRIMARY KEY (store_id, deduction_id, source_system_id, expense_date,
               expense_subtype);
