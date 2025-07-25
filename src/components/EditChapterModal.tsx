
import React, { useState } from 'react';
import { Chapter, VideoLink } from '@/types';
import { XMarkIcon, PlusCircleIcon, TrashIcon } from '@/components/icons';

interface EditChapterModalProps {
  chapter: Chapter | null; // Null for creation
  onSave: (chapterData: Chapter) => void;
  onClose: () => void;
}

export const EditChapterModal: React.FC<EditChapterModalProps> = ({ chapter, onSave, onClose }) => {
  const [title, setTitle] = useState(chapter?.title || '');
  const [summary, setSummary] = useState(chapter?.summary || '');
  const [videoLinks, setVideoLinks] = useState<VideoLink[]>(chapter?.videoLinks || []);
  
  const isCreating = !chapter;
  const modalTitle = isCreating ? "Ajouter un nouveau chapitre" : "Modifier le chapitre";

  const handleVideoLinkChange = (index: number, field: keyof VideoLink, value: string) => {
    const newVideoLinks = [...videoLinks];
    newVideoLinks[index] = { ...newVideoLinks[index], [field]: value };
    setVideoLinks(newVideoLinks);
  };

  const handleAddVideoLink = () => {
    setVideoLinks([...videoLinks, { id: '', title: '' }]);
  };

  const handleRemoveVideoLink = (index: number) => {
    const newVideoLinks = videoLinks.filter((_, i) => i !== index);
    setVideoLinks(newVideoLinks);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      alert("Le titre est obligatoire.");
      return;
    }

    const finalChapter: Chapter = {
      id: chapter?.id || `ch-${Date.now()}`,
      title: title.trim(),
      summary: summary.trim(),
      videoLinks: videoLinks.filter(link => link.id.trim() && link.title.trim()),
      quizzes: chapter?.quizzes || [],
      series: chapter?.series || [],
    };
    
    onSave(finalChapter);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-chapter-title"
      onClick={onClose}
    >
      <div
        className="bg-gray-800 rounded-xl border border-gray-700/50 shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 id="edit-chapter-title" className="text-xl font-bold text-brand-blue-300">{modalTitle}</h2>
          <button onClick={onClose} aria-label="Fermer" className="p-1 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white">
            <XMarkIcon className="w-6 h-6" />
          </button>
        </header>

        <form onSubmit={handleSave} id="edit-chapter-form" className="flex-grow overflow-y-auto p-6 space-y-6">
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-300 mb-1">Titre du chapitre</label>
            <input
              type="text"
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full p-3 bg-gray-900 border-2 border-gray-700 rounded-lg text-gray-300 focus:ring-2 focus:ring-brand-blue-500 focus:border-brand-blue-500"
            />
          </div>
          <div>
            <label htmlFor="summary" className="block text-sm font-medium text-gray-300 mb-1">Résumé de la leçon</label>
            <textarea
              id="summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={8}
              className="w-full p-3 bg-gray-900 border-2 border-gray-700 rounded-lg text-gray-300 focus:ring-2 focus:ring-brand-blue-500 focus:border-brand-blue-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Liens Vidéo YouTube</label>
            <div className="space-y-4">
              {videoLinks.map((link, index) => (
                <div key={index} className="flex items-center gap-2 p-3 bg-gray-900/50 rounded-lg border border-gray-700">
                  <div className="flex-grow grid grid-cols-1 md:grid-cols-2 gap-2">
                     <input
                      type="text"
                      value={link.title}
                      onChange={(e) => handleVideoLinkChange(index, 'title', e.target.value)}
                      placeholder="Titre de la vidéo (ex: Partie 1)"
                      className="w-full p-2 bg-gray-800 border-2 border-gray-600 rounded-lg text-gray-300 focus:ring-2 focus:ring-brand-blue-500 focus:border-brand-blue-500"
                    />
                    <input
                      type="text"
                      value={link.id}
                      onChange={(e) => handleVideoLinkChange(index, 'id', e.target.value)}
                      placeholder="ID YouTube (ex: _RkL24x4k6c)"
                      className="w-full p-2 bg-gray-800 border-2 border-gray-600 rounded-lg text-gray-300 focus:ring-2 focus:ring-brand-blue-500 focus:border-brand-blue-500"
                    />
                  </div>
                  <button type="button" onClick={() => handleRemoveVideoLink(index)} className="p-2 text-gray-500 hover:text-red-400 shrink-0">
                    <TrashIcon className="w-5 h-5"/>
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={handleAddVideoLink}
                className="flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-lg transition-colors duration-200 text-brand-blue-300 hover:bg-brand-blue-500/10"
              >
                <PlusCircleIcon className="w-5 h-5" />
                Ajouter un lien vidéo
              </button>
            </div>
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
            form="edit-chapter-form"
            className="px-4 py-2 text-sm font-semibold rounded-lg transition-colors duration-200 bg-brand-blue-600 border-2 border-brand-blue-500 text-white hover:bg-brand-blue-700"
          >
            {isCreating ? 'Ajouter le chapitre' : 'Enregistrer'}
          </button>
        </footer>
      </div>
    </div>
  );
};
