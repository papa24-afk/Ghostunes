package com.ghosttunes.mobile.data.direct

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

class SongKeyTest {
    @Test fun `versions of the same song match`() {
        val k = songKey("Blinding Lights")
        for (t in listOf(
            "Blinding Lights (Official Audio)",
            "The Weeknd - Blinding Lights [Lyrics]",
            "Blinding Lights (Official Video)",
            "blinding lights slowed + reverb",
            "Blinding Lights - Live",
            "Blinding Lights (Remix)",
            "BLINDING LIGHTS",
        )) assertEquals(t, k, songKey(t))
    }

    @Test fun `different songs stay different`() {
        assertNotEquals(songKey("Blinding Lights"), songKey("Save Your Tears"))
        assertNotEquals(songKey("Alive"), songKey("A"))
        assertNotEquals(songKey("Discover"), songKey("Dis"))
        assertNotEquals(songKey("Starboy"), songKey("Die For You"))
    }
}

class BalanceRadioTest {
    private fun t(id: String, artist: String) = com.ghosttunes.mobile.data.model.Track(id = id, title = "Song $id", artist = artist)

    @Test fun `alternates the artist with similar artists`() {
        val mix = listOf(t("1", "The Kid LAROI"), t("2", "The Weeknd"), t("3", "Post Malone"), t("4", "The Weeknd & Daft Punk"), t("5", "Rihanna"))
        val out = balanceRadio("The Weeknd", mix, emptyList()).map { it.id }
        assertEquals(listOf("2", "1", "4", "3", "5"), out)
    }

    @Test fun `tops up the artist side when the mix has few`() {
        val mix = listOf(t("1", "ZAYN"), t("2", "Post Malone"), t("3", "Rihanna"))
        val extra = listOf(t("10", "The Weeknd"), t("11", "TheWeekndVEVO"), t("12", "Someone Else"))
        val out = balanceRadio("The Weeknd", mix, extra).map { it.id }
        assertEquals(listOf("10", "1", "11", "2", "3"), out)
    }

    @Test fun `artist matching`() {
        assertEquals(true, sameArtist("The Weeknd & Daft Punk", "The Weeknd"))
        assertEquals(true, sameArtist("TheWeekndVEVO", "The Weeknd"))
        assertEquals(false, sameArtist("Post Malone", "The Weeknd"))
    }
}
