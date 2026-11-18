package com.ghosttunes.mobile.data.direct

import com.ghosttunes.mobile.data.model.Track
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.longOrNull
import okhttp3.Request
import java.io.IOException
import java.util.concurrent.atomic.AtomicInteger
import kotlin.math.abs
import kotlin.math.max

/**
 * Imports public playlists from Spotify, Deezer, Apple Music and YouTube Music links, on the phone,
 * the same way the desktop app does (serverPlaylistImport.js), then matches each song on YouTube Music.
 */
class PlaylistImporter(private val direct: DirectSource, private val json: Json) {

    enum class Platform(val label: String) { Spotify("Spotify"), Deezer("Deezer"), Apple("Apple Music"), YouTube("YouTube") }

    data class Source(val title: String, val artist: String, val durationSeconds: Int)

    data class Resolved(val platform: Platform, val title: String, val author: String, val sources: List<Source>, val ready: List<Track> = emptyList())

    data class Result(val title: String, val platform: Platform, val tracks: List<Track>, val total: Int, val unmatched: List<Source>)

    class ImportException(message: String) : IOException(message)

    private val browserUa = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"

    fun platformOf(link: String): Platform? {
        val s = link.trim()
        return when {
            s.contains("spotify.com") || s.contains("spotify.link") || s.startsWith("spotify:") -> Platform.Spotify
            s.contains("deezer.com") || s.contains("deezer.page.link") || s.contains("dzr.page.link") -> Platform.Deezer
            s.contains("music.apple.com") || s.contains("apple.co") -> Platform.Apple
            s.contains("youtube.com") || s.contains("youtu.be") -> Platform.YouTube
            else -> null
        }
    }

    private fun get(url: String): Pair<String, String> =
        direct.client.newCall(Request.Builder().url(url).header("User-Agent", browserUa).header("Accept-Language", "en").build()).execute().use { r ->
            if (r.code == 404) throw ImportException("This playlist doesn't exist or is private.")
            if (!r.isSuccessful) throw ImportException("Couldn't open this link (HTTP ${r.code}).")
            (r.body?.string().orEmpty()) to r.request.url.toString()
        }

    private fun JsonElement?.obj() = this as? JsonObject
    private fun JsonElement?.arr() = this as? JsonArray
    private fun JsonElement?.str() = (this as? JsonPrimitive)?.contentOrNull
    private fun JsonElement?.num() = (this as? JsonPrimitive)?.longOrNull
    private operator fun JsonElement?.get(key: String): JsonElement? = obj()?.get(key)

    fun resolve(link: String): Resolved {
        val s = link.trim()
        return when (platformOf(s)) {
            Platform.Spotify -> spotify(s)
            Platform.Deezer -> deezer(s)
            Platform.Apple -> apple(s)
            Platform.YouTube -> youtube(s)
            null -> throw ImportException("Paste a playlist link from Spotify, Apple Music, Deezer or YouTube.")
        }
    }

    private fun spotify(link: String): Resolved {
        var id = Regex("""playlist[/:]([A-Za-z0-9]+)""").find(link)?.groupValues?.get(1)
        if (id == null && link.contains("spotify.link")) {
            val (_, finalUrl) = get(link)
            id = Regex("""playlist/([A-Za-z0-9]+)""").find(finalUrl)?.groupValues?.get(1)
        }
        id ?: throw ImportException("That Spotify link isn't a playlist.")
        val (html, _) = get("https://open.spotify.com/embed/playlist/$id")
        val data = Regex("""<script id="__NEXT_DATA__" type="application/json">([\s\S]+?)</script>""").find(html)?.groupValues?.get(1)
            ?: throw ImportException("Couldn't read this Spotify playlist. Make sure it's public.")
        val entity = json.parseToJsonElement(data)["props"]["pageProps"]["state"]["data"]["entity"]
            ?: throw ImportException("Couldn't read this Spotify playlist. Make sure it's public.")
        val sources = entity["trackList"].arr().orEmpty().mapNotNull { t ->
            val title = t["title"].str() ?: return@mapNotNull null
            Source(title, t["subtitle"].str().orEmpty(), ((t["duration"].num() ?: 0) / 1000).toInt())
        }
        return Resolved(Platform.Spotify, entity["name"].str() ?: entity["title"].str() ?: "Spotify playlist",
            entity["authors"].arr()?.mapNotNull { it["name"].str() }?.joinToString().orEmpty(), sources)
    }

    private fun deezer(link: String): Resolved {
        var id = Regex("""playlist/(\d+)""").find(link)?.groupValues?.get(1)
        if (id == null) {
            val (_, finalUrl) = get(link) // short links redirect to deezer.com/.../playlist/<id>
            id = Regex("""playlist/(\d+)""").find(finalUrl)?.groupValues?.get(1)
        }
        id ?: throw ImportException("That Deezer link isn't a playlist.")
        val (body, _) = get("https://api.deezer.com/playlist/$id")
        val root = json.parseToJsonElement(body)
        root["error"]?.let { throw ImportException("This Deezer playlist is private or doesn't exist.") }
        val sources = mutableListOf<Source>()
        fun add(items: JsonArray?) = items.orEmpty().forEach { t ->
            val title = t["title"].str() ?: return@forEach
            sources += Source(title, t["artist"]["name"].str().orEmpty(), (t["duration"].num() ?: 0).toInt())
        }
        add(root["tracks"]["data"].arr())
        var next = root["tracks"]["next"].str()
        var guard = 0
        while (next != null && guard++ < 20) {
            val page = json.parseToJsonElement(get(next).first)
            add(page["data"].arr())
            next = page["next"].str()
        }
        return Resolved(Platform.Deezer, root["title"].str() ?: "Deezer playlist", root["creator"]["name"].str().orEmpty(), sources)
    }

