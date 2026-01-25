import React from 'react';

export const Logo: React.FC<{ className?: string }> = ({ className = "w-8 h-8" }) => (
  <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Girandola - 8 triangoli che ruotano dal centro */}

    {/* Triangolo 1 - Nord (verde scuro) */}
    <polygon points="50,50 42,8 58,8" fill="#4A7C4E" />

    {/* Triangolo 2 - Nord-Est (verde chiaro) */}
    <polygon points="50,50 70,15 85,30" fill="#8BC34A" />

    {/* Triangolo 3 - Est (verde medio) */}
    <polygon points="50,50 92,42 92,58" fill="#6B9B4E" />

    {/* Triangolo 4 - Sud-Est (verde chiaro) */}
    <polygon points="50,50 85,70 70,85" fill="#9CCC65" />

    {/* Triangolo 5 - Sud (verde scuro) */}
    <polygon points="50,50 58,92 42,92" fill="#4A7C4E" />

    {/* Triangolo 6 - Sud-Ovest (verde chiaro) */}
    <polygon points="50,50 30,85 15,70" fill="#8BC34A" />

    {/* Triangolo 7 - Ovest (verde medio) */}
    <polygon points="50,50 8,58 8,42" fill="#6B9B4E" />

    {/* Triangolo 8 - Nord-Ovest (verde chiaro) */}
    <polygon points="50,50 15,30 30,15" fill="#9CCC65" />
  </svg>
);