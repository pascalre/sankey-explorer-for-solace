// Runs before any test file is loaded. config.ts (imported by server.ts,
// imported by route tests) reads SESSION_SECRET from process.env at module
// load time - this has to be set before that happens, which a regular
// import-time assignment inside a test file is too late for (ES module
// imports are resolved before a file's own top-level code runs).
process.env.SESSION_SECRET ??= "test-secret-for-vitest-do-not-use-in-prod";
// The SEMP throttle's timing behavior is unit-tested in isolation
// (client.test.ts, with an explicit 0ms override) - the real 200ms default
// would just slow down every route test that touches a SempV1Client.
process.env.SEMP_MIN_REQUEST_INTERVAL_MS ??= "0";
