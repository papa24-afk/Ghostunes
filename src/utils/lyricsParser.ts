// src/utils/lyricsParser.ts
import { LyricLine } from '../types';

export type LyricFormat = 'synced' | 'plain' | 'paragraph' | 'none';

export interface ParsedLyrics {
  format: LyricFormat;
  syncedLines: LyricLine[];
  plainStanzas: string[][];
  rawText?: string;
  hasLyrics: boolean;
  isInstrumental?: boolean;
}

/**
 * Standard LRC timestamped lyrics parser.
 * Handles single or multiple timestamps per line: [00:12.34][00:45.67] Chorus
 */
export function parseLrc(lrcText?: string | null): LyricLine[] {
  if (!lrcText || typeof lrcText !== 'string') return [];
  const lines = lrcText.split(/\r?\n/);
  const result: LyricLine[] = [];

  const timeRegex = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const timestamps: number[] = [];
    let match: RegExpExecArray | null;

    // Reset regex index
    timeRegex.lastIndex = 0;
    while ((match = timeRegex.exec(trimmed)) !== null) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const millis = match[3] ? parseInt(match[3].padEnd(3, '0').slice(0, 3), 10) : 0;
      timestamps.push(minutes * 60 + seconds + millis / 1000);
    }

    if (timestamps.length > 0) {
      const rawText = trimmed.replace(timeRegex, '').trim();
      if (rawText) {
        // Genuine word-level LRC support: <00:12.34> word
        const wordTagRegex = /<(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?>/g;
        let words: { word: string; time: number }[] | undefined;
        let cleanText = rawText;

        if (rawText.includes('<') && /<\d{1,2}:\d{2}/.test(rawText)) {
          const wordTokens: { word: string; time: number }[] = [];
          const parts = rawText.split(/(<\d{1,2}:\d{2}(?:\.\d{1,3})?>)/);
          let currentWordTime = timestamps[0];

          for (const part of parts) {
            const wordMatch = /<(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?>/.exec(part);
            if (wordMatch) {
              const m = parseInt(wordMatch[1], 10);
              const s = parseInt(wordMatch[2], 10);
              const ms = wordMatch[3] ? parseInt(wordMatch[3].padEnd(3, '0').slice(0, 3), 10) : 0;
              currentWordTime = m * 60 + s + ms / 1000;
            } else if (part.trim()) {
              wordTokens.push({ word: part.trim(), time: currentWordTime });
            }
          }

          if (wordTokens.length > 0) {
            words = wordTokens;
            cleanText = rawText.replace(wordTagRegex, '').replace(/\s+/g, ' ').trim();
          }
        }

        for (const time of timestamps) {
          result.push({ time, text: cleanText, words });
        }
      }
    }
  }

  return result.sort((a, b) => a.time - b.time);
}

/**
 * Filters out empty lyric lines and guarantees strictly chronological sort order.
 */
export function getChronologicalLyrics(lyrics?: LyricLine[] | null): LyricLine[] {
  if (!lyrics || !Array.isArray(lyrics)) return [];
  return lyrics
    .filter(l => l && typeof l.text === 'string' && l.text.trim().length > 0)
    .slice()
    .sort((a, b) => a.time - b.time);
}

/**
 * Shared active lyric index calculation for both Main Player View and Ghost Mode.
 * Finds the latest lyric index whose timestamp is <= currentTime.
 * Returns -1 if playback is currently before the first vocal timestamp (intro).
 */
export function findActiveLyricIndex(lyrics: LyricLine[], currentTime: number): number {
  if (!lyrics || lyrics.length === 0) return -1;
  let idx = -1;
  for (let i = 0; i < lyrics.length; i++) {
    if (currentTime >= lyrics[i].time) {
      idx = i;
    } else {
      break;
    }
  }
  return idx;
}

/**
 * Splits unformatted single-paragraph lyrics into readable lines and stanzas.
 * Uses punctuation, capitalization, and sentence boundaries.
 * Preserves 100% of original wording and word order without breaking words.
 */
