
import React from 'react';

interface ChapterProgressProps {
    completedCount: number;
    totalCount: number;
}

export const ChapterProgress: React.FC<ChapterProgressProps> = ({ completedCount, totalCount }) => {
    if (totalCount === 0) {
        return null; // Don't show progress if there are no exercises
    }

    const percentage = (completedCount / totalCount) * 100;
    const isCompleted = completedCount === totalCount;

    return (
        <div className="mt-3">
            <div className="flex justify-between items-center text-xs text-gray-400 mb-1">
                <span>Progression</span>
                <span>{completedCount} / {totalCount} exercices</span>
            </div>
            <div className="w-full bg-gray-600/50 rounded-full h-2">
                <div
                    className={`h-2 rounded-full transition-all duration-500 ${isCompleted ? 'bg-green-500' : 'bg-brand-blue-500'}`}
                    style={{ width: `${percentage}%` }}
                ></div>
            </div>
        </div>
    );
};
