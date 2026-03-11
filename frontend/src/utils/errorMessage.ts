/**
 * Extrait un message d'erreur lisible depuis une erreur API ou une exception.
 */
export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    if (err.message) return err.message;
  }
  const api = err as {
    response?: { data?: { message?: string }; status?: number };
  };
  if (api?.response?.data?.message) {
    return api.response.data.message;
  }
  if (api?.response?.status === 401) {
    return 'Identifiants incorrects';
  }
  if (api?.response?.status === 403) {
    return 'Accès refusé';
  }
  if (api?.response?.status === 404) {
    return 'Ressource introuvable';
  }
  if (api?.response?.status && api.response.status >= 500) {
    return 'Erreur serveur, réessayez plus tard';
  }
  if (typeof err === 'string') return err;
  return 'Une erreur est survenue';
}
