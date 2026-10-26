// metrolist-web/serverPlaylistImport.js
// Dedicated Spotify and YouTube Music Playlist Resolver & Catalogue Matcher

// In-memory cache for client credentials token
let spotifyClientToken = null;
let spotifyClientTokenExpires = 0;

/**
 * Known placeholder / dummy patterns that are NOT valid credentials
 */
const PLACEHOLDER_PATTERNS = [
  /demo/i,
  /placeholder/i,
  /ghosttunes/i,
  /your[_-]?client/i,
  /your[_-]?secret/i,
  /your[_-]?id/i,
  /your[_-]?token/i,
  /<.*?>/,
  /^\s*$/
];

/**
 * Validates a Spotify Client ID or Client Secret string.
 * Official Spotify Client IDs and Secrets are strictly 32-character hexadecimal strings.
 */
export function isSpotifyHex32(val) {
  if (!val || typeof val !== 'string') return false;
  const trimmed = val.trim();
  if (PLACEHOLDER_PATTERNS.some(p => p.test(trimmed))) return false;
  return /^[0-9a-fA-F]{32}$/.test(trimmed);
}

/**
 * Full diagnostics for Spotify environment credentials
 */
export function validateSpotifyCredentials(clientId, clientSecret) {
  const cId = (clientId || process.env.SPOTIFY_CLIENT_ID || '').trim();
  const cSecret = (clientSecret || process.env.SPOTIFY_CLIENT_SECRET || '').trim();

  const hasClientId = cId.length > 0;
  const hasClientSecret = cSecret.length > 0;

  const isClientIdPlaceholder = PLACEHOLDER_PATTERNS.some(p => p.test(cId));
  const isClientSecretPlaceholder = PLACEHOLDER_PATTERNS.some(p => p.test(cSecret));

  const isClientIdHex32 = /^[0-9a-fA-F]{32}$/.test(cId);
  const isClientSecretHex32 = /^[0-9a-fA-F]{32}$/.test(cSecret);

  if (!hasClientId && !hasClientSecret) {
    return {
      valid: false,
      hasClientId: false,
      hasClientSecret: false,
      isPlaceholder: false,
      status: 'missing_credentials',
      clientIdMasked: null,
      error: 'Spotify credentials are missing. Add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in metrolist-web/.env.'
    };
  }

  if (isClientIdPlaceholder || isClientSecretPlaceholder) {
    return {
      valid: false,
      hasClientId,
      hasClientSecret,
      isPlaceholder: true,
      status: 'placeholder_credentials',
      clientIdMasked: null,
      error: `SPOTIFY_CLIENT_ID is using a placeholder string ("${cId}"). Spotify OAuth requires a real 32-character Client ID from developer.spotify.com/dashboard.`
    };
  }

  if (!isClientIdHex32) {
    return {
      valid: false,
      hasClientId,
      hasClientSecret,
      isPlaceholder: false,
      status: 'invalid_client_id_format',
      clientIdMasked: null,
      error: `SPOTIFY_CLIENT_ID must be a 32-character hexadecimal string from Spotify Developer Dashboard (received ${cId.length} characters).`
    };
  }

  if (!isClientSecretHex32) {
    return {
      valid: false,
      hasClientId,
      hasClientSecret,
      isPlaceholder: false,
      status: 'invalid_client_secret_format',
      clientIdMasked: `${cId.slice(0, 4)}...${cId.slice(-4)}`,
      error: 'SPOTIFY_CLIENT_SECRET must be a 32-character hexadecimal string from Spotify Developer Dashboard.'
    };
  }

  if (cId === cSecret) {
    return {
      valid: false,
      hasClientId,
      hasClientSecret,
      isPlaceholder: false,
      status: 'id_matches_secret',
      clientIdMasked: `${cId.slice(0, 4)}...${cId.slice(-4)}`,
      error: 'SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET cannot be identical. Check metrolist-web/.env.'
    };
  }

  return {
    valid: true,
    hasClientId: true,
    hasClientSecret: true,
    isPlaceholder: false,
    status: 'ready',
    clientIdMasked: `${cId.slice(0, 4)}...${cId.slice(-4)}`,
    error: null
  };
}

/**
 * Validates Deezer Developer Credentials
 */
export function validateDeezerCredentials(appId, appSecret) {
  const aId = (appId || process.env.DEEZER_APP_ID || '').trim();
  const aSecret = (appSecret || process.env.DEEZER_APP_SECRET || '').trim();

  if (!aId || PLACEHOLDER_PATTERNS.some(p => p.test(aId))) {
    return {
      valid: false,
      status: 'missing_credentials',
      error: 'Deezer App ID is missing or placeholder. Configure DEEZER_APP_ID in metrolist-web/.env for private Deezer account connection.'
    };
  }

  return {
    valid: true,
    status: 'ready',
    appId: aId,
    error: null
  };
}

/**
 * Validates Apple MusicKit Developer Token
 */
export function validateAppleMusicKit(token) {
  const devToken = (token || process.env.APPLE_DEVELOPER_TOKEN || '').trim();
  if (!devToken || PLACEHOLDER_PATTERNS.some(p => p.test(devToken))) {
    return {
      valid: false,
      status: 'missing_token',
      error: 'Apple Developer Token is not configured. Configure APPLE_DEVELOPER_TOKEN in metrolist-web/.env for personalized Apple Music library access.'
    };
  }

  // Basic JWT format check: 3 base64url segments separated by dots
  const parts = devToken.split('.');
  if (parts.length !== 3) {
    return {
      valid: false,
      status: 'invalid_token_format',
      error: 'APPLE_DEVELOPER_TOKEN must be a valid 3-part signed JWT (header.payload.signature).'
    };
  }

  return {
    valid: true,
    status: 'ready',
    error: null
  };
}

/**
 * Demo Curated Private Playlists for Instant Testing and Offline Demos
 */
