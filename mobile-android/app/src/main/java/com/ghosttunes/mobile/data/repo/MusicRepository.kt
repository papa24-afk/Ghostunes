package com.ghosttunes.mobile.data.repo

import com.ghosttunes.mobile.data.model.AlbumPage
import com.ghosttunes.mobile.data.model.ArtistPage
import com.ghosttunes.mobile.data.model.Feedback
import com.ghosttunes.mobile.data.model.Lyrics
import com.ghosttunes.mobile.data.model.PlaylistPage
import com.ghosttunes.mobile.data.model.SearchAll
import com.ghosttunes.mobile.data.model.Suggestions
import com.ghosttunes.mobile.data.model.Track
import com.ghosttunes.mobile.data.net.GhosttunesApi
import com.ghosttunes.mobile.data.net.ServerConfig
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.IOException
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

/** A failed call, phrased for people. */
class ServerError(message: String, cause: Throwable? = null) : Exception(message, cause)

@Singleton
class MusicRepository @Inject constructor(
    private val api: GhosttunesApi,
    private val config: ServerConfig,
    private val client: OkHttpClient,
    private val json: Json,
) {
    private val cache = ConcurrentHashMap<String, Pair<Long, Any>>()

    @Suppress("UNCHECKED_CAST")
    private suspend fun <T : Any> cached(key: String, ttlMs: Long, block: suspend () -> T): Result<T> {
        val hit = cache[key]
        if (hit != null && System.currentTimeMillis() - hit.first < ttlMs) return Result.success(hit.second as T)
        return call(block).onSuccess { cache[key] = System.currentTimeMillis() to it }
    }

    private suspend fun <T> call(block: suspend () -> T): Result<T> = try {
        Result.success(withContext(Dispatchers.IO) { block() })
    } catch (e: CancellationException) {
        throw e
    } catch (e: IOException) {
        Result.failure(ServerError("Can't reach your PC. Is Ghosttunes open and on the same Wi-Fi?", e))
    } catch (e: retrofit2.HttpException) {
        Result.failure(ServerError(if (e.code() == 404) "Not found." else "Your PC returned an error (${e.code()}).", e))
    } catch (e: Exception) {
        Result.failure(ServerError("Something went wrong loading this.", e))
    }

    fun clearCache() = cache.clear()

    suspend fun home() = cached("home", 30 * 60_000L) { api.home().tracks }
    suspend fun genre(name: String) = cached("genre:$name", 60 * 60_000L) { api.genre(name).tracks }
    suspend fun searchAll(q: String): Result<SearchAll> = cached("all:${q.lowercase()}", 10 * 60_000L) { api.searchAll(q) }
    suspend fun suggestions(q: String): Result<Suggestions> = call { api.suggestions(q) }
    suspend fun album(id: String): Result<AlbumPage> = cached("album:$id", 60 * 60_000L) { api.album(id) }
    suspend fun playlist(id: String): Result<PlaylistPage> = cached("pl:$id", 60 * 60_000L) { api.playlist(id) }
    suspend fun related(id: String) = cached("rel:$id", 60 * 60_000L) { api.related(id).tracks }

    suspend fun artist(id: String?, name: String?): Result<ArtistPage> =
        cached("artist:${id ?: name}", 60 * 60_000L) {
            if (!id.isNullOrBlank() && id.startsWith("UC")) api.artistById(id) else api.artistByName(name ?: id.orEmpty())
        }

    suspend fun avatar(name: String): Result<String?> = cached("avatar:$name", 24 * 60 * 60_000L) { api.artistAvatar(name).avatar ?: "" }
        .map { it.ifBlank { null } }

    suspend fun radio(seed: Track): Result<List<Track>> = cached("radio:${seed.id}", 5 * 60_000L) {
        api.smartRadio(seed.id, seed.title, seed.artist, seed.durationSeconds.coerceAtLeast(1)).tracks
    }

    suspend fun lyrics(t: Track): Result<Lyrics> = cached("lyrics:${t.id}", 60 * 60_000L) {
        api.lyrics(t.title, t.artist, t.album, t.durationSeconds, t.id)
    }

    suspend fun prepare(id: String) = call { api.prepare(id) }

    suspend fun feedback(t: Track, action: String, playedSec: Int, totalSec: Int) = call {
        api.feedback(Feedback(t.id, t.title, t.artist, action, playedSec, totalSec))
    }

    /** Health check against an arbitrary address (onboarding), bypassing the configured server. */
    suspend fun checkServer(baseUrl: String, timeoutMs: Long = 4000): Boolean = withContext(Dispatchers.IO) {
        val quick = client.newBuilder()
            .connectTimeout(timeoutMs, TimeUnit.MILLISECONDS)
            .readTimeout(timeoutMs, TimeUnit.MILLISECONDS)
            .callTimeout(timeoutMs, TimeUnit.MILLISECONDS)
            .build()
        runCatching {
            quick.newCall(Request.Builder().url("$baseUrl/api/health").build()).execute().use { r ->
                r.isSuccessful && r.body?.string()?.contains("\"ok\"") == true
            }
        }.getOrDefault(false)
    }

    suspend fun isServerReachable(): Boolean = checkServer(config.baseUrl.value, 3000)
}
