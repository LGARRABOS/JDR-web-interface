import { ErrorPageLayout } from '../components/ErrorPageLayout';

export function NotFoundPage() {
  return (
    <ErrorPageLayout
      code={404}
      title="Page introuvable"
      message="La page que vous recherchez n'existe pas ou a été déplacée."
    />
  );
}
