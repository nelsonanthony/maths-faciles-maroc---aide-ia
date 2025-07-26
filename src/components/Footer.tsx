import React from 'react';

export const Footer: React.FC = () => {
    return (
        <footer className="bg-gray-900 border-t border-gray-800 mt-auto">
            <div className="container mx-auto px-4 py-6 text-center text-gray-500">
                <p>&copy; {new Date().getFullYear()} Maths Faciles Maroc. L'éducation augmentée par l'IA.</p>
            </div>
        </footer>
    );
};