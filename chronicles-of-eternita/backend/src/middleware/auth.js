export const isAuthenticated = (req, res, next) => {
  if (req.session?.user) {
    return next();
  }
  return res.status(401).json({ message: 'Non authentifié' });
};

export const requireRole = (role) => (req, res, next) => {
  if (req.session?.user?.role === role) {
    return next();
  }
  return res.status(403).json({ message: 'Accès refusé' });
};
