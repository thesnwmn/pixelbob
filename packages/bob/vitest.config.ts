// Bob's tests simulate seconds of goo, so their wall time depends on the machine: the
// tacky-climb test takes about 5 s in a session container (vitest's default limit) and
// half that on CI. What they test is the outcome, which is deterministic, so give them room.
export default { test: { testTimeout: 30_000 } };
