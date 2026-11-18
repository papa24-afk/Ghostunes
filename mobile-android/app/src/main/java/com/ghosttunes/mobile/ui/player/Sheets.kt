package com.ghosttunes.mobile.ui.player

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Computer
import androidx.compose.material.icons.rounded.DragHandle
import androidx.compose.material.icons.rounded.Headphones
import androidx.compose.material.icons.rounded.PhoneAndroid
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.SwipeToDismissBox
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.material3.rememberSwipeToDismissBoxState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.ghosttunes.mobile.data.model.DesktopState
import com.ghosttunes.mobile.data.model.Track
import com.ghosttunes.mobile.data.net.ArtworkUrls
import com.ghosttunes.mobile.playback.SleepTimerState
import com.ghosttunes.mobile.ui.MainViewModel
import com.ghosttunes.mobile.ui.components.Artwork
import com.ghosttunes.mobile.ui.components.EqualizerBars
import com.ghosttunes.mobile.ui.components.rememberHaptics
import com.ghosttunes.mobile.ui.components.trackArtModel
import com.ghosttunes.mobile.ui.theme.GT
import com.ghosttunes.mobile.ui.theme.Radii
import com.ghosttunes.mobile.ui.theme.Space
import com.ghosttunes.mobile.ui.theme.TypeScale
import kotlinx.coroutines.delay
import sh.calvin.reorderable.ReorderableItem
import sh.calvin.reorderable.rememberReorderableLazyListState

@Composable
fun GtSheet(onDismiss: () -> Unit, content: @Composable () -> Unit) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = GT.Surface1,
        contentColor = GT.Text,
        shape = RoundedCornerShape(topStart = Radii.sheet, topEnd = Radii.sheet),
        dragHandle = {
            Box(Modifier.padding(top = Space.sm, bottom = Space.xs).size(width = 36.dp, height = 4.dp).clip(CircleShape).background(GT.TextTertiary))
        },
    ) { content() }
}

@Composable
private fun SheetTitle(text: String, trailing: (@Composable () -> Unit)? = null) {
    Row(Modifier.fillMaxWidth().padding(start = Space.edge, end = Space.xs, top = Space.xs, bottom = Space.xs), verticalAlignment = Alignment.CenterVertically) {
        Text(text, style = TypeScale.title, color = GT.Text, modifier = Modifier.weight(1f))
        trailing?.invoke()
    }
}

private data class QueueEntry(val key: String, val playerIndex: Int, val track: Track)

