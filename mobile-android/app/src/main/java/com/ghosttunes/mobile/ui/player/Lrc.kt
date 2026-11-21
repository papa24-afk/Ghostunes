package com.ghosttunes.mobile.ui.player

data class LyricLine(val timeMs: Long, val text: String)

/** Parses LRC ("[01:02.34] text", multiple stamps per line allowed). Empty lines become breaks. */
object Lrc {
    private val stamp = Regex("""\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?]""")

    fun parse(lrc: String?): List<LyricLine> {
        if (lrc.isNullOrBlank()) return emptyList()
        val out = mutableListOf<LyricLine>()
        for (raw in lrc.lineSequence()) {
            val stamps = stamp.findAll(raw).toList()
            if (stamps.isEmpty()) continue
            val text = raw.substring(stamps.last().range.last + 1).trim()
            for (m in stamps) {
                val min = m.groupValues[1].toLong()
                val sec = m.groupValues[2].toLong()
                val frac = m.groupValues[3]
                val ms = when (frac.length) { 0 -> 0L; 1 -> frac.toLong() * 100; 2 -> frac.toLong() * 10; else -> frac.take(3).toLong() }
                out += LyricLine(min * 60_000 + sec * 1_000 + ms, text)
            }
        }
        return out.sortedBy { it.timeMs }
    }

    /** Index of the line active at [positionMs], or -1 before the first line. */
    fun activeIndex(lines: List<LyricLine>, positionMs: Long): Int {
        var lo = 0
        var hi = lines.lastIndex
        var ans = -1
        while (lo <= hi) {
            val mid = (lo + hi) ushr 1
            if (lines[mid].timeMs <= positionMs) { ans = mid; lo = mid + 1 } else hi = mid - 1
        }
        return ans
    }
}
