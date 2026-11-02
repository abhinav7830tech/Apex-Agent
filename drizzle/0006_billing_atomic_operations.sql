-- Atomic billing/quota operations are separate from the schema migration.
-- All functions use SECURITY DEFINER with a pinned search_path and are revoked
-- from PUBLIC below. Deployment must grant EXECUTE only to the backend role.

CREATE FUNCTION billing_account_has_non_starter_entitlement(p_account_id text, p_at timestamptz)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM grandfathering_cohort_members gm
      JOIN grandfathering_batches gb ON gb.id = gm.batch_id
      WHERE gm.billing_account_id = p_account_id
        AND gm.member_state = 'grandfathered'
        AND gb.status IN ('applied', 'verified')
    )
    OR EXISTS (
      SELECT 1 FROM billing_subscriptions s
      WHERE s.billing_account_id = p_account_id AND s.is_current
        AND (
          (s.status = 'active' AND s.current_period_end > p_at)
          OR (s.status = 'trialing' AND s.trial_end IS NOT NULL AND s.trial_end > p_at)
          OR (s.grace_until IS NOT NULL AND s.grace_until > p_at)
          OR (s.cancel_at_period_end AND s.current_period_end > p_at)
        )
    );
$$;--> statement-breakpoint

CREATE FUNCTION enforce_grandfathering_transition() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.member_state = 'converted' THEN
      RAISE EXCEPTION 'grandfathering conversion requires an existing grandfathered cohort member';
    END IF;
    IF NEW.member_state = 'grandfathered' AND NOT EXISTS (
      SELECT 1 FROM grandfathering_batches b
      WHERE b.id = NEW.batch_id AND b.status IN ('approved', 'applied', 'verified')
    ) THEN
      RAISE EXCEPTION 'grandfathering batch is not approved';
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.batch_id, NEW.billing_account_id) IS DISTINCT FROM (OLD.batch_id, OLD.billing_account_id) THEN
    RAISE EXCEPTION 'grandfathering cohort identity is immutable';
  END IF;
  IF OLD.member_state = 'converted' AND NEW.member_state <> 'converted' THEN
    RAISE EXCEPTION 'grandfathering conversion is permanent';
  END IF;
  IF OLD.member_state = 'candidate' AND NEW.member_state = 'converted' THEN
    RAISE EXCEPTION 'candidate must be grandfathered before conversion';
  END IF;
  IF OLD.member_state = 'excluded' AND NEW.member_state <> 'excluded' THEN
    RAISE EXCEPTION 'excluded cohort membership is terminal';
  END IF;
  IF OLD.member_state = 'grandfathered' AND NEW.member_state NOT IN ('grandfathered', 'converted') THEN
    RAISE EXCEPTION 'applied grandfathering membership cannot be revoked';
  END IF;
  IF OLD.member_state = 'grandfathered' AND NEW.member_state = 'converted' AND NOT EXISTS (
    SELECT 1 FROM billing_subscriptions s
    WHERE s.billing_account_id = NEW.billing_account_id AND s.is_current
      AND ( (s.status = 'active' AND s.current_period_end > clock_timestamp())
        OR (s.status = 'trialing' AND s.trial_end > clock_timestamp()) )
  ) THEN
    RAISE EXCEPTION 'conversion requires a verified active or trialing subscription';
  END IF;
  IF OLD.member_state = 'candidate' AND NEW.member_state = 'grandfathered' AND NOT EXISTS (
    SELECT 1 FROM grandfathering_batches b
    WHERE b.id = NEW.batch_id AND b.status IN ('approved', 'applied', 'verified')
  ) THEN
    RAISE EXCEPTION 'grandfathering batch is not approved';
  END IF;
  IF OLD.member_state = 'converted' AND NEW.converted_at IS DISTINCT FROM OLD.converted_at THEN
    RAISE EXCEPTION 'conversion timestamp is immutable';
  END IF;
  IF OLD.applied_at IS NOT NULL AND NEW.applied_at IS DISTINCT FROM OLD.applied_at THEN
    RAISE EXCEPTION 'cohort application timestamp is immutable';
  END IF;
  IF OLD.grandfathered_at IS NOT NULL AND NEW.grandfathered_at IS DISTINCT FROM OLD.grandfathered_at THEN
    RAISE EXCEPTION 'grandfathering timestamp is immutable';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER grandfathering_transition_guard
BEFORE INSERT OR UPDATE ON grandfathering_cohort_members
FOR EACH ROW EXECUTE FUNCTION enforce_grandfathering_transition();--> statement-breakpoint

CREATE FUNCTION prevent_usage_event_mutation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'meeting usage events are immutable';
END;
$$;--> statement-breakpoint
CREATE TRIGGER meeting_usage_events_immutable
BEFORE UPDATE OR DELETE ON meeting_usage_events
FOR EACH ROW EXECUTE FUNCTION prevent_usage_event_mutation();--> statement-breakpoint

