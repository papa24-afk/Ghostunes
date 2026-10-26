// src/components/ListeningRoomModal.tsx
import React, { useState, useEffect } from 'react';
import {
  X, Users, Radio, Copy, Check, Shield, Crown,
  LogOut, Play, Pause, Sparkles, AlertCircle, RefreshCw
} from 'lucide-react';
import { Track, ListeningRoomState } from '../types';
import { listeningRooms } from '../services/listeningRoomsService';

interface ListeningRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTrack?: Track | null;
  onRoomTrackChange?: (track: Track) => void;
}

export const ListeningRoomModal: React.FC<ListeningRoomModalProps> = ({
  isOpen,
  onClose,
  currentTrack,
  onRoomTrackChange
}) => {
  const [activeTab, setActiveTab] = useState<'status' | 'create' | 'join'>('status');
  const [roomState, setRoomState] = useState<ListeningRoomState | null>(null);
  const [joinCode, setJoinCode] = useState<string>('');
  const [userName, setUserName] = useState<string>('Ghost Listener');
  const [roomName, setRoomName] = useState<string>('Ghosttunes Lounge');
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const unsub = listeningRooms.subscribe(st => {
      setRoomState(st);
      if (st && st.roomId) {
        setActiveTab('status');
      } else {
        setActiveTab('join');
      }
    });
    return () => unsub();
  }, [isOpen]);

  const handleCreateRoom = async () => {
    setLoading(true);
    setError(null);
    try {
      const st = await listeningRooms.createRoom(roomName, userName, currentTrack || null);
      setRoomState(st);
      setActiveTab('status');
    } catch (err: any) {
      setError(err.message || 'Failed to create room');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinRoom = async () => {
    if (!joinCode.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const st = await listeningRooms.joinRoom(joinCode, userName);
      setRoomState(st);
      setActiveTab('status');
    } catch (err: any) {
      setError(err.message || 'Failed to join room');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyCode = () => {
    if (!roomState?.roomId) return;
    navigator.clipboard.writeText(roomState.roomId);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2500);
  };

  const handleLeaveRoom = () => {
    listeningRooms.leaveRoom();
    setRoomState(null);
    setActiveTab('join');
  };

  const handleTogglePlay = () => {
    if (!roomState) return;
    listeningRooms.sendAction(roomState.isPlaying ? 'pause' : 'play', { time: roomState.playbackTime });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/85 backdrop-blur-md animate-fade-in">
      <div 
        className="relative w-full max-w-xl bg-zinc-950/95 border border-zinc-800/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="px-6 py-4 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-900/40">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <Radio className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-serif text-white tracking-wide">Listening Rooms</h2>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                  Synchronized Social Audio
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Listen together in real-time with sub-20ms drift synchronization
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {error && (
            <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Active Room View */}
          {roomState?.roomId ? (
            <div className="space-y-5">
              {/* Room Hero Card */}
              <div className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400">
                      Live Broadcast
                    </span>
                    <h3 className="text-lg font-serif font-bold text-white">{roomState.roomName}</h3>
                  </div>

                  {/* Room Code Badge */}
                  <button
                    onClick={handleCopyCode}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-colors text-xs font-mono font-semibold"
                    title="Click to copy invite code"
                  >
                    <span>{roomState.roomId}</span>
                    {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-zinc-400" />}
                  </button>
                </div>

                {/* Current Track Snapshot */}
                {roomState.currentTrack ? (
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-zinc-950/70 border border-zinc-800">
                    <img
                      src={roomState.currentTrack.thumbnail || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=100&auto=format&fit=crop&q=80'}
                      alt={roomState.currentTrack.title}
                      className="w-12 h-12 rounded-lg object-cover border border-zinc-800"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-white truncate font-serif">
                        {roomState.currentTrack.title}
                      </div>
                      <div className="text-[11px] text-zinc-400 truncate">
                        {roomState.currentTrack.artist}
                      </div>
                      <div className="text-[10px] font-mono text-emerald-400 mt-0.5">
                        &bull; Audio Aligned &lt;20ms
                      </div>
                    </div>

                    {roomState.isHost && (
                      <button
                        onClick={handleTogglePlay}
                        className="p-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black transition-colors"
                      >
                        {roomState.isPlaying ? <Pause className="w-4 h-4 fill-black" /> : <Play className="w-4 h-4 fill-black" />}
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-zinc-500">Host has not queued a track yet.</p>
                )}
              </div>

              {/* Members Presence */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-mono uppercase text-zinc-400">
                  <div className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-amber-400" />
                    <span>In The Room ({roomState.members?.length || 1})</span>
                  </div>
                  <span className="text-[10px] text-zinc-500">Real-time presence</span>
                </div>

                <div className="divide-y divide-zinc-800/60 rounded-xl bg-zinc-900/40 border border-zinc-800/80 overflow-hidden">
                  {(roomState.members || []).map((m) => (
                    <div key={m.id} className="flex items-center justify-between p-3 text-xs">
                      <div className="flex items-center gap-2">
                        {m.isHost ? (
                          <Crown className="w-3.5 h-3.5 text-amber-400" />
                        ) : (
                          <div className="w-2 h-2 rounded-full bg-emerald-400" />
                        )}
                        <span className="font-medium text-zinc-200">{m.name}</span>
                        {m.isHost && (
                          <span className="text-[9px] uppercase font-mono px-1.5 py-0.2 bg-amber-500/15 text-amber-400 rounded">
                            Host
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-mono text-zinc-500">{m.pingMs || 16}ms latency</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Leave Room Action */}
              <div className="pt-2 flex justify-end">
                <button
                  onClick={handleLeaveRoom}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium bg-rose-950/60 hover:bg-rose-900/60 border border-rose-800/50 text-rose-300 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Leave Room</span>
                </button>
              </div>
            </div>
          ) : (
            /* Create or Join Room Mode */
            <div className="space-y-5">
              <div className="flex bg-zinc-900 p-1 rounded-xl border border-zinc-800">
                <button
                  onClick={() => setActiveTab('join')}
                  className={`flex-1 py-2 text-xs font-medium rounded-lg transition-colors ${
                    activeTab === 'join' ? 'bg-amber-500 text-black font-semibold' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Join with Code
                </button>
                <button
                  onClick={() => setActiveTab('create')}
                  className={`flex-1 py-2 text-xs font-medium rounded-lg transition-colors ${
                    activeTab === 'create' ? 'bg-amber-500 text-black font-semibold' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Host New Room
                </button>
              </div>

              {activeTab === 'join' ? (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-mono uppercase text-zinc-400">Room Code</label>
                    <input
                      type="text"
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                      placeholder="e.g. GHOST-7X2"
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-base font-mono uppercase tracking-widest text-center text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-mono uppercase text-zinc-400">Your Nickname</label>
                    <input
                      type="text"
                      value={userName}
                      onChange={(e) => setUserName(e.target.value)}
                      placeholder="Nickname"
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <button
                    onClick={handleJoinRoom}
                    disabled={loading || !joinCode.trim()}
                    className="w-full py-2.5 rounded-xl text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-black transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
                    <span>Connect & Sync Audio</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-mono uppercase text-zinc-400">Room Name</label>
                    <input
                      type="text"
                      value={roomName}
                      onChange={(e) => setRoomName(e.target.value)}
                      placeholder="e.g. Late Night Listening Lounge"
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-mono uppercase text-zinc-400">Host Nickname</label>
                    <input
                      type="text"
                      value={userName}
                      onChange={(e) => setUserName(e.target.value)}
                      placeholder="Host Name"
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <button
                    onClick={handleCreateRoom}
                    disabled={loading}
                    className="w-full py-2.5 rounded-xl text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-black transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Radio className="w-4 h-4" />}
                    <span>Create Room & Generate Code</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-zinc-800/80 bg-zinc-900/40 flex items-center justify-between text-xs text-zinc-500 font-mono">
          <div>Ghosttunes Social Sync Engine &bull; Server-Sent Events</div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-white transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
