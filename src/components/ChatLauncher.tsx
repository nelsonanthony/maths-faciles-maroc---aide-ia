

import React from 'react';
import { ChatBubbleLeftRightIcon } from './icons';

interface ChatLauncherProps {
    onClick: () => void;
}

export const ChatLauncher: React.FC<ChatLauncherProps> = ({ onClick }) => (
    <div className="bg-gray-800/30 rounded-xl p-6 border border-gray-700/30">
        <h3 className="text-xl font-semibold text-brand-blue-300 flex items-center gap-3 mb-4">
           <ChatBubbleLeftRightIcon className="w-6 h-6" />
            Groupes d'Étude
        </h3>
        <p className="text-gray-400 text-sm mb-4">Rejoignez une discussion avec d'autres élèves pour résoudre cet exercice ensemble ou posez vos questions.</p>
        <button onClick={onClick} className="w-full text-center px-4 py-2 font-semibold text-white bg-brand-blue-600 rounded-lg hover:bg-brand-blue-700">
           Accéder aux discussions
        </button>
    </div>
);
