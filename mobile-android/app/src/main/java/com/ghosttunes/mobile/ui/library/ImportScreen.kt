package com.ghosttunes.mobile.ui.library

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.ContentPaste
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.ghosttunes.mobile.data.direct.PlaylistImporter
import com.ghosttunes.mobile.data.repo.LibraryRepository
import com.ghosttunes.mobile.ui.LocalActions
import com.ghosttunes.mobile.ui.LocalBottomPadding
import com.ghosttunes.mobile.ui.UserPlaylistRoute
import com.ghosttunes.mobile.ui.components.Chip
import com.ghosttunes.mobile.ui.components.PillButton
import com.ghosttunes.mobile.ui.theme.GT
import com.ghosttunes.mobile.ui.theme.Radii
import com.ghosttunes.mobile.ui.theme.Space
import com.ghosttunes.mobile.ui.theme.TypeScale
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import javax.inject.Inject

sealed interface ImportState {
    data object Idle : ImportState
    data class Reading(val platform: String) : ImportState
    data class Matching(val title: String, val done: Int, val total: Int) : ImportState
    data class Done(val playlistId: Long, val title: String, val matched: Int, val total: Int, val missing: List<String>) : ImportState
    data class Failed(val message: String) : ImportState
}

@HiltViewModel
class ImportViewModel @Inject constructor(
    private val importer: PlaylistImporter,
    private val library: LibraryRepository,
) : ViewModel() {
    val link = MutableStateFlow("")
    private val _state = MutableStateFlow<ImportState>(ImportState.Idle)
    val state: StateFlow<ImportState> = _state
    private var job: Job? = null

    fun platformOf(s: String) = importer.platformOf(s)

    fun start() {
        val url = link.value.trim()
        val platform = importer.platformOf(url)
        if (platform == null) {
            _state.value = ImportState.Failed("Paste a playlist link from Spotify, Apple Music, Deezer or YouTube.")
            return
        }
        job?.cancel()
        job = viewModelScope.launch {
            _state.value = ImportState.Reading(platform.label)
            try {
                val resolved = withContext(Dispatchers.IO) { importer.resolve(url) }
                val total = resolved.sources.size + resolved.ready.size
                _state.value = ImportState.Matching(resolved.title, 0, total)
                val result = importer.match(resolved) { d, t -> _state.update { s -> if (s is ImportState.Matching) s.copy(done = d, total = t) else s } }
                val id = library.importPlaylist(result.title, result.tracks, result.cover)
                _state.value = ImportState.Done(id, result.title, result.tracks.size, result.total, result.unmatched.map { "${it.title} — ${it.artist}" })
            } catch (e: kotlinx.coroutines.CancellationException) {
                throw e
            } catch (e: PlaylistImporter.ImportException) {
                _state.value = ImportState.Failed(e.message ?: "Import failed.")
            } catch (e: Exception) {
                _state.value = ImportState.Failed("Couldn't import this playlist. Check the link and your connection.")
            }
        }
    }

    fun reset() { _state.value = ImportState.Idle; link.value = "" }
}

