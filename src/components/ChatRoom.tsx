
import React, { useState, useEffect, useRef } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { EditableMathField, MathField } from 'react-mathquill';
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
    const mathFieldRef = useRef<MathField | null>(null);
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
    }, [room.id, supabase]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSendMessage = async (e: React.MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();
        const messageToSend = newMessage.trim();
        if (!messageToSend || !user) return;
    
        setNewMessage(''); // Optimistically clear the input via state
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
                body: JSON.stringify({ room_id: room.id, content: messageToSend }),
            });
    
            if (!response.ok) {
                // On failure, restore the message.
                setNewMessage(messageToSend);
                if (response.status === 403) {
                    setError("Votre message n'a pas pu être envoyé car il a été jugé hors-sujet. Veuillez vous concentrer sur l'exercice de mathématiques.");
                } else {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'Failed to send message');
                }
            }
            // On success, the input remains cleared.
        } catch (err) {
            // On any other failure, restore the message.
            setNewMessage(messageToSend);
            setError(err instanceof Error ? err.message : 'Failed to send message');
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
                    // The content is pure LaTeX from the math input. Wrap it for display rendering.
                    const mathContent = `$$${msg.content}$$`;
                    
                    return (
                        <div key={msg.id} className={`flex items-end gap-2 ${msg.user_id === user?.id ? 'justify-end' : ''}`}>
                            <div className={`max-w-xs md:max-w-md p-3 rounded-lg ${msg.user_id === user?.id ? 'bg-brand-blue-600 text-white' : 'bg-gray-700 text-gray-200'}`}>
                                {msg.user_id !== user?.id && <p className="text-xs font-bold text-brand-blue-300 mb-1">{msg.user_email}</p>}
                                <div className="text-sm">
                                    <MathJaxRenderer content={mathContent} className="overflow-x-auto py-1" />
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
                        if(mathFieldRef.current) mathFieldRef.current.latex(latex);
                        setIsKeyboardOpen(false);
                    }}
                    onClose={() => setIsKeyboardOpen(false)}
                />
            )}

            <footer className="p-4 border-t border-gray-700">
                 {error && <p className="text-sm text-red-400 mb-2 text-center">{error}</p>}
                <div className="space-y-2">
                    <div className="flex items-stretch gap-2">
                        <div className="math-input-wrapper flex-grow">
                             <EditableMathField
                                latex={newMessage}
                                onChange={(field: MathField) => {
                                    setNewMessage(field.latex());
                                    if (error) setError(null);
                                }}
                                mathquillDidMount={(field) => (mathFieldRef.current = field)}
                                config={{
                                    autoOperatorNames: 'sin cos tan log ln',
                                }}
                                aria-placeholder="Votre réponse..."
                                className="h-full"
                             />
                        </div>
                         <button type="button" onClick={() => setIsKeyboardOpen(true)} className="p-3 bg-gray-700 rounded-lg hover:bg-gray-600 flex items-center justify-center">
                            <span className="font-serif text-xl italic text-brand-blue-300">ƒ(x)</span>
                        </button>
                        <button type="button" onClick={handleSendMessage} className="px-4 py-3 bg-brand-blue-600 text-white font-semibold rounded-lg disabled:opacity-50" disabled={!newMessage.trim()}>
                            Envoyer
                        </button>
                    </div>
                </div>
            </footer>
        </div>
    );
};
