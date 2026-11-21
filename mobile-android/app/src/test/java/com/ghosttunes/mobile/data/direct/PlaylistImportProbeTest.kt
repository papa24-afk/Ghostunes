package com.ghosttunes.mobile.data.direct

import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test

class PlaylistImportTest {
    private val importer = PlaylistImporter(DirectSource(OkHttpClient(), Json), Json)

    @Test fun `recognises links`() {
        assertEquals(PlaylistImporter.Platform.Spotify, importer.platformOf("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=x"))
        assertEquals(PlaylistImporter.Platform.Deezer, importer.platformOf("https://www.deezer.com/en/playlist/3155776842"))
        assertEquals(PlaylistImporter.Platform.Deezer, importer.platformOf("https://link.deezer.com/s/abc"))
        assertEquals(PlaylistImporter.Platform.Apple, importer.platformOf("https://music.apple.com/us/playlist/todays-hits/pl.f4d106fed2bd41149aaacabb233eb5eb"))
        assertEquals(PlaylistImporter.Platform.YouTube, importer.platformOf("https://music.youtube.com/playlist?list=PLX0yRpY9uxn4wJWndOffj3zUvFTmnjooh"))
        assertEquals(null, importer.platformOf("hello"))
    }

    @Test fun `similarity ignores feat and brackets`() {
        assertTrue(importer.similarity("Essence (feat. Tems)", "Essence") > 0.95)
        assertTrue(importer.similarity("Last Last", "City Boys") < 0.4)
    }
}

/** Live import against real public playlists. Run with -Dprobe=1. */
class PlaylistImportProbeTest {
    @Test
    fun importRealPlaylists() = runBlocking {
        assumeTrue(System.getProperty("probe") == "1")
        val json = Json { ignoreUnknownKeys = true; explicitNulls = false; coerceInputValues = true }
        val importer = PlaylistImporter(DirectSource(OkHttpClient(), json), json)
        val links = listOf(
            "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M",
            "https://www.deezer.com/en/playlist/3155776842",
            "https://music.apple.com/us/playlist/todays-hits/pl.f4d106fed2bd41149aaacabb233eb5eb",
            "https://music.youtube.com/playlist?list=PLX0yRpY9uxn4wJWndOffj3zUvFTmnjooh",
        )
        for (link in links) {
            val t0 = System.currentTimeMillis()
            val r = runCatching { importer.resolve(link) }
            r.onFailure { println("IMPORT ${importer.platformOf(link)} RESOLVE FAILED: ${it.message}") }
            val res = r.getOrNull() ?: continue
            println("IMPORT ${res.platform} \"${res.title}\" by ${res.author}: ${res.sources.size + res.ready.size} songs, e.g. ${res.sources.take(2).joinToString { "${it.title} — ${it.artist}" }}")
            val limited = if (res.sources.size > 12) res.copy(sources = res.sources.take(12)) else res
            val m = importer.match(limited) { _, _ -> }
            println("   matched ${m.tracks.size}/${m.total} in ${System.currentTimeMillis() - t0} ms; ${limited.sources.take(3).zip(m.tracks.take(3)).joinToString { (s, t) -> "'${s.title}' -> '${t.title} — ${t.artist}'" }}; unmatched=${m.unmatched.map { it.title }}")
        }
    }
}
