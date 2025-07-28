

import React, { useState } from 'react';
import { XMarkIcon, TrashIcon, SpinnerIcon } from './icons';

interface ConfirmDeleteModalProps {
  message: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

export const ConfirmDeleteModal: React.FC<ConfirmDeleteModalProps> = ({ message, onConfirm, onClose }) => {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleConfirm = async () => {
    setIsDeleting(true);
    try {
      await onConfirm();
      // onClose is called by the parent component upon success
    } catch (error) {
      console.error("Delete failed:", error);
      alert(`La suppression a échoué: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
      setIsDeleting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-delete-title"
      onClick={onClose}
    >
      <div
        className="bg-gray-800 rounded-xl border border-gray-700/50 shadow-2xl w-full max-w-md"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 id="confirm-delete-title" className="text-lg font-bold text-red-400 flex items-center gap-2">
            <TrashIcon className="w-5 h-5"/>
            Confirmation Requise
          </h2>
          <button onClick={onClose} aria-label="Fermer" className="p-1 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white" disabled={isDeleting}>
            <XMarkIcon className="w-6 h-6" />
          </button>
        </header>

        <div className="p-6">
          <p className="text-gray-300">{message}</p>
        </div>

        <footer className="flex justify-end gap-4 p-4 bg-gray-900/50 rounded-b-xl">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2 text-sm font-semibold rounded-lg transition-colors duration-200 bg-gray-700/50 border-2 border-gray-600 hover:bg-gray-700 hover:border-gray-500 text-gray-300 disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isDeleting}
            className="px-4 py-2 text-sm font-semibold rounded-lg transition-colors duration-200 bg-red-600 border-2 border-red-500 text-white hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
          >
            {isDeleting && <SpinnerIcon className="w-4 h-4 animate-spin" />}
            {isDeleting ? 'Suppression...' : 'Confirmer'}
          </button>
        </footer>
      </div>
    </div>
  );
};