COMMENT ON TABLE billing_accounts IS 'usage_tracking_started_at is the approved quota activation cutoff; no earlier meeting starts count.';--> statement-breakpoint
COMMENT ON TABLE billing_subscriptions IS 'Canonical Stripe snapshots; is_current has a unique partial index.';--> statement-breakpoint
COMMENT ON TABLE stripe_webhook_events IS 'Deduplication and retry metadata only; raw provider payloads are not stored.';--> statement-breakpoint
COMMENT ON TABLE grandfathering_cohort_members IS 'Fixed materialized cohort; conversion is permanent and returns to Starter after subscription ends.';--> statement-breakpoint
COMMENT ON TABLE meeting_usage_periods IS 'Repairable counters; meeting_usage_events is the immutable source of truth.';--> statement-breakpoint
COMMENT ON TABLE meeting_start_reservations IS 'Lease expiry requires reconciliation and never releases reserved capacity by itself.';--> statement-breakpoint
COMMENT ON TABLE meeting_usage_events IS 'Immutable actual starts after account activation; unique meeting ID prevents retry double-counting.';--> statement-breakpoint

CREATE FUNCTION reserve_meeting_start(
  p_billing_account_id text,
  p_meeting_id text,
  p_reservation_id text
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_user_id text;
  v_activation timestamptz;
  v_period date;
  v_started integer;
  v_reserved integer;
  v_existing meeting_start_reservations%ROWTYPE;
BEGIN
  -- Global order begins with account, then period, then reservation.
  SELECT user_id, usage_tracking_started_at INTO v_user_id, v_activation
  FROM billing_accounts WHERE id = p_billing_account_id FOR UPDATE;
  IF NOT FOUND OR v_user_id IS NULL THEN RETURN 'account_missing'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM meetings WHERE id = p_meeting_id AND user_id = v_user_id
  ) THEN RETURN 'meeting_not_owned'; END IF;
  IF EXISTS (SELECT 1 FROM meeting_usage_events WHERE meeting_id = p_meeting_id) THEN
    RETURN 'already_started';
  END IF;
  IF v_now < v_activation THEN RETURN 'not_activated'; END IF;
  IF billing_account_has_non_starter_entitlement(p_billing_account_id, v_now) THEN
    RETURN 'no_reservation_required';
  END IF;

  v_period := date_trunc('month', v_now AT TIME ZONE 'UTC')::date;
  INSERT INTO meeting_usage_periods (billing_account_id, period_start, started_count, reserved_count)
  SELECT p_billing_account_id, v_period, count(*)::integer, 0
  FROM meeting_usage_events
  WHERE billing_account_id = p_billing_account_id AND period_start = v_period
  ON CONFLICT (billing_account_id, period_start) DO NOTHING;
  PERFORM 1 FROM meeting_usage_periods
  WHERE billing_account_id = p_billing_account_id AND period_start = v_period
  FOR UPDATE;
  -- Re-read the immutable ledger and pending reservations while the account
  -- lock serializes all writers. This prevents stale counters from admitting
  -- more than five starts even before the periodic repair job runs.
  SELECT count(*)::integer INTO v_started FROM meeting_usage_events
  WHERE billing_account_id = p_billing_account_id AND period_start = v_period;
  SELECT count(*)::integer INTO v_reserved FROM meeting_start_reservations r
  WHERE r.billing_account_id = p_billing_account_id AND r.period_start = v_period
    AND r.state = 'pending' AND NOT EXISTS (
      SELECT 1 FROM meeting_usage_events e WHERE e.meeting_id = r.meeting_id
    );
  UPDATE meeting_usage_periods SET started_count = v_started,
    reserved_count = v_reserved, updated_at = v_now
  WHERE billing_account_id = p_billing_account_id AND period_start = v_period;

  SELECT * INTO v_existing FROM meeting_start_reservations
  WHERE meeting_id = p_meeting_id AND state = 'pending'
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing.lease_expires_at <= v_now AND v_existing.reconciliation_state <> 'required' THEN
      UPDATE meeting_start_reservations
      SET reconciliation_state = 'required', next_reconciliation_at = v_now
      WHERE id = v_existing.id;
      RETURN 'reconciliation_required';
    END IF;
    RETURN 'reservation_reused';
  END IF;
  IF v_started + v_reserved >= 5 THEN RETURN 'quota_exceeded'; END IF;

  INSERT INTO meeting_start_reservations (
    id, meeting_id, billing_account_id, period_start, state,
    created_at, lease_expires_at, reconciliation_state
  ) VALUES (
    p_reservation_id, p_meeting_id, p_billing_account_id, v_period, 'pending',
    v_now, v_now + interval '90 minutes', 'none'
  );
  UPDATE meeting_usage_periods
  SET reserved_count = reserved_count + 1, updated_at = v_now
  WHERE billing_account_id = p_billing_account_id AND period_start = v_period;
  RETURN 'reserved';
END;
$$;--> statement-breakpoint

