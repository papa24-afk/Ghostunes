package com.ghosttunes.mobile.handoff

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothClass
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothSocket
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import androidx.core.content.ContextCompat
import com.ghosttunes.mobile.data.model.HandoffSnapshot
import com.ghosttunes.mobile.data.net.ServerConfig
import com.ghosttunes.mobile.playback.PlaybackConnection
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.ResponseBody.Companion.toResponseBody
import okhttp3.Request
import java.io.BufferedReader
import java.io.InputStreamReader
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import javax.inject.Inject
import javax.inject.Provider
import javax.inject.Singleton

/** Lets the OkHttp interceptor reach the Bluetooth link without a dependency cycle. */
object BtTunnel {
    @Volatile var link: PcLink? = null
}

/**
 * A permanent connection to Ghosttunes on the PC while the app runs: over Wi-Fi when they share a
 * network, otherwise over Bluetooth (phone paired with the PC once). Carries events from the PC
 * (brought close, play/pause from another device, "play this here") and, over Bluetooth, tunnels
 * the phone's normal API requests so every feature works without shared Wi-Fi.
 */
@Singleton
class PcLink @Inject constructor(
    private val context: Context,
    private val config: ServerConfig,
    private val client: OkHttpClient,
    private val json: Json,
    private val scope: CoroutineScope,
    private val playback: PlaybackConnection,
    private val coordinator: Provider<HandoffCoordinator>,
    private val beacon: ProximityBeacon,
    private val api: com.ghosttunes.mobile.data.net.GhosttunesApi,
    private val output: com.ghosttunes.mobile.playback.AudioOutput,
    private val locator: com.ghosttunes.mobile.data.net.PcLocator,
) {
    enum class Via { Wifi, Bluetooth }

    private val _via = MutableStateFlow<Via?>(null)
    val via: StateFlow<Via?> = _via

    private var job: Job? = null
    private var reportJob: Job? = null
    private var lastReport = ""

    /** Tells the PC (and so every other device) what this phone is playing: on change, and every 5 s while playing. */
    private suspend fun reportLoop() {
        var lastSent = 0L
        while (true) {
            delay(1_000)
            if (_via.value == null) continue
            val s = playback.state.value
            val p = playback.progress.value
            val track = s.current
            val key = "${track?.id}|${s.isPlaying}|${output.current.value.name}"
            val now = System.currentTimeMillis()
            if (key == lastReport && !(s.isPlaying && now - lastSent > 5_000)) continue
            val snapshot = track?.let {
                HandoffCoordinator.buildSnapshot(s.queue.ifEmpty { listOf(it) }.take(50), s.index.coerceAtMost(49).coerceAtLeast(0), p.positionMs / 1000.0, phoneName)
                    ?.copy(isPlaying = s.isPlaying)
            }
            val out = output.current.value.takeIf { it.kind != com.ghosttunes.mobile.playback.OutputDevice.Kind.Speaker }?.name
            runCatching { api.deviceState(com.ghosttunes.mobile.data.model.DeviceStateRequest(beacon.id, phoneName, snapshot, out)) }
                .onSuccess { lastReport = key; lastSent = now }
        }
    }
    private var socket: BluetoothSocket? = null
    private val pending = ConcurrentHashMap<Int, CompletableDeferred<Pair<Int, String>>>()
    private val rid = AtomicInteger(0)

    val phoneName: String by lazy {
        Settings.Global.getString(context.contentResolver, Settings.Global.DEVICE_NAME)?.takeIf { it.isNotBlank() }
            ?: Build.MODEL.orEmpty()
    }

    fun start() {
        BtTunnel.link = this
        if (reportJob?.isActive != true) reportJob = scope.launch { reportLoop() }
        if (job?.isActive == true) return
        job = scope.launch(Dispatchers.IO) {
            while (isActive) {
                // Wi-Fi first (re-finding the PC if its address changed), else Bluetooth.
                if (!viaWifi() && !(runCatching { locator.ensure(allowScan = false) }.getOrNull() != null && viaWifi())) viaBluetooth()
                _via.value = null
                delay(3_000)
            }
        }
    }

    // ------------------------------------------------------------------ Wi-Fi (server-sent events)

    private fun viaWifi(): Boolean {
        val stream = client.newBuilder().readTimeout(0, TimeUnit.MILLISECONDS).connectTimeout(2, TimeUnit.SECONDS).build()
        val name = java.net.URLEncoder.encode(phoneName, "UTF-8")
        return runCatching {
            stream.newCall(Request.Builder().url("${config.baseUrl.value}/api/handoff/phone-events?id=${beacon.id}&name=$name").build()).execute().use { r ->
                if (!r.isSuccessful) return@use false
                _via.value = Via.Wifi
                val source = r.body?.source() ?: return@use false
                var event = ""
                var data = ""
                while (!source.exhausted()) {
                    val line = source.readUtf8Line() ?: break
                    when {
                        line.startsWith("event:") -> event = line.removePrefix("event:").trim()
                        line.startsWith("data:") -> data = line.removePrefix("data:").trim()
                        line.isEmpty() -> { if (event.isNotEmpty()) onEvent(event, data); event = ""; data = "" }
                    }
                }
                true
            }
        }.getOrDefault(false)
    }

    // ------------------------------------------------------------------ Bluetooth

    private fun canBluetooth() = Build.VERSION.SDK_INT < 31 ||
        ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED

    @SuppressLint("MissingPermission")
    private suspend fun viaBluetooth() {
        if (!canBluetooth()) return
        val adapter = context.getSystemService(BluetoothManager::class.java)?.adapter ?: return
        if (!adapter.isEnabled) return
        val prefs = context.getSharedPreferences("pclink", Context.MODE_PRIVATE)
        val known = prefs.getString("bt", null)
        val candidates = adapter.bondedDevices.orEmpty().sortedBy { d ->
            when {
                d.address == known -> 0
                d.bluetoothClass?.majorDeviceClass == BluetoothClass.Device.Major.COMPUTER -> 1
                else -> 2
            }
        }.filter { it.address == known || it.bluetoothClass?.majorDeviceClass == BluetoothClass.Device.Major.COMPUTER }
        for (device in candidates) {
            val s = runCatching { connect(device) }.getOrNull() ?: continue
            prefs.edit().putString("bt", device.address).apply()
            socket = s
            _via.value = Via.Bluetooth
            runCatching { serve(s) }
            socket = null
            pending.values.forEach { it.complete(503 to "") }
            pending.clear()
            return
        }
    }

    @SuppressLint("MissingPermission")
    private fun connect(device: BluetoothDevice): BluetoothSocket {
        context.getSystemService(BluetoothManager::class.java)?.adapter?.cancelDiscovery()
        val s = device.createRfcommSocketToServiceRecord(SERVICE_UUID)
        s.connect()
        return s
    }

    private fun serve(s: BluetoothSocket) {
        write(buildJsonObject { put("hello", beacon.id); put("name", phoneName) })
        val reader = BufferedReader(InputStreamReader(s.inputStream, Charsets.UTF_8))
        while (true) {
            val line = reader.readLine() ?: break
            val msg = runCatching { json.parseToJsonElement(line).jsonObject }.getOrNull() ?: continue
            val r = (msg["rid"] as? JsonPrimitive)?.contentOrNull?.toIntOrNull()
            if (r != null) {
                val status = (msg["status"] as? JsonPrimitive)?.contentOrNull?.toIntOrNull() ?: 502
                pending.remove(r)?.complete(status to (msg["body"]?.toString() ?: ""))
            } else {
                val event = (msg["event"] as? JsonPrimitive)?.contentOrNull ?: continue
                onEvent(event, msg["data"]?.toString().orEmpty())
            }
        }
    }

    @Synchronized
    private fun write(obj: JsonObject) {
        val out = socket?.outputStream ?: return
        out.write((obj.toString() + "\n").toByteArray(Charsets.UTF_8))
        out.flush()
    }

    /** True when requests to the PC should go over Bluetooth (no Wi-Fi path right now). */
    val bluetoothActive: Boolean get() = _via.value == Via.Bluetooth && socket != null

    /** Runs an API request through the Bluetooth link. Returns HTTP status and body. */
    fun tunnel(method: String, pathAndQuery: String, body: String?): Pair<Int, String> {
        val id = rid.incrementAndGet()
        val deferred = CompletableDeferred<Pair<Int, String>>()
        pending[id] = deferred
        write(buildJsonObject {
            put("rid", id)
            put("method", method)
            put("path", pathAndQuery)
            if (!body.isNullOrBlank()) put("body", json.parseToJsonElement(body))
        })
        return kotlinx.coroutines.runBlocking { withTimeoutOrNull(15_000) { deferred.await() } } ?: (504 to "").also { pending.remove(id) }
    }

    // ------------------------------------------------------------------ events from the PC / other devices

    private fun onEvent(event: String, data: String) {
        when (event) {
            "near" -> { context.vibrate(25); coordinator.get().trigger("near") }
            "command" -> scope.launch(Dispatchers.Main) { runCommand(data) }
            "play" -> scope.launch { playHere(data) }
        }
    }

    private suspend fun runCommand(data: String) {
        val obj = runCatching { json.parseToJsonElement(data).jsonObject }.getOrNull() ?: return
        val action = (obj["action"] as? JsonPrimitive)?.contentOrNull ?: return
        val position = (obj["position"] as? JsonPrimitive)?.doubleOrNull
        val c = playback.controller()
        when (action) {
            "play" -> c.play()
            "pause" -> c.pause()
            "toggle" -> if (c.isPlaying) c.pause() else c.play()
            "next" -> playback.next()
            "previous" -> playback.previous()
            "seek" -> position?.let { c.seekTo((it * 1000).toLong()) }
            "sendToPc" -> coordinator.get().trigger("remote")
        }
    }

    /** Another device sent music here. */
    private suspend fun playHere(data: String) {
        val obj = runCatching { json.parseToJsonElement(data).jsonObject }.getOrNull() ?: return
        val snap = runCatching { json.decodeFromJsonElement(HandoffSnapshot.serializer(), obj["snapshot"] as JsonElement) }.getOrNull() ?: return
        coordinator.get().stopRemote()
        val queue = snap.queue.ifEmpty { listOf(snap.track) }
        val index = queue.indexOfFirst { it.id == snap.track.id }.coerceAtLeast(0)
        coordinator.get().announceArrival(snap.track)
        playback.playAndAwait(queue, index, ((snap.position + 0.35) * 1000).toLong())
    }

    companion object {
        val SERVICE_UUID: UUID = UUID.fromString("6f3c2a10-9a41-4c6e-8b6e-47544e554e31")
    }
}

