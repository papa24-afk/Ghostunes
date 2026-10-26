// src/components/GhostSkinFlourish.tsx
import React from 'react';

interface Props {
  type: 'none' | 'brush_slash' | 'crown_doodle' | 'sparkle' | 'wave_underline';
  color?: string;
  className?: string;
}

export const GhostSkinFlourish: React.FC<Props> = () => {
  // Purely disabled: lyrics presentation strictly follows restrained Snooze editorial serif typography
  return null;
};
