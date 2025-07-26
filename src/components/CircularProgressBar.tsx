import React, { useState, useEffect } from 'react';

interface CircularProgressBarProps {
    percentage: number;
    size?: number;
    strokeWidth?: number;
}

export const CircularProgressBar: React.FC<CircularProgressBarProps> = ({ 
    percentage, 
    size = 150, 
    strokeWidth = 12 
}) => {
    const [animatedPercentage, setAnimatedPercentage] = useState(0);

    useEffect(() => {
        const animation = requestAnimationFrame(() => {
            setAnimatedPercentage(percentage);
        });
        return () => cancelAnimationFrame(animation);
    }, [percentage]);

    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (animatedPercentage / 100) * circumference;
    
    const color = percentage >= 75 ? 'text-green-400' : percentage >= 50 ? 'text-yellow-400' : 'text-red-400';

    return (
        <div className="relative" style={{ width: size, height: size }}>
            <svg
                className="transform -rotate-90"
                width={size}
                height={size}
            >
                {/* Background circle */}
                <circle
                    stroke="rgba(255, 255, 255, 0.1)"
                    fill="transparent"
                    strokeWidth={strokeWidth}
                    r={radius}
                    cx={size / 2}
                    cy={size / 2}
                />
                {/* Foreground circle */}
                <circle
                    className={`${color} transition-all duration-1000 ease-out`}
                    stroke="currentColor"
                    fill="transparent"
                    strokeWidth={strokeWidth}
                    strokeDasharray={circumference}
                    style={{ strokeDashoffset: offset }}
                    strokeLinecap="round"
                    r={radius}
                    cx={size / 2}
                    cy={size / 2}
                />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
                <span className={`text-4xl font-bold ${color}`}>
                    {Math.round(animatedPercentage)}%
                </span>
            </div>
        </div>
    );
};