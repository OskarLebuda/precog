import { startMock, type MockServer } from "../../core/test/mock-typesafe";

/** Fixed, so the playground servers can be pointed at it from the config. */
export const MOCK_PORT = 4571;

let mock: MockServer | undefined;

/**
 * Stands in for the TypeSafe API for the whole run.
 *
 * The playground has no stand-in of its own any more: it always takes the real path through
 * the module and advocaat's client, and only the service at the other end is faked. That way
 * the end-to-end suite covers the server route and the HTTP client too, and it still needs no
 * key and costs nothing.
 */
export default async function globalSetup() {
  mock = await startMock({}, MOCK_PORT);
  return async () => {
    await mock?.close();
  };
}
