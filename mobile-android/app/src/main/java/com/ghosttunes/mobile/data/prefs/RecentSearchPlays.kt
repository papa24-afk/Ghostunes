package com.ghosttunes.mobile.data.prefs

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.ghosttunes.mobile.data.model.Track
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import javax.inject.Inject
import javax.inject.Singleton

private val Context.recentPlaysStore by preferencesDataStore("recent_search_plays")

/** Songs the user played from search, newest first ("From recent searches" on the Search screen). */
@Singleton
class RecentSearchPlays @Inject constructor(
    @ApplicationContext private val context: Context,
    private val json: Json,
) {
    private val key = stringPreferencesKey("tracks")
    private val serializer = ListSerializer(Track.serializer())

    val tracks: Flow<List<Track>> = context.recentPlaysStore.data.map { prefs -> decode(prefs[key]) }

    suspend fun add(track: Track) = context.recentPlaysStore.edit { prefs ->
        val list = decode(prefs[key]).filter { it.id != track.id }
        prefs[key] = json.encodeToString(serializer, (listOf(track) + list).take(MAX))
    }

    suspend fun clear() = context.recentPlaysStore.edit { it.remove(key) }

    private fun decode(raw: String?): List<Track> =
        if (raw.isNullOrBlank()) emptyList() else runCatching { json.decodeFromString(serializer, raw) }.getOrDefault(emptyList())

    companion object {
        const val MAX = 15
    }
}