export function segmentParagraphLyrics(text?: string | null): string[][] {
  if (!text || typeof text !== 'string') return [];
  const clean = text.trim();
  if (!clean) return [];

  // If text already has line breaks, respect original structure with sensible stanza chunking
  if (clean.includes('\n')) {
    const rawStanzas = clean.split(/\r?\n\s*\r?\n/);
    const stanzas: string[][] = [];
    for (const rawStanza of rawStanzas) {
      const stanzaLines = rawStanza.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      if (stanzaLines.length === 0) continue;
      if (stanzaLines.length <= 5) {
        stanzas.push(stanzaLines);
      } else {
        // Sub-chunk long uninterrupted blocks into clean 4-line stanzas
        for (let i = 0; i < stanzaLines.length; i += 4) {
          stanzas.push(stanzaLines.slice(i, i + 4));
        }
      }
    }
    if (stanzas.length > 0) return stanzas;
  }

  // Single continuous paragraph: segment using punctuation, clauses, parentheses, and capitalization
  const words = clean.split(/\s+/);
  const lines: string[] = [];
  let currentWords: string[] = [];
  let parenDepth = 0;

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    currentWords.push(word);

    // Track open/close parens or brackets
    for (const char of word) {
      if (char === '(' || char === '[' || char === '{') parenDepth++;
      if (char === ')' || char === ']' || char === '}') parenDepth = Math.max(0, parenDepth - 1);
    }

    const isLastWord = i === words.length - 1;
    if (isLastWord) {
      lines.push(currentWords.join(' '));
      currentWords = [];
      break;
    }

    // Do NOT break inside an unclosed parenthesis or bracket
    if (parenDepth > 0) {
      continue;
    }

    const nextWord = words[i + 1] || '';
    const currentLength = currentWords.join(' ').length;
    const hasTerminalPunctuation = /[.?!]$/.test(word);
    const hasPausePunctuation = /[,;:—–-]$/.test(word);
    const nextIsCapital = /^[A-Z"'(]/.test(nextWord);

    // 1. Break at terminal punctuation (.?!) at >= 18 characters
    if (hasTerminalPunctuation && currentLength >= 18) {
      lines.push(currentWords.join(' '));
      currentWords = [];
      continue;
    }

    // 2. Break at pause punctuation (, ; :) if followed by capital letter at >= 28 chars
    if (hasPausePunctuation && nextIsCapital && currentLength >= 28) {
      lines.push(currentWords.join(' '));
      currentWords = [];
      continue;
    }

    // 3. Break before capital letter if line is at comfortable lyric length (>= 36 chars)
    if (nextIsCapital && currentLength >= 36 && currentWords.length >= 5) {
      lines.push(currentWords.join(' '));
      currentWords = [];
      continue;
    }

    // 4. Fallback break if line reaches 55+ chars and we have a pause or natural space
    if (currentLength >= 55 && (hasPausePunctuation || currentWords.length >= 8)) {
      lines.push(currentWords.join(' '));
      currentWords = [];
      continue;
    }
  }

  if (currentWords.length > 0) {
    lines.push(currentWords.join(' '));
  }

  // Filter out any empty lines
  const cleanLines = lines.map(l => l.trim()).filter(Boolean);

  // Group into stanzas of 4 lines
  const stanzas: string[][] = [];
  for (let i = 0; i < cleanLines.length; i += 4) {
    stanzas.push(cleanLines.slice(i, i + 4));
  }

  return stanzas;
}

/**
 * Universal lyric payload parser.
 * Detects format: 'synced', 'plain', 'paragraph', or 'none'.
 * Distinguishes confirmed instrumental tracks from lookup failures.
 */
export function parseLyricsPayload(
  synced?: string | null, 
  plain?: string | null,
  isInstrumental?: boolean
): ParsedLyrics {
  // 0. Confirmed instrumental track
  if (isInstrumental) {
    return {
      format: 'none',
      syncedLines: [],
      plainStanzas: [],
      hasLyrics: false,
      isInstrumental: true
    };
  }

  // 1. Check for timestamped synchronized lyrics
  if (synced && typeof synced === 'string' && synced.includes('[')) {
    const syncedLines = parseLrc(synced);
    if (syncedLines.length > 0) {
      return {
        format: 'synced',
        syncedLines,
        plainStanzas: [],
        rawText: synced,
        hasLyrics: true
      };
    }
  }

  // 2. Check plain lyrics (or fallback to untimestamped raw text if synced lacked timestamp markers)
  const effectivePlain = (plain && typeof plain === 'string' && plain.trim().length > 0)
    ? plain.trim()
    : (synced && typeof synced === 'string' && synced.trim().length > 0 ? synced.trim() : null);

  if (effectivePlain) {
    if (effectivePlain.includes('\n')) {
      // Normal plain lyrics with newlines
      const plainStanzas = segmentParagraphLyrics(effectivePlain);
      return {
        format: 'plain',
        syncedLines: [],
        plainStanzas,
        rawText: effectivePlain,
        hasLyrics: plainStanzas.length > 0
      };
    } else {
      // Single continuous paragraph without newlines!
      const paragraphStanzas = segmentParagraphLyrics(effectivePlain);
      return {
        format: 'paragraph',
        syncedLines: [],
        plainStanzas: paragraphStanzas,
        rawText: effectivePlain,
        hasLyrics: paragraphStanzas.length > 0
      };
    }
  }

  // 3. No lyrics available
  return {
    format: 'none',
    syncedLines: [],
    plainStanzas: [],
    hasLyrics: false
  };
}
