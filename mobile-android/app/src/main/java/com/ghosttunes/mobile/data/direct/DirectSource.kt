package com.ghosttunes.mobile.data.direct

import com.ghosttunes.mobile.data.model.AlbumPage
import com.ghosttunes.mobile.data.model.AlbumRef
import com.ghosttunes.mobile.data.model.ArtistPage
import com.ghosttunes.mobile.data.model.ArtistRef
import com.ghosttunes.mobile.data.model.Lyrics
import com.ghosttunes.mobile.data.model.PlaylistPage
import com.ghosttunes.mobile.data.model.PlaylistRef
import com.ghosttunes.mobile.data.model.SearchAll
import com.ghosttunes.mobile.data.model.Suggestions
import com.ghosttunes.mobile.data.model.TopResult
import com.ghosttunes.mobile.data.model.Track
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.jsonObject
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.schabi.newpipe.extractor.InfoItem
import org.schabi.newpipe.extractor.MediaFormat
import org.schabi.newpipe.extractor.NewPipe
import org.schabi.newpipe.extractor.ServiceList
import org.schabi.newpipe.extractor.channel.ChannelInfoItem
import org.schabi.newpipe.extractor.downloader.Downloader
import org.schabi.newpipe.extractor.downloader.Response
import org.schabi.newpipe.extractor.exceptions.ReCaptchaException
import org.schabi.newpipe.extractor.localization.ContentCountry
import org.schabi.newpipe.extractor.localization.Localization
import org.schabi.newpipe.extractor.playlist.PlaylistInfo
import org.schabi.newpipe.extractor.playlist.PlaylistInfoItem
import org.schabi.newpipe.extractor.services.youtube.YoutubeParsingHelper
import org.schabi.newpipe.extractor.services.youtube.linkHandler.YoutubeSearchQueryHandlerFactory
import org.schabi.newpipe.extractor.stream.DeliveryMethod
import org.schabi.newpipe.extractor.stream.StreamInfo
import org.schabi.newpipe.extractor.stream.StreamInfoItem
import java.io.IOException
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicLong

const val DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:153.0) Gecko/20100101 Firefox/153.0"

/** NewPipeExtractor's HTTP layer on OkHttp. */
class NewPipeDownloader(private val client: OkHttpClient) : Downloader() {
    override fun execute(request: org.schabi.newpipe.extractor.downloader.Request): Response {
        val body = request.dataToSend()
        val builder = Request.Builder()
            .url(request.url())
            .method(request.httpMethod(), body?.toRequestBody(null) ?: if (request.httpMethod() == "POST") ByteArray(0).toRequestBody(null) else null)
            .header("User-Agent", DESKTOP_UA)
        request.headers().forEach { (name, values) ->
            builder.removeHeader(name)
            values.forEach { builder.addHeader(name, it) }
        }
        client.newCall(builder.build()).execute().use { r ->
            if (r.code == 429) throw ReCaptchaException("reCaptcha challenge requested", request.url())
            return Response(r.code, r.message, r.headers.toMultimap(), r.body?.string(), r.request.url.toString())
        }
    }
}

/**
 * Makes YouTube's progressive audio URLs behave the way NewPipe's player requests them:
 * POST with a 2-byte body, a request number, a matching user agent, web headers for web-client URLs.
 * The Range header from ExoPlayer is kept.
 */
class YouTubeStreamInterceptor : Interceptor {
    private val requestNumber = AtomicLong(0)

