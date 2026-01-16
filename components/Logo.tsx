import React from 'react';

export const Logo: React.FC<{ className?: string }> = ({ className = "w-8 h-8" }) => (
  <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* 
      8-pointed star construction:
      1. Diagonal Star (Back layer - Light Green/Accent)
      2. Cardinal Star (Front layer - Dark Green)
    */}
    
    {/* Diagonal Star (Tips at corners) - Light Green #7CB342 */}
    <path 
      d="M20 20 L50 38 L80 20 L62 50 L80 80 L50 62 L20 80 L38 50 Z" 
      fill="#7CB342" 
    />
    
    {/* Cardinal Star (Tips at N, E, S, W) - Dark Green #4A7C4E */}
    {/* Slightly larger tips to create depth */}
    <path 
      d="M50 5 L63 37 L95 50 L63 63 L50 95 L37 63 L5 50 L37 37 Z" 
      fill="#4A7C4E" 
    />
    
    {/* Center Detail - Optional for 'construction' feel, a small diamond in center */}
    <path 
      d="M50 42 L58 50 L50 58 L42 50 Z" 
      fill="#E8EDE8"
      opacity="0.8"
    />
  </svg>
);