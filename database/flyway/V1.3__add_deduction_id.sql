ALTER TABLE vendor.expense_events
ADD COLUMN deduction_id BIGINT NULL DEFAULT NULL;

CREATE INDEX storeId_deductionId ON vendor.expense_events (store_id, deduction_id);