    override fun intercept(chain: Interceptor.Chain): okhttp3.Response {
        val req = chain.request()
        val url = req.url
        if (!url.host.endsWith("googlevideo.com") || !url.encodedPath.startsWith("/videoplayback")) return chain.proceed(req)
        val full = url.toString().let { if (it.contains("&rn=")) it else it + "&rn=" + requestNumber.getAndIncrement() }
        val b = req.newBuilder()
            .url(full.toHttpUrl())
            .post(byteArrayOf(0x78, 0).toRequestBody("application/octet-stream".toMediaType()))
            .header("User-Agent", if (YoutubeParsingHelper.isVisionOsStreamingUrl(full)) YoutubeParsingHelper.getVisionOsUserAgent(null) else DESKTOP_UA)
            .header("TE", "trailers")
            .header("Accept-Encoding", "identity")
        if (YoutubeParsingHelper.isWebStreamingUrl(full)) {
            b.header("Origin", "https://www.youtube.com")
                .header("Referer", "https://www.youtube.com")
                .header("Sec-Fetch-Dest", "empty")
                .header("Sec-Fetch-Mode", "cors")
                .header("Sec-Fetch-Site", "cross-site")
        }
        return chain.proceed(b.build())
    }
}

data class ResolvedStream(val url: String, val mimeType: String, val bitrate: Int, val expiresAtMs: Long, val contentLength: Long)

/**
 * Searches and streams YouTube Music directly from this device (no PC). Pure JVM: no Android types,
 * so it's exercised on the PC by DirectSourceProbeTest.
 */
class DirectSource(baseClient: OkHttpClient, private val json: Json) {
    val client: OkHttpClient = baseClient.newBuilder().readTimeout(30, TimeUnit.SECONDS).build()
    private val yt get() = ServiceList.YouTube
    private val streams = ConcurrentHashMap<String, ResolvedStream>()

    init {
        synchronized(DirectSource::class.java) {
            if (!initialized) {
                NewPipe.init(NewPipeDownloader(client), Localization("en", "US"), ContentCountry("GH"))
                initialized = true
            }
        }
    }

    // ------------------------------------------------------------------ mapping

    private fun idFromUrl(url: String?): String? {
        if (url == null) return null
        Regex("""[?&]v=([\w-]{11})""").find(url)?.let { return it.groupValues[1] }
        Regex("""youtu\.be/([\w-]{11})""").find(url)?.let { return it.groupValues[1] }
        return null
    }

    private fun listId(url: String?) = url?.let { Regex("""[?&]list=([\w-]+)""").find(it)?.groupValues?.get(1) }
    private fun channelId(url: String?) = url?.let { Regex("""/channel/([\w-]+)""").find(it)?.groupValues?.get(1) }

    private fun best(images: List<org.schabi.newpipe.extractor.Image>?): String =
        images.orEmpty().maxByOrNull { it.width.coerceAtLeast(it.height) }?.url.orEmpty()

    private fun cleanArtist(name: String?): String = name.orEmpty().removeSuffix(" - Topic").trim().ifBlank { "Unknown Artist" }

    private fun fmt(sec: Long): String = if (sec <= 0) "" else "%d:%02d".format(sec / 60, sec % 60)

    fun toTrack(item: StreamInfoItem, album: String = ""): Track? {
        val id = idFromUrl(item.url) ?: return null
        val sec = item.duration
        return Track(
            id = id,
            title = item.name.orEmpty(),
            artist = cleanArtist(item.uploaderName),
            artistId = channelId(item.uploaderUrl),
            album = album,
            duration = fmt(sec),
            durationSeconds = sec.coerceAtLeast(0).toInt(),
            thumbnail = best(item.thumbnails).ifBlank { "https://i.ytimg.com/vi/$id/hqdefault.jpg" },
            source = "youtube",
        )
    }

    private fun search(query: String, filter: String, max: Int): List<InfoItem> {
        val extractor = yt.getSearchExtractor(query, listOf(filter), "")
        extractor.fetchPage()
        val out = mutableListOf<InfoItem>()
        var page = extractor.initialPage
        out += page.items
        var guard = 0
        while (out.size < max && page.hasNextPage() && guard++ < 2) {
            page = extractor.getPage(page.nextPage)
            out += page.items
        }
        return out.take(max)
    }

    // ------------------------------------------------------------------ catalogue

    fun songs(query: String, max: Int = 30): List<Track> =
        search(query, YoutubeSearchQueryHandlerFactory.MUSIC_SONGS, max).filterIsInstance<StreamInfoItem>().mapNotNull { toTrack(it) }

