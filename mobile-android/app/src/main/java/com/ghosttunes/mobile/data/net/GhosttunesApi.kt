package com.ghosttunes.mobile.data.net

import com.ghosttunes.mobile.data.model.AlbumPage
import com.ghosttunes.mobile.data.model.ArtistPage
import com.ghosttunes.mobile.data.model.AvatarResponse
import com.ghosttunes.mobile.data.model.DesktopState
import com.ghosttunes.mobile.data.model.Feedback
import com.ghosttunes.mobile.data.model.HandoffStatusResponse
import com.ghosttunes.mobile.data.model.Health
import com.ghosttunes.mobile.data.model.Lyrics
import com.ghosttunes.mobile.data.model.PlaylistPage
import com.ghosttunes.mobile.data.model.PrepareResponse
import com.ghosttunes.mobile.data.model.PushRequest
import com.ghosttunes.mobile.data.model.PushResponse
import com.ghosttunes.mobile.data.model.ReleaseRequest
import com.ghosttunes.mobile.data.model.SearchAll
import com.ghosttunes.mobile.data.model.SearchResponse
import com.ghosttunes.mobile.data.model.SmartRadio
import com.ghosttunes.mobile.data.model.Suggestions
import com.ghosttunes.mobile.data.model.TracksResponse
import okhttp3.ResponseBody
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/** The PC's Ghosttunes server. Base URL is rewritten per request by [ServerConfig]. */
interface GhosttunesApi {
    @GET("api/health") suspend fun health(): Health
    @GET("api/home") suspend fun home(): TracksResponse
    @GET("api/genre") suspend fun genre(@Query("q") query: String): TracksResponse
    @GET("api/search") suspend fun search(@Query("q") query: String): SearchResponse
    @GET("api/search/all") suspend fun searchAll(@Query("q") query: String): SearchAll
    @GET("api/search/suggestions") suspend fun suggestions(@Query("q") query: String): Suggestions
    @GET("api/artist") suspend fun artistById(@Query("id") id: String): ArtistPage
    @GET("api/artist") suspend fun artistByName(@Query("name") name: String): ArtistPage
    @GET("api/artist-avatar") suspend fun artistAvatar(@Query("name") name: String): AvatarResponse
    @GET("api/album") suspend fun album(@Query("id") id: String): AlbumPage
    @GET("api/playlist") suspend fun playlist(@Query("id") id: String): PlaylistPage
    @GET("api/related") suspend fun related(@Query("id") id: String): TracksResponse

    @GET("api/smart-radio")
    suspend fun smartRadio(
        @Query("id") id: String,
        @Query("title") title: String,
        @Query("artist") artist: String,
        @Query("duration") duration: Int,
        @Query("mode") mode: String = "balanced",
    ): SmartRadio

    @POST("api/smart-radio/feedback") suspend fun feedback(@Body body: Feedback): Response<ResponseBody>

    @GET("api/lyrics")
    suspend fun lyrics(
        @Query("title") title: String,
        @Query("artist") artist: String,
        @Query("album") album: String,
        @Query("duration") duration: Int,
        @Query("id") id: String,
    ): Lyrics

    @GET("api/stream/{id}/prepare") suspend fun prepare(@Path("id") id: String): PrepareResponse

    // ---- handoff ----
    @GET("api/handoff/desktop") suspend fun desktop(): DesktopState
    @POST("api/handoff/push") suspend fun push(@Body body: PushRequest): Response<PushResponse>
    @GET("api/handoff/{id}") suspend fun handoffStatus(@Path("id") id: String): HandoffStatusResponse
    @POST("api/handoff/release") suspend fun release(@Body body: ReleaseRequest): Response<ResponseBody>
    @POST("api/handoff/command") suspend fun command(@Body body: com.ghosttunes.mobile.data.model.CommandRequest): Response<ResponseBody>
    /** Warms a track on the PC's own server (used before a flick, so the PC starts instantly). */
    @GET("api/stream/{id}/prepare") suspend fun warmOnPc(@Path("id") id: String): Response<ResponseBody>
}
