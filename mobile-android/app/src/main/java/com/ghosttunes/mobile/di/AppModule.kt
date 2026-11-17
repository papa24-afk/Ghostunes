package com.ghosttunes.mobile.di

import android.app.Application
import android.content.Context
import androidx.room.Room
import com.ghosttunes.mobile.data.db.AppDatabase
import com.ghosttunes.mobile.data.db.DownloadDao
import com.ghosttunes.mobile.data.db.LibraryDao
import com.ghosttunes.mobile.data.db.QueueDao
import com.ghosttunes.mobile.data.net.GhosttunesApi
import com.ghosttunes.mobile.data.net.PrivateNetworkGuard
import com.ghosttunes.mobile.data.net.ServerConfig
import com.ghosttunes.mobile.data.net.ServerRewriteInterceptor
import com.ghosttunes.mobile.data.prefs.SettingsRepository
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import java.util.concurrent.TimeUnit
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object AppModule {
    @Provides @Singleton fun context(app: Application): Context = app

    @Provides @Singleton fun scope(): CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    @Provides @Singleton fun json(): Json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
        coerceInputValues = true
        isLenient = true
    }

    @Provides @Singleton fun settings(context: Context, scope: CoroutineScope) = SettingsRepository(context, scope)

    @Provides @Singleton fun serverConfig(settings: SettingsRepository) = ServerConfig(settings.initial.serverUrl)

    @Provides @Singleton fun okHttp(config: ServerConfig): OkHttpClient = OkHttpClient.Builder()
        .addInterceptor(ServerRewriteInterceptor(config))
        .addInterceptor(PrivateNetworkGuard())
        .connectTimeout(6, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

    @Provides @Singleton fun api(client: OkHttpClient, json: Json): GhosttunesApi = Retrofit.Builder()
        .baseUrl(ServerConfig.PLACEHOLDER)
        .client(client)
        .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
        .build()
        .create(GhosttunesApi::class.java)

    @Provides @Singleton fun database(context: Context): AppDatabase =
        Room.databaseBuilder(context, AppDatabase::class.java, "ghosttunes.db").build()

    @Provides fun libraryDao(db: AppDatabase): LibraryDao = db.library()
    @Provides fun downloadDao(db: AppDatabase): DownloadDao = db.downloads()
    @Provides fun queueDao(db: AppDatabase): QueueDao = db.queue()
}
