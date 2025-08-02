

import React, { useState } from 'react';
import { Level } from '@/types';
import { XMarkIcon, SpinnerIcon } from '@/components/icons';

interface EditLevelModalProps {
  level: Level | null; // Null for creation
  onSave: (levelData: Level) => Promise<void>;
  onClose: () => void;
}

const emptyLevel: Omit<Level, 'id' | 'chapters'> = {
  levelName: '',
  description: ''
};

export const EditLevelModal: React.FC<EditLevelModalProps> = ({ level, onSave, onClose }) => {
  const [formData, setFormData] = useState(level || emptyLevel);
  const [isSaving, setIsSaving] = useState(false);

  const isCreating = !level;
  const modalTitle = isCreating ? "Ajouter un nouveau niveau" : "Modifier le niveau";

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.levelName.trim()) {
      alert("Le nom du niveau est obligatoire.");
      return;
    }

    setIsSaving(true);
    try {
      const finalLevel: Level = {
        id: level?.id || `level-${Date.now()}`,
        levelName: formData.levelName.trim(),
        description: formData.description.trim(),
        chapters: level?.chapters || [],
      };
      await onSave(finalLevel);
      onClose();
    } catch (error) {
      console.error("Save failed:", error);
      alert(`Erreur lors de la sauvegarde: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-level-title"
      onClick={isSaving ? undefined : onClose}
    >
      <div
        className="bg-gray-800 rounded-xl border border-gray-700/50 shadow-2xl w-full max-w-2xl"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 id="edit-level-title" className="text-xl font-bold text-brand-blue-300">{modalTitle}</h2>
          <button onClick={onClose} aria-label="Fermer" className="p-1 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white" disabled={isSaving}>
            <XMarkIcon className="w-6 h-6" />
          </button>
        </header>

        <form onSubmit={handleSave} id="edit-level-form" className="p-6 space-y-4">
          <div>
            <label htmlFor="levelName" className="block text-sm font-medium text-gray-300 mb-1">Nom du niveau</label>
            <input
              type="text"
              id="levelName"
              name="levelName"
              value={formData.levelName}
              onChange={handleChange}
              required
              disabled={isSaving}
              className="w-full p-3 bg-gray-900 border-2 border-gray-700 rounded-lg text-gray-300 focus:ring-2 focus:ring-brand-blue-500 focus:border-brand-blue-500 disabled:opacity-50"
            />
          </div>
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-300 mb-1">Description</label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows={4}
              disabled={isSaving}
              className="w-full p-3 bg-gray-900 border-2 border-gray-700 rounded-lg text-gray-300 focus:ring-2 focus:ring-brand-blue-500 focus:border-brand-blue-500 disabled:opacity-50"
            />
          </div>
        </form>

        <footer className="flex justify-end gap-4 p-4 border-t border-gray-700 bg-gray-800/50">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="px-4 py-2 text-sm font-semibold rounded-lg transition-colors duration-200 bg-gray-700/50 border-2 border-gray-600 hover:bg-gray-700 hover:border-gray-500 text-gray-300 disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="submit"
            form="edit-level-form"
            disabled={isSaving}
            className="px-4 py-2 text-sm font-semibold rounded-lg transition-colors duration-200 bg-brand-blue-600 border-2 border-brand-blue-500 text-white hover:bg-brand-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            {isSaving && <SpinnerIcon className="w-4 h-4 animate-spin" />}
            {isSaving ? 'Sauvegarde...' : (isCreating ? 'Ajouter' : 'Enregistrer')}
          </button>
        </footer>
      </div>
    </div>
  );
};