    private fun apple(link: String): Resolved {
        val (html, _) = get(link)
        val title = Regex("""<meta property="og:title" content="([^"]+)"""").find(html)?.groupValues?.get(1)
            ?.replace("&amp;", "&")?.replace(" on Apple Music", "")?.trim() ?: "Apple Music playlist"
        val data = Regex("""<script[^>]*id="serialized-server-data"[^>]*>([\s\S]*?)</script>""").find(html)?.groupValues?.get(1)
            ?: throw ImportException("Couldn't read this Apple Music playlist. Make sure it's public.")
        val root = json.parseToJsonElement(data)
        val first = root.arr()?.firstOrNull() ?: root["data"].arr()?.firstOrNull()
        val sections = (first["data"]["sections"] ?: root["data"].arr()?.firstOrNull()["data"]["sections"]).arr().orEmpty()
        val sources = sections.filter { it["itemKind"].str() == "trackLockup" }.flatMap { sec ->
            sec["items"].arr().orEmpty().mapNotNull { t ->
                val name = t["title"].str() ?: return@mapNotNull null
                Source(name, t["artistName"].str().orEmpty(), ((t["duration"].num() ?: 0) / 1000).toInt())
            }
        }
        return Resolved(Platform.Apple, title, "Apple Music", sources)
    }

    private fun youtube(link: String): Resolved {
        val id = Regex("""[?&]list=([\w-]+)""").find(link)?.groupValues?.get(1) ?: throw ImportException("That YouTube link isn't a playlist.")
        val page = direct.playlist(id)
        return Resolved(Platform.YouTube, page.title, page.author, emptyList(), page.tracks)
    }

    // ------------------------------------------------------------------ matching

    private fun norm(s: String) = s.lowercase()
        .replace(Regex("""[(\[{].*?[)\]}]"""), " ")
        .replace(Regex("""\b(feat|ft|featuring|with)\b.*"""), " ")
        .replace(Regex("""[^\p{L}\p{N} ]"""), " ")
        .replace(Regex("""\s+"""), " ").trim()

    /** Dice coefficient on character bigrams (0..1). */
    fun similarity(a: String, b: String): Double {
        val x = norm(a).replace(" ", "")
        val y = norm(b).replace(" ", "")
        if (x.isEmpty() || y.isEmpty()) return 0.0
        if (x == y) return 1.0
        if (x.length < 2 || y.length < 2) return 0.0
        val bx = x.windowed(2).groupingBy { it }.eachCount().toMutableMap()
        var hits = 0
        for (g in y.windowed(2)) { val c = bx[g] ?: 0; if (c > 0) { hits++; bx[g] = c - 1 } }
        return 2.0 * hits / (x.length - 1 + y.length - 1)
    }

    private fun score(src: Source, cand: Track): Double {
        val title = max(similarity(src.title, cand.title), if (norm(cand.title).contains(norm(src.title))) 0.9 else 0.0)
        val srcArtist = src.artist.split(',', '&').first().trim()
        val artist = if (srcArtist.isBlank()) 0.5 else max(similarity(srcArtist, cand.artist), if (norm(cand.artist).contains(norm(srcArtist))) 1.0 else 0.0)
        val dur = if (src.durationSeconds <= 0 || cand.durationSeconds <= 0) 0.5
        else (1.0 - abs(src.durationSeconds - cand.durationSeconds) / 30.0).coerceIn(0.0, 1.0)
        return 0.55 * title + 0.3 * artist + 0.15 * dur
    }

    suspend fun match(resolved: Resolved, onProgress: (done: Int, total: Int) -> Unit): Result = withContext(Dispatchers.IO) {
        if (resolved.ready.isNotEmpty()) {
            onProgress(resolved.ready.size, resolved.ready.size)
            return@withContext Result(resolved.title, resolved.platform, resolved.ready, resolved.ready.size, emptyList())
        }
        val total = resolved.sources.size
        if (total == 0) throw ImportException("This playlist has no songs, or it's private.")
        val done = AtomicInteger(0)
        val gate = Semaphore(5)
        val matches = coroutineScope {
            resolved.sources.map { src ->
                async {
                    gate.withPermit {
                        val q = "${norm(src.title)} ${src.artist.split(',', '&').first().trim()}"
                        val best = runCatching { direct.songs(q, 6) }.getOrDefault(emptyList())
                            .map { it to score(src, it) }.maxByOrNull { it.second }
                        onProgress(done.incrementAndGet(), total)
                        best?.takeIf { it.second >= 0.55 }?.first
                    }
                }
            }.awaitAll()
        }
        val tracks = matches.filterNotNull().distinctBy { it.id }
        val unmatched = resolved.sources.filterIndexed { i, _ -> matches[i] == null }
        if (tracks.isEmpty()) throw ImportException("Couldn't match any songs from this playlist.")
        Result(resolved.title, resolved.platform, tracks, total, unmatched)
    }
}