    fun suggestions(query: String): Suggestions = Suggestions(yt.suggestionExtractor.suggestionList(query).take(8))

    fun searchAll(query: String): SearchAll {
        val songs = runCatching { songs(query, 20) }.getOrDefault(emptyList())
        val artists = runCatching {
            search(query, YoutubeSearchQueryHandlerFactory.MUSIC_ARTISTS, 10).filterIsInstance<ChannelInfoItem>().mapNotNull { c ->
                val id = channelId(c.url) ?: return@mapNotNull null
                ArtistRef(id, c.name.orEmpty(), best(c.thumbnails), "Artist")
            }
        }.getOrDefault(emptyList())
        val albums = runCatching { albums(query, 10) }.getOrDefault(emptyList())
        val playlists = runCatching {
            search(query, YoutubeSearchQueryHandlerFactory.MUSIC_PLAYLISTS, 10).filterIsInstance<PlaylistInfoItem>().mapNotNull { p ->
                val id = listId(p.url) ?: return@mapNotNull null
                PlaylistRef(id, p.name.orEmpty(), cleanArtist(p.uploaderName).takeIf { it != "Unknown Artist" }.orEmpty(),
                    if (p.streamCount > 0) p.streamCount.toString() else "", best(p.thumbnails))
            }
        }.getOrDefault(emptyList())
        if (songs.isEmpty() && artists.isEmpty() && albums.isEmpty() && playlists.isEmpty()) throw IOException("Search failed")
        return SearchAll(query, topResult(query, songs, artists, albums), songs, artists, albums, playlists)
    }

    private fun norm(s: String) = s.lowercase().filter { it.isLetterOrDigit() }

    private fun topResult(q: String, songs: List<Track>, artists: List<ArtistRef>, albums: List<AlbumRef>): TopResult? {
        val nq = norm(q)
        val a = artists.firstOrNull()
        if (a != null && nq.isNotEmpty()) {
            val n = norm(a.name)
            if (n == nq || (nq.length >= 4 && n.startsWith(nq) && nq.length >= n.length * 0.6)) return TopResult("artist", obj(a))
        }
        songs.firstOrNull { norm(it.title) == nq }?.let { return TopResult("song", obj(it)) }
        albums.firstOrNull { norm(it.title) == nq }?.let { return TopResult("album", obj(it)) }
        songs.firstOrNull()?.let { return TopResult("song", obj(it)) }
        return a?.let { TopResult("artist", obj(it)) }
    }

    private inline fun <reified T> obj(v: T): JsonObject = json.encodeToJsonElement(v).jsonObject

    fun albums(query: String, max: Int): List<AlbumRef> =
        search(query, YoutubeSearchQueryHandlerFactory.MUSIC_ALBUMS, max).filterIsInstance<PlaylistInfoItem>().mapNotNull { p ->
            val id = listId(p.url) ?: return@mapNotNull null
            AlbumRef(id, p.name.orEmpty(), cleanArtist(p.uploaderName), "", if (p.streamCount == 1L) "single" else "album", best(p.thumbnails))
        }

    private fun playlistInfo(id: String, maxTracks: Int): Pair<PlaylistInfo, List<StreamInfoItem>> {
        val url = "https://www.youtube.com/playlist?list=$id"
        val info = PlaylistInfo.getInfo(yt, url)
        val items = info.relatedItems.toMutableList()
        var next = info.nextPage
        var guard = 0
        while (next != null && items.size < maxTracks && guard++ < 10) {
            val more = PlaylistInfo.getMoreItems(yt, url, next)
            items += more.items
            next = more.nextPage
        }
        return info to items.take(maxTracks)
    }

    fun album(id: String): AlbumPage {
        val (info, items) = playlistInfo(id, 200)
        val title = info.name.orEmpty().replace(Regex("""^(Album|Single|EP)\s*[–-]\s*"""), "").trim()
        val tracks = items.mapNotNull { toTrack(it, title) }
        val art = best(info.thumbnails).ifBlank { tracks.firstOrNull()?.thumbnail.orEmpty() }
        val total = tracks.sumOf { it.durationSeconds }
        return AlbumPage(
            id = id, title = title,
            artist = cleanArtist(info.uploaderName).takeIf { it != "Unknown Artist" } ?: tracks.firstOrNull()?.artist.orEmpty(),
            thumbnail = art,
            durationText = "${tracks.size} songs • ${total / 60} minutes",
            trackCount = tracks.size,
            tracks = tracks.map { it.copy(thumbnail = art.ifBlank { it.thumbnail }) },
        )
    }

