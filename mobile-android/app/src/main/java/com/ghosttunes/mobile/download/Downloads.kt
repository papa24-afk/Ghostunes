package com.ghosttunes.mobile.download

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.ServiceInfo
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.ForegroundInfo
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import com.ghosttunes.mobile.R
import com.ghosttunes.mobile.data.db.DownloadDao
import com.ghosttunes.mobile.data.db.DownloadEntity
import com.ghosttunes.mobile.data.model.Track
import com.ghosttunes.mobile.data.net.ArtworkUrls
import com.ghosttunes.mobile.data.net.ServerConfig
import com.ghosttunes.mobile.data.prefs.SettingsRepository
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.android.EntryPointAccessors
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

/** Where downloads live. Used by the player's resolver without DI. */
object DownloadFiles {
    fun dir(context: Context) = File(context.filesDir, "downloads").apply { mkdirs() }
    fun audio(context: Context, id: String) = File(dir(context), "$id.audio")
    fun art(context: Context, id: String) = File(dir(context), "$id.jpg")
    fun localAudio(context: Context, id: String): File? = audio(context, id).takeIf { it.exists() && it.length() > 0 }
    fun localArt(context: Context, id: String): File? = art(context, id).takeIf { it.exists() && it.length() > 0 }
}

data class DownloadItem(val track: Track, val state: String, val progress: Float, val bytes: Long)

@Singleton
class DownloadRepository @Inject constructor(
    private val context: Context,
    private val dao: DownloadDao,
    private val json: Json,
    scope: CoroutineScope,
) {
    val items: Flow<List<DownloadItem>> = dao.all().map { list ->
        list.mapNotNull { e ->
            runCatching { json.decodeFromString(Track.serializer(), e.json) }.getOrNull()
                ?.let { DownloadItem(it, e.state, e.progress, e.bytes) }
        }
    }

    val states: StateFlow<Map<String, DownloadItem>> =
        items.map { l -> l.associateBy { it.track.id } }.stateIn(scope, SharingStarted.Eagerly, emptyMap())

    fun isDownloaded(id: String) = states.value[id]?.state == STATE_DONE

    suspend fun enqueue(tracks: List<Track>) {
        val wm = WorkManager.getInstance(context)
        for (t in tracks) {
            val existing = dao.get(t.id)
            if (existing?.state == STATE_DONE && DownloadFiles.localAudio(context, t.id) != null) continue
            dao.upsert(DownloadEntity(t.id, json.encodeToString(Track.serializer(), t), STATE_QUEUED, 0f, 0, System.currentTimeMillis()))
            val request = OneTimeWorkRequestBuilder<DownloadWorker>()
                .setInputData(workDataOf(DownloadWorker.KEY_ID to t.id))
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .addTag(TAG)
                .build()
            wm.enqueueUniqueWork("download:${t.id}", ExistingWorkPolicy.KEEP, request)
        }
    }

    suspend fun remove(id: String) {
        WorkManager.getInstance(context).cancelUniqueWork("download:$id")
        withContext(Dispatchers.IO) {
            DownloadFiles.audio(context, id).delete()
            DownloadFiles.art(context, id).delete()
            File(DownloadFiles.dir(context), "$id.part").delete()
        }
        dao.delete(id)
    }

    suspend fun removeAll() {
        WorkManager.getInstance(context).cancelAllWorkByTag(TAG)
        withContext(Dispatchers.IO) { DownloadFiles.dir(context).listFiles()?.forEach { it.delete() } }
        dao.deleteAll()
    }

    suspend fun storageBytes(): Long = withContext(Dispatchers.IO) {
        DownloadFiles.dir(context).listFiles()?.sumOf { it.length() } ?: 0L
    }

    companion object {
        const val STATE_QUEUED = "queued"
        const val STATE_RUNNING = "running"
        const val STATE_DONE = "done"
        const val STATE_FAILED = "failed"
        const val TAG = "ghosttunes-download"
    }
}

@EntryPoint
@InstallIn(SingletonComponent::class)
interface DownloadWorkerDeps {
    fun dao(): DownloadDao
    fun client(): OkHttpClient
    fun config(): ServerConfig
    fun settings(): SettingsRepository
    fun json(): Json
    fun direct(): com.ghosttunes.mobile.data.direct.DirectSource
}

class DownloadWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    private val deps = EntryPointAccessors.fromApplication(context, DownloadWorkerDeps::class.java)

    override suspend fun getForegroundInfo(): ForegroundInfo = foreground("Downloading", 0f)

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val id = inputData.getString(KEY_ID) ?: return@withContext Result.failure()
        val dao = deps.dao()
        val entity = dao.get(id) ?: return@withContext Result.failure()
        val track = runCatching { deps.json().decodeFromString(Track.serializer(), entity.json) }.getOrNull()
            ?: return@withContext Result.failure()
        runCatching { setForeground(foreground(track.title, 0f)) }

        val client = deps.client().newBuilder().readTimeout(60, TimeUnit.SECONDS).callTimeout(0, TimeUnit.SECONDS).build()
        val part = File(DownloadFiles.dir(applicationContext), "$id.part")
        try {
            dao.update(id, DownloadRepository.STATE_RUNNING, 0f, 0)
            val settings = deps.settings().current
            val low = settings.lowQualityDownloads
            var lastUpdate = 0L
            suspend fun progress(read: Long, total: Long) {
                val now = System.currentTimeMillis()
                if (now - lastUpdate < 300) return
                lastUpdate = now
                val p = if (total > 0) read.toFloat() / total else 0f
                dao.update(id, DownloadRepository.STATE_RUNNING, p, read)
                runCatching { setForeground(foreground(track.title, p)) }
            }

            // Straight from YouTube on the phone (1 MB ranges, like the player), else via the PC.
            val ok = if (settings.streamFromPhone) runCatching { downloadDirect(id, low, part, ::progress) }.getOrDefault(false) else false
            if (!ok) downloadFromPc(client, deps.config().downloadUrl(id, low), part, ::progress)
            val read = part.length()
            if (read == 0L) error("no data")
            val target = DownloadFiles.audio(applicationContext, id)
            if (!part.renameTo(target)) {
                part.copyTo(target, overwrite = true)
                part.delete()
            }
            run {
                // Artwork for offline display.
                runCatching {
                    val art = ArtworkUrls.sized(track.thumbnail, ArtworkUrls.Size.Hero)
                    if (art.startsWith("https://")) {
                        client.newCall(Request.Builder().url(art).build()).execute().use { r ->
                            val bytes = if (r.isSuccessful) r.body?.bytes() else null
                            val fallback = if (bytes == null) ArtworkUrls.fallback(art) else null
                            val finalBytes = bytes ?: fallback?.let { f ->
                                client.newCall(Request.Builder().url(f).build()).execute().use { it.body?.bytes() }
                            }
                            finalBytes?.let { DownloadFiles.art(applicationContext, id).writeBytes(it) }
                        }
                    }
                }
                dao.update(id, DownloadRepository.STATE_DONE, 1f, target.length())
            }
            Result.success()
        } catch (e: Exception) {
            part.delete()
            dao.update(id, DownloadRepository.STATE_FAILED, 0f, 0)
            if (runAttemptCount < 2) Result.retry() else Result.failure()
        }
    }

    private suspend fun downloadDirect(id: String, low: Boolean, part: File, progress: suspend (Long, Long) -> Unit): Boolean {
        val direct = deps.direct()
        val stream = direct.stream(id, low)
        val client = direct.client.newBuilder()
            .addInterceptor(com.ghosttunes.mobile.data.direct.YouTubeStreamInterceptor())
            .readTimeout(60, TimeUnit.SECONDS)
            .build()
        var total = stream.contentLength
        var offset = 0L
        part.outputStream().use { out ->
            while (total < 0 || offset < total) {
                if (isStopped) return false
                val end = if (total > 0) minOf(offset + CHUNK - 1, total - 1) else offset + CHUNK - 1
                client.newCall(Request.Builder().url(stream.url).header("Range", "bytes=$offset-$end").build()).execute().use { r ->
                    if (r.code != 206 && r.code != 200) error("HTTP ${r.code}")
                    if (total < 0) total = r.header("Content-Range")?.substringAfter('/')?.toLongOrNull() ?: r.body?.contentLength() ?: -1
                    val bytes = r.body?.bytes() ?: ByteArray(0)
                    if (bytes.isEmpty()) return offset > 0
                    out.write(bytes)
                    offset += bytes.size
                    if (r.code == 200) return true
                }
                progress(offset, total)
                if (total < 0) break
            }
        }
        return offset > 0
    }

    private suspend fun downloadFromPc(client: OkHttpClient, url: String, part: File, progress: suspend (Long, Long) -> Unit) {
        client.newCall(Request.Builder().url(url).build()).execute().use { response ->
            if (!response.isSuccessful) error("HTTP ${response.code}")
            val body = response.body ?: error("empty body")
            val total = body.contentLength().takeIf { it > 0 } ?: -1L
            var read = 0L
            part.outputStream().use { out ->
                body.byteStream().use { input ->
                    val buf = ByteArray(64 * 1024)
                    while (true) {
                        if (isStopped) return
                        val n = input.read(buf)
                        if (n < 0) break
                        out.write(buf, 0, n)
                        read += n
                        progress(read, total)
                    }
                }
            }
        }
    }

    private fun foreground(title: String, progress: Float): ForegroundInfo {
        val nm = applicationContext.getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL) == null) {
            nm.createNotificationChannel(NotificationChannel(CHANNEL, "Downloads", NotificationManager.IMPORTANCE_LOW))
        }
        val notification = NotificationCompat.Builder(applicationContext, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_ghost)
            .setContentTitle("Downloading")
            .setContentText(title)
            .setOnlyAlertOnce(true)
            .setOngoing(true)
            .setProgress(100, (progress * 100).toInt(), progress <= 0f)
            .build()
        val notificationId = 4100 + (inputData.getString(KEY_ID)?.hashCode() ?: 0) % 500
        return if (Build.VERSION.SDK_INT >= 29) {
            ForegroundInfo(notificationId, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            ForegroundInfo(notificationId, notification)
        }
    }

    companion object {
        const val CHUNK = 1L shl 20
        const val KEY_ID = "track_id"
        const val CHANNEL = "downloads"
    }
}
