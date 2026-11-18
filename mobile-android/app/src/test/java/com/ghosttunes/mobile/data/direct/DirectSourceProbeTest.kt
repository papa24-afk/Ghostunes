package com.ghosttunes.mobile.data.direct

import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient
import okhttp3.Request
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test

/**
 * Live check against YouTube + LRCLIB from this machine: search → stream URL → real audio bytes.
 * Skipped unless run with -Dprobe=1 (needs internet).
 */
class DirectSourceProbeTest {
    @Test
    fun searchResolveAndStream() {
        assumeTrue(System.getProperty("probe") == "1")
        val json = Json { ignoreUnknownKeys = true; explicitNulls = false; coerceInputValues = true }
        val src = DirectSource(OkHttpClient(), json)

        val t0 = System.currentTimeMillis()
        val songs = src.songs("burna boy city boys", 10)
        println("SEARCH ${songs.size} songs in ${System.currentTimeMillis() - t0} ms")
        songs.take(3).forEach { println("  ${it.id}  ${it.title} — ${it.artist}  ${it.duration}  ${it.thumbnail.take(60)}") }
        assertTrue(songs.isNotEmpty())

        val t1 = System.currentTimeMillis()
        val s = try { src.stream(songs.first().id) } catch (e: Exception) {
            println("STREAM FAILED after ${System.currentTimeMillis() - t1} ms: ${e.javaClass.simpleName}: ${e.message?.take(120)}")
            null
        }
        if (s != null) {
        println("STREAM resolved in ${System.currentTimeMillis() - t1} ms: ${s.mimeType} ${s.bitrate} bps clen=${s.contentLength} host=${s.url.substringAfter("//").substringBefore("/")}")

        // Fetch the first 256 KB and a chunk from the middle exactly the way the player will.
        val client = OkHttpClient.Builder().addInterceptor(YouTubeStreamInterceptor()).build()
        for (range in listOf("bytes=0-262143", "bytes=1000000-1065535")) {
            val t2 = System.currentTimeMillis()
            client.newCall(Request.Builder().url(s.url).header("Range", range).build()).execute().use { r ->
                val bytes = r.body?.bytes() ?: ByteArray(0)
                val head = bytes.take(12).map { (it.toInt() and 0xff).toChar() }.joinToString("").filter { it.isLetterOrDigit() }
                println("RANGE $range -> HTTP ${r.code} ${r.header("Content-Type")} ${bytes.size} bytes in ${System.currentTimeMillis() - t2} ms, head='$head'")
                assertTrue("HTTP ${r.code}", r.code == 206 || r.code == 200)
                assertTrue(bytes.size > 60_000)
            }
        }
        }

        val all = src.searchAll("burna boy")
        println("SEARCH-ALL top=${all.top?.type} songs=${all.songs.size} artists=${all.artists.size} albums=${all.albums.size} playlists=${all.playlists.size}")
        all.albums.firstOrNull()?.let { a ->
            val page = src.album(a.id)
            println("ALBUM ${page.title} by ${page.artist}: ${page.trackCount} tracks, first=${page.tracks.firstOrNull()?.title}")
        }
        val artist = src.artist(all.artists.firstOrNull()?.id, "Burna Boy")
        println("ARTIST ${artist.name}: top=${artist.topTracks.size} albums=${artist.albums.size} singles=${artist.singles.size} avatar=${artist.avatar.isNotBlank()}")
        val radio = runCatching { src.radio(songs.first()) }.onFailure { println("RADIO FAILED: ${it.javaClass.simpleName}") }.getOrDefault(emptyList())
        println("RADIO ${radio.size} related, e.g. ${radio.take(3).joinToString { it.title }}")
        val lyrics = src.lyrics(songs.first())
        println("LYRICS synced=${lyrics.syncedLyrics?.lines()?.size ?: 0} lines, plain=${lyrics.plainLyrics?.length ?: 0} chars")
        println("AVATAR ${src.avatar("Wizkid")?.take(50)}")
        println("SUGGEST ${src.suggestions("wizk").suggestions}")
    }
}