@Composable
fun QueueSheet(vm: MainViewModel, onDismiss: () -> Unit) {
    val state by vm.player.collectAsState()
    val from by vm.playingFrom.collectAsState()
    val haptics = rememberHaptics()
    val current = state.current ?: return

    var entries by remember { mutableStateOf(emptyList<QueueEntry>()) }
    var dragging by remember { mutableStateOf<QueueEntry?>(null) }
    LaunchedEffect(state.upNext, state.queue) {
        if (dragging == null) entries = state.upNext.mapNotNull { i -> state.queue.getOrNull(i)?.let { QueueEntry("${it.id}#$i", i, it) } }
    }
    val listState = rememberLazyListState()
    val reorder = rememberReorderableLazyListState(listState) { from, to ->
        val fromIdx = entries.indexOfFirst { it.key == from.key }
        val toIdx = entries.indexOfFirst { it.key == to.key }
        if (fromIdx >= 0 && toIdx >= 0) {
            entries = entries.toMutableList().apply { add(toIdx, removeAt(fromIdx)) }
            haptics.tick()
        }
    }

    GtSheet(onDismiss) {
        LazyColumn(state = listState, modifier = Modifier.fillMaxHeight(0.92f).navigationBarsPadding()) {
            item(key = "h-now") { SheetTitle("Now playing") }
            item(key = "now") { QueueRow(current, playing = state.isPlaying, current = true) }
            item(key = "h-next") {
                SheetTitle(if (from.isNotBlank()) "Next from: $from" else "Next up") {
                    if (entries.isNotEmpty()) {
                        Text("Clear", style = TypeScale.label, color = GT.TextSecondary,
                            modifier = Modifier.clip(CircleShape).clickable { vm.playback.clearUpNext() }.padding(Space.sm))
                    }
                }
                if (state.shuffle && entries.size > 1) {
                    Text("Turn off shuffle to reorder.", style = TypeScale.label, color = GT.TextTertiary, modifier = Modifier.padding(horizontal = Space.edge, vertical = Space.xxs))
                }
            }
            if (entries.isEmpty()) {
                item(key = "empty") {
                    Text("Nothing queued.", style = TypeScale.body, color = GT.TextSecondary, modifier = Modifier.padding(Space.edge))
                }
            }
            items(entries, key = { it.key }) { entry ->
                ReorderableItem(reorder, key = entry.key) { isDragging ->
                    val dismiss = rememberSwipeToDismissBoxState(confirmValueChange = { v ->
                        if (v != SwipeToDismissBoxValue.Settled) { haptics.tick(); vm.playback.remove(entry.playerIndex) }
                        v != SwipeToDismissBoxValue.Settled
                    })
                    SwipeToDismissBox(
                        dismiss,
                        backgroundContent = {
                            Box(Modifier.fillMaxWidth().fillMaxHeight().background(GT.Surface3).padding(horizontal = Space.edge), contentAlignment = Alignment.CenterEnd) {
                                Text("Remove", style = TypeScale.label, color = GT.TextSecondary)
                            }
                        },
                    ) {
                        Row(
                            Modifier.fillMaxWidth().background(if (isDragging) GT.Surface3 else GT.Surface1)
                                .clickable { vm.playback.skipTo(entry.playerIndex) },
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Box(Modifier.weight(1f)) { QueueRow(entry.track, playing = false, current = false) }
                            if (!state.shuffle) {
                                IconButton(
                                    onClick = {},
                                    modifier = Modifier.draggableHandle(
                                        onDragStarted = { dragging = entry; haptics.longPress() },
                                        onDragStopped = {
                                            val moved = dragging
                                            dragging = null
                                            if (moved != null) {
                                                val newPos = entries.indexOfFirst { it.key == moved.key }
                                                if (newPos >= 0) vm.playback.move(moved.playerIndex, state.index + 1 + newPos)
                                            }
                                        },
                                    ),
                                ) { Icon(Icons.Rounded.DragHandle, "Reorder ${entry.track.title}", tint = GT.TextSecondary) }
                            }
                        }
                    }
                }
            }
            item(key = "pad") { Spacer(Modifier.height(Space.lg)) }
        }
    }
}

