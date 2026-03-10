import { ErrorPageLayout } from '../components/ErrorPageLayout';

export function ServerErrorPage() {
  return (
    <ErrorPageLayout
      code={500}
      title="Erreur serveur"
      message="Une erreur inattendue s'est produite. Veuillez réessayer plus tard."
    />
  );
}
