import React, { useState } from 'react';
import { Track, Playlist } from '../types';
import { X, Plus, FolderPlus, Check, ListMusic, Layers } from 'lucide-react';

interface Props {
  track: Track | null;
  playlists: Playlist[];
  onClose: () => void;
  onCreatePlaylist: (name: string, description?: string) => Playlist;
  onAddTrackToPlaylist: (playlistId: string, track: Track) => void;
  onOpenImportModal?: () => void;
}

export const PlaylistModal: React.FC<Props> = ({
  track,
  playlists,
  onClose,
  onCreatePlaylist,
  onAddTrackToPlaylist,
  onOpenImportModal
}) => {
  const [isCreatingNew, setIsCreatingNew] = useState(!track?.id);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [newPlaylistDesc, setNewPlaylistDesc] = useState('');
  const [addedPlaylistIds, setAddedPlaylistIds] = useState<string[]>([]);

  const handleCreateAndAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;
    const created = onCreatePlaylist(newPlaylistName.trim(), newPlaylistDesc.trim());
    if (track && track.id) {
      onAddTrackToPlaylist(created.id, track);
      setAddedPlaylistIds(prev => [...prev, created.id]);
    }
    setNewPlaylistName('');
    setNewPlaylistDesc('');
    setIsCreatingNew(false);
    onClose();
  };

  const handleAdd = (playlistId: string) => {
    if (track) {
      onAddTrackToPlaylist(playlistId, track);
      setAddedPlaylistIds(prev => [...prev, playlistId]);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-zinc-900 border border-white/10 rounded-3xl w-full max-w-md p-6 shadow-2xl relative">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-rose-500/20 text-rose-500 flex items-center justify-center">
              <FolderPlus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">{track?.title ? 'Add to Playlist' : 'Create Playlist'}</h3>
              {track?.title && <p className="text-xs text-zinc-400 truncate max-w-[220px]">{track.title}</p>}
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Existing Playlists list */}
        <div className="my-4 max-h-60 overflow-y-auto space-y-2 pr-1">
          {playlists.length === 0 && !isCreatingNew && (
            <div className="text-center py-6 text-zinc-500">
              <ListMusic className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-xs">No personal playlists yet.</p>
            </div>
          )}

          {playlists.map((pl) => {
            const alreadyInPlaylist = (track && pl.tracks.some(t => t.id === track.id)) || addedPlaylistIds.includes(pl.id);
            return (
              <button
                key={pl.id}
                onClick={() => !alreadyInPlaylist && handleAdd(pl.id)}
                disabled={alreadyInPlaylist}
                className={`w-full flex items-center justify-between p-3 rounded-2xl border transition-all text-left ${
                  alreadyInPlaylist
                    ? 'bg-rose-500/10 border-rose-500/30 text-rose-400 cursor-default'
                    : 'bg-zinc-800/50 hover:bg-zinc-800 border-white/5 hover:border-white/15 text-white'
                }`}
              >
                <div>
                  <p className="text-sm font-semibold truncate">{pl.name}</p>
                  <p className="text-xs text-zinc-400">{pl.tracks.length} tracks</p>
                </div>

                {alreadyInPlaylist ? (
                  <span className="flex items-center gap-1 text-xs font-bold text-rose-400 bg-rose-500/20 px-2 py-0.5 rounded-full">
                    <Check className="w-3.5 h-3.5" /> Added
                  </span>
                ) : (
                  <Plus className="w-4 h-4 text-zinc-400" />
                )}
              </button>
            );
          })}
        </div>

        {/* Create New Playlist Form / Button */}
        {isCreatingNew ? (
          <form onSubmit={handleCreateAndAdd} className="mt-4 pt-4 border-t border-white/5 space-y-3">
            <input
              type="text"
              autoFocus
              value={newPlaylistName}
              onChange={(e) => setNewPlaylistName(e.target.value)}
              placeholder="Playlist name..."
              className="w-full bg-zinc-800 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
            <input
              type="text"
              value={newPlaylistDesc}
              onChange={(e) => setNewPlaylistDesc(e.target.value)}
              placeholder="Description (optional)..."
              className="w-full bg-zinc-800 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsCreatingNew(false)}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!newPlaylistName.trim()}
                className="px-4 py-1.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white transition-all shadow-md shadow-rose-600/30"
              >
                {track && track.id ? 'Create & Add' : 'Create Playlist'}
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-2 mt-2">
            <button
              onClick={() => setIsCreatingNew(true)}
              className="w-full py-2.5 rounded-2xl border border-dashed border-white/15 hover:border-rose-500/50 hover:bg-rose-500/5 text-xs font-bold text-zinc-300 hover:text-rose-400 flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Create New Playlist</span>
            </button>

            {onOpenImportModal && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenImportModal();
                }}
                className="w-full py-2.5 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] text-xs font-semibold text-zinc-300 hover:text-white flex items-center justify-center gap-2 border border-white/10 transition-colors cursor-pointer"
              >
                <Layers className="w-3.5 h-3.5 text-[#ff8099]" />
                <span>Import Playlist (Spotify / YouTube Music)</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