    fun playlist(id: String): PlaylistPage {
        val (info, items) = playlistInfo(id, 300)
        val tracks = items.mapNotNull { toTrack(it) }
        return PlaylistPage(
            id = id, title = info.name.orEmpty(),
            author = cleanArtist(info.uploaderName).takeIf { it != "Unknown Artist" }.orEmpty(),
            description = info.description?.content.orEmpty(),
            subtitle = "${tracks.size} songs",
            thumbnail = best(info.thumbnails).ifBlank { tracks.firstOrNull()?.thumbnail.orEmpty() },
            trackCount = tracks.size, tracks = tracks,
        )
    }

    fun artist(id: String?, name: String): ArtistPage {
        val artistHit = search(name, YoutubeSearchQueryHandlerFactory.MUSIC_ARTISTS, 5).filterIsInstance<ChannelInfoItem>()
            .let { list -> list.firstOrNull { channelId(it.url) == id } ?: list.firstOrNull { norm(it.name.orEmpty()) == norm(name) } ?: list.firstOrNull() }
        val realName = artistHit?.name ?: name
        val key = norm(realName)
        val songs = songs(realName, 30)
        val top = songs.filter { norm(it.artist).contains(key) }.ifEmpty { songs }.take(10)
        val albums = runCatching { albums(realName, 20) }.getOrDefault(emptyList()).filter { norm(it.artist).contains(key) }
        val avatar = best(artistHit?.thumbnails)
        return ArtistPage(
            id = artistHit?.let { channelId(it.url) } ?: id.orEmpty(),
            name = realName,
            avatar = avatar,
            banner = avatar,
            subscribers = artistHit?.subscriberCount?.takeIf { it > 0 }?.let { "${compact(it)} subscribers" }.orEmpty(),
            topTracks = top,
            albums = albums.filter { it.type != "single" },
            singles = albums.filter { it.type == "single" },
        )
    }

    private fun compact(n: Long) = when {
        n >= 1_000_000 -> "%.1fM".format(n / 1_000_000.0).replace(".0M", "M")
        n >= 1_000 -> "%.0fK".format(n / 1_000.0)
        else -> n.toString()
    }

    /**
     * Radio for a track: YouTube Music's own mix for it (RDAMVM playlist), else related videos,
     * else more songs by the same artist.
     */
    fun radio(seed: Track): List<Track> {
        fun clean(list: List<Track>) = list.filter { it.id != seed.id && (it.durationSeconds == 0 || it.durationSeconds in 60..900) }.distinctBy { it.id }.take(25)
        runCatching {
            val url = "https://www.youtube.com/watch?v=${seed.id}&list=RDAMVM${seed.id}"
            val info = PlaylistInfo.getInfo(yt, url)
            clean(info.relatedItems.mapNotNull { toTrack(it) })
        }.getOrNull()?.takeIf { it.size >= 5 }?.let { return it }
        runCatching {
            val info = StreamInfo.getInfo(yt, "https://www.youtube.com/watch?v=${seed.id}")
            cache(seed.id, info)
            clean(info.relatedItems.filterIsInstance<StreamInfoItem>().mapNotNull { toTrack(it) })
        }.getOrNull()?.takeIf { it.size >= 5 }?.let { return it }
        return clean(songs(seed.artist.substringBefore(",").trim(), 30).shuffled())
    }

    fun avatar(name: String): String? =
        search(name, YoutubeSearchQueryHandlerFactory.MUSIC_ARTISTS, 3).filterIsInstance<ChannelInfoItem>()
            .firstOrNull { norm(it.name.orEmpty()) == norm(name) }?.let { best(it.thumbnails) }?.ifBlank { null }

