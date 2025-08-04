

import React, { useState, useEffect, useMemo } from 'react';
import { ExerciseContext, ChatRoom as ChatRoomType } from '@/types';
import { getSupabase } from '@/services/authService';
import { ChatRoom } from '@/components/ChatRoom';
import { ArrowLeftIcon, SpinnerIcon, PlusCircleIcon } from '@/components/icons';

interface ChatPageProps {
    exerciseContext: ExerciseContext;
    onBack: () => void;
    selectedRoomId: string | null;
    onSelectRoom: (roomId: string | null) => void;
}

export const ChatPage: React.FC<ChatPageProps> = ({ exerciseContext, onBack, selectedRoomId, onSelectRoom }) => {
    const [rooms, setRooms] = useState<ChatRoomType[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isCreatingRoom, setIsCreatingRoom] = useState(false);
    const [newRoomName, setNewRoomName] = useState('');

    const selectedRoom = useMemo(() => {
        if (!selectedRoomId || rooms.length === 0) return null;
        return rooms.find(r => r.id === selectedRoomId);
    }, [selectedRoomId, rooms]);

    useEffect(() => {
        const fetchRooms = async () => {
            setIsLoading(true);
            try {
                const response = await fetch(`/api/chat/get-rooms?exercise_id=${exerciseContext.exerciseId}`);
                if (!response.ok) throw new Error('Failed to fetch rooms');
                const data = await response.json();
                setRooms(data);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'An unknown error occurred');
            } finally {
                setIsLoading(false);
            }
        };

        fetchRooms();
    }, [exerciseContext.exerciseId]);

    const handleCreateRoom = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newRoomName.trim()) return;

        setIsLoading(true);
        try {
            const supabase = getSupabase();
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error("User not authenticated");

            const response = await fetch(`/api/chat/create-room`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({ name: newRoomName, exercise_id: exerciseContext.exerciseId })
            });

            if (!response.ok) {
                 const errorData = await response.json();
                 throw new Error(errorData.error || 'Failed to create room');
            }
            const newRoom = await response.json();
            setRooms(prev => [newRoom, ...prev]);
            setNewRoomName('');
            setIsCreatingRoom(false);
            onSelectRoom(newRoom.id);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An unknown error occurred');
        } finally {
            setIsLoading(false);
        }
    };

    if (isLoading) {
        return (
            <div className="text-center p-8">
                <SpinnerIcon className="w-8 h-8 animate-spin mx-auto text-brand-blue-500" />
                <p className="mt-2 text-slate-400">Chargement des groupes...</p>
            </div>
        );
    }

    if (selectedRoom) {
        return <ChatRoom room={selectedRoom} onBack={() => onSelectRoom(null)} />;
    }

    return (
        <div className="max-w-4xl mx-auto">
            <button onClick={onBack} className="flex items-center gap-2 text-brand-blue-400 hover:text-brand-blue-300 transition-colors mb-4">
                <ArrowLeftIcon className="w-5 h-5" />
                Retour à l'exercice
            </button>
            <h2 className="text-3xl font-bold text-brand-blue-300 mb-6">Groupes d'Étude</h2>

            {error ? (
                <p className="text-red-400 text-center">{error}</p>
            ) : (
                <div className="space-y-6">
                    <div className="p-4 bg-gray-800/50 rounded-xl border border-gray-700">
                        <button onClick={() => setIsCreatingRoom(!isCreatingRoom)} className="flex justify-between items-center w-full text-lg font-semibold text-gray-200">
                            <span>Créer un nouveau groupe</span>
                            <PlusCircleIcon className={`w-6 h-6 transition-transform ${isCreatingRoom ? 'rotate-45' : ''}`} />
                        </button>
                        {isCreatingRoom && (
                            <form onSubmit={handleCreateRoom} className="mt-4 space-y-2">
                                <input
                                    type="text"
                                    value={newRoomName}
                                    onChange={(e) => setNewRoomName(e.target.value)}
                                    placeholder="Nom du groupe (ex: Aide sur les asymptotes)"
                                    className="w-full p-2 bg-gray-900 border-2 border-gray-600 rounded-lg text-gray-300"
                                />
                                <button type="submit" className="px-4 py-2 bg-brand-blue-600 text-white rounded-lg">
                                    Créer
                                </button>
                            </form>
                        )}
                    </div>

                    <div className="space-y-4">
                        <h3 className="text-xl font-semibold">Groupes existants :</h3>
                        {rooms.length > 0 ? (
                            rooms.map(room => (
                                <button key={room.id} onClick={() => onSelectRoom(room.id)} className="w-full text-left p-4 bg-gray-800 hover:bg-gray-700/60 rounded-lg transition-colors">
                                    <p className="font-semibold text-gray-200">{room.name}</p>
                                    <p className="text-xs text-gray-400">Créé le {new Date(room.created_at).toLocaleString()}</p>
                                </button>
                            ))
                        ) : (
                            <p className="text-gray-400 text-center py-4">Aucun groupe de discussion pour cet exercice. Soyez le premier à en créer un !</p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
