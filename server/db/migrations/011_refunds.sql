-- Refunds are a supported payment state.
BEGIN;
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_state_check;
ALTER TABLE orders ADD CONSTRAINT orders_state_check
  CHECK (state IN ('created','pending_payment','paid','fulfilled','refunded','failed','cancelled','expired'));
COMMIT;
