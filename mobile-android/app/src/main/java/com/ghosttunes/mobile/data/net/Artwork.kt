package com.ghosttunes.mobile.data.net

/**
 * Search/home thumbnails come back at 120px. Rewrites CDN URLs to the size actually drawn,
 * mirroring the server's upgradeArtworkUrl().
 */
object ArtworkUrls {
    enum class Size(val px: Int) { Row(226), Card(544), Hero(1080) }

    private val googleWh = Regex("""=w\d+-h\d+[^?/]*""")
    private val googleS = Regex("""=s\d+[^?/]*""")
    private val ytimg = Regex("""/(default|mqdefault|hqdefault|sddefault|hq720|maxresdefault)\.jpg(\?.*)?$""")

    fun sized(url: String?, size: Size): String {
        if (url.isNullOrBlank()) return ""
        val px = size.px
        return when {
            url.contains("googleusercontent.com") || url.contains("ggpht.com") -> when {
                googleWh.containsMatchIn(url) -> url.replace(googleWh, "=w$px-h$px-l90-rj")
                googleS.containsMatchIn(url) -> url.replace(googleS, "=s$px")
                !url.contains('=') -> "$url=w$px-h$px-l90-rj"
                else -> url
            }
            url.contains("i.ytimg.com/vi/") -> url.replace(ytimg, if (size == Size.Row) "/hqdefault.jpg" else "/maxresdefault.jpg")
            else -> url
        }
    }

    /** Fallback when a maxres thumbnail doesn't exist (404) for older videos. */
    fun fallback(url: String): String? =
        if (url.contains("maxresdefault.jpg")) url.replace("maxresdefault.jpg", "hqdefault.jpg") else null

    /** YouTube video thumbnails are 16:9 with letterbox bars; music art is square. */
    fun isVideoFrame(url: String?): Boolean = url?.contains("i.ytimg.com/vi/") == true
}
