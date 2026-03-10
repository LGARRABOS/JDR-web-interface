import { ErrorPageLayout } from '../components/ErrorPageLayout';

export function ForbiddenPage() {
  return (
    <ErrorPageLayout
      code={403}
      title="Accès refusé"
      message="Vous n'avez pas les droits nécessaires pour accéder à cette page."
    />
  );
}
