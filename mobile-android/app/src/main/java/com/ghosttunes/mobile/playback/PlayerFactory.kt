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
) {
    fun create(): ExoPlayer {
        // Streaming: no read timeout surprises on slow first bytes (the PC may be resolving the stream).
        val streamClient = okHttp.newBuilder()
            .readTimeout(45, java.util.concurrent.TimeUnit.SECONDS)
            .build()
        val http = OkHttpDataSource.Factory(streamClient)
        val cached = CacheDataSource.Factory()
            .setCache(audioCache.cache)
            .setUpstreamDataSourceFactory(http)
            .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR)
        val upstream = DefaultDataSource.Factory(context, cached)

        // ghosttunes://track/<id> -> downloaded file, else http://<pc>/api/stream/<id>.
        val resolving = ResolvingDataSource.Factory(upstream) { spec ->
            val uri = spec.uri
            if (uri.scheme != "ghosttunes" || uri.host != "track") return@Factory spec
            val id = uri.lastPathSegment ?: return@Factory spec
            val local = DownloadFiles.localAudio(context, id)
            if (local != null) {
                spec.withUri(Uri.fromFile(local))
            } else {
                val low = settings.current.lowQualityStreaming
                spec.buildUpon()
                    .setUri(Uri.parse(config.streamUrl(id, low)))
                    .setKey("track:$id:${if (low) "low" else "high"}")
                    .build()
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
