-- Widen the rate column. numeric(13,2) cannot hold sub-1% rates: a 2.5%
-- fee would silently round to 0.03 before the endpoint ever reads it.
-- numeric(6,4) holds rates up to 99.9999, which covers the 0.00-0.10
-- seed range and any realistic percentage fee.
ALTER TABLE vendor.deductions
  ALTER COLUMN deduction_value TYPE numeric(6, 4);
