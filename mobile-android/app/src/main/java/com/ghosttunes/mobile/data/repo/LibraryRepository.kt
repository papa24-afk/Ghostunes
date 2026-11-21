package com.ghosttunes.mobile.data.repo

import com.ghosttunes.mobile.data.db.FollowedArtistEntity
import com.ghosttunes.mobile.data.db.HistoryEntity
import com.ghosttunes.mobile.data.db.LibraryDao
import com.ghosttunes.mobile.data.db.LikedEntity
import com.ghosttunes.mobile.data.db.PlaylistEntity
import com.ghosttunes.mobile.data.db.PlaylistTrackEntity
import com.ghosttunes.mobile.data.model.Track
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.serialization.json.Json
import javax.inject.Inject
import javax.inject.Singleton

data class UserPlaylist(val id: Long, val name: String, val count: Int, val cover: Track?, val updatedAt: Long, val customCover: String? = null)
data class FollowedArtist(val id: String, val name: String, val avatar: String)

@Singleton
class LibraryRepository @Inject constructor(
    private val dao: LibraryDao,
    private val json: Json,
    scope: CoroutineScope,
) {
    fun decode(s: String): Track? = runCatching { json.decodeFromString(Track.serializer(), s) }.getOrNull()
    fun encode(t: Track): String = json.encodeToString(Track.serializer(), t)

    val liked: Flow<List<Track>> = dao.liked().map { list -> list.mapNotNull { decode(it.json) } }
    val likedIds: StateFlow<Set<String>> = dao.likedIds().map { it.toSet() }.stateIn(scope, SharingStarted.Eagerly, emptySet())

    suspend fun toggleLike(t: Track): Boolean {
        val nowLiked = t.id !in likedIds.value
        if (nowLiked) dao.like(LikedEntity(t.id, encode(t), System.currentTimeMillis())) else dao.unlike(t.id)
        return nowLiked
    }

    suspend fun setLiked(t: Track, liked: Boolean) {
        if (liked) dao.like(LikedEntity(t.id, encode(t), System.currentTimeMillis())) else dao.unlike(t.id)
    }

    val playlists: Flow<List<UserPlaylist>> = dao.playlists().map { list ->
        list.map { UserPlaylist(it.id, it.name, it.count, it.firstJson?.let(::decode), it.updatedAt, it.cover) }
    }

    fun playlistName(id: Long): Flow<String?> = dao.playlist(id).map { it?.name }
    fun playlistCover(id: Long): Flow<String?> = dao.playlist(id).map { it?.cover }
    suspend fun setCover(id: Long, cover: String?) = dao.setCover(id, cover, System.currentTimeMillis())
    fun playlistTracks(id: Long): Flow<List<Track>> = dao.playlistTracks(id).map { l -> l.mapNotNull { decode(it.json) } }

    suspend fun createPlaylist(name: String): Long {
        val now = System.currentTimeMillis()
        return dao.createPlaylist(PlaylistEntity(name = name.trim().ifEmpty { "New playlist" }, createdAt = now, updatedAt = now))
    }

    /** Creates a playlist holding [tracks] in order. Returns its id. */
    suspend fun importPlaylist(name: String, tracks: List<Track>, cover: String? = null): Long {
        val id = createPlaylist(name)
        if (!cover.isNullOrBlank()) dao.setCover(id, cover, System.currentTimeMillis())
        tracks.forEachIndexed { i, t -> dao.addToPlaylist(PlaylistTrackEntity(id, t.id, i, encode(t))) }
        dao.touchPlaylist(id, System.currentTimeMillis())
        return id
    }

    suspend fun renamePlaylist(id: Long, name: String) = dao.renamePlaylist(id, name.trim(), System.currentTimeMillis())
    suspend fun deletePlaylist(id: Long) = dao.deletePlaylist(id)

    suspend fun addToPlaylist(id: Long, t: Track) {
        dao.addToPlaylist(PlaylistTrackEntity(id, t.id, dao.nextPosition(id), encode(t)))
        dao.touchPlaylist(id, System.currentTimeMillis())
    }

    suspend fun removeFromPlaylist(id: Long, trackId: String) {
        dao.removeFromPlaylist(id, trackId)
        dao.touchPlaylist(id, System.currentTimeMillis())
    }

    val history: Flow<List<Track>> = dao.recent(100).map { l -> l.mapNotNull { decode(it.json) } }
    fun recent(limit: Int): Flow<List<Track>> = dao.recent(limit).map { l -> l.mapNotNull { decode(it.json) } }
    suspend fun recordPlay(t: Track) = dao.addHistory(HistoryEntity(trackId = t.id, json = encode(t), playedAt = System.currentTimeMillis()))
    suspend fun mostPlayed(limit: Int): List<Track> = dao.mostPlayedJson(limit).mapNotNull { decode(it.json) }
    suspend fun clearHistory() = dao.clearHistory()

    val followed: Flow<List<FollowedArtist>> = dao.followed().map { l -> l.map { FollowedArtist(it.id, it.name, it.avatar) } }
    suspend fun follow(a: FollowedArtist) = dao.follow(FollowedArtistEntity(a.id, a.name, a.avatar, System.currentTimeMillis()))
    suspend fun unfollow(id: String) = dao.unfollow(id)
}
