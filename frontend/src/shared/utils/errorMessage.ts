/**
 * Extrait un message d'erreur lisible depuis une erreur API ou une exception.
 * Le message renvoyé par le serveur est prioritaire sur le message technique
 * d'axios (« Request failed with status code 403 »).
 */
export function getErrorMessage(
  err: unknown,
  fallback = 'Une erreur est survenue'
): string {
  const api = err as {
    response?: { data?: { message?: string }; status?: number };
  };
  if (api?.response?.data?.message) {
    return api.response.data.message;
  }
  const status = api?.response?.status;
  if (status === 401) return 'Identifiants incorrects';
  if (status === 403) return 'Accès refusé';
  if (status === 404) return 'Ressource introuvable';
  if (status && status >= 500) return 'Erreur serveur, réessayez plus tard';
  if (
    api?.response === undefined &&
    (err as { code?: string })?.code === 'ERR_NETWORK'
  ) {
    return 'Serveur injoignable';
  }
  if (typeof err === 'string') return err;
  if (err instanceof Error && err.message && !api?.response) return err.message;
  return fallback;
}
