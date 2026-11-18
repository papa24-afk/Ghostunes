package com.ghosttunes.mobile.data.net

import com.ghosttunes.mobile.data.prefs.SettingsRepository
import com.ghosttunes.mobile.data.repo.MusicRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.NetworkInterface
import java.net.SocketTimeoutException
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Keeps the PC address working on any network: checks the saved address, and if it's gone,
 * asks the network ("GHOSTTUNES?" broadcast on UDP 3002, answered by the desktop app), then falls
 * back to scanning the local subnets. A found address is saved automatically.
 */
@Singleton
class PcLocator @Inject constructor(
    private val music: MusicRepository,
    private val discovery: ServerDiscovery,
    private val settings: SettingsRepository,
    private val config: ServerConfig,
) {
    private val lock = Mutex()

    /** elapsedRealtime of the last successful contact with the PC (0 = never). */
    @Volatile var lastOkAt: Long = 0
        private set

    /** Returns a reachable base URL (saving it if it changed), or null if no PC is on this network. */
    suspend fun ensure(allowScan: Boolean = true): String? = lock.withLock {
        val current = config.baseUrl.value
        if (music.checkServer(current, 2000)) { lastOkAt = android.os.SystemClock.elapsedRealtime(); return current }
        val found = broadcast().firstOrNull { music.checkServer(it, 2000) }
            ?: if (allowScan) withTimeoutOrNull(12_000) { discovery.scan().first { it.found.isNotEmpty() }.found.first() } else null
        if (found != null) lastOkAt = android.os.SystemClock.elapsedRealtime()
        if (found != null && found != current) {
            config.set(found)
            music.clearCache()
            settings.setServer(found)
        }
        found
    }

    /** Broadcast to every local network (Wi-Fi, hotspot) and collect replies for ~1 s. */
    suspend fun broadcast(timeoutMs: Int = 1000): List<String> = withContext(Dispatchers.IO) {
        val targets = buildSet {
            add(InetAddress.getByName("255.255.255.255"))
            runCatching {
                NetworkInterface.getNetworkInterfaces().toList().filter { it.isUp && !it.isLoopback }
                    .flatMap { it.interfaceAddresses }.mapNotNull { it.broadcast }.forEach { add(it) }
            }
        }
        val found = linkedSetOf<String>()
        runCatching {
            DatagramSocket().use { socket ->
                socket.broadcast = true
                socket.soTimeout = 250
                val ask = "GHOSTTUNES?".toByteArray()
                repeat(2) { targets.forEach { runCatching { socket.send(DatagramPacket(ask, ask.size, it, 3002)) } } }
                val deadline = System.currentTimeMillis() + timeoutMs
                val buf = ByteArray(512)
                while (System.currentTimeMillis() < deadline) {
                    val packet = DatagramPacket(buf, buf.size)
                    try {
                        socket.receive(packet)
                    } catch (_: SocketTimeoutException) {
                        continue
                    }
                    val text = String(packet.data, 0, packet.length)
                    if (!text.contains("\"ghosttunes\"")) continue
                    val port = Regex(""""port"\s*:\s*(\d+)""").find(text)?.groupValues?.get(1) ?: "3001"
                    packet.address.hostAddress?.let { found += "http://$it:$port" }
                }
            }
        }
        found.toList()
    }
}
