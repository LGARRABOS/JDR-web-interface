import { useState, useEffect } from 'react';
import { AuthAPI } from '../api/client';
import type { User } from '../auth/AuthContext';
import { Modal, ModalButtons } from './Modal';

interface ProfileModalProps {
  open: boolean;
  onClose: () => void;
  user: User | null;
  onSuccess: () => void;
  onAccountDeleted?: () => void;
}

export function ProfileModal({
  open,
  onClose,
  user,
  onSuccess,
  onAccountDeleted,
}: ProfileModalProps) {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [purgeConfirmOpen, setPurgeConfirmOpen] = useState(false);
  const [purging, setPurging] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (open && user) {
      setDisplayName(user.displayName ?? '');
      setEmail(user.email ?? '');
      setPassword('');
      setError(null);
    }
  }, [open, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const data: { displayName?: string; email?: string; password?: string } =
        {};
      if (displayName.trim() !== (user?.displayName ?? '')) {
        data.displayName = displayName.trim();
      }
      if (email.trim().toLowerCase() !== (user?.email ?? '')) {
        data.email = email.trim().toLowerCase();
      }
      if (password) {
        data.password = password;
      }
      if (Object.keys(data).length === 0) {
        setError('Aucune modification');
        setSaving(false);
        return;
      }
      await AuthAPI.updateProfile(data);
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? 'Erreur lors de la mise à jour';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handlePurgeConfirm = async () => {
    setPurging(true);
    setError(null);
    try {
      await AuthAPI.purgeAssets();
      onSuccess();
      setPurgeConfirmOpen(false);
      onClose();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? 'Erreur lors de la purge';
      setError(msg);
    } finally {
      setPurging(false);
    }
  };

  const handleDeleteAccountConfirm = async () => {
    setDeleting(true);
    setError(null);
    try {
      await AuthAPI.deleteAccount();
      setDeleteConfirmOpen(false);
      onClose();
      onAccountDeleted?.();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? 'Erreur lors de la suppression du compte';
      setError(msg);
    } finally {
      setDeleting(false);
    }
  };

  if (!user) return null;

  return (
    <Modal open={open} onClose={onClose} title="Mon profil">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="profile-displayName"
            className="block text-sm font-medium text-fantasy-text-soft mb-1"
          >
            Pseudo
          </label>
          <input
            id="profile-displayName"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full rounded bg-fantasy-input-soft px-3 py-2 text-fantasy-text-soft border border-fantasy-border-soft"
            placeholder="Votre pseudo"
          />
        </div>
        <div>
          <label
            htmlFor="profile-email"
            className="block text-sm font-medium text-fantasy-text-soft mb-1"
          >
            Email
          </label>
          <input
            id="profile-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded bg-fantasy-input-soft px-3 py-2 text-fantasy-text-soft border border-fantasy-border-soft"
            placeholder="votre@email.com"
          />
        </div>
        <div>
          <label
            htmlFor="profile-password"
            className="block text-sm font-medium text-fantasy-text-soft mb-1"
          >
            Nouveau mot de passe
          </label>
          <input
            id="profile-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded bg-fantasy-input-soft px-3 py-2 text-fantasy-text-soft border border-fantasy-border-soft"
            placeholder="Laisser vide pour ne pas changer"
          />
          <p className="text-xs text-fantasy-muted-soft mt-1">
            Minimum 6 caractères
          </p>
        </div>
        {error && (
          <p className="text-sm text-fantasy-error">{error}</p>
        )}

        <div className="pt-4 mt-4 border-t border-fantasy-border-soft">
          <h3 className="text-sm font-medium text-fantasy-text-soft mb-2">
            Zone de danger
          </h3>
          <p className="text-xs text-fantasy-muted-soft mb-2">
            Supprimer définitivement tous vos assets : cartes, monstres, décor,
            musique. Les parties ne seront pas supprimées.
          </p>
          <button
            type="button"
            onClick={() => setPurgeConfirmOpen(true)}
            className="px-4 py-2 rounded bg-fantasy-danger/80 hover:bg-fantasy-danger text-white text-sm"
          >
            Purger tous mes assets
          </button>
          <div className="mt-3 pt-3 border-t border-fantasy-border-soft">
            <p className="text-xs text-fantasy-muted-soft mb-2">
              Supprimer définitivement votre compte et toutes vos données
              (parties, messages, etc.).
            </p>
            <button
              type="button"
              onClick={() => setDeleteConfirmOpen(true)}
              className="px-4 py-2 rounded bg-fantasy-danger hover:bg-fantasy-error text-white text-sm"
            >
              Supprimer mon compte
            </button>
          </div>
        </div>

        <Modal
          open={deleteConfirmOpen}
          onClose={() => !deleting && setDeleteConfirmOpen(false)}
          title="Supprimer le compte"
        >
          <p className="text-fantasy-text-soft text-sm mb-4">
            Supprimer définitivement votre compte ? Toutes vos parties, messages
            et données seront perdus. Cette action est irréversible.
          </p>
          <ModalButtons>
            <button
              type="button"
              onClick={() => setDeleteConfirmOpen(false)}
              disabled={deleting}
              className="px-4 py-2 rounded bg-fantasy-input-soft hover:bg-fantasy-input-hover-soft text-fantasy-text-soft disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleDeleteAccountConfirm}
              disabled={deleting}
              className="px-4 py-2 rounded bg-fantasy-danger hover:bg-fantasy-error text-white disabled:opacity-50"
            >
              {deleting ? 'Suppression...' : 'Supprimer mon compte'}
            </button>
          </ModalButtons>
        </Modal>

        <Modal
          open={purgeConfirmOpen}
          onClose={() => !purging && setPurgeConfirmOpen(false)}
          title="Purger les assets"
        >
          <p className="text-fantasy-text-soft text-sm mb-4">
            Supprimer définitivement toutes vos cartes, éléments (monstres,
            décor) et pistes musicales ? Cette action est irréversible.
          </p>
          <ModalButtons>
            <button
              type="button"
              onClick={() => setPurgeConfirmOpen(false)}
              disabled={purging}
              className="px-4 py-2 rounded bg-fantasy-input-soft hover:bg-fantasy-input-hover-soft text-fantasy-text-soft disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handlePurgeConfirm}
              disabled={purging}
              className="px-4 py-2 rounded bg-fantasy-danger hover:bg-fantasy-error text-white disabled:opacity-50"
            >
              {purging ? 'Suppression...' : 'Purger'}
            </button>
          </ModalButtons>
        </Modal>

        <ModalButtons>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded bg-fantasy-input-soft hover:bg-fantasy-input-hover-soft text-fantasy-text-soft"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 rounded bg-fantasy-accent hover:bg-fantasy-accent-hover text-fantasy-bg disabled:opacity-50"
          >
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </ModalButtons>
      </form>
    </Modal>
  );
}