/** Sends API requests for the PC over Bluetooth when there's no Wi-Fi path (placed before the host rewrite). */
class BluetoothTunnelInterceptor : okhttp3.Interceptor {
    override fun intercept(chain: okhttp3.Interceptor.Chain): okhttp3.Response {
        val req = chain.request()
        if (req.url.host != "ghosttunes.invalid") return chain.proceed(req)
        val link = BtTunnel.link
        if (link?.bluetoothActive == true) return tunnel(link, req)
        return try {
            chain.proceed(req)
        } catch (e: java.io.IOException) {
            if (link?.bluetoothActive == true) tunnel(link, req) else throw e
        }
    }

    private fun tunnel(link: PcLink, req: Request): okhttp3.Response {
        val body = req.body?.let { b -> okio.Buffer().also { b.writeTo(it) }.readUtf8() }
        val path = req.url.encodedPath + (req.url.encodedQuery?.let { "?$it" } ?: "")
        val (status, text) = link.tunnel(req.method, path, body)
        if (status == 503 || status == 504) throw java.io.IOException("Bluetooth link to the PC dropped")
        return okhttp3.Response.Builder()
            .request(req)
            .protocol(okhttp3.Protocol.HTTP_1_1)
            .code(status)
            .message("bluetooth")
            .body(text.ifBlank { "{}" }.toResponseBody("application/json".toMediaType()))
            .build()
    }
}
