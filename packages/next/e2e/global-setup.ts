import { startMock, type MockServer } from "../../core/test/mock-typesafe";

/** Fixed, so the playground can be pointed at it from the config. */
export const MOCK_PORT = 4573;

let mock: MockServer | undefined;

/**
 * Stands in for the TypeSafe API for the whole run, so the suite covers the route handler and
 * advocaat's client without a key and without spending anything.
 */
export default async function globalSetup() {
  mock = await startMock({}, MOCK_PORT);
  return async () => {
    await mock?.close();
  };
}
