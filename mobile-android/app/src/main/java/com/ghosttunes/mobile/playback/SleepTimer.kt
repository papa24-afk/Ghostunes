package com.ghosttunes.mobile.playback

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import javax.inject.Inject
import javax.inject.Singleton

sealed interface SleepTimerState {
    data object Off : SleepTimerState
    data class At(val endsAtElapsed: Long, val minutes: Int) : SleepTimerState
    data object EndOfTrack : SleepTimerState
}

/** Shared between the UI (sets it) and PlaybackService (acts on it). Same process. */
@Singleton
class SleepTimer @Inject constructor() {
    private val _state = MutableStateFlow<SleepTimerState>(SleepTimerState.Off)
    val state: StateFlow<SleepTimerState> = _state

    fun set(minutes: Int) {
        _state.value = SleepTimerState.At(android.os.SystemClock.elapsedRealtime() + minutes * 60_000L, minutes)
    }

    fun endOfTrack() { _state.value = SleepTimerState.EndOfTrack }
    fun cancel() { _state.value = SleepTimerState.Off }
}