@Composable
private fun QueueRow(track: Track, playing: Boolean, current: Boolean) {
    Row(Modifier.fillMaxWidth().heightIn(min = Space.compactRow).padding(horizontal = Space.edge), verticalAlignment = Alignment.CenterVertically) {
        Artwork(trackArtModel(track, ArtworkUrls.Size.Row), null, Modifier.size(Space.compactArt))
        Spacer(Modifier.width(Space.sm))
        Column(Modifier.weight(1f).padding(vertical = Space.xs)) {
            Text(track.title, style = TypeScale.bodyLarge.copy(fontSize = TypeScale.body.fontSize), color = if (current) GT.Accent else GT.Text, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(track.artist, style = TypeScale.label.copy(fontWeight = TypeScale.body.fontWeight), color = GT.TextSecondary, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        if (current) EqualizerBars(animate = playing)
    }
}

@Composable
fun SleepSheet(vm: MainViewModel, onDismiss: () -> Unit) {
    val timer by vm.sleepTimer.collectAsState()
    val remaining by produceState(0L, timer) {
        while (true) {
            value = (timer as? SleepTimerState.At)?.let { it.endsAtElapsed - android.os.SystemClock.elapsedRealtime() } ?: 0L
            delay(1_000)
        }
    }
    GtSheet(onDismiss) {
        Column(Modifier.navigationBarsPadding().padding(bottom = Space.md)) {
            SheetTitle("Sleep timer")
            val status = when (val t = timer) {
                SleepTimerState.Off -> "Off"
                SleepTimerState.EndOfTrack -> "Stops at the end of this song"
                is SleepTimerState.At -> "Stops in ${formatTime(remaining)}"
            }
            Text(status, style = TypeScale.body, color = GT.TextSecondary, modifier = Modifier.padding(horizontal = Space.edge))
            Spacer(Modifier.height(Space.xs))
            listOf(5, 15, 30, 45, 60).forEach { m ->
                SheetOption("$m minutes", selected = (timer as? SleepTimerState.At)?.minutes == m) { vm.setSleep(m); onDismiss() }
            }
            SheetOption("End of this song", selected = timer == SleepTimerState.EndOfTrack) { vm.sleepEndOfTrack(); onDismiss() }
            if (timer != SleepTimerState.Off) SheetOption("Turn off timer", selected = false) { vm.cancelSleep(); onDismiss() }
        }
    }
}

@Composable
fun SheetOption(text: String, selected: Boolean, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().heightIn(min = 52.dp).clickable(onClick = onClick).padding(horizontal = Space.edge),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(text, style = TypeScale.bodyLarge.copy(fontWeight = TypeScale.body.fontWeight), color = if (selected) GT.Accent else GT.Text, modifier = Modifier.weight(1f))
        if (selected) Icon(Icons.Rounded.Check, "Selected", tint = GT.Accent)
    }
}

/** Spotify Connect-style picker: this phone, or Ghosttunes on the PC. */
@Composable
fun DeviceSheet(vm: MainViewModel, onDismiss: () -> Unit) {
    val desktop by produceState<Result<DesktopState>?>(null) {
        while (true) {
            value = runCatching { vm.desktopState() }
            delay(2_000)
        }
    }
    GtSheet(onDismiss) {
        Column(Modifier.navigationBarsPadding().padding(bottom = Space.md)) {
            SheetTitle("Connect to a device")
            val remote by vm.remote.collectAsState()
            val output by vm.output.collectAsState()
            val onHeadset = output.kind != com.ghosttunes.mobile.playback.OutputDevice.Kind.Speaker
            DeviceRow(
                if (onHeadset) Icons.Rounded.Headphones else Icons.Rounded.PhoneAndroid,
                if (onHeadset) output.name else "This phone",
                if (remote != null) "Continue here" else if (onHeadset) "This phone" else "Playing here",
                active = remote == null, enabled = true,
            ) {
                vm.continueOnPhone()
                onDismiss()
            }
            val d = desktop
            val (subtitle, online) = when {
                d == null -> "Looking for your PC…" to false
                d.isFailure -> "Can't reach your PC" to false
                d.getOrNull()?.online != true -> "Open Ghosttunes on your PC" to false
                else -> {
                    val np = d.getOrNull()?.nowPlaying
                    (if (np != null && np.isPlaying) "Playing ${np.track.title}" else "Ready") to true
                }
            }
            val pcName = remote?.pcName ?: d?.getOrNull()?.name?.ifBlank { null } ?: "Your PC"
            DeviceRow(Icons.Rounded.Computer, pcName, if (remote != null) "Playing here" else subtitle, active = remote != null, enabled = online || remote != null) {
                vm.handoff()
                onDismiss()
            }
        }
    }
}

@Composable
private fun DeviceRow(icon: androidx.compose.ui.graphics.vector.ImageVector, title: String, subtitle: String, active: Boolean, enabled: Boolean, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().heightIn(min = Space.row).clickable(enabled = enabled && !active, onClick = onClick).padding(horizontal = Space.edge),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Space.md),
    ) {
        Icon(icon, null, tint = if (active) GT.Accent else if (enabled) GT.Text else GT.TextTertiary, modifier = Modifier.size(28.dp))
        Column(Modifier.weight(1f)) {
            Text(title, style = TypeScale.bodyLarge, color = if (active) GT.Accent else if (enabled) GT.Text else GT.TextSecondary)
            Text(subtitle, style = TypeScale.body, color = GT.TextSecondary, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        if (active) EqualizerBars(animate = true)
    }
}