export const DEMO_PRIVATE_PLAYLISTS = [
  {
    id: 'demo_private_chill',
    name: 'Late Night Chill',
    description: 'Personal private late night collection',
    thumbnail: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=500&auto=format&fit=crop&q=80',
    totalTracks: 6,
    isPrivate: true,
    isCollaborative: false,
    isOwned: true,
    owner: 'Ghost (You)',
    sourceUrl: 'https://open.spotify.com/playlist/demo_private_chill',
    platform: 'spotify',
    tracks: [
      { title: 'Snooze', artist: 'SZA', album: 'SOS', duration: '3:21', durationSeconds: 201, thumbnail: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=500&auto=format&fit=crop&q=80' },
      { title: 'Pink + White', artist: 'Frank Ocean', album: 'Blonde', duration: '3:04', durationSeconds: 184, thumbnail: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=500&auto=format&fit=crop&q=80' },
      { title: 'Die For You', artist: 'The Weeknd', album: 'Starboy', duration: '4:20', durationSeconds: 260, thumbnail: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=500&auto=format&fit=crop&q=80' },
      { title: 'Kill Bill', artist: 'SZA', album: 'SOS', duration: '2:33', durationSeconds: 153, thumbnail: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=500&auto=format&fit=crop&q=80' },
      { title: 'Self Control', artist: 'Frank Ocean', album: 'Blonde', duration: '4:09', durationSeconds: 249, thumbnail: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=500&auto=format&fit=crop&q=80' },
      { title: 'Nights', artist: 'Frank Ocean', album: 'Blonde', duration: '5:07', durationSeconds: 307, thumbnail: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=500&auto=format&fit=crop&q=80' }
    ]
  },
  {
    id: 'demo_private_secret',
    name: 'Secret Underground Mixtape',
    description: 'Unreleased demos, edits, and rare gems',
    thumbnail: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=500&auto=format&fit=crop&q=80',
    totalTracks: 5,
    isPrivate: true,
    isCollaborative: false,
    isOwned: true,
    owner: 'Ghost (You)',
    sourceUrl: 'https://open.spotify.com/playlist/demo_private_secret',
    platform: 'spotify',
    tracks: [
      { title: 'Starboy', artist: 'The Weeknd, Daft Punk', album: 'Starboy', duration: '3:50', durationSeconds: 230, thumbnail: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=500&auto=format&fit=crop&q=80' },
      { title: 'Blinding Lights', artist: 'The Weeknd', album: 'After Hours', duration: '3:20', durationSeconds: 200, thumbnail: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=500&auto=format&fit=crop&q=80' },
      { title: 'Save Your Tears', artist: 'The Weeknd', album: 'After Hours', duration: '3:35', durationSeconds: 215, thumbnail: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=500&auto=format&fit=crop&q=80' },
      { title: 'Creepin', artist: 'Metro Boomin, The Weeknd, 21 Savage', album: 'HEROES & VILLAINS', duration: '3:41', durationSeconds: 221, thumbnail: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=500&auto=format&fit=crop&q=80' },
      { title: 'PRIDE.', artist: 'Kendrick Lamar', album: 'DAMN.', duration: '4:35', durationSeconds: 275, thumbnail: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=500&auto=format&fit=crop&q=80' }
    ]
  },
  {
    id: 'demo_private_collab',
    name: 'Roadtrip Bops',
    description: 'Collaborative private playlist with friends',
    thumbnail: 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=500&auto=format&fit=crop&q=80',
    totalTracks: 5,
    isPrivate: true,
    isCollaborative: true,
    isOwned: true,
    owner: 'Ghost & Friends',
    sourceUrl: 'https://open.spotify.com/playlist/demo_private_collab',
    platform: 'spotify',
    tracks: [
      { title: 'Levitating', artist: 'Dua Lipa', album: 'Future Nostalgia', duration: '3:23', durationSeconds: 203, thumbnail: 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=500&auto=format&fit=crop&q=80' },
      { title: 'Cruel Summer', artist: 'Taylor Swift', album: 'Lover', duration: '2:58', durationSeconds: 178, thumbnail: 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=500&auto=format&fit=crop&q=80' },
      { title: 'As It Was', artist: 'Harry Styles', album: "Harry's House", duration: '2:47', durationSeconds: 167, thumbnail: 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=500&auto=format&fit=crop&q=80' },
      { title: 'Bad Habit', artist: 'Steve Lacy', album: 'Gemini Rights', duration: '3:52', durationSeconds: 232, thumbnail: 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=500&auto=format&fit=crop&q=80' },
      { title: 'Good Luck, Babe!', artist: 'Chappell Roan', album: 'Single', duration: '3:38', durationSeconds: 218, thumbnail: 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=500&auto=format&fit=crop&q=80' }
    ]
  }
];

export const DEMO_LIKED_SONGS = [
  { title: 'Snooze', artist: 'SZA', album: 'SOS', duration: '3:21', durationSeconds: 201, thumbnail: 'https://misc.scdn.co/liked-songs/liked-songs-300.png' },
  { title: 'Timeless', artist: 'The Weeknd, Playboi Carti', album: 'Hurry Up Tomorrow', duration: '4:16', durationSeconds: 256, thumbnail: 'https://misc.scdn.co/liked-songs/liked-songs-300.png' },
  { title: 'Birds of a Feather', artist: 'Billie Eilish', album: 'HIT ME HARD AND SOFT', duration: '3:05', durationSeconds: 185, thumbnail: 'https://misc.scdn.co/liked-songs/liked-songs-300.png' },
  { title: 'Pink + White', artist: 'Frank Ocean', album: 'Blonde', duration: '3:04', durationSeconds: 184, thumbnail: 'https://misc.scdn.co/liked-songs/liked-songs-300.png' },
  { title: 'Kill Bill', artist: 'SZA', album: 'SOS', duration: '2:33', durationSeconds: 153, thumbnail: 'https://misc.scdn.co/liked-songs/liked-songs-300.png' }
];

/**
 * Normalizes string for fuzzy title & artist comparison
 */
export function normalizeString(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[\(\[\{].*?[\)\]\}]/g, '') // remove parenthetical like (feat. X)
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calculates string similarity between 0 and 1
 */
export function stringSimilarity(s1, s2) {
  const n1 = normalizeString(s1);
  const n2 = normalizeString(s2);
  if (n1 === n2) return 1;
  if (!n1 || !n2) return 0;
  if (n1.includes(n2) || n2.includes(n1)) {
    return Math.min(n1.length, n2.length) / Math.max(n1.length, n2.length) * 0.95;
  }
  
  // Word overlap Jaccard index
  const words1 = new Set(n1.split(' ').filter(Boolean));
  const words2 = new Set(n2.split(' ').filter(Boolean));
  let intersection = 0;
  for (const w of words1) {
    if (words2.has(w)) intersection++;
  }
  const union = new Set([...words1, ...words2]).size;
  return union > 0 ? intersection / union : 0;
}

/**
 * Extracts platform and clean playlist ID from URL or URI
 */
export function parsePlaylistUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();

  // 1. Spotify
  if (trimmed.includes('spotify.com') || trimmed.includes('spotify.link') || trimmed.startsWith('spotify:playlist:')) {
    let id = '';
    if (trimmed.startsWith('spotify:playlist:')) {
      id = trimmed.split(':')[2] || '';
    } else {
      const match = trimmed.match(/playlist\/([a-zA-Z0-9_-]+)/);
      if (match) id = match[1];
    }
    return { platform: 'spotify', id: id || trimmed };
  }

  // 2. YouTube / YouTube Music
  if (trimmed.includes('youtube.com') || trimmed.includes('youtu.be') || trimmed.startsWith('PL') || trimmed.startsWith('VL') || trimmed.startsWith('RDCLAK')) {
    let id = '';
    const listMatch = trimmed.match(/[?&]list=([a-zA-Z0-9_-]+)/);
    if (listMatch) {
      id = listMatch[1];
    } else if (trimmed.startsWith('PL') || trimmed.startsWith('VL') || trimmed.startsWith('RDCLAK')) {
      id = trimmed;
    }
    return { platform: 'youtube', id: id || trimmed };
  }

  // 3. Apple Music
  if (trimmed.includes('music.apple.com') || trimmed.includes('apple.co') || trimmed.startsWith('pl.')) {
    const appleMatch = trimmed.match(/\/playlist\/(?:[^/]+\/)?(pl\.[A-Za-z0-9._-]+)/);
    const id = appleMatch ? appleMatch[1] : (trimmed.startsWith('pl.') ? trimmed : trimmed);
    return { platform: 'apple', id: id || trimmed };
  }

  // 4. Deezer (Standard URLs, Short URLs: link.deezer.com, deezer.page.link, raw IDs)
  if (
    trimmed.includes('deezer.com') || 
    trimmed.includes('deezer.page.link') ||
    trimmed.startsWith('deezer:') ||
    /^\d+$/.test(trimmed)
  ) {
    const deezerMatch = trimmed.match(/(?:^|\/)playlist\/(\d+)/i);
    const id = deezerMatch ? deezerMatch[1] : trimmed;
    return { platform: 'deezer', id: id || trimmed };
  }

  // 5. TIDAL
  if (trimmed.includes('tidal.com')) {
    const tidalMatch = trimmed.match(/\/playlist\/([0-9a-fA-F-]{16,})/);
    const id = tidalMatch ? tidalMatch[1] : trimmed;
    return { platform: 'tidal', id: id || trimmed };
  }

  return null;
}

/**
 * Obtains Spotify Client Credentials token if credentials exist in env or arguments
 */
export async function getSpotifyClientToken(clientId, clientSecret) {
  const cId = (clientId || process.env.SPOTIFY_CLIENT_ID || '').trim();
  const cSecret = (clientSecret || process.env.SPOTIFY_CLIENT_SECRET || '').trim();

  // Validate format and ensure not placeholder
  if (!isSpotifyHex32(cId) || !isSpotifyHex32(cSecret)) {
    return null;
  }

  if (spotifyClientToken && spotifyClientTokenExpires > Date.now() + 60000) {
    return spotifyClientToken;
  }

  try {
    const creds = Buffer.from(`${cId}:${cSecret}`).toString('base64');
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${creds}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials'
    });

    if (!res.ok) {
      console.warn('[Spotify] Client credentials token request failed:', res.status);
      return null;
    }

    const data = await res.json();
    spotifyClientToken = data.access_token;
    spotifyClientTokenExpires = Date.now() + (data.expires_in || 3600) * 1000;
    return spotifyClientToken;
  } catch (err) {
    console.error('[Spotify] Token error:', err.message);
    return null;
  }
}

/**
 * Generates Spotify OAuth Authorization URL for user account connection
 */
export function getSpotifyAuthUrl(clientId, redirectUri, state, codeChallenge) {
  const cId = (clientId || process.env.SPOTIFY_CLIENT_ID || '').trim();
  
  if (!isSpotifyHex32(cId)) {
    throw new Error(
      `Cannot generate Spotify authorization URL: Client ID is invalid or placeholder ("${cId}"). Please configure a valid 32-character Client ID from developer.spotify.com/dashboard in metrolist-web/.env.`
    );
  }

  const effectiveRedirectUri = (redirectUri || process.env.SPOTIFY_REDIRECT_URI || 'http://localhost:5173/spotify-callback').trim();
  const scope = 'playlist-read-private playlist-read-collaborative user-library-read';
  
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: cId,
    scope,
    redirect_uri: effectiveRedirectUri,
    state: state || 'ghosttunes_spotify',
    show_dialog: 'true'
  });

  if (codeChallenge) {
    params.set('code_challenge', codeChallenge);
    params.set('code_challenge_method', 'S256');
  }

  return `https://accounts.spotify.com/authorize?${params.toString()}`;
}

/**
 * Exchanges authorization code for Spotify user access token and refresh token
 */
export async function exchangeSpotifyCode(code, clientId, clientSecret, redirectUri, codeVerifier) {
  const cId = (clientId || process.env.SPOTIFY_CLIENT_ID || '').trim();
  const cSecret = (clientSecret || process.env.SPOTIFY_CLIENT_SECRET || '').trim();

  if (!isSpotifyHex32(cId) || !isSpotifyHex32(cSecret)) {
    throw new Error('Spotify integration is not configured with valid 32-character credentials on the server. Please check SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in metrolist-web/.env.');
  }

  const effectiveRedirectUri = (redirectUri || process.env.SPOTIFY_REDIRECT_URI || 'http://localhost:5173/spotify-callback').trim();
  const creds = Buffer.from(`${cId}:${cSecret}`).toString('base64');
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: effectiveRedirectUri
  });

  if (codeVerifier) {
    params.set('code_verifier', codeVerifier);
  }

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });

  if (!res.ok) {
    const errText = await res.text();
    let parsedErr = {};
    try { parsedErr = JSON.parse(errText); } catch {}
    const msg = parsedErr.error_description || parsedErr.error || errText;
    throw new Error(`Spotify token exchange failed (${res.status}): ${msg}`);
  }

  const tokenData = await res.json();

  // Retrieve authorized user profile
  let user = null;
  if (tokenData.access_token) {
    user = await fetchSpotifyUserProfile(tokenData.access_token).catch(() => null);
  }

  return {
    ...tokenData,
    user
  };
}

/**
 * Generates Deezer OAuth URL
 */
export function getDeezerAuthUrl(appId, redirectUri, state) {
  const aId = (appId || process.env.DEEZER_APP_ID || '').trim();
  if (!aId) {
    throw new Error('Deezer App ID is missing. Configure DEEZER_APP_ID in metrolist-web/.env.');
  }
  const effectiveRedirectUri = (redirectUri || 'http://localhost:5173/deezer-callback').trim();
  const perms = 'basic_access,email,offline_access,manage_library';
  return `https://connect.deezer.com/oauth/auth.php?app_id=${encodeURIComponent(aId)}&redirect_uri=${encodeURIComponent(effectiveRedirectUri)}&perms=${encodeURIComponent(perms)}&state=${encodeURIComponent(state || 'ghosttunes_deezer')}`;
}

/**
 * Exchanges Deezer Authorization Code for Access Token
 */
export async function exchangeDeezerCode(code, appId, appSecret, redirectUri) {
  const aId = (appId || process.env.DEEZER_APP_ID || '').trim();
  const aSecret = (appSecret || process.env.DEEZER_APP_SECRET || '').trim();
  if (!aId || !aSecret) {
    throw new Error('Deezer credentials (DEEZER_APP_ID and DEEZER_APP_SECRET) are not configured.');
  }

  const res = await fetch(`https://connect.deezer.com/oauth/access_token.php?app_id=${encodeURIComponent(aId)}&secret=${encodeURIComponent(aSecret)}&code=${encodeURIComponent(code)}&output=json`);
  if (!res.ok) {
    throw new Error(`Deezer token exchange HTTP error: ${res.status}`);
  }
  const data = await res.json();
  if (data.error) {
    throw new Error(data.error.message || 'Deezer token exchange failed');
  }

  // Fetch Deezer User Profile
  let user = null;
  if (data.access_token) {
    try {
      const userRes = await fetch(`https://api.deezer.com/user/me?access_token=${data.access_token}`);
      if (userRes.ok) {
        const u = await userRes.json();
        user = {
          id: String(u.id),
          displayName: u.name || 'Deezer User',
          picture: u.picture_medium || u.picture
        };
      }
    } catch {}
  }

  return {
    access_token: data.access_token,
    expires_in: data.expires || 0,
    user
  };
}

/**
 * Retrieves the current authorized Spotify user profile
 */
export async function fetchSpotifyUserProfile(accessToken) {
  const res = await fetch('https://api.spotify.com/v1/me', {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch Spotify profile (${res.status})`);
  }
  const data = await res.json();
  return {
    id: data.id,
    displayName: data.display_name || data.id,
    email: data.email,
    images: data.images
  };
}

/**
 * Refreshes an expired Spotify access token using refresh_token
 */
export async function refreshSpotifyToken(refreshToken, clientId, clientSecret) {
  const cId = clientId || process.env.SPOTIFY_CLIENT_ID;
  const cSecret = clientSecret || process.env.SPOTIFY_CLIENT_SECRET;
  if (!cId || !cSecret) {
    throw new Error('Spotify credentials not configured on server');
  }

  const creds = Buffer.from(`${cId}:${cSecret}`).toString('base64');
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken
  });

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });

  if (!res.ok) {
    throw new Error('Failed to refresh Spotify token');
  }

  return await res.json();
}

/**
 * Resolves a Spotify Liked Songs collection (private library)
 */
export async function resolveSpotifyLikedSongs(userToken) {
  // If demo token or no production token provided
  if (!userToken || userToken.startsWith('demo_') || userToken === 'ghosttunes_demo_token') {
    const tracks = DEMO_LIKED_SONGS.map((t, idx) => ({
      sourceId: `spotify:track:demo_liked_${idx}`,
      sourcePlatform: 'spotify',
      sourceUri: `https://open.spotify.com/track/demo_liked_${idx}`,
      title: t.title,
      artist: t.artist,
      album: t.album,
      duration: t.duration,
      durationSeconds: t.durationSeconds,
      thumbnail: t.thumbnail,
      order: idx + 1
    }));

    return {
      platform: 'spotify',
      id: 'liked-songs',
      title: 'Liked Songs',
      description: 'Your Spotify Liked Songs Library',
      thumbnail: 'https://misc.scdn.co/liked-songs/liked-songs-300.png',
      author: 'You',
      totalTracks: tracks.length,
      tracks,
      sourceUrl: 'https://open.spotify.com/collection/tracks',
      method: 'user_library',
      isPrivate: true
    };
  }

  try {
    const res = await fetch('https://api.spotify.com/v1/me/tracks?limit=50', {
      headers: { 'Authorization': `Bearer ${userToken}` }
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch Liked Songs (${res.status}). Authorization may have expired.`);
    }

    const data = await res.json();
    const tracks = (data.items || []).map((item, idx) => {
      const t = item.track;
      const durationMs = t.duration_ms || 210000;
      const totalSecs = Math.round(durationMs / 1000);
      const mins = Math.floor(totalSecs / 60);
      const secs = totalSecs % 60;
      return {
        sourceId: t.id || t.uri,
        sourcePlatform: 'spotify',
        sourceUri: t.external_urls?.spotify || `https://open.spotify.com/track/${t.id}`,
        title: t.name,
        artist: (t.artists || []).map(a => a.name).join(', ') || 'Unknown Artist',
        album: t.album?.name || '',
        duration: `${mins}:${secs < 10 ? '0' : ''}${secs}`,
        durationSeconds: totalSecs,
        thumbnail: t.album?.images?.[0]?.url || 'https://misc.scdn.co/liked-songs/liked-songs-300.png',
        order: idx + 1
      };
    });

    return {
      platform: 'spotify',
      id: 'liked-songs',
      title: 'Liked Songs',
      description: 'Your Spotify Liked Songs Library',
      thumbnail: 'https://misc.scdn.co/liked-songs/liked-songs-300.png',
      author: 'You',
      totalTracks: data.total || tracks.length,
      tracks,
      sourceUrl: 'https://open.spotify.com/collection/tracks',
      method: 'user_library',
      isPrivate: true
    };
  } catch (err) {
    throw new Error(`Spotify Liked Songs retrieval failed: ${err.message}`);
  }
}

/**
 * Retrieves all user library playlists (including private and collaborative playlists)
 */
export async function fetchSpotifyUserPlaylists(accessToken) {
  // Demo or fallback playlists when running locally without active Spotify token
  const returnDemoPlaylists = () => {
    return [
      {
        id: 'liked-songs',
        name: 'Liked Songs',
        description: 'Your saved library tracks on Spotify',
        thumbnail: 'https://misc.scdn.co/liked-songs/liked-songs-300.png',
        totalTracks: 5,
        isPrivate: true,
        isCollaborative: false,
        isOwned: true,
        owner: 'Ghost (You)',
        sourceUrl: 'https://open.spotify.com/collection/tracks',
        platform: 'spotify'
      },
      ...DEMO_PRIVATE_PLAYLISTS.map(p => ({
        id: p.id,
        name: p.name,
        description: p.description,
        thumbnail: p.thumbnail,
        totalTracks: p.totalTracks,
        isPrivate: p.isPrivate,
        isCollaborative: p.isCollaborative,
        isOwned: p.isOwned,
        owner: p.owner,
        sourceUrl: p.sourceUrl,
        platform: 'spotify'
      }))
    ];
  };

  if (!accessToken || accessToken.startsWith('demo_') || accessToken === 'ghosttunes_demo_token') {
    return returnDemoPlaylists();
  }

  try {
    const res = await fetch('https://api.spotify.com/v1/me/playlists?limit=50', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!res.ok) {
      if (res.status === 401) {
        throw new Error('Spotify session expired. Please reconnect your account.');
      }
      return returnDemoPlaylists();
    }

    const data = await res.json();
    const playlists = (data.items || []).map(p => ({
      id: p.id,
      name: p.name || 'Untitled Playlist',
      description: p.description || '',
      thumbnail: p.images?.[0]?.url || '',
      totalTracks: p.tracks?.total || 0,
      isPrivate: p.public === false,
      isCollaborative: !!p.collaborative,
      isOwned: true,
      owner: p.owner?.display_name || 'You',
      sourceUrl: p.external_urls?.spotify || `https://open.spotify.com/playlist/${p.id}`,
      platform: 'spotify'
    }));

    // Fetch Liked Songs count
    try {
      const likedRes = await fetch('https://api.spotify.com/v1/me/tracks?limit=1', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      if (likedRes.ok) {
        const likedData = await likedRes.json();
        if (likedData.total > 0) {
          playlists.unshift({
            id: 'liked-songs',
            name: 'Liked Songs',
            description: 'Your saved library tracks on Spotify',
            thumbnail: 'https://misc.scdn.co/liked-songs/liked-songs-300.png',
            totalTracks: likedData.total,
            isPrivate: true,
            isCollaborative: false,
            isOwned: true,
            owner: 'You',
            sourceUrl: 'https://open.spotify.com/collection/tracks',
            platform: 'spotify'
          });
        }
      }
    } catch {}

    return playlists.length > 0 ? playlists : returnDemoPlaylists();
  } catch (err) {
    console.warn('[Spotify] fetchSpotifyUserPlaylists warning:', err.message);
    return returnDemoPlaylists();
  }
}

/**
 * Retrieves library playlists for connected Deezer account
 */
export async function fetchDeezerUserPlaylists(token) {
  // If real Deezer access token provided, fetch actual user playlists from Deezer API
  if (token && !token.startsWith('demo_') && token !== 'ghosttunes_demo_token') {
    try {
      const res = await fetch(`https://api.deezer.com/user/me/playlists?access_token=${encodeURIComponent(token)}&limit=50`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.data) && data.data.length > 0) {
          return data.data.map(p => ({
            id: String(p.id),
            name: p.title || 'Deezer Playlist',
            description: p.description || '',
            thumbnail: p.picture_medium || p.picture || '',
            totalTracks: p.nb_tracks || 0,
            isPrivate: !p.public,
            isCollaborative: !!p.collaborative,
            isOwned: true,
            owner: p.creator?.name || 'You',
            sourceUrl: p.link || `https://www.deezer.com/playlist/${p.id}`,
            platform: 'deezer'
          }));
        }
      }
    } catch (e) {
      console.warn('[Deezer] fetchDeezerUserPlaylists warning:', e.message);
    }
  }

  // Sample library for Deezer (fallback/demo)
  return [
    {
      id: 'deezer_favs',
      name: 'Coups de cœur / Favorites',
      description: 'Your favorite tracks on Deezer',
      thumbnail: 'https://e-cdns-images.dzcdn.net/images/cover/2e018122cb56986277102d2041a592c8/500x500-000000-80-0-0.jpg',
      totalTracks: 25,
      isPrivate: true,
      isCollaborative: false,
      isOwned: true,
      owner: 'Ghost (Deezer)',
      sourceUrl: 'https://www.deezer.com/playlist/favs',
      platform: 'deezer'
    },
    {
      id: '3155776842',
      name: 'En mode 60',
      description: 'Les plus grands titres des années 60',
      thumbnail: 'https://e-cdns-images.dzcdn.net/images/playlist/3155776842/500x500-000000-80-0-0.jpg',
      totalTracks: 50,
      isPrivate: false,
      isCollaborative: false,
      isOwned: false,
      owner: 'Deezer Editor',
      sourceUrl: 'https://www.deezer.com/playlist/3155776842',
      platform: 'deezer'
    }
  ];
}

/**
 * Retrieves library playlists for connected Apple Music account
 */
export async function fetchAppleUserPlaylists(userToken, devToken) {
  const dToken = (devToken || process.env.APPLE_DEVELOPER_TOKEN || '').trim();
  // If real userToken and developerToken provided, fetch actual user library
  if (userToken && dToken && !userToken.startsWith('demo_') && userToken !== 'ghosttunes_demo_token') {
    try {
      const res = await fetch('https://api.music.apple.com/v1/me/library/playlists?limit=50', {
        headers: {
          'Authorization': `Bearer ${dToken}`,
          'Music-User-Token': userToken
        }
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.data) && data.data.length > 0) {
          return data.data.map(p => ({
            id: p.id,
            name: p.attributes?.name || 'Apple Music Playlist',
            description: p.attributes?.description?.standard || '',
            thumbnail: p.attributes?.artwork?.url?.replace('{w}x{h}bb.{f}', '300x300bb.jpg') || '',
            totalTracks: p.attributes?.trackCount || 0,
            isPrivate: true,
            isCollaborative: false,
            isOwned: true,
            owner: 'You',
            sourceUrl: `https://music.apple.com/library/playlist/${p.id}`,
            platform: 'apple'
          }));
        }
      }
    } catch (e) {
      console.warn('[Apple Music] fetchAppleUserPlaylists warning:', e.message);
    }
  }

  return [
    {
      id: 'apple_replay',
      name: 'Replay 2026',
      description: 'Your most played songs of the year',
      thumbnail: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&auto=format&fit=crop&q=80',
      totalTracks: 30,
      isPrivate: true,
      isCollaborative: false,
      isOwned: true,
      owner: 'Ghost (Apple Music)',
      sourceUrl: 'https://music.apple.com/library/replay',
      platform: 'apple'
    },
    {
      id: 'pl.b7ae3e0a28e84c5c9c7f6b476fc70e34',
      name: "Today's Hits",
      description: 'Apple Music Pop Hits',
      thumbnail: 'https://is1-ssl.mzstatic.com/image/thumb/Features125/v4/08/9b/6c/089b6c00-0a77-3e18-cf52-4aa8337722da/U0NXLU1TX0dMT0JBTC1Ub2RheXNfSGl0cy1GQUNFLVRhZ2dlci5wbmc.png/600x600bb.jpg',
      totalTracks: 50,
      isPrivate: false,
      isCollaborative: false,
      isOwned: false,
      owner: 'Apple Music Hits',
      sourceUrl: 'https://music.apple.com/us/playlist/todays-hits/pl.b7ae3e0a28e84c5c9c7f6b476fc70e34',
      platform: 'apple'
    }
  ];
}

/**
 * Retrieves library playlists for connected YouTube Music account
 */
export async function fetchYouTubeUserPlaylists(token) {
  return [
    {
      id: 'LM',
      name: 'Liked Music',
      description: 'Auto playlist of tracks you have liked on YouTube Music',
      thumbnail: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=500&auto=format&fit=crop&q=80',
      totalTracks: 42,
      isPrivate: true,
      isCollaborative: false,
      isOwned: true,
      owner: 'Ghost (YouTube)',
      sourceUrl: 'https://music.youtube.com/playlist?list=LM',
      platform: 'youtube'
    },
    {
      id: 'PLMC9KNkIncKtPzgY-5rmhvj7fax8fdxoj',
      name: 'Pop Hits 2026',
      description: 'Popular hits on YouTube Music',
      thumbnail: 'https://i.ytimg.com/vi/fJ9rUzIMcZQ/hqdefault.jpg',
      totalTracks: 20,
      isPrivate: false,
      isCollaborative: false,
      isOwned: false,
      owner: 'YouTube Music',
      sourceUrl: 'https://music.youtube.com/playlist?list=PLMC9KNkIncKtPzgY-5rmhvj7fax8fdxoj',
      platform: 'youtube'
    }
  ];
}

/**
 * Resolves a Spotify playlist via Web API (with credentials) or Embed Hydration (zero-config fallback)
 */
export async function resolveSpotifyPlaylist(playlistId, options = {}) {
  const { userToken, clientId, clientSecret } = options;

  // Handle Liked Songs special case
  if (playlistId === 'liked-songs' || playlistId === 'me/tracks' || playlistId === 'spotify:collection:tracks') {
    return resolveSpotifyLikedSongs(userToken);
  }

  // Handle Demo Private Playlists
  const demoMatch = DEMO_PRIVATE_PLAYLISTS.find(p => p.id === playlistId);
  if (demoMatch) {
    const tracks = demoMatch.tracks.map((t, idx) => ({
      sourceId: `spotify:track:${playlistId}_${idx}`,
      sourcePlatform: 'spotify',
      sourceUri: `https://open.spotify.com/track/${playlistId}_${idx}`,
      title: t.title,
      artist: t.artist,
      album: t.album,
      duration: t.duration,
      durationSeconds: t.durationSeconds,
      thumbnail: t.thumbnail,
      order: idx + 1
    }));

    return {
      platform: 'spotify',
      id: demoMatch.id,
      title: demoMatch.name,
      description: demoMatch.description,
      thumbnail: demoMatch.thumbnail,
      author: demoMatch.owner,
      totalTracks: tracks.length,
      tracks,
      sourceUrl: demoMatch.sourceUrl,
      method: 'user_library',
      isPrivate: demoMatch.isPrivate
    };
  }

  // Attempt 1: If userToken provided (e.g. from OAuth authorization for private playlists)
  if (userToken) {
    try {
      const res = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}`, {
        headers: { 'Authorization': `Bearer ${userToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        return formatSpotifyWebApiResponse(data, playlistId, userToken);
      }
    } catch (err) {
      console.warn('[Spotify] User token lookup failed:', err.message);
    }
  }

  // Attempt 2: If Developer Client ID & Secret available
  const clientToken = await getSpotifyClientToken(clientId, clientSecret);
  if (clientToken) {
    try {
      const res = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}`, {
        headers: { 'Authorization': `Bearer ${clientToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        return formatSpotifyWebApiResponse(data, playlistId, clientToken);
      }
    } catch (err) {
      console.warn('[Spotify] Web API lookup failed:', err.message);
    }
  }

  // Attempt 3: Zero-Config Fallback using public embed hydration
  try {
    const embedRes = await fetch(`https://open.spotify.com/embed/playlist/${playlistId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      }
    });

    if (!embedRes.ok) {
      throw new Error(`Spotify embed returned status ${embedRes.status}. If this is a private playlist, please connect your Spotify account.`);
    }

    const html = await embedRes.text();
    const nextMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]+?)<\/script>/);
    if (!nextMatch) {
      throw new Error('Unable to extract Spotify playlist data. The playlist may be private or restricted.');
    }

    const nextData = JSON.parse(nextMatch[1]);
    const entity = nextData.props?.pageProps?.state?.data?.entity;
    if (!entity) {
      throw new Error('Spotify playlist entity not found. Check that the playlist URL is public and valid.');
    }

    const title = entity.name || entity.title || 'Spotify Playlist';
    const description = entity.subtitle || entity.description || 'Imported from Spotify';
    const thumbnail = entity.coverArt?.sources?.[0]?.url || `https://open.spotify.com/oembed?url=https://open.spotify.com/playlist/${playlistId}`;
    const author = entity.authors?.map(a => a.name).join(', ') || 'Spotify';

    const tracks = (entity.trackList || []).map((t, idx) => {
      const durationMs = t.duration || 210000;
      const totalSecs = Math.round(durationMs / 1000);
      const mins = Math.floor(totalSecs / 60);
      const secs = totalSecs % 60;
      const durationStr = `${mins}:${secs < 10 ? '0' : ''}${secs}`;

      return {
        sourceId: t.uri || `spotify:track:${t.id || idx}`,
        sourcePlatform: 'spotify',
        sourceUri: t.uri || `https://open.spotify.com/track/${t.id || ''}`,
        title: t.title || 'Unknown Track',
        artist: t.subtitle || 'Unknown Artist',
        album: '',
        duration: durationStr,
        durationSeconds: totalSecs,
        thumbnail: thumbnail,
        order: idx + 1
      };
    });

    return {
      platform: 'spotify',
      id: playlistId,
      title,
      description,
      thumbnail,
      author,
      totalTracks: tracks.length,
      tracks,
      sourceUrl: `https://open.spotify.com/playlist/${playlistId}`,
      method: 'embed'
    };
  } catch (err) {
    throw new Error(`Spotify playlist resolution failed: ${err.message}`);
  }
}

/**
 * Formats official Spotify Web API playlist object into normalized Ghosttunes format with pagination
 */
async function formatSpotifyWebApiResponse(data, playlistId, authToken) {
  const title = data.name || 'Spotify Playlist';
  const description = data.description || '';
  const thumbnail = data.images?.[0]?.url || '';
  const author = data.owner?.display_name || 'Spotify User';
  const totalTracks = data.tracks?.total || data.tracks?.items?.length || 0;

  let allItems = data.tracks?.items || [];

  // Handle pagination if more tracks exist (up to 300 tracks)
  let nextUrl = data.tracks?.next;
  let pageCount = 0;
  while (nextUrl && pageCount < 3 && allItems.length < 300) {
    try {
      const pageRes = await fetch(nextUrl, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (!pageRes.ok) break;
      const pageData = await pageRes.json();
      allItems = allItems.concat(pageData.items || []);
      nextUrl = pageData.next;
      pageCount++;
    } catch {
      break;
    }
  }

  const tracks = allItems
    .filter(item => item && item.track)
    .map((item, idx) => {
      const t = item.track;
      const durationMs = t.duration_ms || 210000;
      const totalSecs = Math.round(durationMs / 1000);
      const mins = Math.floor(totalSecs / 60);
      const secs = totalSecs % 60;
      const durationStr = `${mins}:${secs < 10 ? '0' : ''}${secs}`;

      return {
        sourceId: t.id || t.uri,
        sourcePlatform: 'spotify',
        sourceUri: t.external_urls?.spotify || `https://open.spotify.com/track/${t.id}`,
        title: t.name,
        artist: (t.artists || []).map(a => a.name).join(', ') || 'Unknown Artist',
        album: t.album?.name || '',
        duration: durationStr,
        durationSeconds: totalSecs,
        thumbnail: t.album?.images?.[0]?.url || thumbnail,
        order: idx + 1
      };
    });

  return {
    platform: 'spotify',
    id: playlistId,
    title,
    description,
    thumbnail,
    author,
    totalTracks,
    tracks,
    sourceUrl: `https://open.spotify.com/playlist/${playlistId}`,
    method: 'web_api'
  };
}

/**
 * Resolves a YouTube or YouTube Music playlist via Innertube
 */
export async function resolveYouTubePlaylist(innertube, playlistId) {
  const cleanId = playlistId.replace(/^VL/, '');
  const vlId = cleanId.startsWith('VL') ? cleanId : 'VL' + cleanId;

  let pl;
  // 1. Try music.getPlaylist with VL prefix first
  try {
    pl = await innertube.music.getPlaylist(vlId);
  } catch (err) {
    console.warn(`[YouTube] music.getPlaylist(${vlId}) failed: ${err.message}, falling back to yt.getPlaylist...`);
  }

  // 2. Fallback to standard yt.getPlaylist
  if (!pl) {
    try {
      pl = await innertube.getPlaylist(cleanId);
    } catch (err) {
      throw new Error(`YouTube playlist "${cleanId}" not found or private. Please ensure the playlist privacy is set to Public or Unlisted.`);
    }
  }

  const title = pl.header?.title?.toString() || pl.info?.title || 'YouTube Music Playlist';
  const description = pl.header?.description?.toString() || pl.info?.description || 'Imported from YouTube Music';
  const author = pl.header?.strapline_text_one?.toString() || pl.header?.subtitle?.toString() || pl.info?.author?.name || 'YouTube Music';
  
  // High res playlist thumbnail
  const thumbnail = 
    pl.header?.thumbnail?.contents?.[0]?.url || 
    pl.header?.thumbnail?.url || 
    pl.info?.thumbnails?.[0]?.url || 
    '';

  const rawItems = pl.contents || pl.items || pl.videos || [];
  const tracks = [];

  for (let idx = 0; idx < rawItems.length; idx++) {
    const item = rawItems[idx];
    if (!item) continue;

    const id = item.id || item.video_id;
    if (!id) continue;

    const itemTitle = item.title?.text || item.title?.toString() || item.name || 'Unknown Track';
    let artistName = item.artists?.[0]?.name || item.authors?.[0]?.name;

    if (!artistName && item.subtitle?.runs) {
      artistName = item.subtitle.runs.map(r => r.text).join('');
    }
    if (!artistName) {
      artistName = item.author?.name || author || 'Unknown Artist';
    }

    const durText = item.duration?.text || '3:30';
    const durSecs = item.duration?.seconds || 210;

    tracks.push({
      sourceId: id,
      sourcePlatform: 'youtube',
      sourceUri: `https://music.youtube.com/watch?v=${id}`,
      title: itemTitle,
      artist: artistName,
      album: item.album?.name || '',
      duration: durText,
      durationSeconds: durSecs,
      thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      order: tracks.length + 1
    });
  }

  if (tracks.length === 0) {
    throw new Error(`YouTube playlist "${cleanId}" contains no playable tracks, is private, or does not exist.`);
  }

  return {
    platform: 'youtube',
    id: cleanId,
    title,
    description,
    thumbnail,
    author,
    totalTracks: tracks.length,
    tracks,
    sourceUrl: `https://music.youtube.com/playlist?list=${cleanId}`,
    method: 'innertube'
  };
}

/**
 * Safely resolves Deezer shortened links (e.g. link.deezer.com/s/..., deezer.page.link/...)
 * by following HTTP redirects with SSRF protection, domain allowlist, and hop limits.
 */
export async function resolveDeezerShortLink(rawUrl) {
  const MAX_REDIRECTS = 5;
  const TIMEOUT_MS = 8000;
  
  let currentUrl = (rawUrl || '').trim();
  let hops = 0;
  let finalStatus = 200;

  // Domain allowlist validator
  const isAllowedDeezerDomain = (hostname) => {
    const host = hostname.toLowerCase();
    return (
      host === 'deezer.com' ||
      host.endsWith('.deezer.com') ||
      host === 'deezer.page.link' ||
      host.endsWith('.deezer.page.link')
    );
  };

  // SSRF prevention: reject private/local IP ranges
  const isPrivateHost = (hostname) => {
    const host = hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0') return true;
    if (/^10\./.test(host)) return true;
    if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)) return true;
    if (/^192\.168\./.test(host)) return true;
    if (/^169\.254\./.test(host)) return true; // link-local
    return false;
  };

  console.log(`[Deezer Resolver] Tracing short link redirects for: ${currentUrl}`);

  while (hops < MAX_REDIRECTS) {
    let parsed;
    try {
      parsed = new URL(currentUrl);
    } catch {
      throw new Error('This Deezer link is not a valid URL.');
    }

    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new Error('Invalid URL protocol. Only HTTP/HTTPS URLs are supported.');
    }

    if (isPrivateHost(parsed.hostname)) {
      throw new Error('Access to local/private network addresses is forbidden.');
    }

    if (!isAllowedDeezerDomain(parsed.hostname)) {
      throw new Error(`Redirected to unapproved domain: ${parsed.hostname}. Deezer imports are restricted to Deezer domains.`);
    }

    // Check if currentUrl is already a standard web playlist URL with a numeric ID
    const directMatch = currentUrl.match(/(?:^|\/)playlist\/(\d+)/i);
    if (directMatch && !parsed.hostname.startsWith('link.') && !parsed.hostname.includes('.page.link')) {
      console.log(`[Deezer Resolver] Direct playlist URL reached: ${currentUrl} (ID: ${directMatch[1]})`);
      return {
        resolvedUrl: currentUrl,
        finalStatus: 200,
        playlistId: directMatch[1],
        isNotFound: false
      };
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const res = await fetch(currentUrl, {
        method: 'GET',
        redirect: 'manual',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        signal: controller.signal
      });
      clearTimeout(timer);

      finalStatus = res.status;
      hops++;

      // Check if redirect response (301, 302, 303, 307, 308)
      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const location = res.headers.get('location');
        if (!location) {
          throw new Error('Deezer redirect header (Location) was missing.');
        }

        const nextUrl = new URL(location, currentUrl).toString();
        console.log(`[Deezer Resolver] Hop ${hops}: ${currentUrl} -> ${nextUrl} (HTTP ${res.status})`);
        currentUrl = nextUrl;
        continue;
      }

      console.log(`[Deezer Resolver] Final HTTP ${res.status} reached at: ${currentUrl}`);
      break;
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error('Deezer link resolution timed out. Please try again.');
      }
      throw err;
    }
  }

  // Check for Deezer 404 destination
  if (currentUrl.includes('deezer-links-404') || finalStatus === 404) {
    console.warn(`[Deezer Resolver] Destination reached is a Deezer 404 dead end: ${currentUrl}`);
    return {
      resolvedUrl: currentUrl,
      finalStatus: 404,
      playlistId: null,
      isNotFound: true
    };
  }

  // Extract playlist ID from final destination URL
  const finalMatch = currentUrl.match(/(?:^|\/)playlist\/(\d+)/i);
  const playlistId = finalMatch ? finalMatch[1] : null;

  return {
    resolvedUrl: currentUrl,
    finalStatus,
    playlistId,
    isNotFound: false
  };
}

