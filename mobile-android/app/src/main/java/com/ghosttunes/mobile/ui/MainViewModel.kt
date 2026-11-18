package com.ghosttunes.mobile.ui

import android.content.Context
import android.content.Intent
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.ghosttunes.mobile.data.model.Track
import com.ghosttunes.mobile.data.prefs.SettingsRepository
import com.ghosttunes.mobile.data.repo.LibraryRepository
import com.ghosttunes.mobile.data.repo.MusicRepository
import com.ghosttunes.mobile.data.repo.UserPlaylist
import com.ghosttunes.mobile.download.DownloadItem
import com.ghosttunes.mobile.download.DownloadRepository
import com.ghosttunes.mobile.handoff.HandoffCoordinator
import com.ghosttunes.mobile.handoff.HandoffStatus
import com.ghosttunes.mobile.playback.PlaybackConnection
import com.ghosttunes.mobile.playback.PlayerState
import com.ghosttunes.mobile.playback.Progress
import com.ghosttunes.mobile.playback.SleepTimer
import com.ghosttunes.mobile.playback.SleepTimerState
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

/** One-off messages ("Added to queue"). */
data class Snack(val text: String, val id: Long = System.nanoTime())

@HiltViewModel
class MainViewModel @Inject constructor(
    private val context: Context,
    val playback: PlaybackConnection,
    private val library: LibraryRepository,
    private val downloads: DownloadRepository,
    private val music: MusicRepository,
    val settings: SettingsRepository,
    private val handoff: HandoffCoordinator,
    private val sleep: SleepTimer,
    private val api: com.ghosttunes.mobile.data.net.GhosttunesApi,
    audioOutput: com.ghosttunes.mobile.playback.AudioOutput,
    pcLink: com.ghosttunes.mobile.handoff.PcLink,
) : ViewModel() {
    private val pcLinkFlow = pcLink.via
    /** Bluetooth headset / speaker, headphones, or the phone speaker. */
    val output: StateFlow<com.ghosttunes.mobile.playback.OutputDevice> = audioOutput.current
    val coordinator: HandoffCoordinator get() = handoff
    val remote: StateFlow<com.ghosttunes.mobile.handoff.RemoteState?> = handoff.remote
    fun remoteToggle() = handoff.remoteToggle()
    fun remoteNext() = handoff.remoteNext()
    fun remotePrevious() = handoff.remotePrevious()
    fun remoteSeek(ms: Long) = handoff.remoteSeek(ms / 1000.0)
    fun continueOnPhone() = handoff.continueOnPhone()
    val devices = handoff.devices
    fun selectDevice(d: com.ghosttunes.mobile.data.model.Device) = handoff.selectDevice(d)
    val phoneName: String get() = handoff.deviceName
    val linkVia: StateFlow<com.ghosttunes.mobile.handoff.PcLink.Via?> get() = pcLinkFlow
    val player: StateFlow<PlayerState> = playback.state
    val progress: StateFlow<Progress> = playback.progress
    val likedIds: StateFlow<Set<String>> = library.likedIds
    val downloadStates: StateFlow<Map<String, DownloadItem>> = downloads.states
    val handoffStatus: StateFlow<HandoffStatus?> = handoff.status
    val sleepTimer: StateFlow<SleepTimerState> = sleep.state
    val playlists: StateFlow<List<UserPlaylist>> = library.playlists.stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

    private val _snack = MutableStateFlow<Snack?>(null)
    val snack = _snack.asStateFlow()
    fun snack(text: String) { _snack.value = Snack(text) }

    /** What the current queue was started from ("No Sign Of Weakness", "Search", "City Boys Radio"). */
    private val _context = MutableStateFlow("")
    val playingFrom = _context.asStateFlow()

    fun play(tracks: List<Track>, index: Int = 0, from: String = "", shuffle: Boolean = false) {
        if (tracks.isEmpty()) return
        _context.value = from
        playback.play(tracks, if (shuffle) (tracks.indices).random() else index, 0, shuffle)
    }

    fun playNext(t: Track) { playback.playNext(t); snack("Playing next") }
    fun addToQueue(tracks: List<Track>) { playback.addToQueue(tracks); snack(if (tracks.size == 1) "Added to queue" else "Added ${tracks.size} songs to queue") }

    fun toggleLike(t: Track) = viewModelScope.launch {
        val liked = library.toggleLike(t)
        snack(if (liked) "Added to Liked Songs" else "Removed from Liked Songs")
    }

    fun download(tracks: List<Track>) = viewModelScope.launch {
        downloads.enqueue(tracks)
        snack(if (tracks.size == 1) "Downloading" else "Downloading ${tracks.size} songs")
    }

    fun removeDownload(id: String) = viewModelScope.launch { downloads.remove(id); snack("Removed download") }

    fun startRadio(seed: Track) = viewModelScope.launch {
        snack("Starting radio")
        music.radio(seed).onSuccess { list ->
            play(listOf(seed) + list.filter { it.id != seed.id }, 0, from = "${seed.title} Radio")
        }.onFailure { snack(it.message ?: "Couldn't start radio") }
    }

    fun addToPlaylist(id: Long, t: Track, name: String) = viewModelScope.launch {
        library.addToPlaylist(id, t)
        snack("Added to $name")
    }

    fun removeFromPlaylist(id: Long, t: Track) = viewModelScope.launch {
        library.removeFromPlaylist(id, t.id)
        snack("Removed from playlist")
    }

    fun createPlaylistWith(name: String, t: Track?) = viewModelScope.launch {
        val id = library.createPlaylist(name)
        if (t != null) library.addToPlaylist(id, t)
        snack(if (t != null) "Added to $name" else "Created $name")
    }

    fun handoff() = handoff.trigger("button")

    suspend fun desktopState() = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) { api.desktop() }

    fun setSleep(minutes: Int) { sleep.set(minutes); snack("Sleep timer: $minutes min") }
    fun sleepEndOfTrack() { sleep.endOfTrack(); snack("Sleep timer: end of song") }
    fun cancelSleep() { sleep.cancel(); snack("Sleep timer off") }

    fun share(t: Track) {
        val text = "${t.title} · ${t.artist}"
        val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text)
        context.startActivity(Intent.createChooser(send, "Share").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    fun lyricsFlow(t: Track): Flow<Result<com.ghosttunes.mobile.data.model.Lyrics>> = kotlinx.coroutines.flow.flow { emit(music.lyrics(t)) }
}
