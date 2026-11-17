package com.ghosttunes.mobile.playback

import com.ghosttunes.mobile.data.db.QueueDao
import com.ghosttunes.mobile.data.db.QueueEntity
import com.ghosttunes.mobile.data.model.Track
import com.ghosttunes.mobile.data.prefs.SettingsRepository
import kotlinx.serialization.json.Json
import javax.inject.Inject
import javax.inject.Singleton

data class SavedQueue(val tracks: List<Track>, val index: Int, val positionMs: Long)

/** Last queue + position, restored on launch and for Android's media resumption. */
@Singleton
class QueueStore @Inject constructor(
    private val dao: QueueDao,
    private val settings: SettingsRepository,
    private val json: Json,
) {
    private var lastSavedIds: List<String> = emptyList()

    suspend fun save(tracks: List<Track>, index: Int, positionMs: Long) {
        val ids = tracks.map { it.id }
        if (ids != lastSavedIds) {
            dao.replace(tracks.mapIndexed { i, t -> QueueEntity(i, json.encodeToString(Track.serializer(), t)) })
            lastSavedIds = ids
        }
        settings.saveQueuePosition(index, positionMs.coerceAtLeast(0))
    }

    suspend fun load(): SavedQueue? {
        val tracks = dao.load().mapNotNull { runCatching { json.decodeFromString(Track.serializer(), it.json) }.getOrNull() }
        if (tracks.isEmpty()) return null
        lastSavedIds = tracks.map { it.id }
        val s = settings.current
        return SavedQueue(tracks, s.savedQueueIndex.coerceIn(0, tracks.lastIndex), s.savedPositionMs)
    }
}
