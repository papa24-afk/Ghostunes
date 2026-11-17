package com.ghosttunes.mobile.data.prefs

import android.content.Context
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.ghosttunes.mobile.BuildConfig
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.runBlocking

private val Context.dataStore by preferencesDataStore("settings")

enum class FlickSensitivity(val scale: Float, val label: String) {
    Low(1.2f, "Low"), Medium(1.0f, "Medium"), High(0.85f, "High")
}

data class AppSettings(
    val serverUrl: String = BuildConfig.DEFAULT_SERVER,
    val onboarded: Boolean = false,
    val flickEnabled: Boolean = true,
    val flickSensitivity: FlickSensitivity = FlickSensitivity.Medium,
    val flickInBackground: Boolean = true,
    val lowQualityStreaming: Boolean = false,
    val lowQualityDownloads: Boolean = false,
    val autoplay: Boolean = true,
    val recentSearches: List<String> = emptyList(),
    val libraryGrid: Boolean = false,
    val librarySort: Int = 0,
    val savedQueueIndex: Int = 0,
    val savedPositionMs: Long = 0,
    val debugUnlocked: Boolean = false,
)

class SettingsRepository(private val context: Context, scope: CoroutineScope) {
    private object K {
        val server = stringPreferencesKey("server_url")
        val onboarded = booleanPreferencesKey("onboarded")
        val flick = booleanPreferencesKey("flick_enabled")
        val flickSens = intPreferencesKey("flick_sensitivity")
        val flickBg = booleanPreferencesKey("flick_background")
        val lowStream = booleanPreferencesKey("low_quality_stream")
        val lowDownload = booleanPreferencesKey("low_quality_download")
        val autoplay = booleanPreferencesKey("autoplay")
        val recent = stringPreferencesKey("recent_searches")
        val libGrid = booleanPreferencesKey("library_grid")
        val libSort = intPreferencesKey("library_sort")
        val queueIndex = intPreferencesKey("queue_index")
        val position = longPreferencesKey("queue_position")
        val debug = booleanPreferencesKey("debug_unlocked")
    }

    private fun Preferences.toSettings() = AppSettings(
        serverUrl = this[K.server] ?: BuildConfig.DEFAULT_SERVER,
        onboarded = this[K.onboarded] ?: false,
        flickEnabled = this[K.flick] ?: true,
        flickSensitivity = FlickSensitivity.entries.getOrElse(this[K.flickSens] ?: 1) { FlickSensitivity.Medium },
        flickInBackground = this[K.flickBg] ?: true,
        lowQualityStreaming = this[K.lowStream] ?: false,
        lowQualityDownloads = this[K.lowDownload] ?: false,
        autoplay = this[K.autoplay] ?: true,
        recentSearches = (this[K.recent] ?: "").split(SEP).filter { it.isNotBlank() },
        libraryGrid = this[K.libGrid] ?: false,
        librarySort = this[K.libSort] ?: 0,
        savedQueueIndex = this[K.queueIndex] ?: 0,
        savedPositionMs = this[K.position] ?: 0,
        debugUnlocked = this[K.debug] ?: false,
    )

    /** Read once at startup so the first request already knows the PC address. */
    val initial: AppSettings = runBlocking { context.dataStore.data.first().toSettings() }

    val settings: StateFlow<AppSettings> =
        context.dataStore.data.map { it.toSettings() }.stateIn(scope, SharingStarted.Eagerly, initial)

    val current: AppSettings get() = settings.value

    suspend fun setServer(url: String) = context.dataStore.edit { it[K.server] = url; it[K.onboarded] = true }
    suspend fun setFlickEnabled(v: Boolean) = context.dataStore.edit { it[K.flick] = v }
    suspend fun setFlickSensitivity(v: FlickSensitivity) = context.dataStore.edit { it[K.flickSens] = v.ordinal }
    suspend fun setFlickInBackground(v: Boolean) = context.dataStore.edit { it[K.flickBg] = v }
    suspend fun setLowQualityStreaming(v: Boolean) = context.dataStore.edit { it[K.lowStream] = v }
    suspend fun setLowQualityDownloads(v: Boolean) = context.dataStore.edit { it[K.lowDownload] = v }
    suspend fun setAutoplay(v: Boolean) = context.dataStore.edit { it[K.autoplay] = v }
    suspend fun setLibraryGrid(v: Boolean) = context.dataStore.edit { it[K.libGrid] = v }
    suspend fun setLibrarySort(v: Int) = context.dataStore.edit { it[K.libSort] = v }
    suspend fun unlockDebug() = context.dataStore.edit { it[K.debug] = true }

    suspend fun saveQueuePosition(index: Int, positionMs: Long) = context.dataStore.edit {
        it[K.queueIndex] = index
        it[K.position] = positionMs
    }

    suspend fun addRecentSearch(query: String) = context.dataStore.edit { prefs ->
        val q = query.trim()
        if (q.isEmpty()) return@edit
        val list = (prefs[K.recent] ?: "").split(SEP).filter { it.isNotBlank() && !it.equals(q, true) }
        prefs[K.recent] = (listOf(q) + list).take(12).joinToString(SEP)
    }

    suspend fun removeRecentSearch(query: String) = context.dataStore.edit { prefs ->
        prefs[K.recent] = (prefs[K.recent] ?: "").split(SEP).filter { it.isNotBlank() && it != query }.joinToString(SEP)
    }

    suspend fun clearRecentSearches() = context.dataStore.edit { it.remove(K.recent) }

    private companion object { const val SEP = "\u001F" }
}
