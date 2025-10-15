import { verifyToken } from '../utils/jwt.js';

/**
 * Express middleware validating JWT tokens provided through the Authorization
 * header. On success the decoded user is attached to req.user for downstream
 * handlers.
 */
export const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({ message: 'Token manquant' });
  }

  try {
    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Token invalide' });
  }
};

/**
 * Helper middleware enforcing Game Master only operations. For now it relies on
 * a boolean flag stored in the JWT payload but the structure is ready for more
 * granular permission checks.
 */
export const requireGameMaster = (req, res, next) => {
  if (!req.user?.isGameMaster) {
    return res.status(403).json({ message: 'Accès réservé au MJ' });
  }

  next();
};
