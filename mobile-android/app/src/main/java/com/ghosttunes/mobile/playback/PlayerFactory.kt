package com.ghosttunes.mobile.playback

import android.content.Context
import android.net.Uri
import androidx.annotation.OptIn
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.util.UnstableApi
import androidx.media3.database.StandaloneDatabaseProvider
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.ResolvingDataSource
import androidx.media3.datasource.cache.CacheDataSource
import androidx.media3.datasource.cache.LeastRecentlyUsedCacheEvictor
import androidx.media3.datasource.cache.SimpleCache
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import com.ghosttunes.mobile.data.net.ServerConfig
import com.ghosttunes.mobile.data.prefs.SettingsRepository
import com.ghosttunes.mobile.download.DownloadFiles
import okhttp3.OkHttpClient
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton

/** Tracks to load from the PC once (a song pulled from the PC: its server already has it ready). */
object StreamHints {
    val preferPc: MutableSet<String> = java.util.concurrent.ConcurrentHashMap.newKeySet()
}

/** One SimpleCache per directory per process. 256 MB of recently streamed audio. */
@OptIn(UnstableApi::class)
@Singleton
class AudioCache @Inject constructor(context: Context) {
    val cache = SimpleCache(
        File(context.cacheDir, "audio"),
        LeastRecentlyUsedCacheEvictor(256L * 1024 * 1024),
        StandaloneDatabaseProvider(context),
    )

    fun bytes(): Long = cache.cacheSpace

    fun clear() {
        cache.keys.toList().forEach { runCatching { cache.removeResource(it) } }
    }
}

@OptIn(UnstableApi::class)
class PlayerFactory @Inject constructor(
    private val context: Context,
    private val okHttp: OkHttpClient,
    private val config: ServerConfig,
    private val settings: SettingsRepository,
    private val audioCache: AudioCache,
    private val direct: com.ghosttunes.mobile.data.direct.DirectSource,
) {
    private fun pcReachable(): Boolean = runCatching {
        okHttp.newBuilder().callTimeout(2500, java.util.concurrent.TimeUnit.MILLISECONDS).build()
            .newCall(okhttp3.Request.Builder().url(config.baseUrl.value + "/api/health").build()).execute().use { it.isSuccessful }
    }.getOrDefault(false)

    fun create(): ExoPlayer {
        // Streaming: no read timeout surprises on slow first bytes (the PC may be resolving the stream).
        val streamClient = okHttp.newBuilder()
            .readTimeout(45, java.util.concurrent.TimeUnit.SECONDS)
            .addInterceptor(com.ghosttunes.mobile.data.direct.YouTubeStreamInterceptor())
            .build()
        val http = OkHttpDataSource.Factory(streamClient)
        val cached = CacheDataSource.Factory()
            .setCache(audioCache.cache)
            .setUpstreamDataSourceFactory(http)
            .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR)
        val upstream = DefaultDataSource.Factory(context, cached)

        // ghosttunes://track/<id> -> downloaded file, else YouTube directly from the phone,
        // else the PC's /api/stream/<id> (or the other way round if the user prefers the PC).
        val resolving = ResolvingDataSource.Factory(upstream) { spec ->
            val uri = spec.uri
            if (uri.scheme != "ghosttunes" || uri.host != "track") return@Factory spec
            val id = uri.lastPathSegment ?: return@Factory spec
            val local = DownloadFiles.localAudio(context, id)
            if (local != null) return@Factory spec.withUri(Uri.fromFile(local))
            val low = settings.current.lowQualityStreaming
            val q = if (low) "low" else "high"
            fun viaPc() = spec.buildUpon().setUri(Uri.parse(config.streamUrl(id, low))).setKey("pc:$id:$q").build()
            fun viaPhone() = direct.stream(id, low).let { s -> spec.buildUpon().setUri(Uri.parse(s.url)).setKey("yt:$id:$q").build() }
            if (!settings.current.streamFromPhone) return@Factory viaPc()
            // Pulled from the PC: the PC is already streaming it, so it's instant over the LAN.
            if (StreamHints.preferPc.remove(id)) return@Factory viaPc()
            try {
                viaPhone()
            } catch (e: Exception) {
                // YouTube blocked or unreachable from here: use the PC if it's around, else report why.
                if (pcReachable()) viaPc() else throw java.io.IOException(e.message ?: "stream unavailable", e)
            }
        }

        val loadControl = DefaultLoadControl.Builder()
            // Start as soon as ~1.5 s is buffered; keep up to 2 min ahead.
            .setBufferDurationsMs(15_000, 120_000, 1_500, 3_000)
            .build()

        return ExoPlayer.Builder(context)
            .setMediaSourceFactory(DefaultMediaSourceFactory(resolving))
            .setLoadControl(loadControl)
            .setAudioAttributes(
                AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(),
                /* handleAudioFocus = */ true,
            )
            .setHandleAudioBecomingNoisy(true)
            .setWakeMode(C.WAKE_MODE_NETWORK)
            .build()
    }
}
