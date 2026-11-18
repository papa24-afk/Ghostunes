package com.ghosttunes.mobile.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.SharedTransitionLayout
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Home
import androidx.compose.material.icons.rounded.LibraryMusic
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.LibraryMusic
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavController
import androidx.navigation.NavDestination.Companion.hasRoute
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.toRoute
import com.ghosttunes.mobile.data.model.Track
import com.ghosttunes.mobile.ui.collection.AlbumScreen
import com.ghosttunes.mobile.ui.collection.DownloadsScreen
import com.ghosttunes.mobile.ui.collection.GenreScreen
import com.ghosttunes.mobile.ui.collection.HistoryScreen
import com.ghosttunes.mobile.ui.collection.LikedScreen
import com.ghosttunes.mobile.ui.collection.PlaylistScreen
import com.ghosttunes.mobile.ui.collection.UserPlaylistScreen
import com.ghosttunes.mobile.ui.artist.ArtistScreen
import com.ghosttunes.mobile.ui.common.TrackMenuSheet
import com.ghosttunes.mobile.ui.components.HandoffPill
import com.ghosttunes.mobile.ui.home.HomeScreen
import com.ghosttunes.mobile.ui.library.LibraryScreen
import com.ghosttunes.mobile.ui.onboarding.OnboardingScreen
import com.ghosttunes.mobile.ui.player.MiniPlayer
import com.ghosttunes.mobile.ui.player.NowPlaying
import com.ghosttunes.mobile.ui.search.SearchScreen
import com.ghosttunes.mobile.ui.settings.DebugScreen
import com.ghosttunes.mobile.ui.settings.SettingsScreen
import com.ghosttunes.mobile.ui.theme.GT
import com.ghosttunes.mobile.ui.theme.Space
import com.ghosttunes.mobile.ui.theme.TypeScale
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.StateFlow

@Composable
fun AppRoot(openPlayerRequests: StateFlow<Int>, vm: MainViewModel = hiltViewModel()) {
    val settings by vm.settings.settings.collectAsState()
    // The phone streams on its own; the PC setup screen only appears if the user chose the PC as source.
    if (!settings.streamFromPhone && !settings.onboarded) {
        OnboardingScreen()
        return
    }

    val nav = rememberNavController()
    val player by vm.player.collectAsState()
    val handoff by vm.handoffStatus.collectAsState()
    var expanded by rememberSaveable { mutableStateOf(false) }
    var menuFor by remember { mutableStateOf<Pair<Track, Long?>?>(null) }
    var tab by rememberSaveable { mutableStateOf(Tab.Home) }

    val openRequests by openPlayerRequests.collectAsState()
    LaunchedEffect(openRequests) { if (openRequests > 0 && player.current != null) expanded = true }

    val actions = remember(nav) {
        object : AppActions {
            override val nav: NavController = nav
            override fun play(tracks: List<Track>, index: Int, from: String, shuffle: Boolean) = vm.play(tracks, index, from, shuffle)
            override fun trackMenu(track: Track, playlistId: Long?) { menuFor = track to playlistId }
            override fun openArtist(id: String, name: String) { expanded = false; nav.navigate(ArtistRoute(id, name)) }
            override fun openAlbum(id: String) { expanded = false; nav.navigate(AlbumRoute(id)) }
            override fun openPlaylist(id: String) = nav.navigate(PlaylistRoute(id))
            override fun openGenre(name: String) = nav.navigate(GenreRoute(name))
            override fun toggleLike(track: Track) { vm.toggleLike(track) }
            override fun download(tracks: List<Track>) { vm.download(tracks) }
            override fun addToQueue(tracks: List<Track>) = vm.addToQueue(tracks)
            override fun snack(text: String) = vm.snack(text)
        }
    }

    // Keep the highlighted tab in sync when back navigation lands on another tab's root.
    val entry by nav.currentBackStackEntryAsState()
    LaunchedEffect(entry) {
        val d = entry?.destination ?: return@LaunchedEffect
        when {
            d.hasRoute(HomeRoute::class) -> tab = Tab.Home
            d.hasRoute(SearchRoute::class) -> tab = Tab.Search
            d.hasRoute(LibraryRoute::class) -> tab = Tab.Library
        }
    }

    val navInset = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    val hasTrack = player.current != null
    val bottomPadding = Space.navBar + navInset + (if (hasTrack) Space.miniPlayer + Space.xs else 0.dp) + Space.md

    androidx.compose.runtime.CompositionLocalProvider(LocalActions provides actions, LocalBottomPadding provides bottomPadding, LocalMainVm provides vm) {
        SharedTransitionLayout(Modifier.fillMaxSize().background(GT.Bg)) {
            Box(Modifier.fillMaxSize()) {
                NavHost(
                    navController = nav,
                    startDestination = HomeRoute,
                    modifier = Modifier.fillMaxSize(),
                    enterTransition = { slideInHorizontally(tween(300)) { it / 4 } + fadeIn(tween(300)) },
                    exitTransition = { fadeOut(tween(200)) },
                    popEnterTransition = { fadeIn(tween(250)) },
                    popExitTransition = { slideOutHorizontally(tween(250)) { it / 4 } + fadeOut(tween(250)) },
                ) {
                    composable<HomeRoute>(enterTransition = { fadeIn(tween(220)) }, exitTransition = { fadeOut(tween(160)) }) { HomeScreen() }
                    composable<SearchRoute>(enterTransition = { fadeIn(tween(220)) }, exitTransition = { fadeOut(tween(160)) }) { SearchScreen() }
                    composable<LibraryRoute>(enterTransition = { fadeIn(tween(220)) }, exitTransition = { fadeOut(tween(160)) }) { LibraryScreen() }
                    composable<SettingsRoute> { SettingsScreen() }
                    composable<DebugRoute> { DebugScreen() }
                    composable<LikedRoute> { LikedScreen() }
                    composable<DownloadsRoute> { DownloadsScreen() }
                    composable<HistoryRoute> { HistoryScreen() }
                    composable<ImportRoute> { com.ghosttunes.mobile.ui.library.ImportScreen() }
                    composable<AlbumRoute> { AlbumScreen(it.toRoute<AlbumRoute>().id) }
                    composable<ArtistRoute> { val r = it.toRoute<ArtistRoute>(); ArtistScreen(r.id, r.name) }
                    composable<PlaylistRoute> { PlaylistScreen(it.toRoute<PlaylistRoute>().id) }
                    composable<UserPlaylistRoute> { UserPlaylistScreen(it.toRoute<UserPlaylistRoute>().id) }
                    composable<GenreRoute> { GenreScreen(it.toRoute<GenreRoute>().name) }
                }

                // Bottom chrome: mini-player above a nav bar that fades into the background.
                Column(Modifier.align(Alignment.BottomCenter).fillMaxWidth()) {
                    AnimatedVisibility(
                        visible = hasTrack && !expanded,
                        enter = fadeIn(tween(200)),
                        exit = fadeOut(tween(120)),
                    ) {
                        MiniPlayer(
                            vm = vm,
                            onExpand = { expanded = true },
                            sharedScope = this@SharedTransitionLayout,
                            visibilityScope = this,
                            modifier = Modifier.padding(horizontal = Space.xs),
                        )
                    }
                    BottomNav(tab) { t ->
                        if (t == tab && t == Tab.Home) {
                            nav.popBackStack(HomeRoute, inclusive = false)
                        }
                        tab = t
                        val route: Any = when (t) { Tab.Home -> HomeRoute; Tab.Search -> SearchRoute; Tab.Library -> LibraryRoute }
                        nav.navigate(route) {
                            popUpTo(nav.graph.findStartDestination().id) { saveState = true }
                            launchSingleTop = true
                            restoreState = true
                        }
                    }
                }

                AnimatedVisibility(
                    visible = expanded && hasTrack,
                    enter = slideInVertically(tween(320)) { it / 3 } + fadeIn(tween(240)),
                    exit = slideOutVertically(tween(260)) { it / 3 } + fadeOut(tween(200)),
                ) {
                    NowPlaying(
                        vm = vm,
                        onCollapse = { expanded = false },
                        sharedScope = this@SharedTransitionLayout,
                        visibilityScope = this,
                    )
                }

                SnackHost(vm, Modifier.align(Alignment.BottomCenter).padding(bottom = if (expanded) navInset + Space.lg else bottomPadding))

                com.ghosttunes.mobile.ui.components.TransferOverlay(vm.coordinator)
                HandoffPill(handoff, Modifier.align(Alignment.TopCenter).statusBarsPadding())
            }
        }

        menuFor?.let { (track, playlistId) ->
            TrackMenuSheet(track = track, playlistId = playlistId, vm = vm, onDismiss = { menuFor = null })
        }
    }
}

