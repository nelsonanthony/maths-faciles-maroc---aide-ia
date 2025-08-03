
import React from 'react';
import { ModalState, Level, Chapter, Series, Exercise, Quiz, QuizQuestion } from '@/types.ts';
import { EditLevelModal } from '@/components/EditLevelModal.tsx';
import { EditChapterModal } from '@/components/EditChapterModal.tsx';
import { EditSeriesModal } from '@/components/EditSeriesModal.tsx';
import { EditExerciseModal } from '@/components/EditExerciseModal.tsx';
import { EditQuizModal } from '@/components/EditQuizModal.tsx';
import { EditQuizQuestionModal } from '@/components/EditQuizQuestionModal.tsx';
import { ConfirmDeleteModal } from '@/components/ConfirmDeleteModal.tsx';

interface ModalManagerProps {
    modal: ModalState | null;
    levelId: string | null;
    openModal: (modalState: ModalState) => void;
    onClose: () => void;
    onSaveLevel: (levelData: Level) => Promise<void>;
    onSaveChapter: (chapterData: Chapter) => Promise<void>;
    onSaveSeries: (seriesData: Series, chapterId: string) => Promise<void>;
    onSaveExercise: (exerciseData: Exercise, seriesId: string) => Promise<void>;
    onSaveQuiz: (quizData: Quiz, chapterId: string) => Promise<void>;
    onSaveQuizQuestion: (questionData: QuizQuestion, quizId: string, chapterId: string) => Promise<void>;
    onConfirmDelete: () => Promise<void>;
}

export const ModalManager: React.FC<ModalManagerProps> = ({
    modal,
    levelId,
    openModal,
    onClose,
    onSaveLevel,
    onSaveChapter,
    onSaveSeries,
    onSaveExercise,
    onSaveQuiz,
    onSaveQuizQuestion,
    onConfirmDelete,
}) => {
    if (!modal) {
        return null;
    }

    switch (modal.type) {
        case 'editLevel':
            return <EditLevelModal level={modal.payload.level} onSave={onSaveLevel} onClose={onClose} />;
        case 'addLevel':
            return <EditLevelModal level={null} onSave={onSaveLevel} onClose={onClose} />;
        
        case 'editChapter':
            return <EditChapterModal chapter={modal.payload.chapter} onSave={onSaveChapter} onClose={onClose} />;
        case 'addChapter':
            return <EditChapterModal chapter={null} onSave={onSaveChapter} onClose={onClose} />;
        
        case 'editSeries':
            return <EditSeriesModal series={modal.payload.series} onSave={(seriesData) => onSaveSeries(seriesData, modal.payload.chapterId)} onClose={onClose} />;
        
        case 'editExercise':
            return <EditExerciseModal exercise={modal.payload.exercise} seriesId={modal.payload.seriesId} onSave={onSaveExercise} onClose={onClose} />;
        
        case 'editQuiz': {
            const { quiz, chapterId } = modal.payload;
            if (!levelId) return null;
            
            return <EditQuizModal
                        quiz={quiz}
                        chapterId={chapterId}
                        onSave={onSaveQuiz}
                        onClose={onClose}
                        openModal={openModal}
                        onSaveQuizQuestion={onSaveQuizQuestion}
                   />;
        }
        case 'editQuizQuestion':
            return <EditQuizQuestionModal
                        question={modal.payload.question}
                        quizId={modal.payload.quizId}
                        chapterId={modal.payload.chapterId}
                        onSave={onSaveQuizQuestion}
                        onClose={onClose}
                   />;
        
        case 'delete':
            return <ConfirmDeleteModal
                        message={`Êtes-vous sûr de vouloir supprimer "${modal.payload.name}" ? Cette action est irréversible.`}
                        onConfirm={onConfirmDelete}
                        onClose={onClose}
                   />;
        
        default:
            return null;
    }
};