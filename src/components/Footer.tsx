import React from 'react';

export const Footer: React.FC = () => {
    return (
        <footer className="bg-slate-950 border-t border-slate-800 mt-auto">
            <div className="container mx-auto px-4 py-6 text-center text-slate-500">
                <p>&copy; {new Date().getFullYear()} Maths Faciles Maroc. L'éducation augmentée par l'IA.</p>
            </div>
        </footer>
    );
};