@Composable
private fun BottomNav(selected: Tab, onSelect: (Tab) -> Unit) {
    Box(
        Modifier
            .fillMaxWidth()
            .background(Brush.verticalGradient(0f to GT.Bg.copy(alpha = 0f), 0.35f to GT.Bg.copy(alpha = 0.92f), 1f to GT.Bg))
            .navigationBarsPadding()
            .height(Space.navBar),
    ) {
        Row(Modifier.fillMaxSize(), horizontalArrangement = Arrangement.SpaceEvenly, verticalAlignment = Alignment.CenterVertically) {
            NavItem("Home", Icons.Rounded.Home, Icons.Outlined.Home, selected == Tab.Home) { onSelect(Tab.Home) }
            NavItem("Search", Icons.Rounded.Search, Icons.Outlined.Search, selected == Tab.Search) { onSelect(Tab.Search) }
            NavItem("Your Library", Icons.Rounded.LibraryMusic, Icons.Outlined.LibraryMusic, selected == Tab.Library) { onSelect(Tab.Library) }
        }
    }
}

@Composable
private fun NavItem(label: String, active: ImageVector, inactive: ImageVector, selected: Boolean, onClick: () -> Unit) {
    val color = if (selected) GT.Text else GT.TextTertiary
    Column(
        Modifier
            .clip(CircleShape)
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, onClick = onClick)
            .semantics { role = Role.Tab; this.selected = selected }
            .padding(horizontal = Space.lg, vertical = 6.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(if (selected) active else inactive, null, tint = color, modifier = Modifier.size(26.dp))
        Spacer(Modifier.height(2.dp))
        Text(label, style = TypeScale.caption, color = color, maxLines = 1)
    }
}

@Composable
private fun SnackHost(vm: MainViewModel, modifier: Modifier) {
    val snack by vm.snack.collectAsState()
    var visible by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(snack) {
        val s = snack ?: return@LaunchedEffect
        visible = s.text
        delay(2_000)
        visible = null
    }
    AnimatedVisibility(visible != null, modifier, enter = fadeIn() + slideInVertically { it / 2 }, exit = fadeOut()) {
        Box(
            Modifier.padding(horizontal = Space.edge).clip(CircleShape).background(GT.Text).padding(horizontal = Space.md, vertical = 10.dp),
        ) { Text(visible.orEmpty(), style = TypeScale.label.copy(fontSize = TypeScale.body.fontSize), color = GT.Bg, maxLines = 1) }
    }
}