@Composable
fun ImportScreen(vm: ImportViewModel = hiltViewModel()) {
    val state by vm.state.collectAsState()
    val link by vm.link.collectAsState()
    val actions = LocalActions.current
    val bottom = LocalBottomPadding.current
    val clipboard = LocalClipboardManager.current
    val focus = LocalFocusManager.current
    val busy = state is ImportState.Reading || state is ImportState.Matching
    val detected = vm.platformOf(link)

    Column(Modifier.fillMaxSize().imePadding()) {
        Row(Modifier.statusBarsPadding().fillMaxWidth().height(56.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = { actions.nav.popBackStack() }) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back", tint = GT.Text) }
            Text("Import a playlist", style = TypeScale.title, color = GT.Text)
        }
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = Space.edge).padding(bottom = bottom)) {
            Text(
                "Paste a public playlist link.",
                style = TypeScale.body, color = GT.TextSecondary,
            )
            Spacer(Modifier.height(Space.md))
            Row(horizontalArrangement = Arrangement.spacedBy(Space.xs)) {
                PlaylistImporter.Platform.entries.forEach { p -> Chip(p.label, detected == p, onClick = {}) }
            }
            Spacer(Modifier.height(Space.md))
            Row(
                Modifier.fillMaxWidth().height(52.dp).clip(RoundedCornerShape(Radii.hero)).background(GT.Surface2).padding(start = Space.md),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                androidx.compose.foundation.layout.Box(Modifier.weight(1f)) {
                    if (link.isEmpty()) Text("https://open.spotify.com/playlist/…", style = TypeScale.body, color = GT.TextTertiary, maxLines = 1)
                    BasicTextField(
                        value = link,
                        onValueChange = { vm.link.value = it },
                        singleLine = true,
                        enabled = !busy,
                        textStyle = TypeScale.body.copy(color = GT.Text),
                        cursorBrush = SolidColor(GT.Accent),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Go),
                        keyboardActions = KeyboardActions(onGo = { focus.clearFocus(); vm.start() }),
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                IconButton(onClick = { clipboard.getText()?.text?.let { vm.link.value = it.trim() } }, enabled = !busy) {
                    Icon(Icons.Rounded.ContentPaste, "Paste link", tint = GT.TextSecondary)
                }
            }
            Spacer(Modifier.height(Space.md))
            PillButton(
                if (busy) "Importing…" else "Import",
                { focus.clearFocus(); vm.start() },
                filled = true,
                enabled = !busy && link.isNotBlank(),
                modifier = Modifier.fillMaxWidth(),
            )

            Spacer(Modifier.height(Space.lg))
            when (val s = state) {
                is ImportState.Reading -> Status("Reading your ${s.platform} playlist…", null)
                is ImportState.Matching -> Status(
                    "Matching \"${s.title}\": ${s.done} of ${s.total}",
                    if (s.total > 0) s.done / s.total.toFloat() else 0f,
                )
                is ImportState.Failed -> Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radii.hero)).background(GT.Surface2).padding(Space.md)) {
                    Text("Couldn't import", style = TypeScale.bodyLarge, color = GT.Text)
                    Text(s.message, style = TypeScale.body, color = GT.TextSecondary)
                }
                is ImportState.Done -> Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(Radii.hero)).background(GT.Surface2).padding(Space.md)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Rounded.CheckCircle, null, tint = GT.Success, modifier = Modifier.size(22.dp))
                        Spacer(Modifier.size(Space.xs))
                        Text(s.title, style = TypeScale.bodyLarge, color = GT.Text, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    Spacer(Modifier.height(Space.xxs))
                    Text("Imported ${s.matched} of ${s.total} songs.", style = TypeScale.body, color = GT.TextSecondary)
                    AnimatedVisibility(s.missing.isNotEmpty()) {
                        Text(
                            "Not found: " + s.missing.take(8).joinToString("; ") + if (s.missing.size > 8) "; and ${s.missing.size - 8} more" else "",
                            style = TypeScale.label.copy(fontWeight = TypeScale.body.fontWeight), color = GT.TextTertiary,
                            modifier = Modifier.padding(top = Space.xs),
                        )
                    }
                    Spacer(Modifier.height(Space.md))
                    Row(horizontalArrangement = Arrangement.spacedBy(Space.xs)) {
                        PillButton("Open playlist", { actions.nav.navigate(UserPlaylistRoute(s.playlistId)) { popUpTo(com.ghosttunes.mobile.ui.LibraryRoute) } }, filled = true)
                        PillButton("Import another", { vm.reset() })
                    }
                }
                ImportState.Idle -> Unit
            }
        }
    }
}

@Composable
private fun Status(text: String, progress: Float?) {
    Column(Modifier.fillMaxWidth()) {
        Text(text, style = TypeScale.body, color = GT.TextSecondary)
        Spacer(Modifier.height(Space.xs))
        if (progress == null) {
            LinearProgressIndicator(Modifier.fillMaxWidth().clip(CircleShape), color = GT.Accent, trackColor = GT.Surface3)
        } else {
            LinearProgressIndicator(progress = { progress }, modifier = Modifier.fillMaxWidth().clip(CircleShape), color = GT.Accent, trackColor = GT.Surface3, drawStopIndicator = {})
        }
    }
}
