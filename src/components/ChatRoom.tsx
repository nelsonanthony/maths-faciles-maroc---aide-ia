

import React, { useState, useEffect, useRef } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { ChatRoom as ChatRoomType, ChatMessage } from '@/types';
import { getSupabase } from '@/services/authService';
import { useAuth } from '@/contexts/AuthContext';
import { ArrowLeftIcon, SpinnerIcon } from '@/components/icons';
import { MathJaxRenderer } from './MathJaxRenderer';
import { MathKeyboard } from './MathKeyboard';

interface ChatRoomProps {
    room: ChatRoomType;
    onBack: () => void;
}

export const ChatRoom: React.FC<ChatRoomProps> = ({ room, onBack }) => {
    const { user } = useAuth();
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const supabase = getSupabase();

    useEffect(() => {
        const fetchMessages = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (!session) throw new Error("User not authenticated to fetch messages");

                const response = await fetch(`/api/chat/get-messages?room_id=${room.id}`, {
                    headers: {
                        'Authorization': `Bearer ${session.access_token}`
                    }
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'Failed to fetch messages');
                }
                const data = await response.json();
                setMessages(data);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'An unknown error occurred');
            } finally {
                setIsLoading(false);
            }
        };

        fetchMessages();

        const channel = supabase
            .channel(`chat_room_${room.id}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `room_id=eq.${room.id}` },
                (payload) => {
                    setMessages(prev => [...prev, payload.new as ChatMessage]);
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [room.id]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !user) return;
        setError(null);

        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error("User not authenticated");

            const response = await fetch(`/api/chat/send-message`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({ room_id: room.id, content: newMessage }),
            });

            if (!response.ok) {
                if (response.status === 403) {
                    setError("Votre message n'a pas pu être envoyé car il a été jugé hors-sujet. Veuillez vous concentrer sur l'exercice de mathématiques.");
                } else {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'Failed to send message');
                }
            } else {
                setNewMessage('');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to send message');
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setNewMessage(e.target.value);
        if (error) {
            setError(null);
        }
    };

    return (
        <div className="flex flex-col h-[80vh] max-w-4xl mx-auto bg-gray-800/50 rounded-xl border border-gray-700/50">
            <header className="p-4 border-b border-gray-700 flex items-center gap-4">
                <button onClick={onBack} className="p-2 rounded-full hover:bg-gray-700">
                    <ArrowLeftIcon className="w-5 h-5" />
                </button>
                <h2 className="text-xl font-bold text-brand-blue-300">{room.name}</h2>
            </header>

            <main className="flex-grow p-4 overflow-y-auto space-y-4">
                {isLoading && <div className="text-center"><SpinnerIcon className="w-6 h-6 animate-spin mx-auto" /></div>}
                
                {messages.map(msg => {
                    const safeContent = DOMPurify.sanitize(marked.parse(msg.content, { breaks: true }) as string);
                    return (
                        <div key={msg.id} className={`flex items-end gap-2 ${msg.user_id === user?.id ? 'justify-end' : ''}`}>
                            <div className={`max-w-xs md:max-w-md p-3 rounded-lg ${msg.user_id === user?.id ? 'bg-brand-blue-600 text-white' : 'bg-gray-700 text-gray-200'}`}>
                                {msg.user_id !== user?.id && <p className="text-xs font-bold text-brand-blue-300 mb-1">{msg.user_email}</p>}
                                <div className="text-sm break-words prose prose-invert prose-p:my-0 prose-pre:my-0 max-w-none">
                                    <MathJaxRenderer content={safeContent} />
                                </div>
                            </div>
                        </div>
                    );
                })}
                <div ref={messagesEndRef} />
            </main>

            {isKeyboardOpen && (
                <MathKeyboard
                    initialValue={newMessage}
                    onConfirm={(latex) => {
                        setNewMessage(latex);
                        setIsKeyboardOpen(false);
                    }}
                    onClose={() => setIsKeyboardOpen(false)}
                />
            )}

            <footer className="p-4 border-t border-gray-700">
                <form onSubmit={handleSendMessage} className="space-y-2">
                    <div className="flex gap-2">
                        <div className="relative flex-grow">
                            <input
                                type="text"
                                value={newMessage}
                                onChange={handleInputChange}
                                placeholder="Écrivez votre message ou utilisez le clavier ƒ(x)"
                                className="w-full p-3 pr-14 bg-gray-900 border-2 border-gray-600 rounded-lg text-gray-200 focus:ring-2 focus:ring-brand-blue-500 focus:border-brand-blue-500"
                                disabled={!user}
                            />
                            <button
                                type="button"
                                onClick={() => setIsKeyboardOpen(true)}
                                className="absolute inset-y-0 right-0 flex items-center justify-center w-14 text-gray-400 hover:text-brand-blue-400 rounded-r-lg"
                                aria-label="Ouvrir le clavier mathématique"
                            >
                                <span className="font-serif text-xl italic text-brand-blue-300">ƒ(x)</span>
                            </button>
                        </div>
                        <button type="submit" className="px-6 py-3 bg-brand-blue-600 text-white font-semibold rounded-lg disabled:opacity-50 flex-shrink-0" disabled={!user || !newMessage.trim()}>
                            Envoyer
                        </button>
                    </div>
                     {error && <p className="text-red-400 text-sm pl-1">{error}</p>}
                </form>
            </footer>
        </div>
    );
};