import { ConvexHttpClient } from 'convex/browser';

const CONVEX_URL_ENVIRONMENT_VARIABLE = 'NEXT_PUBLIC_CONVEX_URL';

/**
 * Creates a request-scoped Convex client authenticated with the current user.
 * Never share this client between requests because ConvexHttpClient is stateful.
 */
export function convexServerClient(token: string): ConvexHttpClient {
  const deploymentUrl = process.env.NEXT_PUBLIC_CONVEX_URL?.trim();
  const normalizedToken = token.trim();

  if (!deploymentUrl) {
    throw new Error(
      `${CONVEX_URL_ENVIRONMENT_VARIABLE} is required to create a server-side Convex client`
    );
  }

  if (!normalizedToken) {
    throw new Error('A non-empty Convex session token is required');
  }

  return new ConvexHttpClient(deploymentUrl, {
    auth: normalizedToken,
    logger: false,
  });
}
