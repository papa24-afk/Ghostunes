// src/services/listeningRoomsService.ts
import { Track, ListeningRoomState } from '../types';
import { getApiBaseUrl } from '../utils/api';

class ListeningRoomsManager {
  private currentRoomId: string | null = null;
  private hostToken: string | null = null;
  private memberId: string | null = null;
  private isHost: boolean = false;
  private eventSource: EventSource | null = null;
  private stateChangeCallbacks: Set<(state: ListeningRoomState) => void> = new Set();
  private lastKnownState: ListeningRoomState | null = null;
  private syncTimer: any = null;

  public async createRoom(roomName: string, hostName: string, currentTrack: Track | null): Promise<ListeningRoomState> {
    this.leaveRoom();

    const res = await fetch(`${getApiBaseUrl()}/api/rooms/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomName, hostName, initialTrack: currentTrack })
    });

    if (!res.ok) throw new Error('Failed to create listening room');
    const data = await res.json();

    this.currentRoomId = data.roomId;
    this.hostToken = data.hostToken;
    this.memberId = data.hostId;
    this.isHost = true;
    this.lastKnownState = data.roomState;

    this.startEventSource(data.roomId);
    return data.roomState;
  }

  public async joinRoom(roomId: string, memberName: string): Promise<ListeningRoomState> {
    this.leaveRoom();

    const cleanId = roomId.toUpperCase().trim();
    const res = await fetch(`${getApiBaseUrl()}/api/rooms/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: cleanId, memberName })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Room not found' }));
      throw new Error(err.error || 'Failed to join room');
    }

    const data = await res.json();
    this.currentRoomId = data.roomId;
    this.hostToken = null;
    this.memberId = data.memberId;
    this.isHost = false;
    this.lastKnownState = data.roomState;

    this.startEventSource(cleanId);
    return data.roomState;
  }

  public subscribe(callback: (state: ListeningRoomState) => void) {
    this.stateChangeCallbacks.add(callback);
    if (this.lastKnownState) callback(this.lastKnownState);
    return () => {
      this.stateChangeCallbacks.delete(callback);
    };
  }

  public async sendAction(action: 'play' | 'pause' | 'seek' | 'change_track' | 'toggle_collab', payload?: any) {
    if (!this.currentRoomId) return;

    try {
      await fetch(`${getApiBaseUrl()}/api/rooms/${this.currentRoomId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          payload,
          token: this.hostToken,
          memberId: this.memberId
        })
      });
    } catch (err) {
      console.warn('[ListeningRooms] Send action error:', err);
    }
  }

  // Smooth drift alignment against host clock
  public alignAudioDrift(audioElement: HTMLAudioElement, targetPlaybackTime: number, isPlaying: boolean) {
    if (!audioElement) return;

    const current = audioElement.currentTime;
    const drift = Math.abs(current - targetPlaybackTime);

    // If drift is significant (>0.45s), smoothly seek to target
    if (drift > 0.45) {
      audioElement.currentTime = targetPlaybackTime;
    }

    // Align play/pause state
    if (isPlaying && audioElement.paused) {
      audioElement.play().catch(() => {});
    } else if (!isPlaying && !audioElement.paused) {
      audioElement.pause();
    }
  }

  public leaveRoom() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    this.currentRoomId = null;
    this.hostToken = null;
    this.memberId = null;
    this.isHost = false;
    this.lastKnownState = null;
  }

  public getActiveRoom(): { roomId: string | null; isHost: boolean } {
    return { roomId: this.currentRoomId, isHost: this.isHost };
  }

  private startEventSource(roomId: string) {
    try {
      const url = `${getApiBaseUrl()}/api/rooms/${roomId}/events`;
      this.eventSource = new EventSource(url);

      this.eventSource.addEventListener('init_state', (e: MessageEvent) => {
        try {
          const parsed = JSON.parse(e.data);
          if (parsed.roomState) {
            this.updateState(parsed.roomState);
          }
        } catch {}
      });

      const handleEvent = (e: MessageEvent) => {
        try {
          const parsed = JSON.parse(e.data);
          if (parsed.roomState) {
            this.updateState(parsed.roomState);
          }
        } catch {}
      };

      this.eventSource.addEventListener('playback_play', handleEvent);
      this.eventSource.addEventListener('playback_pause', handleEvent);
      this.eventSource.addEventListener('playback_seek', handleEvent);
      this.eventSource.addEventListener('track_changed', handleEvent);
      this.eventSource.addEventListener('member_joined', handleEvent);
      this.eventSource.addEventListener('collab_toggled', handleEvent);

      this.eventSource.onerror = () => {
        // EventSource will auto-reconnect
      };

      // Periodic ping for drift sync
      this.syncTimer = setInterval(() => {
        if (!this.currentRoomId) return;
        fetch(`${getApiBaseUrl()}/api/rooms/${this.currentRoomId}/sync`)
          .then(r => r.json())
          .then(data => {
            if (this.lastKnownState && data) {
              this.updateState({
                ...this.lastKnownState,
                playbackTime: data.playbackTime,
                isPlaying: data.isPlaying,
                currentTrack: data.currentTrack || this.lastKnownState.currentTrack
              });
            }
          })
          .catch(() => {});
      }, 5000);
    } catch (err) {
      console.warn('[ListeningRooms] Failed to connect EventSource:', err);
    }
  }

  private updateState(state: ListeningRoomState) {
    this.lastKnownState = {
      ...state,
      isHost: this.isHost
    };
    this.stateChangeCallbacks.forEach(cb => cb(this.lastKnownState!));
  }
}

export const listeningRooms = new ListeningRoomsManager();
