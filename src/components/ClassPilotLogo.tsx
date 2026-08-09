import React from 'react';

interface ClassPilotLogoProps {
  variant?: 'vertical' | 'horizontal' | 'icon-only';
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  showTagline?: boolean;
  selectedTagline?: string;
  isDarkTheme?: boolean;
  className?: string;
}

export const ClassPilotLogo: React.FC<ClassPilotLogoProps> = ({
  variant = 'vertical',
  size = 'md',
  showTagline = true,
  selectedTagline = 'Your Day, On Track',
  isDarkTheme = false,
  className = '',
}) => {
  // Sizing definitions
  const iconSizes = {
    sm: 'w-8 h-8',
    md: 'w-12 h-12',
    lg: 'w-16 h-16',
    xl: 'w-20 h-20',
    '2xl': 'w-28 h-28',
  };

  const titleSizes = {
    sm: 'text-base',
    md: 'text-2xl',
    lg: 'text-3xl',
    xl: 'text-4xl',
    '2xl': 'text-5xl',
  };

  return (
    <div className={`flex ${variant === 'horizontal' ? 'flex-row items-center space-x-3' : 'flex-col items-center text-center space-y-2'} ${className}`}>
      {/* Icon Emblem: Compass Needle + Graduation Cap + Wing motif */}
      <div className={`relative ${iconSizes[size]} rounded-full bg-gradient-to-tr from-blue-700 via-blue-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-600/30 ring-4 ring-blue-50/20 shrink-0`}>
        <svg
          className="w-3/5 h-3/5 text-white"
          viewBox="0 0 100 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Compass Ring */}
          <circle cx="50" cy="50" r="42" stroke="currentColor" strokeWidth="6" strokeOpacity="0.3" />
          
          {/* Graduation Cap Top Diamond */}
          <polygon points="50,15 88,32 50,49 12,32" fill="currentColor" />
          
          {/* Graduation Cap Cap Base & Tassel */}
          <path d="M28 42 V58 C28 66 72 66 72 58 V42" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
          <path d="M80 34 V55 C80 58 83 60 83 62 C83 64 80 66 80 66" stroke="#fbbf24" strokeWidth="4" strokeLinecap="round" />

          {/* Compass Needle / Paper Airplane Wing overlay in Gold Accent */}
          <path
            d="M50 25 L65 52 L50 44 L35 52 Z"
            fill="#fbbf24"
            className="drop-shadow-sm"
          />
        </svg>
      </div>

      {variant !== 'icon-only' && (
        <div className={variant === 'horizontal' ? 'text-left' : 'text-center'}>
          {/* App Name */}
          <div className={`font-heading font-black tracking-tight ${titleSizes[size]} ${isDarkTheme ? 'text-white' : 'text-blue-950'} leading-none`}>
            Class<span className="text-blue-500">Pilot</span>
          </div>

          {/* Subtitle College Name */}
          <div className={`text-xs font-bold tracking-wide mt-1 ${isDarkTheme ? 'text-slate-300' : 'text-slate-500'}`}>
            Digboi College (Autonomous)
          </div>

          {/* Tagline */}
          {showTagline && (
            <div className={`text-[11px] font-semibold mt-0.5 tracking-tight flex items-center justify-center space-x-1 ${isDarkTheme ? 'text-cyan-300' : 'text-cyan-700'}`}>
              <span>{selectedTagline}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