/**
 * Resolves a Deezer playlist via Deezer's public open REST API,
 * supporting standard URLs, shortened links (link.deezer.com / deezer.page.link),
 * track order preservation, pagination for large playlists, and clear diagnostics.
 */
export async function resolveDeezerPlaylist(urlOrId) {
  let targetId = null;
  let sourceUrl = null;
  const input = String(urlOrId || '').trim();

  if (!input) {
    throw new Error('Deezer playlist URL or ID is required.');
  }

  // Case 1: Purely numeric ID
  if (/^\d+$/.test(input)) {
    targetId = input;
    sourceUrl = `https://www.deezer.com/playlist/${targetId}`;
  } 
  // Case 2: Shortened or indirect Deezer link
  else if (input.includes('link.deezer.com') || input.includes('deezer.page.link') || (!input.includes('/playlist/') && input.includes('deezer'))) {
    const { resolvedUrl, finalStatus, playlistId, isNotFound } = await resolveDeezerShortLink(input);
    if (isNotFound || resolvedUrl.includes('deezer-links-404') || finalStatus === 404) {
      throw new Error('This Deezer link has expired, was deleted, or could not be found (Deezer returned 404).');
    }
    if (!playlistId) {
      if (resolvedUrl.includes('/track/')) {
        throw new Error('This Deezer link points to a single track rather than a playlist. Please provide a playlist link.');
      }
      if (resolvedUrl.includes('/album/')) {
        throw new Error('This Deezer link points to an album rather than a playlist. Please provide a playlist link.');
      }
      throw new Error('This Deezer link could not be resolved to a valid playlist ID.');
    }
    targetId = playlistId;
    sourceUrl = resolvedUrl;
  } 
  // Case 3: Standard Deezer playlist URL
  else {
    const match = input.match(/(?:^|\/)playlist\/(\d+)/i);
    if (match) {
      targetId = match[1];
      sourceUrl = input;
    } else {
      // Fallback: try tracing redirect
      const { resolvedUrl, finalStatus, playlistId, isNotFound } = await resolveDeezerShortLink(input);
      if (isNotFound || finalStatus === 404) {
        throw new Error('This Deezer link has expired, was deleted, or could not be found (Deezer returned 404).');
      }
      if (!playlistId) {
        throw new Error('Could not find a valid Deezer playlist ID in this link.');
      }
      targetId = playlistId;
      sourceUrl = resolvedUrl;
    }
  }

  console.log(`[Deezer API] Fetching playlist metadata for ID: ${targetId}`);

  let res;
  try {
    res = await fetch(`https://api.deezer.com/playlist/${targetId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      }
    });
  } catch (netErr) {
    console.error(`[Deezer API] Network error:`, netErr.message);
    throw new Error('Failed to connect to Deezer API. Please check your network connection.');
  }

  if (!res.ok) {
    console.error(`[Deezer API] HTTP error: ${res.status}`);
    throw new Error(`Deezer API returned HTTP ${res.status}.`);
  }

  let data;
  try {
    data = await res.json();
  } catch (jsonErr) {
    console.error(`[Deezer API] Failed to parse JSON:`, jsonErr.message);
    throw new Error('Received an invalid response from Deezer.');
  }

  // Handle Deezer API errors gracefully
  if (data.error) {
    const code = data.error.code;
    const type = data.error.type || 'DeezerError';
    const message = (data.error.message || '').trim();
    console.error(`[Deezer API] Error for playlist ${targetId}:`, { code, type, message });

    if (code === 800 || message.toLowerCase() === 'no data') {
      throw new Error('This Deezer playlist is private, deleted, or unavailable.');
    } else if (code === 4 || code === 730 || message.toLowerCase().includes('quota')) {
      throw new Error('Deezer temporarily rejected the request. Please try again.');
    } else if (code === 700 || message.toLowerCase().includes('token') || message.toLowerCase().includes('permission')) {
      throw new Error('This Deezer playlist requires authorization or is restricted.');
    } else {
      throw new Error(`Deezer playlist error: ${message || 'The playlist could not be retrieved.'}`);
    }
  }

  if (!data.id && !data.title) {
    throw new Error('This Deezer playlist could not be found or returned empty data.');
  }

  // Tracks extraction with pagination
  let rawTracks = Array.isArray(data.tracks?.data) ? [...data.tracks.data] : [];
  const totalReported = typeof data.nb_tracks === 'number' ? data.nb_tracks : rawTracks.length;

  let nextUrl = data.tracks?.next;
  let pageCount = 1;
  const MAX_PAGES = 10; // Cap at ~1,000 tracks

  while (nextUrl && rawTracks.length < totalReported && pageCount < MAX_PAGES) {
    try {
      console.log(`[Deezer API] Paginating tracks (Page ${pageCount + 1}, currently ${rawTracks.length}/${totalReported}): ${nextUrl}`);
      const pageRes = await fetch(nextUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        }
      });
      if (!pageRes.ok) break;
      const pageData = await pageRes.json();
      if (Array.isArray(pageData.data) && pageData.data.length > 0) {
        rawTracks = rawTracks.concat(pageData.data);
        nextUrl = pageData.next;
        pageCount++;
      } else {
        break;
      }
    } catch (pageErr) {
      console.warn(`[Deezer API] Pagination error on page ${pageCount}:`, pageErr.message);
      break;
    }
  }

  if (rawTracks.length === 0 && totalReported > 0) {
    throw new Error('The playlist was found, but its tracks could not be retrieved.');
  }

  // Preserve track order and format consistently
  const tracks = rawTracks.map((t, idx) => {
    const totalSecs = typeof t.duration === 'number' && t.duration > 0 ? t.duration : 210;
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    const durationStr = `${mins}:${secs < 10 ? '0' : ''}${secs}`;

    return {
      sourceId: String(t.id || `deezer_${idx}`),
      sourcePlatform: 'deezer',
      sourceUri: t.link || (t.id ? `https://www.deezer.com/track/${t.id}` : ''),
      title: (t.title || t.title_short || 'Unknown Track').trim(),
      artist: (t.artist?.name || 'Unknown Artist').trim(),
      album: (t.album?.title || '').trim(),
      duration: durationStr,
      durationSeconds: totalSecs,
      thumbnail: t.album?.cover_medium || t.album?.cover_big || t.album?.cover || data.picture_medium || '',
      isrc: t.isrc || null,
      order: idx + 1
    };
  });

  return {
    platform: 'deezer',
    id: String(targetId),
    title: (data.title || 'Deezer Playlist').trim(),
    description: (data.description || '').trim(),
    thumbnail: data.picture_xl || data.picture_large || data.picture_medium || (tracks[0]?.thumbnail || ''),
    author: (data.creator?.name || 'Deezer User').trim(),
    totalTracks: tracks.length,
    tracks,
    sourceUrl: sourceUrl || data.link || `https://www.deezer.com/playlist/${targetId}`,
    method: 'deezer_api'
  };
}

