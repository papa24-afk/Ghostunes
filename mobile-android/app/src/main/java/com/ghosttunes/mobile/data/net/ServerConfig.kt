package com.ghosttunes.mobile.data.net

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.Interceptor
import okhttp3.Response
import java.io.IOException
import java.net.Inet4Address
import java.net.InetAddress

/** Holds the PC's base URL (e.g. http://10.11.104.3:3001). Requests are re-targeted at call time. */
class ServerConfig(initial: String) {
    private val _baseUrl = MutableStateFlow(normalize(initial) ?: initial)
    val baseUrl: StateFlow<String> = _baseUrl

    fun set(url: String) {
        normalize(url)?.let { _baseUrl.value = it }
    }

    fun httpUrl(): HttpUrl? = _baseUrl.value.toHttpUrlOrNull()

    fun streamUrl(trackId: String, lowQuality: Boolean): String =
        "${_baseUrl.value}/api/stream/$trackId" + if (lowQuality) "?quality=low" else ""

    fun downloadUrl(trackId: String, lowQuality: Boolean): String =
        "${_baseUrl.value}/api/stream/$trackId" + if (lowQuality) "?quality=low" else ""

    companion object {
        const val PLACEHOLDER = "http://ghosttunes.invalid/"

        /** "10.0.0.5" -> "http://10.0.0.5:3001", trims trailing slashes. Returns null if unusable. */
        fun normalize(input: String): String? {
            var s = input.trim()
            if (s.isEmpty()) return null
            if (!s.startsWith("http://") && !s.startsWith("https://")) s = "http://$s"
            val url = s.toHttpUrlOrNull() ?: return null
            val port = if (input.contains(Regex(":\\d+"))) url.port else if (url.scheme == "http") 3001 else url.port
            return "${url.scheme}://${url.host}:$port"
        }
    }
}

/** Sends requests aimed at the placeholder host to the configured PC. */
class ServerRewriteInterceptor(private val config: ServerConfig) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        if (request.url.host != "ghosttunes.invalid") return chain.proceed(request)
        val base = config.httpUrl() ?: throw IOException("No server configured")
        val url = request.url.newBuilder().scheme(base.scheme).host(base.host).port(base.port).build()
        return chain.proceed(request.newBuilder().url(url).build())
    }
}

/**
 * Cleartext HTTP is only allowed to the local network: private, link-local and loopback
 * addresses, the emulator's host alias and mDNS names. Everything else must be HTTPS.
 */
class PrivateNetworkGuard : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val url = chain.request().url
        if (url.scheme == "http" && !isLocalHost(url.host)) {
            throw IOException("Cleartext HTTP to ${url.host} is blocked (only the local Ghosttunes server is allowed)")
        }
        return chain.proceed(chain.request())
    }

    companion object {
        fun isLocalHost(host: String): Boolean {
            val h = host.lowercase()
            if (h == "localhost" || h.endsWith(".local") || h.endsWith(".lan") || h.endsWith(".home.arpa")) return true
            if (!h.matches(Regex("""\d{1,3}(\.\d{1,3}){3}"""))) return false
            val parts = h.split('.').map { it.toInt() }
            if (parts.any { it > 255 }) return false
            val (a, b) = parts[0] to parts[1]
            return a == 10 || a == 127 ||
                (a == 172 && b in 16..31) ||
                (a == 192 && b == 168) ||
                (a == 169 && b == 254) ||
                (a == 100 && b in 64..127) // carrier-grade NAT / Tailscale
        }

        fun isLocalAddress(address: InetAddress): Boolean =
            address is Inet4Address && (address.isSiteLocalAddress || address.isLinkLocalAddress || address.isLoopbackAddress)
    }
}
