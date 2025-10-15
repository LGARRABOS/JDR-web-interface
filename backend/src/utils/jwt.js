let jwtClient = globalThis.__ETERNITA_JWT__;

if (!jwtClient) {
  try {
    const module = await import('jsonwebtoken');
    jwtClient = module.default ?? module;
  } catch (error) {
    throw new Error(
      'Failed to load jsonwebtoken library. Ensure dependencies are installed.',
    );
  }
}

const { JWT_SECRET } = process.env;

if (!JWT_SECRET) {
  throw new Error('Missing JWT_SECRET environment variable.');
}

/**
 * Generate a signed JWT token for a given payload. Tokens are set to expire in
 * seven days to balance security and convenience for campaign sessions.
 */
export const generateToken = (payload) =>
  jwtClient.sign(payload, JWT_SECRET, { expiresIn: '7d' });

/**
 * Verify an incoming JWT token and return the decoded payload. Errors are
 * rethrown so they can be handled upstream by Express middleware.
 */
export const verifyToken = (token) => jwtClient.verify(token, JWT_SECRET);
