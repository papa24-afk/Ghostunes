package com.ghosttunes.mobile

import android.app.Application
import coil3.ImageLoader
import coil3.PlatformContext
import coil3.SingletonImageLoader
import coil3.disk.DiskCache
import coil3.disk.directory
import coil3.memory.MemoryCache
import coil3.network.okhttp.OkHttpNetworkFetcherFactory
import coil3.request.crossfade
import com.ghosttunes.mobile.data.net.ServerConfig
import com.ghosttunes.mobile.data.prefs.SettingsRepository
import dagger.hilt.android.HiltAndroidApp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import javax.inject.Inject

@HiltAndroidApp
class GhosttunesApp : Application(), SingletonImageLoader.Factory {
    @Inject lateinit var okHttp: OkHttpClient
    @Inject lateinit var settings: SettingsRepository
    @Inject lateinit var serverConfig: ServerConfig
    @Inject lateinit var scope: CoroutineScope

    override fun onCreate() {
        super.onCreate()
        // Keep the request target in sync with Settings.
        scope.launch { settings.settings.collect { serverConfig.set(it.serverUrl) } }
    }

    override fun newImageLoader(context: PlatformContext): ImageLoader = ImageLoader.Builder(context)
        .components { add(OkHttpNetworkFetcherFactory(callFactory = { okHttp })) }
        .memoryCache { MemoryCache.Builder().maxSizePercent(context, 0.2).build() }
        .diskCache { DiskCache.Builder().directory(cacheDir.resolve("artwork")).maxSizeBytes(80L * 1024 * 1024).build() }
        .crossfade(180)
        .build()
}
