
import React, { useState } from 'react';
import { Series } from '@/types';
import { XMarkIcon } from '@/components/icons';

interface EditSeriesModalProps {
  series: Series | null; // Null for creation
  onSave: (seriesData: Series) => void;
  onClose: () => void;
}

const emptySeries: Omit<Series, 'id' | 'exercises'> = {
  title: ''
};

export const EditSeriesModal: React.FC<EditSeriesModalProps> = ({ series, onSave, onClose }) => {
  const [formData, setFormData] = useState(series || emptySeries);

  const isCreating = !series;
  const modalTitle = isCreating ? "Ajouter une nouvelle série" : "Modifier la série";

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      alert("Le titre de la série est obligatoire.");
      return;
    }

    const finalSeries: Series = {
      id: series?.id || `series-${Date.now()}`,
      title: formData.title.trim(),
      exercises: series?.exercises || [],
    };
    
    onSave(finalSeries);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-series-title"
      onClick={onClose}
    >
      <div
        className="bg-gray-800 rounded-xl border border-gray-700/50 shadow-2xl w-full max-w-2xl"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 id="edit-series-title" className="text-xl font-bold text-brand-blue-300">{modalTitle}</h2>
          <button onClick={onClose} aria-label="Fermer" className="p-1 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white">
            <XMarkIcon className="w-6 h-6" />
          </button>
        </header>

        <form onSubmit={handleSave} id="edit-series-form" className="p-6 space-y-4">
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-300 mb-1">Titre de la série</label>
            <input
              type="text"
              id="title"
              name="title"
              value={formData.title}
              onChange={handleChange}
              required
              className="w-full p-3 bg-gray-900 border-2 border-gray-700 rounded-lg text-gray-300 focus:ring-2 focus:ring-brand-blue-500 focus:border-brand-blue-500"
            />
          </div>
        </form>

        <footer className="flex justify-end gap-4 p-4 border-t border-gray-700 bg-gray-800/50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold rounded-lg transition-colors duration-200 bg-gray-700/50 border-2 border-gray-600 hover:bg-gray-700 hover:border-gray-500 text-gray-300"
          >
            Annuler
          </button>
          <button
            type="submit"
            form="edit-series-form"
            className="px-4 py-2 text-sm font-semibold rounded-lg transition-colors duration-200 bg-brand-blue-600 border-2 border-brand-blue-500 text-white hover:bg-brand-blue-700"
          >
            {isCreating ? 'Ajouter la série' : 'Enregistrer'}
          </button>
        </footer>
      </div>
    </div>
  );
};
