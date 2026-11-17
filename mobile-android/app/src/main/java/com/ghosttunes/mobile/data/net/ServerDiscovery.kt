package com.ghosttunes.mobile.data.net

import android.content.Context
import android.net.ConnectivityManager
import com.ghosttunes.mobile.data.repo.MusicRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.channelFlow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import java.net.Inet4Address
import javax.inject.Inject
import javax.inject.Singleton

/** Finds Ghosttunes on the local /24 by probing :3001/api/health. */
@Singleton
class ServerDiscovery @Inject constructor(
    private val context: Context,
    private val music: MusicRepository,
) {
    /** This phone's IPv4 on the active network, e.g. "192.168.1.23". */
    fun localAddress(): String? {
        val cm = context.getSystemService(ConnectivityManager::class.java) ?: return null
        val props = cm.getLinkProperties(cm.activeNetwork) ?: return null
        return props.linkAddresses.map { it.address }
            .firstOrNull { it is Inet4Address && !it.isLoopbackAddress }?.hostAddress
    }

    data class Progress(val checked: Int, val total: Int, val found: List<String>)

    fun scan(port: Int = 3001): Flow<Progress> = channelFlow {
        val own = localAddress()
        val candidates = buildList {
            add("10.0.2.2") // Android emulator's alias for the host PC
            if (own != null) {
                val prefix = own.substringBeforeLast('.')
                for (i in 1..254) "$prefix.$i".let { if (it != own) add(it) }
            }
        }
        val found = mutableListOf<String>()
        var checked = 0
        val gate = Semaphore(48)
        send(Progress(0, candidates.size, emptyList()))
        coroutineScope {
            candidates.map { host ->
                async {
                    gate.withPermit {
                        val base = "http://$host:$port"
                        val ok = music.checkServer(base, timeoutMs = 700)
                        synchronized(found) {
                            checked++
                            if (ok) found += base
                        }
                        send(Progress(checked, candidates.size, synchronized(found) { found.toList() }))
                    }
                }
            }.awaitAll()
        }
    }.flowOn(Dispatchers.IO)
}