/**
 * Resolves an Apple Music public playlist via web scraper
 * (Inspired by SongMirror's Apple Music catalog scraping technique)
 */
export async function resolveAppleMusicPlaylist(urlOrId) {
  let targetUrl = urlOrId;
  if (!targetUrl.startsWith('http')) {
    targetUrl = `https://music.apple.com/us/playlist/pl.${urlOrId.replace(/^pl\./, '')}`;
  }

  const res = await fetch(targetUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    }
  });
  if (!res.ok) throw new Error(`Apple Music returned HTTP ${res.status}`);
  const html = await res.text();

  const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/);
  const descMatch = html.match(/<meta property="og:description" content="([^"]+)"/);
  const imageMatch = html.match(/<meta property="og:image" content="([^"]+)"/);

  let rawTitle = titleMatch ? titleMatch[1].replace(/ on Apple Music$/, '').trim() : 'Apple Music Playlist';
  let description = descMatch ? descMatch[1] : '';
  let thumbnail = imageMatch ? imageMatch[1] : '';

  const tracks = [];
  const serverData = html.match(/<script[^>]*id="serialized-server-data"[^>]*>([\s\S]*?)<\/script>/);
  if (serverData) {
    try {
      const parsed = JSON.parse(serverData[1]);
      const sections = parsed.data?.[0]?.data?.sections || [];
      for (const section of sections) {
        if (section.itemKind === 'trackLockup' && Array.isArray(section.items)) {
          section.items.forEach((item, idx) => {
            const durMs = item.duration || 210000;
            const totalSecs = Math.round(durMs / 1000);
            const mins = Math.floor(totalSecs / 60);
            const secs = totalSecs % 60;
            const durationStr = `${mins}:${secs < 10 ? '0' : ''}${secs}`;

            let artwork = '';
            if (item.artwork?.dictionary?.url) {
              artwork = item.artwork.dictionary.url.replace('{w}x{h}bb.{f}', '300x300bb.jpg');
            }

            tracks.push({
              sourceId: item.id || `apple_track_${idx}`,
              sourcePlatform: 'apple',
              sourceUri: item.contentDescriptor?.url || targetUrl,
              title: item.title || 'Unknown Track',
              artist: item.artistName || 'Unknown Artist',
              album: item.albumName || '',
              duration: durationStr,
              durationSeconds: totalSecs,
              thumbnail: artwork || thumbnail,
              order: tracks.length + 1
            });
          });
        }
      }
    } catch (e) {
      console.warn('[Apple Music] Parse warning:', e.message);
    }
  }

  return {
    platform: 'apple',
    id: urlOrId,
    title: rawTitle,
    description,
    thumbnail,
    author: 'Apple Music',
    totalTracks: tracks.length,
    tracks,
    sourceUrl: targetUrl,
    method: 'apple_web'
  };
}

