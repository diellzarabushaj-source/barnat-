-- The rollback drill is append-only evidence and the canonical cutover
-- event history must not be erased or rewound.
do $$
begin
  raise exception 'Rollback blocked: Phase 10F rollback-drill evidence and cutover history are immutable.';
end
$$;
