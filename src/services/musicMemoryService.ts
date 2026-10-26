// src/services/musicMemoryService.ts
import { Track, ListeningHistoryRecord } from '../types';
import { recordListeningPlay, getListeningHistory, getListeningStats, clearListeningHistory, exportListeningData } from './desktopService';

class MusicMemoryTracker {
  private activeTrack: Track | null = null;
  private trackDuration: number = 0;
  private accumulatedSeconds: number = 0;
  private lastTickTime: number = 0;
  private isPlaying: boolean = false;
  private hasRecordedPlay: boolean = false;
  private sessionId: string = `sess_${Date.now()}`;

  public onTrackChange(track: Track | null, duration: number = 0) {
    this.flushCurrentTrackRecord();
    this.activeTrack = track;
    this.trackDuration = duration || (track?.durationSeconds || 180);
    this.accumulatedSeconds = 0;
    this.lastTickTime = Date.now();
    this.hasRecordedPlay = false;
    this.saveSessionState();
  }

  public onPlaybackStateChange(isPlaying: boolean, currentTime: number = 0) {
    const now = Date.now();
    if (this.isPlaying && this.lastTickTime > 0) {
      const deltaSec = (now - this.lastTickTime) / 1000;
      if (deltaSec > 0 && deltaSec < 5) {
        this.accumulatedSeconds += deltaSec;
      }
    }
    this.isPlaying = isPlaying;
    this.lastTickTime = now;

    // Check if threshold reached (30 seconds or 50% duration)
    if (!this.hasRecordedPlay && this.activeTrack) {
      const minThreshold = Math.min(30, this.trackDuration * 0.5);
      if (this.accumulatedSeconds >= minThreshold) {
        this.flushCurrentTrackRecord();
        this.hasRecordedPlay = true; // Avoid double recording
      }
    }
  }

  public onTimeUpdate(currentTime: number, duration: number) {
    if (duration > 0) this.trackDuration = duration;
    const now = Date.now();
    if (this.isPlaying && this.lastTickTime > 0) {
      const deltaSec = (now - this.lastTickTime) / 1000;
      if (deltaSec > 0 && deltaSec < 3) {
        this.accumulatedSeconds += deltaSec;
      }
    }
    this.lastTickTime = now;

    if (!this.hasRecordedPlay && this.activeTrack) {
      const minThreshold = Math.min(30, this.trackDuration * 0.5);
      if (this.accumulatedSeconds >= minThreshold) {
        this.flushCurrentTrackRecord();
        this.hasRecordedPlay = true;
      }
    }
  }

  public flushCurrentTrackRecord() {
    if (!this.activeTrack || this.accumulatedSeconds < 5) return;
    const completion = this.trackDuration > 0 ? Math.min(1, this.accumulatedSeconds / this.trackDuration) : 0;
    // Only record if qualified
    const qualified = this.accumulatedSeconds >= 30 || completion >= 0.5;
    if (!qualified && this.hasRecordedPlay) return;

    const record: Partial<ListeningHistoryRecord> = {
      track_id: this.activeTrack.id,
      title: this.activeTrack.title,
      artist: this.activeTrack.artist,
      album: this.activeTrack.album || '',
      duration: this.trackDuration,
      played_at: Date.now(),
      duration_played: Math.round(this.accumulatedSeconds),
      completion_ratio: Number(completion.toFixed(2)),
      session_id: this.sessionId,
      source: 'manual'
    };

    recordListeningPlay(record).catch(err => {
      console.warn('[MusicMemory] Record play failed:', err);
    });
  }

  // Session recovery snapshot
  public saveSessionSnapshot(queue: Track[], currentIndex: number, currentTime: number, sessionName?: string) {
    try {
      const snapshot = {
        queue,
        currentIndex,
        currentTime,
        sessionName: sessionName || 'Previous Session',
        savedAt: Date.now()
      };
      localStorage.setItem('ghost_interrupted_session', JSON.stringify(snapshot));
    } catch {}
  }

  public getSavedSessionSnapshot(): { queue: Track[]; currentIndex: number; currentTime: number; sessionName: string; savedAt: number } | null {
    try {
      const raw = localStorage.getItem('ghost_interrupted_session');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  private saveSessionState() {
    // Quick checkpoint
  }
}

export const musicMemory = new MusicMemoryTracker();

// Export utilities
export async function downloadHistoryExport(format: 'json' | 'csv' = 'json') {
  const data = await exportListeningData();
  let content = '';
  let mimeType = 'application/json';
  let filename = `ghosttunes-listening-history-${new Date().toISOString().slice(0, 10)}`;

  if (format === 'csv') {
    mimeType = 'text/csv;charset=utf-8;';
    filename += '.csv';
    const rows = [
      ['Track ID', 'Title', 'Artist', 'Album', 'Played At', 'Duration Played (s)', 'Completion Ratio']
    ];
    (data.history || []).forEach((h: any) => {
      rows.push([
        h.track_id,
        `"${(h.title || '').replace(/"/g, '""')}"`,
        `"${(h.artist || '').replace(/"/g, '""')}"`,
        `"${(h.album || '').replace(/"/g, '""')}"`,
        new Date(h.played_at).toISOString(),
        String(h.duration_played || 0),
        String(h.completion_ratio || 0)
      ]);
    });
    content = rows.map(r => r.join(',')).join('\n');
  } else {
    filename += '.json';
    content = JSON.stringify(data, null, 2);
  }

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