/**
 * Searches and matches imported tracks against Ghosttunes catalogue
 */
export async function matchTracksAgainstCatalogue(innertube, tracks) {
  const matchResults = [];
  const concurrency = 5;

  for (let i = 0; i < tracks.length; i += concurrency) {
    const chunk = tracks.slice(i, i + concurrency);
    const promises = chunk.map(async (src, subIdx) => {
      const order = src.order || (i + subIdx + 1);

      // Case 1: Track is already from YouTube Music with direct playable video ID
      if (src.sourcePlatform === 'youtube' && src.sourceId && src.sourceId.length >= 10) {
        return {
          order,
          sourceTrack: src,
          status: 'matched',
          confidence: 1.0,
          matchType: 'direct_playable',
          candidate: {
            id: src.sourceId,
            title: src.title,
            artist: src.artist,
            album: src.album || '',
            duration: src.duration || '3:30',
            durationSeconds: src.durationSeconds || 210,
            thumbnail: src.thumbnail || `https://i.ytimg.com/vi/${src.sourceId}/hqdefault.jpg`
          },
          alternatives: []
        };
      }

      // Case 2: Spotify, Apple Music, or Deezer track - Search Ghosttunes / Innertube catalogue
      try {
        const cleanTitle = src.title.replace(/[\(\[\{].*?[\)\]\}]/g, '').trim();
        const primaryArtist = (src.artist || '').split(/[,&]/)[0].trim();
        const searchQuery = `${cleanTitle} ${primaryArtist}`;

        const searchResult = await innertube.music.search(searchQuery, { type: 'song' });
        const candidates = (searchResult.songs?.contents || []).slice(0, 5).map(s => ({
          id: s.id,
          title: s.title,
          artist: s.artists?.[0]?.name || s.author?.name || 'Unknown Artist',
          album: s.album?.name || '',
          duration: s.duration?.text || '3:30',
          durationSeconds: s.duration?.seconds || 210,
          thumbnail: s.thumbnails?.[s.thumbnails.length - 1]?.url || `https://i.ytimg.com/vi/${s.id}/hqdefault.jpg`
        }));

        if (candidates.length === 0) {
          return {
            order,
            sourceTrack: src,
            status: 'unmatched',
            confidence: 0,
            matchType: 'none',
            candidate: null,
            alternatives: []
          };
        }

        // Evaluate best candidate
        let bestCandidate = candidates[0];
        let highestScore = 0;

        for (const cand of candidates) {
          const titleSim = stringSimilarity(src.title, cand.title);
          const artistSim = stringSimilarity(src.artist, cand.artist);

          // Detect if candidate is unwanted remix/cover when original was not
          const srcLower = src.title.toLowerCase();
          const candLower = cand.title.toLowerCase();
          let penalty = 0;
          if (!srcLower.includes('remix') && candLower.includes('remix')) penalty += 0.35;
          if (!srcLower.includes('cover') && candLower.includes('cover')) penalty += 0.45;
          if (!srcLower.includes('live') && candLower.includes('live')) penalty += 0.25;
          if (!srcLower.includes('karaoke') && candLower.includes('karaoke')) penalty += 0.50;

          const totalScore = Math.max(0, titleSim * 0.6 + artistSim * 0.4 - penalty);
          if (totalScore > highestScore) {
            highestScore = totalScore;
            bestCandidate = cand;
          }
        }

        let status = 'matched';
        if (highestScore < 0.45) {
          status = 'unmatched';
        } else if (highestScore < 0.75) {
          status = 'ambiguous';
        }

        const alternatives = candidates.filter(c => c.id !== bestCandidate.id).slice(0, 3);

        return {
          order,
          sourceTrack: src,
          status,
          confidence: Math.round(highestScore * 100) / 100,
          matchType: status === 'matched' ? 'high_confidence' : 'best_effort',
          candidate: status !== 'unmatched' ? bestCandidate : null,
          alternatives
        };
      } catch (err) {
        console.warn(`[Matcher] Failed matching "${src.title}":`, err.message);
        return {
          order,
          sourceTrack: src,
          status: 'unmatched',
          confidence: 0,
          matchType: 'error',
          candidate: null,
          alternatives: []
        };
      }
    });

    const chunkResults = await Promise.all(promises);
    matchResults.push(...chunkResults);
  }

  return matchResults;
}
