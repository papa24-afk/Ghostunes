package com.ghosttunes.mobile.ui.common

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.PlaylistAdd
import androidx.compose.material.icons.automirrored.rounded.QueueMusic
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Download
import androidx.compose.material.icons.rounded.DownloadDone
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.rounded.FavoriteBorder
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.Radio
import androidx.compose.material.icons.rounded.RemoveCircleOutline
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material.icons.rounded.SkipNext
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.layout.Box
import com.ghosttunes.mobile.data.model.Track
import com.ghosttunes.mobile.data.net.ArtworkUrls
import com.ghosttunes.mobile.download.DownloadRepository
import com.ghosttunes.mobile.ui.LocalActions
import com.ghosttunes.mobile.ui.MainViewModel
import com.ghosttunes.mobile.ui.components.Artwork
import com.ghosttunes.mobile.ui.components.trackArtModel
import com.ghosttunes.mobile.ui.player.GtSheet
import com.ghosttunes.mobile.ui.theme.GT
import com.ghosttunes.mobile.ui.theme.Radii
import com.ghosttunes.mobile.ui.theme.Space
import com.ghosttunes.mobile.ui.theme.TypeScale

@Composable
fun TrackMenuSheet(track: Track, playlistId: Long?, vm: MainViewModel, onDismiss: () -> Unit) {
    val actions = LocalActions.current
    val liked by vm.likedIds.collectAsState()
    val downloads by vm.downloadStates.collectAsState()
    val playlists by vm.playlists.collectAsState()
    var page by remember { mutableStateOf("main") }
    var naming by remember { mutableStateOf(false) }
    val dl = downloads[track.id]

    GtSheet(onDismiss) {
        Column(Modifier.navigationBarsPadding().verticalScroll(rememberScrollState()).padding(bottom = Space.md)) {
            Row(Modifier.fillMaxWidth().padding(horizontal = Space.edge, vertical = Space.sm), verticalAlignment = Alignment.CenterVertically) {
                Artwork(trackArtModel(track, ArtworkUrls.Size.Row), null, Modifier.size(Space.rowArt))
                Spacer(Modifier.width(Space.sm))
                Column(Modifier.weight(1f)) {
                    Text(track.title, style = TypeScale.bodyLarge, color = GT.Text, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(track.artist, style = TypeScale.body, color = GT.TextSecondary, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
            Box(Modifier.fillMaxWidth().padding(vertical = Space.xxs).heightIn(min = 1.dp).background(GT.Outline))

            if (page == "main") {
                val isLiked = track.id in liked
                MenuItem(if (isLiked) Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder, if (isLiked) "Remove from Liked Songs" else "Add to Liked Songs", tint = if (isLiked) GT.Accent else GT.Text) {
                    vm.toggleLike(track); onDismiss()
                }
                MenuItem(Icons.Rounded.SkipNext, "Play next") { vm.playNext(track); onDismiss() }
                MenuItem(Icons.AutoMirrored.Rounded.QueueMusic, "Add to queue") { vm.addToQueue(listOf(track)); onDismiss() }
                MenuItem(Icons.AutoMirrored.Rounded.PlaylistAdd, "Add to playlist") { page = "playlists" }
                if (playlistId != null) {
                    MenuItem(Icons.Rounded.RemoveCircleOutline, "Remove from this playlist") { vm.removeFromPlaylist(playlistId, track); onDismiss() }
                }
                when (dl?.state) {
                    DownloadRepository.STATE_DONE -> MenuItem(Icons.Rounded.DownloadDone, "Remove download", tint = GT.Accent) { vm.removeDownload(track.id); onDismiss() }
                    DownloadRepository.STATE_RUNNING, DownloadRepository.STATE_QUEUED ->
                        MenuItem(Icons.Rounded.Delete, "Cancel download (${(dl.progress * 100).toInt()}%)") { vm.removeDownload(track.id); onDismiss() }
                    else -> MenuItem(Icons.Rounded.Download, "Download") { vm.download(listOf(track)); onDismiss() }
                }
                MenuItem(Icons.Rounded.Radio, "Go to song radio") { vm.startRadio(track); onDismiss() }
                MenuItem(Icons.Rounded.Person, "Go to artist") {
                    onDismiss(); actions.openArtist(track.artistId ?: "", track.artist.substringBefore(",").trim())
                }
                MenuItem(Icons.Rounded.Share, "Share") { vm.share(track); onDismiss() }
            } else {
                MenuItem(Icons.Rounded.Add, "New playlist") { naming = true }
                playlists.forEach { p ->
                    Row(
                        Modifier.fillMaxWidth().heightIn(min = 56.dp).clickable { vm.addToPlaylist(p.id, track, p.name); onDismiss() }.padding(horizontal = Space.edge),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Artwork(p.cover?.let { trackArtModel(it, ArtworkUrls.Size.Row) }, null, Modifier.size(Space.compactArt))
                        Spacer(Modifier.width(Space.sm))
                        Column(Modifier.weight(1f)) {
                            Text(p.name, style = TypeScale.bodyLarge, color = GT.Text, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text("${p.count} songs", style = TypeScale.body, color = GT.TextSecondary)
                        }
                    }
                }
            }
        }
    }

    if (naming) {
        NameDialog(
            title = "Name your playlist",
            initial = "",
            confirm = "Create",
            onConfirm = { name -> vm.createPlaylistWith(name, track); naming = false; onDismiss() },
            onDismiss = { naming = false },
        )
    }
}

@Composable
fun MenuItem(icon: ImageVector, text: String, tint: androidx.compose.ui.graphics.Color = GT.Text, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().heightIn(min = 52.dp).clickable(onClick = onClick).padding(horizontal = Space.edge),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, null, tint = tint, modifier = Modifier.size(24.dp))
        Spacer(Modifier.width(Space.md))
        Text(text, style = TypeScale.bodyLarge.copy(fontWeight = TypeScale.body.fontWeight), color = GT.Text)
    }
}

@Composable
fun NameDialog(title: String, initial: String, confirm: String, onConfirm: (String) -> Unit, onDismiss: () -> Unit) {
    var text by remember { mutableStateOf(initial) }
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = GT.Surface2,
        shape = RoundedCornerShape(Radii.sheet),
        title = { Text(title, style = TypeScale.title, color = GT.Text) },
        text = {
            OutlinedTextField(
                value = text,
                onValueChange = { text = it.take(80) },
                singleLine = true,
                textStyle = TypeScale.bodyLarge,
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences, imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { if (text.isNotBlank()) onConfirm(text.trim()) }),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = GT.Text, unfocusedBorderColor = GT.TextTertiary, cursorColor = GT.Accent,
                    focusedTextColor = GT.Text, unfocusedTextColor = GT.Text,
                ),
                modifier = Modifier.fillMaxWidth(),
            )
        },
        confirmButton = { TextButton(onClick = { onConfirm(text.trim()) }, enabled = text.isNotBlank()) { Text(confirm, style = TypeScale.label, color = if (text.isNotBlank()) GT.Accent else GT.TextTertiary) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel", style = TypeScale.label, color = GT.TextSecondary) } },
    )
}