    // ------------------------------------------------------------------ streaming

    /** Direct, playable audio URL for a track (cached until shortly before YouTube's expiry). */
    fun stream(id: String, lowQuality: Boolean = false): ResolvedStream {
        streams[key(id, lowQuality)]?.let { if (it.expiresAtMs - System.currentTimeMillis() > 10 * 60_000) return it }
        val info = StreamInfo.getInfo(yt, "https://www.youtube.com/watch?v=$id")
        cache(id, info)
        return streams[key(id, lowQuality)] ?: throw IOException("No playable audio for $id")
    }

    private fun key(id: String, low: Boolean) = "$id:${if (low) "l" else "h"}"

    private fun cache(id: String, info: StreamInfo) {
        val audio = info.audioStreams.filter { it.isUrl && it.deliveryMethod == DeliveryMethod.PROGRESSIVE_HTTP }
        if (audio.isEmpty()) return
        // Prefer AAC in MP4 (fast seeking everywhere), then Opus.
        val ranked = audio.sortedWith(compareBy({ if (it.format == MediaFormat.M4A) 0 else 1 }, { -it.averageBitrate.coerceAtLeast(it.bitrate) }))
        val high = ranked.first()
        val low = audio.minByOrNull { it.averageBitrate.coerceAtLeast(it.bitrate).takeIf { b -> b > 0 } ?: Int.MAX_VALUE } ?: high
        for ((isLow, s) in listOf(false to high, true to low)) {
            val url = s.content
            val expire = Regex("""[?&]expire=(\d+)""").find(url)?.groupValues?.get(1)?.toLongOrNull()?.times(1000)
                ?: (System.currentTimeMillis() + 5 * 3600_000L)
            val clen = Regex("""[?&]clen=(\d+)""").find(url)?.groupValues?.get(1)?.toLongOrNull() ?: -1
            streams[key(id, isLow)] = ResolvedStream(url, s.format?.mimeType ?: "audio/mp4", s.averageBitrate.coerceAtLeast(s.bitrate), expire, clen)
        }
    }

    fun invalidate(id: String) {
        streams.remove(key(id, false)); streams.remove(key(id, true))
    }

    // ------------------------------------------------------------------ lyrics (LRCLIB)

    fun lyrics(t: Track): Lyrics {
        val ua = "Ghosttunes Mobile 1.0 (https://github.com/papa24-afk/Ghostunes)"
        fun get(url: okhttp3.HttpUrl): Lyrics? = client.newCall(Request.Builder().url(url).header("User-Agent", ua).build()).execute().use { r ->
            if (!r.isSuccessful) null else r.body?.string()?.let { body ->
                val trimmed = body.trim()
                if (trimmed.startsWith("[")) json.decodeFromString<List<Lyrics>>(trimmed).firstOrNull { !it.syncedLyrics.isNullOrBlank() } ?: json.decodeFromString<List<Lyrics>>(trimmed).firstOrNull()
                else json.decodeFromString<Lyrics>(trimmed)
            }
        }
        val artist = t.artist.substringBefore(",").substringBefore(" & ").trim()
        val exact = "https://lrclib.net/api/get".toHttpUrl().newBuilder()
            .addQueryParameter("track_name", t.title)
            .addQueryParameter("artist_name", artist)
            .apply { if (t.durationSeconds > 0) addQueryParameter("duration", t.durationSeconds.toString()) }
            .build()
        runCatching { get(exact) }.getOrNull()?.let { if (!it.syncedLyrics.isNullOrBlank() || !it.plainLyrics.isNullOrBlank() || it.instrumental) return it.copy(source = "lrclib") }
        val search = "https://lrclib.net/api/search".toHttpUrl().newBuilder()
            .addQueryParameter("track_name", t.title).addQueryParameter("artist_name", artist).build()
        return runCatching { get(search) }.getOrNull()?.copy(source = "lrclib") ?: Lyrics()
    }

    companion object {
        @Volatile private var initialized = false
    }
}
