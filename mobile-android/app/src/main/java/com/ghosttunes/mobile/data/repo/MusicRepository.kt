package com.ghosttunes.mobile.data.repo

import com.ghosttunes.mobile.data.direct.DirectSource
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
import com.ghosttunes.mobile.data.prefs.SettingsRepository
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.IOException
import java.net.UnknownHostException
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

/** A failed call, phrased for people. */
class ServerError(message: String, cause: Throwable? = null) : Exception(message, cause)

const val BLOCKED_MESSAGE = "This network is blocking music. Try mobile data or another Wi-Fi."

/** True when YouTube refused anonymous access from this IP ("Sign in to confirm you're not a bot"). */
fun Throwable.isYouTubeBlock(): Boolean {
    var t: Throwable? = this
    while (t != null) {
        val name = t.javaClass.simpleName
        if (name == "SignInConfirmNotBotException" || name == "ReCaptchaException") return true
        if (t.message?.contains("confirm you", ignoreCase = true) == true && t.message?.contains("bot", ignoreCase = true) == true) return true
        t = t.cause
    }
    return false
}

/**
 * Music catalogue. By default everything comes straight from YouTube Music on this phone
 * ([DirectSource]); the PC's Ghosttunes server is the fallback (or the primary, if the user picks it).
 */
@Singleton
class MusicRepository @Inject constructor(
    private val api: GhosttunesApi,
    private val config: ServerConfig,
    private val client: OkHttpClient,
    private val direct: DirectSource,
    private val settings: SettingsRepository,
) {
    private val cache = ConcurrentHashMap<String, Pair<Long, Any>>()
    private val phoneFirst get() = settings.current.streamFromPhone

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
    } catch (e: Throwable) {
        Result.failure(describe(e))
    }

    private fun describe(e: Throwable): ServerError = when {
        e is ServerError -> e
        e.isYouTubeBlock() -> ServerError(BLOCKED_MESSAGE, e)
        e is UnknownHostException -> ServerError("No internet connection.", e)
        e is retrofit2.HttpException -> ServerError(if (e.code() == 404) "Not found." else "Your PC returned an error (${e.code()}).", e)
        e is IOException -> ServerError(if (phoneFirst) "Couldn't load this." else "Can't reach your PC. Is Ghosttunes open and on the same Wi-Fi?", e)
        else -> ServerError("Something went wrong loading this.", e)
    }

    /** Primary source first (phone or PC, per settings), the other one if it fails. */
    private suspend fun <T> either(onPhone: () -> T, onPc: suspend () -> T): T {
        val first: suspend () -> T = if (phoneFirst) ({ onPhone() }) else onPc
        val second: suspend () -> T = if (phoneFirst) onPc else ({ onPhone() })
        return try {
            first()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Throwable) {
            try { second() } catch (e2: CancellationException) { throw e2 } catch (_: Throwable) { throw e }
        }
    }

    fun clearCache() = cache.clear()

    suspend fun home() = cached("home", 30 * 60_000L) { either({ direct.songs("Trending Hits", 25) }, { api.home().tracks }) }
    suspend fun genre(name: String) = cached("genre:$name", 60 * 60_000L) { either({ direct.songs(name, 30) }, { api.genre(name).tracks }) }
    suspend fun searchAll(q: String): Result<SearchAll> = cached("all:${q.lowercase()}", 10 * 60_000L) { either({ direct.searchAll(q) }, { api.searchAll(q) }) }
    suspend fun suggestions(q: String): Result<Suggestions> = call { either({ direct.suggestions(q) }, { api.suggestions(q) }) }
    suspend fun album(id: String): Result<AlbumPage> = cached("album:$id", 60 * 60_000L) {
        // PC album ids are YouTube Music browse ids (MPREb_…); phone ids are album playlist ids (OLAK…).
        if (id.startsWith("MPREb")) either({ throw IOException("browse id") }, { api.album(id) }) else either({ direct.album(id) }, { api.album(id) })
    }
    suspend fun playlist(id: String): Result<PlaylistPage> = cached("pl:$id", 60 * 60_000L) { either({ direct.playlist(id) }, { api.playlist(id) }) }

    suspend fun artist(id: String?, name: String?): Result<ArtistPage> = cached("artist:${id ?: name}", 60 * 60_000L) {
        either(
            { direct.artist(id, name ?: id.orEmpty()) },
            { if (!id.isNullOrBlank() && id.startsWith("UC")) api.artistById(id) else api.artistByName(name ?: id.orEmpty()) },
        )
    }

    suspend fun avatar(name: String): Result<String?> = cached("avatar:$name", 24 * 60 * 60_000L) {
        either({ direct.avatar(name).orEmpty() }, { api.artistAvatar(name).avatar.orEmpty() })
    }.map { it.ifBlank { null } }

    suspend fun radio(seed: Track): Result<List<Track>> = cached("radio:${seed.id}", 5 * 60_000L) {
        either(
            { direct.radio(seed) },
            { api.smartRadio(seed.id, seed.title, seed.artist, seed.durationSeconds.coerceAtLeast(1)).tracks },
        )
    }

    suspend fun lyrics(t: Track): Result<Lyrics> = cached("lyrics:${t.id}", 60 * 60_000L) {
        either({ direct.lyrics(t) }, { api.lyrics(t.title, t.artist, t.album, t.durationSeconds, t.id) })
    }

    /** Warm the stream for the next track so the transition is instant. */
    suspend fun prepare(id: String) = call {
        if (phoneFirst) runCatching { direct.stream(id, settings.current.lowQualityStreaming) }.getOrElse { api.prepare(id) }
        else api.prepare(id)
    }

    /** Taste feedback only exists on the PC; ignore failures. */
    suspend fun feedback(t: Track, action: String, playedSec: Int, totalSec: Int) = call {
        api.feedback(Feedback(t.id, t.title, t.artist, action, playedSec, totalSec))
    }

    /** Health check against an arbitrary address (Settings → Your PC), bypassing the configured server. */
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
