package com.ghosttunes.mobile.data.db

import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.RoomDatabase
import androidx.room.Transaction
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

@Entity(tableName = "liked")
data class LikedEntity(@PrimaryKey val trackId: String, val json: String, val likedAt: Long)

@Entity(tableName = "playlists")
data class PlaylistEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val name: String,
    val createdAt: Long,
    val updatedAt: Long,
    /** Custom or imported cover: a file path on this phone or an https URL. */
    val cover: String? = null,
)

@Entity(tableName = "playlist_tracks", primaryKeys = ["playlistId", "trackId"])
data class PlaylistTrackEntity(val playlistId: Long, val trackId: String, val position: Int, val json: String)

@Entity(tableName = "history")
data class HistoryEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val trackId: String,
    val json: String,
    val playedAt: Long,
)

@Entity(tableName = "downloads")
data class DownloadEntity(
    @PrimaryKey val trackId: String,
    val json: String,
    val state: String, // queued | running | done | failed
    val progress: Float,
    val bytes: Long,
    val createdAt: Long,
)

@Entity(tableName = "queue")
data class QueueEntity(@PrimaryKey val position: Int, val json: String)

@Entity(tableName = "followed_artists")
data class FollowedArtistEntity(@PrimaryKey val id: String, val name: String, val avatar: String, val followedAt: Long)

data class PlaylistSummary(val id: Long, val name: String, val updatedAt: Long, val count: Int, val firstJson: String?, val cover: String?)

@Dao
interface LibraryDao {
    // liked
    @Query("SELECT * FROM liked ORDER BY likedAt DESC") fun liked(): Flow<List<LikedEntity>>
    @Query("SELECT trackId FROM liked") fun likedIds(): Flow<List<String>>
    @Upsert suspend fun like(e: LikedEntity)
    @Query("DELETE FROM liked WHERE trackId = :id") suspend fun unlike(id: String)

    // playlists
    @Query(
        """SELECT p.id, p.name, p.updatedAt, p.cover, COUNT(t.trackId) AS count,
           (SELECT json FROM playlist_tracks WHERE playlistId = p.id ORDER BY position LIMIT 1) AS firstJson
           FROM playlists p LEFT JOIN playlist_tracks t ON t.playlistId = p.id GROUP BY p.id ORDER BY p.updatedAt DESC"""
    )
    fun playlists(): Flow<List<PlaylistSummary>>
    @Query("SELECT * FROM playlists WHERE id = :id") fun playlist(id: Long): Flow<PlaylistEntity?>
    @Query("SELECT * FROM playlist_tracks WHERE playlistId = :id ORDER BY position") fun playlistTracks(id: Long): Flow<List<PlaylistTrackEntity>>
    @Insert suspend fun createPlaylist(p: PlaylistEntity): Long
    @Query("UPDATE playlists SET name = :name, updatedAt = :now WHERE id = :id") suspend fun renamePlaylist(id: Long, name: String, now: Long)
    @Query("DELETE FROM playlists WHERE id = :id") suspend fun deletePlaylistRow(id: Long)
    @Query("DELETE FROM playlist_tracks WHERE playlistId = :id") suspend fun clearPlaylist(id: Long)
    @Query("SELECT COALESCE(MAX(position), -1) + 1 FROM playlist_tracks WHERE playlistId = :id") suspend fun nextPosition(id: Long): Int
    @Insert(onConflict = OnConflictStrategy.IGNORE) suspend fun addToPlaylist(e: PlaylistTrackEntity)
    @Query("DELETE FROM playlist_tracks WHERE playlistId = :id AND trackId = :trackId") suspend fun removeFromPlaylist(id: Long, trackId: String)
    @Query("UPDATE playlists SET updatedAt = :now WHERE id = :id") suspend fun touchPlaylist(id: Long, now: Long)
    @Query("UPDATE playlists SET cover = :cover, updatedAt = :now WHERE id = :id") suspend fun setCover(id: Long, cover: String?, now: Long)

    @Transaction
    suspend fun deletePlaylist(id: Long) {
        clearPlaylist(id)
        deletePlaylistRow(id)
    }

    // history
    @Insert suspend fun addHistory(e: HistoryEntity)
    @Query(
        """SELECT * FROM history WHERE id IN (SELECT MAX(id) FROM history GROUP BY trackId)
           ORDER BY playedAt DESC LIMIT :limit"""
    )
    fun recent(limit: Int): Flow<List<HistoryEntity>>
    @Query("SELECT json, COUNT(*) AS c FROM history GROUP BY trackId ORDER BY c DESC LIMIT :limit")
    suspend fun mostPlayedJson(limit: Int): List<JsonCount>
    @Query("DELETE FROM history") suspend fun clearHistory()

    // followed artists
    @Query("SELECT * FROM followed_artists ORDER BY followedAt DESC") fun followed(): Flow<List<FollowedArtistEntity>>
    @Upsert suspend fun follow(e: FollowedArtistEntity)
    @Query("DELETE FROM followed_artists WHERE id = :id") suspend fun unfollow(id: String)
}

data class JsonCount(val json: String, val c: Int)

@Dao
interface DownloadDao {
    @Query("SELECT * FROM downloads ORDER BY createdAt DESC") fun all(): Flow<List<DownloadEntity>>
    @Query("SELECT * FROM downloads WHERE trackId = :id") suspend fun get(id: String): DownloadEntity?
    @Upsert suspend fun upsert(e: DownloadEntity)
    @Query("UPDATE downloads SET state = :state, progress = :progress, bytes = :bytes WHERE trackId = :id")
    suspend fun update(id: String, state: String, progress: Float, bytes: Long)
    @Query("DELETE FROM downloads WHERE trackId = :id") suspend fun delete(id: String)
    @Query("DELETE FROM downloads") suspend fun deleteAll()
}

@Dao
interface QueueDao {
    @Query("SELECT * FROM queue ORDER BY position") suspend fun load(): List<QueueEntity>
    @Query("DELETE FROM queue") suspend fun clear()
    @Insert suspend fun insertAll(items: List<QueueEntity>)

    @Transaction
    suspend fun replace(items: List<QueueEntity>) {
        clear()
        insertAll(items)
    }
}

@Database(
    entities = [
        LikedEntity::class, PlaylistEntity::class, PlaylistTrackEntity::class, HistoryEntity::class,
        DownloadEntity::class, QueueEntity::class, FollowedArtistEntity::class,
    ],
    version = 2,
    exportSchema = true,
)
abstract class AppDatabase : RoomDatabase() {
    companion object {
        val MIGRATION_1_2 = object : androidx.room.migration.Migration(1, 2) {
            override fun migrate(db: androidx.sqlite.db.SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE playlists ADD COLUMN cover TEXT")
            }
        }
    }

    abstract fun library(): LibraryDao
    abstract fun downloads(): DownloadDao
    abstract fun queue(): QueueDao
}
