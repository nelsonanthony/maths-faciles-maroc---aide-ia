
import React, { useState, useEffect } from 'react';
import { Chapter, Quiz, VideoLink } from '@/types';
import { ArrowLeftIcon, BookOpenIcon, QuestionMarkCircleIcon, DocumentTextIcon, PlayCircleIcon, PencilIcon, PlusCircleIcon, TrashIcon } from '@/components/icons';
import { MathJaxRenderer } from '@/components/MathJaxRenderer';
import { useAuth } from '@/contexts/AuthContext';

interface ChapterHomePageProps {
    chapter: Chapter;
    videoNavigation: { videoId: string; time: number } | null;
    onSelectQuiz: (quizId: string) => void;
    onSelectSeriesList: () => void;
    onBack: () => void;
    onEditChapter: (chapter: Chapter) => void;
    onAddQuiz: () => void;
    onEditQuiz: (quiz: Quiz) => void;
    onDeleteQuiz: (quizId: string, quizTitle: string) => void;
}

export const ChapterHomePage: React.FC<ChapterHomePageProps> = ({ 
    chapter, 
    videoNavigation,
    onSelectQuiz, 
    onSelectSeriesList, 
    onBack,
    onEditChapter,
    onAddQuiz,
    onEditQuiz,
    onDeleteQuiz
}) => {
    const { isAdmin } = useAuth();
    const [activeVideo, setActiveVideo] = useState<VideoLink | null>(null);
    const [videoUrl, setVideoUrl] = useState<string | null>(null);

    // Effect to set the initial active video when the component loads or chapter changes
    useEffect(() => {
        if (chapter.videoLinks && chapter.videoLinks.length > 0) {
            setActiveVideo(chapter.videoLinks[0]);
        } else {
            setActiveVideo(null);
        }
    }, [chapter]);
    
    // Effect to handle navigation from AI or other sources
    useEffect(() => {
        if (videoNavigation) {
            const targetVideo = chapter.videoLinks?.find(v => v.id === videoNavigation.videoId);
            if (targetVideo) {
                setActiveVideo(targetVideo);
                const url = `https://www.youtube.com/embed/${videoNavigation.videoId}?start=${videoNavigation.time}&autoplay=1`;
                setVideoUrl(url);
            }
        } else if (activeVideo) {
            // Default URL when no specific navigation is requested
            const url = `https://www.youtube.com/embed/${activeVideo.id}`;
            setVideoUrl(url);
        } else {
            setVideoUrl(null);
        }
    }, [activeVideo, videoNavigation, chapter.videoLinks]);

    const handleVideoSelect = (video: VideoLink) => {
        setActiveVideo(video);
        const url = `https://www.youtube.com/embed/${video.id}?autoplay=1`;
        setVideoUrl(url);
    };
    
    return (
        <div className="max-w-4xl mx-auto">
            <div className="mb-8">
                <button onClick={onBack} className="flex items-center gap-2 text-brand-blue-400 hover:text-brand-blue-300 transition-colors mb-4">
                    <ArrowLeftIcon className="w-5 h-5" />
                    Retour aux chapitres
                </button>
                <div className="flex justify-between items-start">
                    <div>
                        <h2 className="text-3xl font-bold text-brand-blue-300">{chapter.title}</h2>
                        <p className="mt-2 text-lg text-gray-400">Explorez les ressources de cette leçon.</p>
                    </div>
                    {isAdmin && (
                        <button
                            onClick={() => onEditChapter(chapter)}
                            className="flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-lg transition-colors duration-200 bg-gray-700/80 border border-gray-600 hover:bg-gray-600 text-gray-300 shadow-lg"
                            aria-label="Modifier le chapitre"
                        >
                            <PencilIcon className="w-4 h-4" />
                            <span>Modifier la leçon</span>
                        </button>
                    )}
                </div>
            </div>

            <div className="space-y-8">
                {/* Video Section */}
                <div className="bg-gray-800/50 backdrop-blur-md rounded-xl border border-gray-700/50 p-6">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-xl font-semibold text-brand-blue-300 flex items-center gap-3">
                            <PlayCircleIcon className="w-6 h-6" />
                            Vidéos Explicatives
                        </h3>
                    </div>
                    {(chapter.videoLinks && chapter.videoLinks.length > 0) ? (
                        <div className="grid lg:grid-cols-3 gap-6">
                            {/* Video Player */}
                            <div className="lg:col-span-2 aspect-w-16 aspect-h-9 bg-black rounded-lg overflow-hidden">
                                {videoUrl && (
                                    <iframe
                                        key={videoUrl} // Use key to force re-render of iframe on URL change
                                        src={videoUrl}
                                        title="YouTube video player"
                                        frameBorder="0"
                                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                        allowFullScreen
                                        className="w-full h-full"
                                    ></iframe>
                                )}
                            </div>
                            {/* Playlist */}
                            <div className="lg:col-span-1 space-y-2">
                                {chapter.videoLinks.map(video => (
                                    <button
                                        key={video.id}
                                        onClick={() => handleVideoSelect(video)}
                                        className={`w-full text-left p-3 rounded-lg border-2 transition-colors ${activeVideo?.id === video.id ? 'bg-brand-blue-600/20 border-brand-blue-500' : 'bg-gray-700/50 border-transparent hover:bg-gray-700'}`}
                                    >
                                        <p className={`font-semibold text-sm ${activeVideo?.id === video.id ? 'text-brand-blue-300' : 'text-gray-300'}`}>{video.title}</p>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <p className="text-gray-400 text-center py-4">Aucune vidéo disponible pour ce chapitre.</p>
                    )}
                </div>


                {/* Summary Section */}
                <div className="bg-gray-800/50 backdrop-blur-md rounded-xl border border-gray-700/50 p-6">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-xl font-semibold text-brand-blue-300 flex items-center gap-3">
                            <BookOpenIcon className="w-6 h-6" />
                            Résumé de la Leçon
                        </h3>
                    </div>
                    <MathJaxRenderer content={chapter.summary} className="text-gray-300 whitespace-pre-wrap" />
                </div>

                {/* Main Actions */}
                <div className="grid md:grid-cols-2 gap-6">
                    {/* Quiz Section */}
                    <div className="bg-gray-800/50 backdrop-blur-md rounded-xl border border-gray-700/50 p-6 space-y-4">
                         <div className="flex justify-between items-center">
                            <h3 className="text-xl font-semibold text-brand-blue-300 flex items-center gap-3">
                                <QuestionMarkCircleIcon className="w-6 h-6" />
                                Quiz
                            </h3>
                            {isAdmin && (
                                <button
                                    onClick={onAddQuiz}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors duration-200 bg-green-600/50 hover:bg-green-600 text-white"
                                    aria-label="Ajouter un quiz"
                                >
                                    <PlusCircleIcon className="w-4 h-4" />
                                    Ajouter
                                </button>
                            )}
                        </div>
                        {chapter.quizzes.length > 0 ? (
                            chapter.quizzes.map(quiz => (
                                <div key={quiz.id} className="group flex items-center justify-between gap-2 bg-gray-700/50 hover:bg-gray-700 transition-colors rounded-lg p-3">
                                    <button onClick={() => onSelectQuiz(quiz.id)} className="flex-grow text-left text-gray-200">
                                        {quiz.title}
                                    </button>
                                    {isAdmin && (
                                        <div className="flex items-center opacity-50 group-hover:opacity-100 transition-opacity">
                                            <button 
                                                onClick={() => onEditQuiz(quiz)}
                                                className="p-1.5 rounded-full text-gray-400 hover:bg-gray-600 hover:text-white"
                                                aria-label="Modifier le quiz"
                                            >
                                                <PencilIcon className="w-4 h-4"/>
                                            </button>
                                            <button 
                                                onClick={() => onDeleteQuiz(quiz.id, quiz.title)}
                                                className="p-1.5 rounded-full text-gray-400 hover:bg-gray-600 hover:text-red-400"
                                                aria-label="Supprimer le quiz"
                                            >
                                                <TrashIcon className="w-4 h-4"/>
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))
                        ) : (
                            <p className="text-gray-400 text-sm text-center py-2">Aucun quiz disponible.</p>
                        )}
                    </div>
                    
                    {/* Exercises Section */}
                    <div className="bg-gray-800/50 backdrop-blur-md rounded-xl border border-gray-700/50 p-6">
                        <h3 className="text-xl font-semibold text-brand-blue-300 flex items-center gap-3 mb-4">
                           <DocumentTextIcon className="w-6 h-6" />
                            Exercices
                        </h3>
                        <button onClick={onSelectSeriesList} className="w-full text-left bg-gray-700/50 hover:bg-gray-700 transition-colors rounded-lg p-4">
                            Voir les séries d'exercices
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
