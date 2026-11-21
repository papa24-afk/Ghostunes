package com.ghosttunes.mobile

import com.ghosttunes.mobile.data.model.Track
import com.ghosttunes.mobile.data.net.ArtworkUrls
import com.ghosttunes.mobile.data.net.PrivateNetworkGuard
import com.ghosttunes.mobile.data.net.ServerConfig
import com.ghosttunes.mobile.handoff.HandoffCoordinator
import com.ghosttunes.mobile.ui.player.Lrc
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class LrcTest {
    @Test fun `parses stamps, fractions and multi-stamp lines`() {
        val lines = Lrc.parse("[00:06.79] I'm a sexy yout\n[00:00.00] Ayo\n[01:02.5][01:10.123] Chorus\nno stamp\n")
        assertEquals(listOf(0L, 6790L, 62500L, 70123L), lines.map { it.timeMs })
        assertEquals("Chorus", lines[2].text)
    }

    @Test fun `active index follows position`() {
        val lines = Lrc.parse("[00:01.00]a\n[00:05.00]b\n[00:09.00]c")
        assertEquals(-1, Lrc.activeIndex(lines, 500))
        assertEquals(0, Lrc.activeIndex(lines, 1000))
        assertEquals(1, Lrc.activeIndex(lines, 8999))
        assertEquals(2, Lrc.activeIndex(lines, 60_000))
    }
}

class ArtworkTest {
    @Test fun `upsizes google cdn thumbnails`() {
        val small = "https://yt3.googleusercontent.com/abc=w120-h120-l90-rj"
        assertEquals("https://yt3.googleusercontent.com/abc=w1080-h1080-l90-rj", ArtworkUrls.sized(small, ArtworkUrls.Size.Hero))
        assertEquals("https://yt3.googleusercontent.com/abc=w226-h226-l90-rj", ArtworkUrls.sized(small, ArtworkUrls.Size.Row))
        assertEquals("https://lh3.googleusercontent.com/x=s544", ArtworkUrls.sized("https://lh3.googleusercontent.com/x=s1200", ArtworkUrls.Size.Card))
    }

    @Test fun `ytimg uses maxres with hqdefault fallback`() {
        val u = ArtworkUrls.sized("https://i.ytimg.com/vi/abc/hq720.jpg", ArtworkUrls.Size.Hero)
        assertEquals("https://i.ytimg.com/vi/abc/maxresdefault.jpg", u)
        assertEquals("https://i.ytimg.com/vi/abc/hqdefault.jpg", ArtworkUrls.fallback(u))
    }
}

class NetworkTest {
    @Test fun `cleartext is limited to the local network`() {
        listOf("10.11.104.3", "192.168.1.10", "172.20.0.5", "127.0.0.1", "10.0.2.2", "169.254.83.107", "my-pc.local", "localhost")
            .forEach { assertTrue(it, PrivateNetworkGuard.isLocalHost(it)) }
        listOf("8.8.8.8", "example.com", "172.32.0.1", "192.169.1.1", "i.ytimg.com", "999.1.1.1")
            .forEach { assertFalse(it, PrivateNetworkGuard.isLocalHost(it)) }
    }

    @Test fun `server address normalisation`() {
        assertEquals("http://10.11.104.3:3001", ServerConfig.normalize("10.11.104.3"))
        assertEquals("http://10.11.104.3:3001", ServerConfig.normalize(" http://10.11.104.3:3001/ "))
        assertEquals("http://192.168.0.2:8080", ServerConfig.normalize("192.168.0.2:8080"))
        assertNull(ServerConfig.normalize(""))
    }
}

class HandoffSnapshotTest {
    private fun t(i: Int) = Track(id = "id%09d".format(i).take(11), title = "Song $i", artist = "A")

    @Test fun `caps the queue at 300 around the current track`() {
        val queue = (0 until 500).map(::t)
        val snap = HandoffCoordinator.buildSnapshot(queue, 400, 42.5, "Pixel 7")!!
        assertEquals(300, snap.queue.size)
        assertEquals(queue[400].id, snap.queue[snap.queueIndex].id)
        assertEquals(queue[400].id, snap.track.id)
        assertEquals(42.5, snap.position, 0.0)
        assertEquals("Pixel 7", snap.deviceName)
    }

    @Test fun `never sends device-local artwork`() {
        val local = Track(id = "3az-NQCK57c", title = "City Boys", artist = "Burna Boy", thumbnail = "file:///data/user/0/x.jpg", artist_thumbnail = "content://y")
        val clean = HandoffCoordinator.sanitize(local)
        assertEquals("https://i.ytimg.com/vi/3az-NQCK57c/hqdefault.jpg", clean.thumbnail)
        assertNull(clean.artist_thumbnail)
        val remote = local.copy(thumbnail = "https://yt3.googleusercontent.com/x=w544-h544")
        assertEquals(remote.thumbnail, HandoffCoordinator.sanitize(remote).thumbnail)
    }

    @Test fun `empty queue gives no snapshot`() = assertNull(HandoffCoordinator.buildSnapshot(emptyList(), 0, 0.0, "x"))
}
