// src/components/CreatePlaylistModal.tsx
import React, { useState, useEffect, useRef } from 'react';
import { Playlist } from '../types';
import { X, Plus, Image as ImageIcon, Music2, Upload, AlertCircle, Check } from 'lucide-react';

interface CreatePlaylistModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string, description?: string, coverUrl?: string) => void;
  existingPlaylists?: Playlist[];
}

const COVER_PRESETS = [
  { id: 'preset-burgundy', label: 'Crimson Glow', url: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=500&auto=format&fit=crop&q=80' },
  { id: 'preset-latenight', label: 'Late Night', url: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=500&auto=format&fit=crop&q=80' },
  { id: 'preset-vinyl', label: 'Vintage Vinyl', url: 'https://images.unsplash.com/photo-1539375665275-f9de415ef9ac?w=500&auto=format&fit=crop&q=80' },
  { id: 'preset-midnight', label: 'Moody Jazz', url: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=80' }
];

export const CreatePlaylistModal: React.FC<CreatePlaylistModalProps> = ({
  isOpen,
  onClose,
  onCreate,
  existingPlaylists = []
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedCover, setSelectedCover] = useState(COVER_PRESETS[0].url);
  const [customCover, setCustomCover] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const nameInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setName('');
      setDescription('');
      setSelectedCover(COVER_PRESETS[0].url);
      setCustomCover(null);
      setError(null);
      setIsDuplicate(false);
      setIsSubmitting(false);
      setTimeout(() => nameInputRef.current?.focus(), 80);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Real-time duplicate check
  const handleNameChange = (val: string) => {
    setName(val);
    if (error) setError(null);
    const trimmed = val.trim().toLowerCase();
    if (trimmed && existingPlaylists.some(p => p.name.toLowerCase() === trimmed)) {
      setIsDuplicate(true);
    } else {
      setIsDuplicate(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file (PNG, JPG, WebP).');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('Cover image must be smaller than 5 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setCustomCover(dataUrl);
      setSelectedCover(dataUrl);
      setError(null);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Please enter a playlist name.');
      nameInputRef.current?.focus();
      return;
    }

    setIsSubmitting(true);
    try {
      onCreate(trimmedName, description.trim(), selectedCover);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to create playlist. Please try again.');
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150 select-none"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-lg bg-[#121318] border border-white/10 rounded-2xl p-6 shadow-2xl relative flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/[0.08]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#9e2a40]/20 border border-[#9e2a40]/40 text-[#e0536c] flex items-center justify-center">
              <Plus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">Create Playlist</h3>
              <p className="text-xs text-zinc-400">Add a new collection to your personal Ghosttunes library</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white transition-colors cursor-pointer"
            title="Close (Esc)"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {/* Cover & Inputs Side-by-Side on Desktop */}
          <div className="flex flex-col sm:flex-row gap-5 items-center sm:items-start">
            {/* Live Cover Preview */}
            <div className="flex flex-col items-center gap-2 flex-shrink-0">
              <div className="relative w-32 h-32 rounded-xl overflow-hidden bg-zinc-900 border border-white/10 shadow-lg group">
                {selectedCover ? (
                  <img src={selectedCover} alt="Cover Preview" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-zinc-500 bg-zinc-900">
                    <Music2 className="w-8 h-8 text-zinc-600 mb-1" />
                    <span className="text-[10px]">No Cover</span>
                  </div>
                )}
                {/* Overlay upload trigger on hover */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white cursor-pointer"
                  title="Upload custom image"
                >
                  <Upload className="w-5 h-5 mb-1" />
                  <span className="text-[10px] font-medium">Upload Image</span>
                </button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
                aria-label="Upload custom playlist artwork"
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-[11px] text-[#e0536c] hover:text-[#ff8099] transition-colors cursor-pointer flex items-center gap-1 font-medium"
              >
                <Upload className="w-3 h-3" />
                <span>Upload cover</span>
              </button>
            </div>

            {/* Inputs Column */}
            <div className="flex-1 w-full space-y-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">
                  Playlist Name <span className="text-[#e0536c]">*</span>
                </label>
                <input
                  ref={nameInputRef}
                  type="text"
                  maxLength={100}
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="e.g. Late Night Drives, Study Lo-Fi..."
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-white/10 text-white placeholder-zinc-500 text-sm focus:outline-none focus:border-[#9e2a40] focus:ring-1 focus:ring-[#9e2a40] transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">
                  Description <span className="text-zinc-500 text-[11px]">(optional)</span>
                </label>
                <textarea
                  rows={2}
                  maxLength={250}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Add an optional description for this collection..."
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-white/10 text-white placeholder-zinc-500 text-xs focus:outline-none focus:border-[#9e2a40] focus:ring-1 focus:ring-[#9e2a40] transition-colors resize-none"
                />
              </div>
            </div>
          </div>

          {/* Cover Presets Picker */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5 flex items-center justify-between">
              <span>Choose Cover Atmosphere</span>
              {customCover && (
                <button
                  type="button"
                  onClick={() => setSelectedCover(customCover)}
                  className="text-[11px] text-[#e0536c] hover:underline cursor-pointer"
                >
                  Use uploaded image
                </button>
              )}
            </label>
            <div className="grid grid-cols-4 gap-2">
              {COVER_PRESETS.map((preset) => {
                const isSelected = selectedCover === preset.url;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setSelectedCover(preset.url)}
                    className={`relative rounded-xl overflow-hidden h-16 border transition-all cursor-pointer group ${
                      isSelected
                        ? 'border-[#e0536c] ring-2 ring-[#e0536c]/40'
                        : 'border-white/10 hover:border-white/30 opacity-70 hover:opacity-100'
                    }`}
                    title={preset.label}
                  >
                    <img src={preset.url} alt={preset.label} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/30 group-hover:bg-transparent transition-colors" />
                    <span className="absolute bottom-1 left-1 right-1 text-[9px] font-medium text-white truncate px-1 py-0.5 rounded bg-black/60 text-center">
                      {preset.label}
                    </span>
                    {isSelected && (
                      <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-[#9e2a40] text-white flex items-center justify-center">
                        <Check className="w-2.5 h-2.5" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Duplicate Warning */}
          {isDuplicate && (
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
              <span>A playlist with this name already exists in your library.</span>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Dialog Action Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-white/[0.08]">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !name.trim()}
              className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-[#9e2a40] hover:bg-[#b8334d] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-[#9e2a40]/30 cursor-pointer flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{isSubmitting ? 'Creating...' : 'Create Playlist'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