CREATE FUNCTION commit_meeting_start(
  p_meeting_id text,
  p_stream_event_id text,
  p_actual_started_at timestamptz
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_account_id text;
  v_activation timestamptz;
  v_actual_period date;
  v_reservation meeting_start_reservations%ROWTYPE;
  v_period date;
  v_inserted text;
  v_event_state text := 'normal';
  v_counter_before integer;
BEGIN
  IF p_actual_started_at IS NULL OR p_stream_event_id IS NULL THEN
    RETURN 'invalid_start_evidence';
  END IF;
  -- p_actual_started_at is accepted only from the signed Stream webhook path;
  -- no public route should expose this function or accept a client timestamp.
  SELECT a.id, a.usage_tracking_started_at INTO v_account_id, v_activation
  FROM meetings m JOIN billing_accounts a ON a.user_id = m.user_id
  WHERE m.id = p_meeting_id;
  IF NOT FOUND THEN RETURN 'meeting_or_account_missing'; END IF;
  PERFORM 1 FROM billing_accounts WHERE id = v_account_id FOR UPDATE;
  IF p_actual_started_at < v_activation THEN RETURN 'before_activation'; END IF;
  v_actual_period := date_trunc('month', p_actual_started_at AT TIME ZONE 'UTC')::date;

  SELECT * INTO v_reservation FROM meeting_start_reservations
  WHERE meeting_id = p_meeting_id
  ORDER BY created_at DESC LIMIT 1;

  INSERT INTO meeting_usage_periods (billing_account_id, period_start, started_count, reserved_count)
  SELECT v_account_id, v_actual_period, count(*)::integer, 0
  FROM meeting_usage_events
  WHERE billing_account_id = v_account_id AND period_start = v_actual_period
  ON CONFLICT (billing_account_id, period_start) DO NOTHING;
  IF v_reservation.id IS NOT NULL AND v_reservation.period_start <> v_actual_period THEN
    INSERT INTO meeting_usage_periods (billing_account_id, period_start, started_count, reserved_count)
    SELECT v_account_id, v_reservation.period_start, count(*)::integer, 0
    FROM meeting_usage_events
    WHERE billing_account_id = v_account_id AND period_start = v_reservation.period_start
    ON CONFLICT (billing_account_id, period_start) DO NOTHING;
  END IF;
  FOR v_period IN
    SELECT period_start FROM meeting_usage_periods
    WHERE billing_account_id = v_account_id
      AND period_start IN (v_actual_period, v_reservation.period_start)
    ORDER BY period_start
  LOOP
    PERFORM 1 FROM meeting_usage_periods
    WHERE billing_account_id = v_account_id AND period_start = v_period
    FOR UPDATE;
  END LOOP;
  IF v_reservation.id IS NOT NULL THEN
    SELECT * INTO v_reservation FROM meeting_start_reservations
    WHERE id = v_reservation.id FOR UPDATE;
  END IF;

  IF v_reservation.id IS NOT NULL AND v_reservation.state = 'pending'
     AND v_reservation.period_start <> v_actual_period THEN
    v_event_state := 'boundary_overage';
  ELSIF (v_reservation.id IS NULL OR v_reservation.state <> 'pending')
     AND NOT billing_account_has_non_starter_entitlement(v_account_id, p_actual_started_at) THEN
    v_event_state := 'unreserved_start';
  END IF;

  INSERT INTO meeting_usage_events (
    meeting_id, billing_account_id, period_start, started_at,
    stream_event_id, reconciliation_state
  ) VALUES (
    p_meeting_id, v_account_id, v_actual_period, p_actual_started_at,
    p_stream_event_id, v_event_state
  ) ON CONFLICT DO NOTHING RETURNING meeting_id INTO v_inserted;
  IF v_inserted IS NULL THEN RETURN 'duplicate'; END IF;

  IF v_reservation.id IS NOT NULL AND v_reservation.state = 'pending' THEN
    IF v_reservation.period_start = v_actual_period THEN
      SELECT reserved_count INTO v_counter_before FROM meeting_usage_periods
      WHERE billing_account_id = v_account_id AND period_start = v_actual_period;
      UPDATE meeting_usage_periods
      SET started_count = started_count + 1,
          reserved_count = GREATEST(reserved_count - 1, 0),
          updated_at = clock_timestamp()
      WHERE billing_account_id = v_account_id AND period_start = v_actual_period;
      IF NOT FOUND OR COALESCE(v_counter_before, 0) = 0 THEN
        IF v_event_state <> 'boundary_overage' THEN v_event_state := 'counter_anomaly'; END IF;
        INSERT INTO billing_audit_events
          (id, billing_account_id, idempotency_key, source, source_event_id, action, details)
        VALUES (md5(p_stream_event_id || ':counter-anomaly'), v_account_id,
          'usage-counter-anomaly:' || p_stream_event_id, 'reconciliation', p_stream_event_id,
          'reservation_counter_underflow', jsonb_build_object('meeting_id', p_meeting_id, 'period_start', v_actual_period))
        ON CONFLICT (idempotency_key) DO NOTHING;
      END IF;
    ELSE
      SELECT reserved_count INTO v_counter_before FROM meeting_usage_periods
      WHERE billing_account_id = v_account_id AND period_start = v_reservation.period_start;
      UPDATE meeting_usage_periods
      SET reserved_count = GREATEST(reserved_count - 1, 0), updated_at = clock_timestamp()
      WHERE billing_account_id = v_account_id AND period_start = v_reservation.period_start;
      UPDATE meeting_usage_periods
      SET started_count = started_count + 1, updated_at = clock_timestamp()
      WHERE billing_account_id = v_account_id AND period_start = v_actual_period;
      IF NOT FOUND OR COALESCE(v_counter_before, 0) = 0 THEN
        INSERT INTO billing_audit_events
          (id, billing_account_id, idempotency_key, source, source_event_id, action, details)
        VALUES (md5(p_stream_event_id || ':counter-anomaly'), v_account_id,
          'usage-counter-anomaly:' || p_stream_event_id, 'reconciliation', p_stream_event_id,
          'reservation_counter_underflow', jsonb_build_object('meeting_id', p_meeting_id, 'period_start', v_reservation.period_start))
        ON CONFLICT (idempotency_key) DO NOTHING;
      END IF;
    END IF;
    UPDATE meeting_start_reservations
    SET state = 'committed', committed_at = clock_timestamp(),
        stream_event_id = p_stream_event_id,
        reconciliation_state = 'confirmed_started'
    WHERE id = v_reservation.id;
  ELSE
    UPDATE meeting_usage_periods
    SET started_count = started_count + 1, updated_at = clock_timestamp()
    WHERE billing_account_id = v_account_id AND period_start = v_actual_period;
  END IF;
  RETURN v_event_state;
END;
$$;--> statement-breakpoint

CREATE FUNCTION release_meeting_reservation(
  p_reservation_id text,
  p_reason text
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_account_id text;
  v_period date;
  v_meeting_id text;
  v_state text;
  v_reconcile text;
  v_counter_before integer;
BEGIN
  SELECT billing_account_id, period_start, meeting_id
  INTO v_account_id, v_period, v_meeting_id
  FROM meeting_start_reservations WHERE id = p_reservation_id;
  IF NOT FOUND THEN RETURN 'missing'; END IF;
  PERFORM 1 FROM billing_accounts WHERE id = v_account_id FOR UPDATE;
  PERFORM 1 FROM meeting_usage_periods
  WHERE billing_account_id = v_account_id AND period_start = v_period FOR UPDATE;
  SELECT state, reconciliation_state INTO v_state, v_reconcile
  FROM meeting_start_reservations WHERE id = p_reservation_id FOR UPDATE;
  IF v_state <> 'pending' THEN RETURN 'no_op'; END IF;
  IF EXISTS (SELECT 1 FROM meeting_usage_events WHERE meeting_id = v_meeting_id) THEN
    RETURN 'already_started';
  END IF;
  IF p_reason = 'meeting_cancelled' AND NOT EXISTS (
    SELECT 1 FROM meetings m JOIN billing_accounts a ON a.user_id = m.user_id
    WHERE m.id = v_meeting_id AND a.id = v_account_id AND m.status = 'cancelled'
  ) THEN RETURN 'cancellation_not_confirmed'; END IF;
  IF p_reason = 'reconciled_no_start' AND v_reconcile <> 'confirmed_not_started' THEN
    RETURN 'reconciliation_not_confirmed';
  END IF;
  IF p_reason NOT IN ('setup_failed', 'meeting_cancelled', 'reconciled_no_start') THEN
    RETURN 'invalid_release_reason';
  END IF;
  SELECT reserved_count INTO v_counter_before FROM meeting_usage_periods
  WHERE billing_account_id = v_account_id AND period_start = v_period;
  UPDATE meeting_usage_periods
  SET reserved_count = GREATEST(reserved_count - 1, 0), updated_at = clock_timestamp()
  WHERE billing_account_id = v_account_id AND period_start = v_period;
  IF NOT FOUND OR COALESCE(v_counter_before, 0) = 0 THEN
    INSERT INTO billing_audit_events
      (id, billing_account_id, idempotency_key, source, action, details)
    VALUES (md5(p_reservation_id || ':release-counter-anomaly'), v_account_id,
      'reservation-counter-anomaly:' || p_reservation_id, 'reconciliation',
      'reservation_counter_underflow', jsonb_build_object('reservation_id', p_reservation_id, 'period_start', v_period))
    ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;
  UPDATE meeting_start_reservations
  SET state = 'released', released_at = clock_timestamp(),
      release_reason = p_reason, reconciliation_state = 'confirmed_not_started'
  WHERE id = p_reservation_id;
  RETURN 'released';
END;
$$;--> statement-breakpoint

CREATE FUNCTION queue_expired_meeting_reservations(p_limit integer)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_count integer;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 500 THEN RAISE EXCEPTION 'invalid batch limit'; END IF;
  WITH candidates AS (
    SELECT id FROM meeting_start_reservations
    WHERE state = 'pending' AND lease_expires_at <= clock_timestamp()
      AND (reconciliation_state = 'none'
        OR (reconciliation_state IN ('required', 'in_progress')
          AND next_reconciliation_at <= clock_timestamp()))
    ORDER BY COALESCE(next_reconciliation_at, lease_expires_at), id
    LIMIT p_limit FOR UPDATE SKIP LOCKED
  )
  UPDATE meeting_start_reservations r
  SET reconciliation_state = 'required',
      reconciliation_attempts = reconciliation_attempts + 1,
      next_reconciliation_at = clock_timestamp() + interval '5 minutes'
  FROM candidates c WHERE r.id = c.id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;--> statement-breakpoint

CREATE FUNCTION record_meeting_reservation_reconciliation(
  p_reservation_id text,
  p_result text
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_account_id text;
  v_period date;
  v_state text;
  v_lease timestamptz;
BEGIN
  SELECT billing_account_id, period_start INTO v_account_id, v_period
  FROM meeting_start_reservations WHERE id = p_reservation_id;
  IF NOT FOUND THEN RETURN 'missing'; END IF;
  PERFORM 1 FROM billing_accounts WHERE id = v_account_id FOR UPDATE;
  PERFORM 1 FROM meeting_usage_periods
  WHERE billing_account_id = v_account_id AND period_start = v_period FOR UPDATE;
  SELECT state, lease_expires_at INTO v_state, v_lease
  FROM meeting_start_reservations WHERE id = p_reservation_id FOR UPDATE;
  IF v_state <> 'pending' THEN RETURN 'not_pending'; END IF;
  IF EXISTS (SELECT 1 FROM meeting_usage_events e JOIN meeting_start_reservations r ON r.meeting_id = e.meeting_id WHERE r.id = p_reservation_id) THEN
    RETURN 'start_already_recorded';
  END IF;
  IF v_lease > clock_timestamp() THEN RETURN 'lease_not_elapsed'; END IF;
  IF p_result NOT IN ('confirmed_not_started', 'inconclusive') THEN RETURN 'invalid_result'; END IF;
  UPDATE meeting_start_reservations SET
    reconciliation_state = CASE WHEN p_result = 'confirmed_not_started' THEN 'confirmed_not_started' ELSE 'required' END,
    reconciliation_attempts = reconciliation_attempts + 1,
    last_reconciled_at = clock_timestamp(),
    next_reconciliation_at = CASE WHEN p_result = 'inconclusive' THEN clock_timestamp() + interval '5 minutes' ELSE NULL END
  WHERE id = p_reservation_id;
  RETURN p_result;
END;
$$;--> statement-breakpoint

CREATE FUNCTION reconcile_meeting_usage_period(
  p_billing_account_id text,
  p_period_start date
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_activation timestamptz;
  v_old_started integer;
  v_old_reserved integer;
  v_started integer;
  v_reserved integer;
  v_key text;
BEGIN
  PERFORM 1 FROM billing_accounts WHERE id = p_billing_account_id FOR UPDATE;
  SELECT usage_tracking_started_at INTO v_activation
  FROM billing_accounts WHERE id = p_billing_account_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'billing account missing'; END IF;
  IF EXTRACT(DAY FROM p_period_start) <> 1 THEN RAISE EXCEPTION 'period_start must be first of month'; END IF;
  INSERT INTO meeting_usage_periods (billing_account_id, period_start)
  VALUES (p_billing_account_id, p_period_start)
  ON CONFLICT (billing_account_id, period_start) DO NOTHING;
  SELECT started_count, reserved_count INTO v_old_started, v_old_reserved
  FROM meeting_usage_periods
  WHERE billing_account_id = p_billing_account_id AND period_start = p_period_start
  FOR UPDATE;
  SELECT count(*)::integer INTO v_started FROM meeting_usage_events
  WHERE billing_account_id = p_billing_account_id AND period_start = p_period_start
    AND started_at >= v_activation;
  SELECT count(*)::integer INTO v_reserved FROM meeting_start_reservations
  WHERE billing_account_id = p_billing_account_id AND period_start = p_period_start
    AND state = 'pending' AND NOT EXISTS (
      SELECT 1 FROM meeting_usage_events e WHERE e.meeting_id = meeting_start_reservations.meeting_id
    );
  UPDATE meeting_usage_periods SET started_count = v_started,
    reserved_count = v_reserved, updated_at = clock_timestamp()
  WHERE billing_account_id = p_billing_account_id AND period_start = p_period_start;
  IF v_old_started <> v_started OR v_old_reserved <> v_reserved THEN
    v_key := 'usage-reconcile:' || p_billing_account_id || ':' || p_period_start::text || ':' || v_started || ':' || v_reserved;
    INSERT INTO billing_audit_events
      (id, billing_account_id, idempotency_key, source, action, details)
    VALUES (md5(v_key), p_billing_account_id, v_key, 'reconciliation',
      'usage_period_reconciled', jsonb_build_object('old_started', v_old_started,
      'new_started', v_started, 'old_reserved', v_old_reserved, 'new_reserved', v_reserved))
    ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;
END;
$$;--> statement-breakpoint

CREATE FUNCTION ingest_stripe_webhook_event(
  p_event_id text,
  p_event_type text,
  p_object_id text,
  p_provider_created_at timestamptz
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_rows integer;
BEGIN
  -- Caller must verify Stripe's raw-body signature before invoking this function.
  INSERT INTO stripe_webhook_events
    (stripe_event_id, event_type, provider_object_id, provider_created_at)
  VALUES (p_event_id, p_event_type, p_object_id, p_provider_created_at)
  ON CONFLICT (stripe_event_id) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows = 1;
END;
$$;--> statement-breakpoint

CREATE FUNCTION claim_stripe_webhook_event(
  p_event_id text,
  p_lease_token text,
  p_lease_expires_at timestamptz
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_lease_expires_at <= clock_timestamp() THEN RAISE EXCEPTION 'lease must expire in the future'; END IF;
  UPDATE stripe_webhook_events SET processing_state = 'processing',
    lease_token = p_lease_token, lease_expires_at = p_lease_expires_at,
    attempt_count = attempt_count + 1, next_attempt_at = NULL
  WHERE stripe_event_id = p_event_id
    AND (processing_state = 'received'
      OR (processing_state = 'retry' AND (next_attempt_at IS NULL OR next_attempt_at <= clock_timestamp()))
      OR (processing_state = 'processing' AND lease_expires_at <= clock_timestamp()));
  RETURN FOUND;
END;
$$;--> statement-breakpoint

CREATE FUNCTION record_stripe_webhook_retry(
  p_event_id text,
  p_lease_token text,
  p_error_code text,
  p_next_attempt_at timestamptz
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE stripe_webhook_events SET processing_state = 'retry',
    lease_token = NULL, lease_expires_at = NULL,
    next_attempt_at = p_next_attempt_at,
    last_error_code = left(regexp_replace(p_error_code, '[^a-zA-Z0-9_.-]', '', 'g'), 80),
    last_error_summary = NULL
  WHERE stripe_event_id = p_event_id AND processing_state = 'processing'
    AND lease_token = p_lease_token;
  RETURN FOUND;
END;
$$;--> statement-breakpoint

CREATE FUNCTION apply_canonical_subscription_event(
  p_event_id text,
  p_lease_token text,
  p_billing_account_id text,
  p_stripe_subscription_id text,
  p_stripe_customer_id text,
  p_provider_created_at timestamptz,
  p_canonical_observed_at timestamptz,
  p_event_type text,
  p_plan_key text,
  p_stripe_price_id text,
  p_status text,
  p_current_period_start timestamptz,
  p_current_period_end timestamptz,
  p_trial_start timestamptz,
  p_trial_end timestamptz,
  p_cancel_at_period_end boolean,
  p_cancel_at timestamptz,
  p_canceled_at timestamptz,
  p_ended_at timestamptz,
  p_invoice_id text,
  p_provider_has_pending_update boolean
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event stripe_webhook_events%ROWTYPE;
  v_account billing_accounts%ROWTYPE;
  v_subscription billing_subscriptions%ROWTYPE;
  v_current billing_subscriptions%ROWTYPE;
  v_is_current boolean;
  v_grace_started timestamptz;
  v_grace_until timestamptz;
  v_grace_invoice text;
  v_old_state jsonb;
  v_new_state jsonb;
BEGIN
  SELECT * INTO v_event FROM stripe_webhook_events
  WHERE stripe_event_id = p_event_id FOR UPDATE;
  IF NOT FOUND OR v_event.processing_state <> 'processing'
     OR v_event.lease_token IS DISTINCT FROM p_lease_token
     OR v_event.lease_expires_at <= clock_timestamp() THEN
    RETURN 'claim_invalid';
  END IF;
  IF v_event.event_type <> p_event_type
     OR v_event.provider_created_at <> p_provider_created_at THEN
    RETURN 'event_mismatch';
  END IF;
  IF p_canonical_observed_at IS NULL THEN RETURN 'canonical_state_required'; END IF;
  IF p_current_period_start IS NOT NULL AND p_current_period_end IS NOT NULL
     AND p_current_period_end < p_current_period_start THEN RETURN 'invalid_period'; END IF;
  IF p_status NOT IN ('incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused') THEN
    RETURN 'invalid_status';
  END IF;

  -- Then lock in global billing order: account, subscription.
  SELECT * INTO v_account FROM billing_accounts
  WHERE id = p_billing_account_id FOR UPDATE;
  IF NOT FOUND OR v_account.stripe_customer_id IS DISTINCT FROM p_stripe_customer_id THEN
    RETURN 'customer_account_mismatch';
  END IF;
  IF p_plan_key NOT IN ('pro', 'enterprise') THEN RETURN 'invalid_plan'; END IF;
  SELECT * INTO v_subscription FROM billing_subscriptions
  WHERE stripe_subscription_id = p_stripe_subscription_id FOR UPDATE;
  IF FOUND AND v_subscription.billing_account_id <> p_billing_account_id THEN
    RETURN 'subscription_account_mismatch';
  END IF;
  IF FOUND AND v_subscription.last_provider_event_created_at IS NOT NULL
     AND p_provider_created_at < v_subscription.last_provider_event_created_at THEN
    UPDATE stripe_webhook_events SET processing_state = 'stale', processed_at = clock_timestamp(),
      lease_token = NULL, lease_expires_at = NULL WHERE stripe_event_id = p_event_id;
    RETURN 'stale_event';
  END IF;
  IF FOUND AND v_subscription.last_provider_event_created_at = p_provider_created_at
     AND v_subscription.last_reconciled_at IS NOT NULL
     AND p_canonical_observed_at <= v_subscription.last_reconciled_at THEN
    UPDATE stripe_webhook_events SET processing_state = 'reconcile',
      lease_token = NULL, lease_expires_at = NULL WHERE stripe_event_id = p_event_id;
    RETURN 'reconciliation_required';
  END IF;

  SELECT * INTO v_current FROM billing_subscriptions
  WHERE billing_account_id = p_billing_account_id AND is_current FOR UPDATE;
  IF v_current.id IS NOT NULL AND v_current.stripe_subscription_id <> p_stripe_subscription_id THEN
    IF v_current.status NOT IN ('canceled', 'incomplete_expired')
       OR (v_current.current_period_end IS NOT NULL AND v_current.current_period_end > clock_timestamp()) THEN
      RETURN 'current_subscription_conflict';
    END IF;
    UPDATE billing_subscriptions SET is_current = false, updated_at = clock_timestamp()
    WHERE id = v_current.id;
  END IF;

  v_is_current := p_status IN ('trialing', 'active', 'past_due', 'unpaid')
    OR (p_status = 'canceled' AND p_cancel_at_period_end
      AND p_current_period_end IS NOT NULL AND p_current_period_end > clock_timestamp());
  IF p_event_type = 'invoice.payment_failed' AND p_status IN ('past_due', 'unpaid') THEN
    v_grace_started := COALESCE(v_subscription.grace_started_at, p_provider_created_at);
    v_grace_until := COALESCE(v_subscription.grace_until, v_grace_started + interval '14 days');
    v_grace_invoice := COALESCE(v_subscription.grace_invoice_id, p_invoice_id);
  ELSIF p_event_type IN ('invoice.paid', 'invoice.payment_succeeded') AND p_status = 'active' THEN
    v_grace_started := NULL; v_grace_until := NULL; v_grace_invoice := NULL;
  ELSIF p_status IN ('canceled', 'incomplete_expired') THEN
    v_grace_started := NULL; v_grace_until := NULL; v_grace_invoice := NULL;
  ELSE
    v_grace_started := v_subscription.grace_started_at;
    v_grace_until := v_subscription.grace_until;
    v_grace_invoice := v_subscription.grace_invoice_id;
  END IF;
  v_old_state := CASE WHEN v_subscription.id IS NULL THEN NULL ELSE
    jsonb_build_object('plan', v_subscription.plan_key, 'status', v_subscription.status,
                       'current', v_subscription.is_current) END;

  INSERT INTO billing_subscriptions (
    id, billing_account_id, stripe_subscription_id, stripe_customer_id, stripe_price_id,
    plan_key, status, is_current, current_period_start, current_period_end,
    trial_start, trial_end, cancel_at_period_end, cancel_at, canceled_at, ended_at,
    grace_started_at, grace_until, grace_invoice_id, last_provider_event_created_at,
    last_reconciled_at
  ) VALUES (
    p_stripe_subscription_id, p_billing_account_id, p_stripe_subscription_id, p_stripe_customer_id, p_stripe_price_id,
    p_plan_key, p_status, v_is_current, p_current_period_start, p_current_period_end,
    p_trial_start, p_trial_end, p_cancel_at_period_end, p_cancel_at, p_canceled_at, p_ended_at,
    v_grace_started, v_grace_until, v_grace_invoice, p_provider_created_at,
    p_canonical_observed_at
  ) ON CONFLICT (stripe_subscription_id) DO UPDATE SET
    stripe_customer_id = EXCLUDED.stripe_customer_id,
    stripe_price_id = EXCLUDED.stripe_price_id,
    plan_key = EXCLUDED.plan_key,
    status = EXCLUDED.status,
    is_current = EXCLUDED.is_current,
    current_period_start = EXCLUDED.current_period_start,
    current_period_end = EXCLUDED.current_period_end,
    trial_start = EXCLUDED.trial_start,
    trial_end = EXCLUDED.trial_end,
    cancel_at_period_end = EXCLUDED.cancel_at_period_end,
    cancel_at = EXCLUDED.cancel_at,
    canceled_at = EXCLUDED.canceled_at,
    ended_at = EXCLUDED.ended_at,
    grace_started_at = EXCLUDED.grace_started_at,
    grace_until = EXCLUDED.grace_until,
    grace_invoice_id = EXCLUDED.grace_invoice_id,
    last_provider_event_created_at = EXCLUDED.last_provider_event_created_at,
    last_reconciled_at = EXCLUDED.last_reconciled_at,
    updated_at = clock_timestamp()
  WHERE billing_subscriptions.billing_account_id = EXCLUDED.billing_account_id;

  IF p_provider_has_pending_update THEN
    UPDATE billing_subscriptions SET pending_switch_requested_at = COALESCE(pending_switch_requested_at, clock_timestamp())
    WHERE stripe_subscription_id = p_stripe_subscription_id;
  ELSIF EXISTS (
    SELECT 1 FROM billing_subscriptions
    WHERE stripe_subscription_id = p_stripe_subscription_id AND pending_plan_key IS NOT NULL
  ) AND p_stripe_price_id <> (
    SELECT pending_price_id FROM billing_subscriptions WHERE stripe_subscription_id = p_stripe_subscription_id
  ) THEN
    UPDATE billing_subscriptions SET pending_plan_key = NULL, pending_price_id = NULL,
      pending_switch_idempotency_key = NULL, pending_switch_requested_at = NULL
    WHERE stripe_subscription_id = p_stripe_subscription_id;
  ELSE
    UPDATE billing_subscriptions SET pending_plan_key = NULL, pending_price_id = NULL,
      pending_switch_idempotency_key = NULL, pending_switch_requested_at = NULL
    WHERE stripe_subscription_id = p_stripe_subscription_id
      AND pending_price_id = p_stripe_price_id;
  END IF;

  IF v_is_current AND (p_status = 'active' OR (p_status = 'trialing' AND p_trial_end > clock_timestamp())) THEN
    UPDATE grandfathering_cohort_members gm
    SET member_state = 'converted', converted_at = COALESCE(converted_at, clock_timestamp())
    FROM grandfathering_batches b
    WHERE gm.batch_id = b.id AND gm.billing_account_id = p_billing_account_id
      AND gm.member_state = 'grandfathered' AND b.status IN ('applied', 'verified');
  END IF;

  SELECT jsonb_build_object('plan', plan_key, 'status', status, 'current', is_current)
  INTO v_new_state FROM billing_subscriptions
  WHERE stripe_subscription_id = p_stripe_subscription_id;
  INSERT INTO billing_audit_events
    (id, billing_account_id, idempotency_key, source, source_event_id, action, before_state, after_state)
  VALUES (md5(p_event_id || ':subscription_state'), p_billing_account_id,
    p_event_id || ':subscription_state', 'stripe', p_event_id,
    'subscription_state_applied', v_old_state, v_new_state)
  ON CONFLICT (idempotency_key) DO NOTHING;
  UPDATE stripe_webhook_events SET processing_state = 'processed', processed_at = clock_timestamp(),
    lease_token = NULL, lease_expires_at = NULL, last_error_code = NULL, last_error_summary = NULL
  WHERE stripe_event_id = p_event_id;
  RETURN 'applied';
END;
$$;--> statement-breakpoint

CREATE FUNCTION begin_subscription_switch(
  p_billing_account_id text,
  p_stripe_subscription_id text,
  p_target_plan_key text,
  p_target_price_id text,
  p_idempotency_key text
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_sub billing_subscriptions%ROWTYPE;
BEGIN
  PERFORM 1 FROM billing_accounts WHERE id = p_billing_account_id FOR UPDATE;
  SELECT * INTO v_sub FROM billing_subscriptions
  WHERE billing_account_id = p_billing_account_id
    AND stripe_subscription_id = p_stripe_subscription_id AND is_current
  FOR UPDATE;
  IF NOT FOUND THEN RETURN 'current_subscription_missing'; END IF;
  IF p_target_plan_key NOT IN ('pro', 'enterprise') THEN RETURN 'invalid_plan'; END IF;
  IF v_sub.pending_switch_idempotency_key IS NOT NULL THEN
    IF v_sub.pending_switch_idempotency_key = p_idempotency_key THEN RETURN 'switch_reused'; END IF;
    RETURN 'switch_pending';
  END IF;
  IF p_target_plan_key = v_sub.plan_key AND p_target_price_id = v_sub.stripe_price_id THEN
    RETURN 'already_on_plan';
  END IF;
  UPDATE billing_subscriptions SET pending_plan_key = p_target_plan_key,
    pending_price_id = p_target_price_id,
    pending_switch_idempotency_key = p_idempotency_key,
    pending_switch_requested_at = clock_timestamp(), updated_at = clock_timestamp()
  WHERE id = v_sub.id;
  INSERT INTO billing_audit_events
    (id, billing_account_id, idempotency_key, source, action, details)
  VALUES (md5(p_idempotency_key || ':switch_requested'), p_billing_account_id,
    p_idempotency_key || ':switch_requested', 'application', 'subscription_switch_requested',
    jsonb_build_object('target_plan', p_target_plan_key, 'target_price_id', p_target_price_id))
  ON CONFLICT (idempotency_key) DO NOTHING;
  RETURN 'switch_recorded';
END;
$$;--> statement-breakpoint

CREATE FUNCTION revoke_expired_checkout(
  p_billing_account_id text,
  p_checkout_session_id text,
  p_provider_confirmed_no_subscription boolean
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT p_provider_confirmed_no_subscription THEN RETURN false; END IF;
  UPDATE billing_accounts SET pending_checkout_session_id = NULL,
    pending_checkout_plan_key = NULL, pending_checkout_expires_at = NULL,
    pending_checkout_idempotency_key = NULL, updated_at = clock_timestamp()
  WHERE id = p_billing_account_id
    AND pending_checkout_session_id = p_checkout_session_id
    AND pending_checkout_expires_at <= clock_timestamp()
    AND NOT EXISTS (SELECT 1 FROM billing_subscriptions s
      WHERE s.billing_account_id = p_billing_account_id AND s.is_current);
  RETURN FOUND;
END;
$$;--> statement-breakpoint

-- The SECURITY DEFINER functions must be explicitly granted to a backend role
-- by a later deployment step. Do not expose these functions to client roles.
REVOKE ALL ON FUNCTION billing_account_has_non_starter_entitlement(text, timestamptz) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION enforce_grandfathering_transition() FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION prevent_usage_event_mutation() FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION reserve_meeting_start(text, text, text) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION commit_meeting_start(text, text, timestamptz) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION release_meeting_reservation(text, text) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION queue_expired_meeting_reservations(integer) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION record_meeting_reservation_reconciliation(text, text) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION reconcile_meeting_usage_period(text, date) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION ingest_stripe_webhook_event(text, text, text, timestamptz) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION claim_stripe_webhook_event(text, text, timestamptz) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION record_stripe_webhook_retry(text, text, text, timestamptz) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION apply_canonical_subscription_event(text, text, text, text, text, timestamptz, timestamptz, text, text, text, text, timestamptz, timestamptz, timestamptz, timestamptz, boolean, timestamptz, timestamptz, timestamptz, text, boolean) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION begin_subscription_switch(text, text, text, text, text) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION revoke_expired_checkout(text, text, boolean) FROM PUBLIC;
