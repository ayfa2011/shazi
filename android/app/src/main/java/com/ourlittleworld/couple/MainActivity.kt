package com.ourlittleworld.couple

import android.os.Bundle
import android.net.Uri
import android.widget.Toast
import android.content.Context
import android.media.MediaRecorder
import android.media.MediaPlayer
import android.media.MediaMetadataRetriever
import android.widget.VideoView
import android.Manifest
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.provider.OpenableColumns
import android.content.pm.PackageManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.Image
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.rememberTransformableState
import androidx.compose.foundation.gestures.transformable
import coil.compose.AsyncImage
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.SelectableDates
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.lightColorScheme
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.BiasAlignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.draw.clip
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.sp
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.IntSize
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseUser
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.MetadataChanges
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.ListenerRegistration
import com.google.firebase.database.DataSnapshot
import com.google.firebase.database.DatabaseError
import com.google.firebase.database.FirebaseDatabase
import com.google.firebase.database.ValueEventListener
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.Job
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID
import java.io.File
import java.security.MessageDigest
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.delay
import java.text.DateFormat
import java.util.Date
import java.time.Duration
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.Locale

private val Rose = Color(0xFFE85287)
private val Ink = Color(0xFF382630)
private val SoftPink = Color(0xFFFFF5F8)

private data class PartnerProfile(val key: String, val name: String, val email: String, val initial: String, val avatar: String = "", val avatarTelegramFileId: String = "", val avatarMimeType: String = "image/jpeg", val previousNames: List<String> = emptyList())

private val partnerProfiles = mutableStateListOf(
    PartnerProfile("kebyy", "Keby", "akabeeram@gmail.com", "K"),
    PartnerProfile("shazy", "Shazy", "hizasgallery@gmail.com", "S")
)

private data class FeedPost(
    val id: String,
    val authorName: String,
    val text: String,
    val createdAt: String,
    val likedBy: List<String> = emptyList(),
    val photoUrl: String? = null,
    val telegramFileId: String? = null,
    val mediaMimeType: String? = null,
    val mediaType: String? = null
)

private data class SpecialReminder(val title: String, val date: String, val days: Long)
private data class LetterMarks(val bold: Boolean = false, val italic: Boolean = false, val underline: Boolean = false)

private fun letterFontSizeFromHtml(html: String): Int = Regex("font-size\\s*:\\s*(\\d+)", RegexOption.IGNORE_CASE)
    .find(html)?.groupValues?.getOrNull(1)?.toIntOrNull()?.coerceIn(14, 38) ?: 20

private fun letterHtmlToTextFieldValue(html: String): TextFieldValue {
    if (html.isBlank()) return TextFieldValue("")
    val spanned = android.text.Html.fromHtml(html, android.text.Html.FROM_HTML_MODE_COMPACT)
    val text = spanned.toString()
    val builder = AnnotatedString.Builder(text)
    spanned.getSpans(0, spanned.length, android.text.style.StyleSpan::class.java).forEach { span ->
        val start = spanned.getSpanStart(span).coerceIn(0, text.length)
        val end = spanned.getSpanEnd(span).coerceIn(start, text.length)
        if (start < end) {
            if (span.style and android.graphics.Typeface.BOLD != 0) builder.addStyle(SpanStyle(fontWeight = FontWeight.Bold), start, end)
            if (span.style and android.graphics.Typeface.ITALIC != 0) builder.addStyle(SpanStyle(fontStyle = FontStyle.Italic), start, end)
        }
    }
    spanned.getSpans(0, spanned.length, android.text.style.UnderlineSpan::class.java).forEach { span ->
        val start = spanned.getSpanStart(span).coerceIn(0, text.length)
        val end = spanned.getSpanEnd(span).coerceIn(start, text.length)
        if (start < end) builder.addStyle(SpanStyle(textDecoration = TextDecoration.Underline), start, end)
    }
    return TextFieldValue(builder.toAnnotatedString(), TextRange(text.length))
}

private fun letterMarksAt(value: AnnotatedString, index: Int): LetterMarks {
    var marks = LetterMarks()
    value.spanStyles.filter { index >= it.start && index < it.end }.forEach { range ->
        range.item.fontWeight?.let { marks = marks.copy(bold = it == FontWeight.Bold) }
        range.item.fontStyle?.let { marks = marks.copy(italic = it == FontStyle.Italic) }
        range.item.textDecoration?.let { marks = marks.copy(underline = it.contains(TextDecoration.Underline)) }
    }
    return marks
}

private fun letterTextFieldValueToHtml(value: TextFieldValue, fontSize: Int): String {
    val text = value.text
    val output = StringBuilder("<div style=\"font-size:${fontSize.coerceIn(14, 38)}px\">")
    var start = 0
    while (start < text.length) {
        val marks = letterMarksAt(value.annotatedString, start)
        var end = start + 1
        while (end < text.length && letterMarksAt(value.annotatedString, end) == marks) end++
        if (marks.bold) output.append("<b>")
        if (marks.italic) output.append("<i>")
        if (marks.underline) output.append("<u>")
        for (index in start until end) {
            when (val char = text[index]) {
                '&' -> output.append("&amp;")
                '<' -> output.append("&lt;")
                '>' -> output.append("&gt;")
                '\n' -> output.append("<br>")
                else -> output.append(char)
            }
        }
        if (marks.underline) output.append("</u>")
        if (marks.italic) output.append("</i>")
        if (marks.bold) output.append("</b>")
        start = end
    }
    return output.append("</div>").toString()
}

private fun renderNativeLetterBitmap(bodyHtml: String, authorName: String, fontSize: Int): Bitmap {
    val width = 1080
    val padding = 84
    val body = android.text.Html.fromHtml(bodyHtml, android.text.Html.FROM_HTML_MODE_COMPACT)
    val titlePaint = android.text.TextPaint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
        color = android.graphics.Color.rgb(135, 52, 86); textSize = 42f; typeface = android.graphics.Typeface.create("serif", android.graphics.Typeface.BOLD)
    }
    val bodyPaint = android.text.TextPaint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
        color = android.graphics.Color.rgb(72, 48, 61); textSize = (fontSize * 2.1f).coerceIn(30f, 80f)
        typeface = android.graphics.Typeface.create("casual", android.graphics.Typeface.NORMAL)
    }
    val layout = android.text.StaticLayout.Builder.obtain(body, 0, body.length, bodyPaint, width - padding * 2)
        .setAlignment(android.text.Layout.Alignment.ALIGN_NORMAL).setIncludePad(true).setLineSpacing(18f, 1.12f).build()
    val headerHeight = 210
    val bottomPadding = 110
    val height = (headerHeight + layout.height + bottomPadding).coerceIn(900, 7000)
    val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    val canvas = android.graphics.Canvas(bitmap)
    canvas.drawColor(android.graphics.Color.WHITE)
    val rulePaint = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply { color = 0xFFE9DCE5.toInt(); strokeWidth = 2f }
    var y = headerHeight.toFloat()
    while (y < height - bottomPadding / 2f) { canvas.drawLine(0f, y, width.toFloat(), y, rulePaint); y += bodyPaint.textSize * 1.12f + 18f }
    canvas.drawText("A letter from $authorName", padding.toFloat(), 82f, titlePaint)
    canvas.drawText("With love ♡", padding.toFloat(), 142f, android.text.TextPaint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
        color = android.graphics.Color.rgb(176, 77, 119); textSize = 28f; typeface = android.graphics.Typeface.create("serif", android.graphics.Typeface.ITALIC)
    })
    canvas.save(); canvas.translate(padding.toFloat(), headerHeight.toFloat()); layout.draw(canvas); canvas.restore()
    canvas.drawText("K & S  ·  Always", padding.toFloat(), height - 42f, android.text.TextPaint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
        color = android.graphics.Color.rgb(161, 122, 141); textSize = 24f; typeface = android.graphics.Typeface.create("serif", android.graphics.Typeface.ITALIC)
    })
    return bitmap
}

private data class NativeDrawPoint(val x: Float, val y: Float)
private data class NativeDrawStroke(val id: String, val uid: String, val color: Int, val width: Float, val points: List<NativeDrawPoint>, val tool: String = "pen", val opacity: Float = 1f)
private fun nativeDrawingJsonValue(value: Any?): Any? = when (value) {
    is org.json.JSONObject -> value.keys().asSequence().associateWith { key -> nativeDrawingJsonValue(value.opt(key)) }
    is org.json.JSONArray -> (0 until value.length()).map { index -> nativeDrawingJsonValue(value.opt(index)) }
    org.json.JSONObject.NULL -> null
    else -> value
}
private class NativeDrawingOutbox(context: Context, uid: String) {
    private val prefs = context.getSharedPreferences("native-drawing-outbox", Context.MODE_PRIVATE)
    private val storageKey = "queue-$uid"
    @Synchronized fun all(): List<Map<String, Any?>> = runCatching {
        val array = org.json.JSONArray(prefs.getString(storageKey, "[]"))
        (0 until array.length()).mapNotNull { i -> nativeDrawingJsonValue(array.optJSONObject(i)) as? Map<String, Any?> }
    }.getOrDefault(emptyList())
    @Synchronized fun add(operation: Map<String, Any?>) { write(all() + operation) }
    @Synchronized fun remove(opId: String) { write(all().filterNot { it["opId"] == opId }) }
    @Synchronized fun removeTypes(types: Set<String>) { write(all().filterNot { types.contains(it["type"] as? String ?: "") }) }
    @Synchronized fun removeStaleBefore(cutoffMs: Long) {
        write(all().filterNot { operation ->
            val type = operation["type"] as? String
            type != null && type in setOf("stroke", "redo", "undo") && ((operation["createdAt"] as? Number)?.toLong() ?: Long.MAX_VALUE) <= cutoffMs
        })
    }
    @Synchronized private fun write(operations: List<Map<String, Any?>>) {
        val array = org.json.JSONArray()
        operations.forEach { array.put(org.json.JSONObject(it)) }
        prefs.edit().putString(storageKey, array.toString()).apply()
    }
}
private fun nativeDrawStrokeFromMap(value: Map<*, *>): NativeDrawStroke? {
    val points = (value["points"] as? List<*>)?.mapNotNull { raw ->
        val point = raw as? Map<*, *> ?: return@mapNotNull null
        val x = (point["x"] as? Number)?.toFloat() ?: return@mapNotNull null
        val y = (point["y"] as? Number)?.toFloat() ?: return@mapNotNull null
        NativeDrawPoint(x.coerceIn(0f, 1f), y.coerceIn(0f, 1f))
    }.orEmpty()
    if (points.isEmpty()) return null
    val storedSize = (value["size"] as? Number)?.toFloat() ?: 5f
    val normalizedSize = if (storedSize > 1f) storedSize / 800f else storedSize
    return NativeDrawStroke(value["id"] as? String ?: UUID.randomUUID().toString(), value["uid"] as? String ?: "", (value["color"] as? Number)?.toLong()?.toInt() ?: 0xFFDC4D88.toInt(), normalizedSize, points, value["tool"] as? String ?: "pen", (value["opacity"] as? Number)?.toFloat() ?: 1f)
}
private data class FeedComment(val id: String, val authorName: String, val authorId: String, val text: String, val parentId: String?, val likedBy: List<String>, val telegramAudioFileId: String? = null, val voiceMimeType: String? = null, val voiceDurationMs: Long = 0L)
private data class VoiceAttachment(val fileId: String, val mimeType: String, val durationMs: Long, val fileUniqueId: String = "", val messageId: Any? = null, val chatId: Any? = null)
private data class NativePost(val id: String, val authorName: String, val authorId: String, val text: String, val createdAt: String, val likedBy: List<String>, val photoUrl: String?, val photoPosition: String?, val telegramFileId: String?, val telegramMimeType: String?, val telegramAudioFileId: String?, val voiceMimeType: String?, val voiceDurationMs: Long)
private fun DocumentSnapshot.toNativePost(): NativePost {
    val date = getTimestamp("createdAt")?.toDate()
    return NativePost(
        id = id,
        authorName = getString("authorName") ?: "Us",
        authorId = getString("authorId") ?: "",
        text = getString("text") ?: "",
        createdAt = date?.let { DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT).format(it) } ?: "Just now",
        likedBy = get("likedBy") as? List<String> ?: emptyList(),
        photoUrl = getString("photoUrl"),
        photoPosition = getString("photoPosition"),
        telegramFileId = getString("telegramFileId"),
        telegramMimeType = getString("photoMimeType") ?: getString("telegramMimeType"),
        telegramAudioFileId = getString("telegramAudioFileId"),
        voiceMimeType = getString("voiceMimeType"),
        voiceDurationMs = getLong("voiceDurationMs") ?: 0L
    )
}

private suspend fun notifyPostPartner(actor: PartnerProfile?, type: String, message: String, sourceId: String, route: String) {
    if (actor == null) return
    val recipient = partnerProfiles.firstOrNull { it.key != actor.key } ?: return
    val safeSourceId = sourceId.replace(Regex("[^A-Za-z0-9_-]"), "_").take(100)
    if (safeSourceId.isBlank()) return
    val notificationId = "$type-$safeSourceId-${recipient.key}"
    val reference = FirebaseFirestore.getInstance().collection("couples").document("our-little-world").collection("notifications").document(notificationId)
    FirebaseFirestore.getInstance().runTransaction { transaction ->
        if (!transaction.get(reference).exists()) {
            transaction.set(reference, mapOf("recipientKey" to recipient.key, "actorKey" to actor.key, "type" to type, "title" to actor.name, "message" to message.take(240), "route" to route, "sourceId" to safeSourceId, "createdAt" to FieldValue.serverTimestamp(), "readAt" to null))
        }
    }.await()
}

private fun nativeQuestionHash(value: String): String {
    var hash = 2_166_136_261u
    value.forEach { hash = (hash xor it.code.toUInt()) * 16_777_619u }
    return hash.toString(36)
}

private suspend fun migrateNativeLegacyQuestionAnswers(context: Context, user: FirebaseUser, profileKey: String): Int {
    val preferences = context.getSharedPreferences("native-question-migrations", Context.MODE_PRIVATE)
    val marker = "legacy-question-answers-v1-${user.uid}"
    if (preferences.getBoolean(marker, false)) return 0

    val firestore = FirebaseFirestore.getInstance()
    val coupleId = "our-little-world"
    val legacyItems = firestore.collection("couples").document(coupleId).collection("items")
        .whereEqualTo("author", user.uid).get().await()
    val uniqueAnswers = linkedMapOf<String, Map<String, Any?>>()
    legacyItems.documents.forEach { document ->
        val item = document.data.orEmpty()
        val answer = item["answer"] as? String
        val dayKey = item["questionDate"] as? String
        if (item["type"] != "answer" || answer.isNullOrBlank() || answer.length > 1200 ||
            dayKey == null || !dayKey.matches(Regex("\\d{4}-\\d{2}-\\d{2}")) ||
            runCatching { LocalDate.parse(dayKey) }.isFailure
        ) return@forEach
        val question = item["question"] as? String ?: return@forEach
        uniqueAnswers.putIfAbsent("$dayKey\u0000$question", item)
    }

    var failed = 0
    uniqueAnswers.values.forEach { item ->
        try {
            val dayKey = item["questionDate"] as String
            val questionText = (item["question"] as? String)?.trim().orEmpty()
            if (questionText.isBlank()) return@forEach
            val hash = nativeQuestionHash(questionText)
            val legacyQuestionId = "legacy-$hash"
            val dayDocumentId = "legacy-$dayKey-$hash"
            val bankReference = firestore.collection("coupleQuestionBank").document(coupleId)
                .collection("questions").document(legacyQuestionId)
            bankReference.set(mapOf("categoryId" to "legacy", "category" to "Legacy question", "question" to questionText, "position" to 0), com.google.firebase.firestore.SetOptions.merge()).await()

            val dailyReference = firestore.collection("coupleDailyQuestions").document(coupleId).collection("days").document(dayDocumentId)
            val answerReference = dailyReference.collection("answers").document(profileKey)
            val participantReference = dailyReference.collection("participants").document(profileKey)
            val answeredAt = item["createdAt"] as? com.google.firebase.Timestamp ?: FieldValue.serverTimestamp()
            firestore.runTransaction { transaction ->
                val existingAnswer = transaction.get(answerReference)
                val existingDay = transaction.get(dailyReference)
                if (existingAnswer.exists()) return@runTransaction null
                if (existingDay.exists() && existingDay.getString("question") != questionText) {
                    throw IllegalStateException("A historical question ID matched different question text.")
                }
                if (!existingDay.exists()) transaction.set(dailyReference, mapOf(
                    "id" to legacyQuestionId,
                    "categoryId" to "about-us",
                    "category" to "💗 About Us",
                    "question" to questionText,
                    "dayKey" to dayKey,
                    "createdAt" to FieldValue.serverTimestamp()
                ))
                transaction.set(answerReference, mapOf("profileKey" to profileKey, "answer" to (item["answer"] as String).trim(), "answeredAt" to answeredAt))
                transaction.set(participantReference, mapOf("profileKey" to profileKey, "answeredAt" to answeredAt))
                null
            }.await()
        } catch (_: Exception) { failed++ }
    }
    if (failed == 0) preferences.edit().putBoolean(marker, true).apply()
    return failed
}

private suspend fun prepareNativeMemoryPhoto(context: Context, uri: Uri): File? = withContext(Dispatchers.IO) {
    val metadata = context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { cursor ->
        if (cursor.moveToFirst()) cursor.getString(0).orEmpty() to cursor.getLong(1) else "" to 0L
    } ?: ("" to 0L)
    val name = metadata.first
    val size = metadata.second
    val mime = context.contentResolver.getType(uri).orEmpty()
    val extension = name.substringAfterLast('.', "").lowercase(Locale.ROOT)
    val needsJpeg = mime.lowercase(Locale.ROOT).contains("heic") || mime.lowercase(Locale.ROOT).contains("heif") || extension in setOf("heic", "heif", "tiff", "tif", "bmp")
    if (!mime.startsWith("image/") || (size in 1..1_572_864 && !needsJpeg)) return@withContext null
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) } ?: return@withContext null
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return@withContext null
    val longest = maxOf(bounds.outWidth, bounds.outHeight)
    var sample = 1
    while (longest / sample > 2048) sample *= 2
    val decoded = context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample }) } ?: return@withContext null
    try {
        val baseScale = minOf(1f, 2048f / maxOf(decoded.width, decoded.height))
        val target = File(context.cacheDir, "memory-${UUID.randomUUID()}.jpg")
        for (scale in listOf(1f, 0.86f, 0.72f, 0.58f)) {
            val width = (decoded.width * baseScale * scale).toInt().coerceAtLeast(1)
            val height = (decoded.height * baseScale * scale).toInt().coerceAtLeast(1)
            val resized = if (width == decoded.width && height == decoded.height) decoded else Bitmap.createScaledBitmap(decoded, width, height, true)
            for (quality in listOf(88, 78, 68)) {
                target.outputStream().use { output -> resized.compress(Bitmap.CompressFormat.JPEG, quality, output) }
                if (target.length() <= 1_572_864) {
                    if (resized !== decoded) resized.recycle()
                    return@withContext target
                }
            }
            if (resized !== decoded) resized.recycle()
        }
        target.delete()
        null
    } finally { decoded.recycle() }
}

private suspend fun uploadTelegramMedia(context: Context, user: FirebaseUser, uri: Uri, caption: String, authorName: String, fallbackMimeType: String, mediaLabel: String = "New Post Photo 📸", sourceFile: File? = null, sourceMimeType: String? = null): Map<String, Any?> = withContext(Dispatchers.IO) {
    val displayName = context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
        if (cursor.moveToFirst()) cursor.getString(0) else null
    } ?: uri.lastPathSegment?.takeIf(String::isNotBlank) ?: if (fallbackMimeType.startsWith("audio/")) "voice-note.m4a" else "post-photo.jpg"
    val uploadName = if (sourceFile != null) "${displayName.substringBeforeLast('.', displayName)}.jpg" else displayName
    val mime = sourceMimeType ?: if (sourceFile != null) "image/jpeg" else context.contentResolver.getType(uri) ?: java.net.URLConnection.guessContentTypeFromName(displayName) ?: fallbackMimeType
    val token = user.getIdToken(false).await().token ?: error("Sign in again before sending your photo.")
    val boundary = "----OurLittleWorld${UUID.randomUUID()}"
    val connection = (URL("https://telegram-photo-proxy.akabeeram.workers.dev/").openConnection() as HttpURLConnection).apply {
        requestMethod = "POST"
        doOutput = true
        connectTimeout = 30000
        readTimeout = 60000
        setRequestProperty("Authorization", "Bearer $token")
        setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
    }
    connection.outputStream.use { output ->
        fun field(name: String, value: String) {
            output.write("--$boundary\r\nContent-Disposition: form-data; name=\"$name\"\r\n\r\n$value\r\n".toByteArray())
        }
        field("caption", "$mediaLabel · $authorName · $caption")
        output.write("--$boundary\r\nContent-Disposition: form-data; name=\"file\"; filename=\"${uploadName.replace("\"", "") }\"\r\nContent-Type: $mime\r\n\r\n".toByteArray())
        (sourceFile?.inputStream() ?: context.contentResolver.openInputStream(uri))?.use { input -> input.copyTo(output) } ?: error("Could not read the selected photo.")
        output.write("\r\n--$boundary--\r\n".toByteArray())
        output.flush()
    }
    val status = connection.responseCode
    val response = (if (status in 200..299) connection.inputStream else connection.errorStream)?.bufferedReader()?.use { it.readText() }.orEmpty()
    connection.disconnect()
    if (status !in 200..299) error("Could not upload photo (HTTP $status).")
    val root = JSONObject(response)
    if (root.optBoolean("ok", true).not()) error(root.optString("error", "Could not upload photo."))
    val message = root.optJSONObject("result") ?: root
    val photos = message.optJSONArray("photo")
    val media = photos?.optJSONObject((photos.length() - 1).coerceAtLeast(0))
        ?: message.optJSONObject("video") ?: message.optJSONObject("audio") ?: message.optJSONObject("voice") ?: message.optJSONObject("document") ?: error("The media service returned no media reference.")
    val fileId = media.optString("file_id").takeIf(String::isNotBlank) ?: error("The media service returned no photo reference.")
    mapOf(
        "telegramFileId" to fileId,
        "telegramFileUniqueId" to media.optString("file_unique_id"),
        "telegramMimeType" to media.optString("mime_type", mime),
        (if (mime.startsWith("image/")) "photoMimeType" else "voiceMimeType") to mime,
        "telegramMessageId" to message.opt("message_id"),
        "telegramChatId" to message.opt("chat")?.let { (it as? JSONObject)?.opt("id") }
    )
}

private suspend fun deleteTelegramGalleryMessage(user: FirebaseUser, chatId: String, messageId: Long) = withContext(Dispatchers.IO) {
    val token = user.getIdToken(false).await().token ?: error("Sign in again before deleting this media.")
    val address = "https://telegram-photo-proxy.akabeeram.workers.dev/?galleryChatId=${Uri.encode(chatId)}&galleryMessageId=$messageId"
    val connection = (URL(address).openConnection() as HttpURLConnection).apply {
        requestMethod = "DELETE"
        connectTimeout = 20000
        readTimeout = 30000
        setRequestProperty("Authorization", "Bearer $token")
    }
    try {
        val status = connection.responseCode
        val response = (if (status in 200..299) connection.inputStream else connection.errorStream)?.bufferedReader()?.use { it.readText() }.orEmpty()
        if (status !in 200..299) error(JSONObject(response).optString("error", "Telegram could not delete this media."))
    } finally { connection.disconnect() }
}

private suspend fun deleteTelegramMediaIfReferenced(user: FirebaseUser, media: Map<*, *>) {
    val chatId = media["telegramChatId"]?.toString()?.takeIf { it.isNotBlank() } ?: return
    val messageId = (media["telegramMessageId"] as? Number)?.toLong()
        ?: media["telegramMessageId"]?.toString()?.toLongOrNull()
        ?: return
    if (messageId > 0L) deleteTelegramGalleryMessage(user, chatId, messageId)
}

private fun mediaCacheFile(context: Context, fileId: String, mimeType: String): File? {
    val directory = File(context.filesDir, "post-media-cache")
    if (!directory.exists() && !directory.mkdirs()) return null
    val key = "$fileId::$mimeType".toByteArray()
    val digest = MessageDigest.getInstance("SHA-256").digest(key).joinToString("") { "%02x".format(it) }
    return File(directory, digest)
}

private fun trimPostMediaCache(context: Context) {
    val files = File(context.filesDir, "post-media-cache").listFiles()?.filter { it.isFile }?.sortedBy { it.lastModified() } ?: return
    var total = files.sumOf { it.length() }
    var count = files.size
    for (file in files) {
        if (count <= 250 && total <= 250L * 1024 * 1024) break
        val size = file.length()
        if (file.delete()) { count--; total -= size }
    }
}

private fun memoryThumbnailCacheFile(context: Context, fileId: String, mimeType: String): File? {
    val directory = File(context.filesDir, "memory-thumbnail-cache")
    if (!directory.exists() && !directory.mkdirs()) return null
    val key = "$fileId::$mimeType".toByteArray()
    val digest = MessageDigest.getInstance("SHA-256").digest(key).joinToString("") { "%02x".format(it) }
    return File(directory, "$digest.jpg")
}

private fun trimMemoryThumbnailCache(context: Context) {
    val files = File(context.filesDir, "memory-thumbnail-cache").listFiles()?.filter { it.isFile }?.sortedBy { it.lastModified() } ?: return
    var total = files.sumOf { it.length() }
    var count = files.size
    for (file in files) {
        if (count <= 300 && total <= 40L * 1024 * 1024) break
        val size = file.length()
        if (file.delete()) { count--; total -= size }
    }
}

private suspend fun loadNativeMemoryThumbnail(context: Context, user: FirebaseUser, fileId: String, mimeType: String?, isVideo: Boolean): Uri? = withContext(Dispatchers.IO) {
    val mime = mimeType ?: if (isVideo) "video/mp4" else "image/jpeg"
    val cached = memoryThumbnailCacheFile(context, fileId, mime)
    if (cached?.exists() == true && cached.length() > 0) {
        cached.setLastModified(System.currentTimeMillis())
        return@withContext Uri.fromFile(cached)
    }
    val source = loadTelegramMediaFile(context, user, fileId, mime) ?: return@withContext null
    val bitmap = if (isVideo) {
        val retriever = MediaMetadataRetriever()
        try {
            retriever.setDataSource(source.absolutePath)
            retriever.getFrameAtTime(0, MediaMetadataRetriever.OPTION_CLOSEST_SYNC)
        } catch (_: Exception) { null } finally { runCatching { retriever.release() } }
    } else {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(source.absolutePath, bounds)
        var sample = 1
        while (bounds.outWidth / sample > 960 || bounds.outHeight / sample > 960) sample *= 2
        BitmapFactory.decodeFile(source.absolutePath, BitmapFactory.Options().apply { inSampleSize = sample })
    } ?: return@withContext null
    try {
        val scale = minOf(1f, 480f / maxOf(bitmap.width, bitmap.height))
        val thumb = if (scale < 1f) Bitmap.createScaledBitmap(bitmap, (bitmap.width * scale).toInt().coerceAtLeast(1), (bitmap.height * scale).toInt().coerceAtLeast(1), true) else bitmap
        val target = cached ?: return@withContext null
        target.outputStream().use { thumb.compress(Bitmap.CompressFormat.JPEG, 82, it) }
        if (thumb !== bitmap) thumb.recycle()
        if (!target.exists() || target.length() <= 0) return@withContext null
        target.setLastModified(System.currentTimeMillis())
        trimMemoryThumbnailCache(context)
        Uri.fromFile(target)
    } finally { bitmap.recycle() }
}

private suspend fun loadTelegramMediaFile(context: Context, user: FirebaseUser, fileId: String, mimeType: String?): File? = withContext(Dispatchers.IO) {
    val mime = mimeType ?: "application/octet-stream"
    val cached = mediaCacheFile(context, fileId, mime)
    if (cached?.exists() == true && cached.length() > 0) {
        cached.setLastModified(System.currentTimeMillis())
        return@withContext cached
    }
    val token = user.getIdToken(false).await().token ?: return@withContext null
    val address = "https://telegram-photo-proxy.akabeeram.workers.dev/?fileId=${Uri.encode(fileId)}&mimeType=${Uri.encode(mime)}"
    val connection = (URL(address).openConnection() as HttpURLConnection).apply {
        requestMethod = "GET"
        connectTimeout = 20000
        readTimeout = 60000
        setRequestProperty("Authorization", "Bearer $token")
    }
    try {
        if (connection.responseCode !in 200..299) return@withContext null
        val target = cached ?: File.createTempFile("olw-media-", ".tmp", context.cacheDir)
        val temporary = File(target.parentFile, "${target.name}.tmp")
        connection.inputStream.use { input -> temporary.outputStream().use { output -> input.copyTo(output) } }
        if (temporary.length() <= 0) { temporary.delete(); return@withContext null }
        if (cached == null) return@withContext temporary
        if (!temporary.renameTo(target)) {
            temporary.copyTo(target, overwrite = true)
            temporary.delete()
        }
        target.setLastModified(System.currentTimeMillis())
        trimPostMediaCache(context)
        target
    } finally { connection.disconnect() }
}

private suspend fun loadPostPhoto(context: Context, user: FirebaseUser, fileId: String, mimeType: String?): Bitmap? = withContext(Dispatchers.IO) {
    val file = loadTelegramMediaFile(context, user, fileId, mimeType ?: "image/jpeg") ?: return@withContext null
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(file.absolutePath, bounds)
    var sample = 1
    while (bounds.outWidth / sample > 2048 || bounds.outHeight / sample > 2048) sample *= 2
    BitmapFactory.decodeFile(file.absolutePath, BitmapFactory.Options().apply { inSampleSize = sample })
}

private suspend fun downloadTelegramAudio(context: Context, user: FirebaseUser, fileId: String, mimeType: String?): File? =
    loadTelegramMediaFile(context, user, fileId, mimeType ?: "audio/webm")

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        runCatching { FirebaseDatabase.getInstance().setPersistenceEnabled(true) }
        setContent {
            MaterialTheme(
                colorScheme = lightColorScheme(
                    primary = Rose,
                    onPrimary = Color.White,
                    secondary = Color(0xFF96536D),
                    background = SoftPink,
                    surface = Color.White,
                    onSurface = Ink
                )
            ) {
                Surface(modifier = Modifier.fillMaxSize(), color = SoftPink) {
                    NativeApp()
                }
            }
        }
    }
}

@Composable
private fun NativeApp() {
    val auth = remember { FirebaseAuth.getInstance() }
    var user by remember { mutableStateOf(auth.currentUser) }

    DisposableEffect(auth) {
        val listener = FirebaseAuth.AuthStateListener { user = it.currentUser }
        auth.addAuthStateListener(listener)
        onDispose { auth.removeAuthStateListener(listener) }
    }

    val signedInUser = user
    if (signedInUser == null) {
        LoginScreen(auth)
    } else {
        DisposableEffect(signedInUser.uid) {
            val reference = FirebaseFirestore.getInstance().collection("couples").document("our-little-world").collection("settings").document("profiles")
            val listener = reference.addSnapshotListener { snapshot, _ ->
                if (snapshot != null) partnerProfiles.indices.forEach { index ->
                    val previous = partnerProfiles[index]
                    val data = snapshot.get(previous.key) as? Map<*, *> ?: return@forEach
                    val name = data["name"] as? String ?: previous.name
                    partnerProfiles[index] = previous.copy(
                        name = name,
                        initial = name.firstOrNull()?.uppercaseChar()?.toString() ?: previous.initial,
                        avatar = data["avatar"] as? String ?: previous.avatar,
                        avatarTelegramFileId = data["avatarTelegramFileId"] as? String ?: previous.avatarTelegramFileId,
                        avatarMimeType = data["avatarMimeType"] as? String ?: previous.avatarMimeType,
                        previousNames = (data["previousNames"] as? List<*>)?.filterIsInstance<String>() ?: previous.previousNames
                    )
                }
            }
            onDispose { listener.remove() }
        }
        var route by rememberSaveable { mutableStateOf("home") }
        when (route) {
            "home" -> DashboardScreen(signedInUser, onSignOut = auth::signOut, onNavigate = { route = it })
            "gallery" -> NativePostsScreen(signedInUser, onBack = { route = "home" })
            "more" -> NativeMoreScreen(onNavigate = { route = it }, onSignOut = auth::signOut)
            "bucket" -> NativeBucketScreen(signedInUser, onBack = { route = "more" })
            "special-days" -> NativeSpecialDaysScreen(signedInUser, onBack = { route = "more" })
            "questions" -> NativeQuestionScreen(signedInUser, onBack = { route = "home" })
            "activities" -> NativeActivitiesScreen(onNavigate = { route = it }, onBack = { route = "home" })
            "profile" -> NativeProfileScreen(signedInUser, onBack = { route = "more" })
            "memories" -> NativeMemoriesScreen(signedInUser, onBack = { route = "home" })
            "gallery-library" -> NativeSharedGalleryScreen(signedInUser, onBack = { route = "more" })
            "letters" -> NativeLettersScreen(signedInUser, onBack = { route = "home" })
            "challenges" -> NativeChallengesScreen(signedInUser, onBack = { route = "home" })
            "drawing" -> NativeDrawingScreen(signedInUser, onBack = { route = "home" })
            "games" -> NativeGamesScreen(signedInUser, onBack = { route = "home" })
            "notifications" -> NativeNotificationsScreen(signedInUser, onNavigate = { route = it }, onBack = { route = "home" })
            "partner-chat" -> NativePartnerChatScreen(signedInUser, onBack = { route = "home" })
            "music" -> NativeMusicScreen(signedInUser, onBack = { route = "home" })
            else -> NativePlaceholderScreen(route, onBack = { route = "home" })
        }
    }
}

@Composable
private fun LoginScreen(auth: FirebaseAuth) {
    var selectedKey by rememberSaveable { mutableStateOf(partnerProfiles.first().key) }
    var password by rememberSaveable { mutableStateOf("") }
    var error by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    val selectedProfile = partnerProfiles.first { it.key == selectedKey }

    Column(
        modifier = Modifier.fillMaxSize().padding(horizontal = 26.dp, vertical = 28.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        BrandMark()
        Spacer(Modifier.height(18.dp))
        Text("Our Little World", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold, color = Ink)
        Text("Two hearts. One little space.", modifier = Modifier.padding(top = 5.dp), color = Color(0xFF836C77))
        Spacer(Modifier.height(30.dp))

        Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
            partnerProfiles.forEach { profile ->
                val chosen = profile.key == selectedKey
                OutlinedButton(
                    onClick = { selectedKey = profile.key; error = "" },
                    modifier = Modifier.weight(1f).height(88.dp),
                    shape = RoundedCornerShape(20.dp),
                    colors = ButtonDefaults.outlinedButtonColors(
                        containerColor = if (chosen) Color(0xFFFFE4EE) else Color.White,
                        contentColor = Ink
                    )
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(profile.initial, fontWeight = FontWeight.Bold, color = Rose)
                        Text(profile.name, fontWeight = if (chosen) FontWeight.Bold else FontWeight.Medium)
                    }
                }
            }
        }

        Spacer(Modifier.height(18.dp))
        OutlinedTextField(
            value = password,
            onValueChange = { password = it; error = "" },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Password") },
            singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
            shape = RoundedCornerShape(16.dp)
        )
        if (error.isNotBlank()) {
            Text(error, color = MaterialTheme.colorScheme.error, modifier = Modifier.fillMaxWidth().padding(top = 10.dp))
        }
        Button(
            onClick = {
                if (password.isBlank()) {
                    error = "Enter your password to continue."
                } else {
                    busy = true
                    error = ""
                    auth.signInWithEmailAndPassword(selectedProfile.email, password)
                        .addOnCompleteListener { task ->
                            busy = false
                            if (!task.isSuccessful) error = "Could not sign in. Check the password and try again."
                        }
                }
            },
            enabled = !busy,
            modifier = Modifier.fillMaxWidth().padding(top = 18.dp).height(54.dp),
            shape = RoundedCornerShape(18.dp)
        ) {
            if (busy) CircularProgressIndicator(modifier = Modifier.size(22.dp), color = Color.White, strokeWidth = 2.dp)
            else Text("Enter our world  ♡", fontWeight = FontWeight.Bold)
        }
        Text("Private · just for us", modifier = Modifier.padding(top = 20.dp), color = Color(0xFF9B7888), style = MaterialTheme.typography.labelMedium)
    }
}

@Composable
private fun BrandMark() {
    Box(
        modifier = Modifier.size(68.dp).background(Color(0xFFFFE1EC), CircleShape),
        contentAlignment = Alignment.Center
    ) {
        Text("♡", color = Rose, style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Bold)
    }
}

@Composable
@OptIn(ExperimentalMaterial3Api::class)
private fun DashboardScreen(user: FirebaseUser, onSignOut: () -> Unit, onNavigate: (String) -> Unit) {
    var latestPost by remember { mutableStateOf<FeedPost?>(null) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf("") }
    var refreshKey by remember { mutableIntStateOf(0) }
    var relationshipDate by remember { mutableStateOf<String?>(null) }
    var reminders by remember { mutableStateOf<List<SpecialReminder>>(emptyList()) }
    var comments by remember { mutableStateOf<List<FeedComment>>(emptyList()) }
    var commentDraft by rememberSaveable { mutableStateOf("") }
    var replyToComment by remember { mutableStateOf<FeedComment?>(null) }
    var commentSending by remember { mutableStateOf(false) }
    var datePickerOpen by remember { mutableStateOf(false) }
    var elapsedSeconds by remember { mutableLongStateOf(0L) }
    var dubaiToday by remember { mutableStateOf(LocalDate.now(ZoneId.of("Asia/Dubai"))) }
    var profileMenuOpen by remember { mutableStateOf(false) }
    var latestPostMediaUri by remember { mutableStateOf<Uri?>(null) }
    var latestPostMediaLoading by remember { mutableStateOf(false) }
    var latestPostMediaError by remember { mutableStateOf(false) }
    var latestPostMediaRetry by remember { mutableIntStateOf(0) }
    var latestDrawing by remember { mutableStateOf<Map<String, Any?>?>(null) }
    var drawingPreviewUri by remember { mutableStateOf<Uri?>(null) }
    var drawingPreviewLoading by remember { mutableStateOf(true) }
    var drawingPreviewError by remember { mutableStateOf(false) }
    var drawingQueryError by remember { mutableStateOf(false) }
    var drawingPreviewRetry by remember { mutableIntStateOf(0) }
    val context = androidx.compose.ui.platform.LocalContext.current
    val signedInEmail = user.email.orEmpty()
    val profile = partnerProfiles.firstOrNull { it.email.equals(signedInEmail, ignoreCase = true) }
    var unreadNotificationCount by remember { mutableIntStateOf(0) }
    var profileAvatarUri by remember { mutableStateOf<Uri?>(null) }

    DisposableEffect(user.uid, profile?.key) {
        val recipientKey = profile?.key ?: "kebyy"
        val listener = FirebaseFirestore.getInstance().collection("couples").document("our-little-world").collection("notifications")
            .whereEqualTo("recipientKey", recipientKey).addSnapshotListener { snapshot, _ ->
                unreadNotificationCount = snapshot?.documents.orEmpty().count { it.getTimestamp("readAt") == null }
            }
        onDispose { listener.remove() }
    }

    LaunchedEffect(latestPost?.id, latestPost?.telegramFileId, latestPostMediaRetry) {
        latestPostMediaUri = null
        latestPostMediaError = false
        val fileId = latestPost?.telegramFileId ?: return@LaunchedEffect
        latestPostMediaLoading = true
        try { latestPostMediaUri = loadTelegramMediaFile(context, user, fileId, latestPost?.mediaMimeType)?.let(Uri::fromFile) ?: error("Post media unavailable") }
        catch (_: Exception) { latestPostMediaError = true }
        finally { latestPostMediaLoading = false }
    }
    LaunchedEffect(profile?.avatar, profile?.avatarTelegramFileId, profile?.avatarMimeType) {
        profileAvatarUri = null
        val direct = profile?.avatar
        val fileId = profile?.avatarTelegramFileId
        if (!direct.isNullOrBlank()) profileAvatarUri = Uri.parse(direct)
        else if (!fileId.isNullOrBlank()) profileAvatarUri = runCatching { loadTelegramMediaFile(context, user, fileId, profile?.avatarMimeType)?.let(Uri::fromFile) }.getOrNull()
    }

    DisposableEffect(user.uid, drawingPreviewRetry) {
        val listener = FirebaseFirestore.getInstance().collection("couples").document("our-little-world")
            .collection("drawingMessages").orderBy("createdAt", Query.Direction.DESCENDING).limit(1)
            .addSnapshotListener { snapshot, error ->
                if (snapshot != null) { latestDrawing = snapshot.documents.firstOrNull()?.let { mapOf("id" to it.id) + it.data.orEmpty() }; drawingQueryError = false }
                else if (error != null) drawingQueryError = true
            }
        onDispose { listener.remove() }
    }
    LaunchedEffect(latestDrawing?.get("telegramFileId"), latestDrawing?.get("photoUrl"), drawingPreviewRetry) {
        drawingPreviewUri = null
        drawingPreviewError = false
        val drawing = latestDrawing
        if (drawing == null) { drawingPreviewLoading = false; return@LaunchedEffect }
        drawingPreviewLoading = true
        try {
            val fileId = drawing["telegramFileId"] as? String
            val directUrl = drawing["photoUrl"] as? String ?: drawing["thumbnailUrl"] as? String
            drawingPreviewUri = if (!fileId.isNullOrBlank()) Uri.fromFile(loadTelegramMediaFile(context, user, fileId, drawing["mimeType"] as? String ?: "image/jpeg") ?: error("Drawing preview is unavailable."))
                else directUrl?.let(Uri::parse) ?: error("Drawing preview is unavailable.")
        } catch (_: Exception) { drawingPreviewError = true }
        finally { drawingPreviewLoading = false }
    }

    LaunchedEffect(user.uid, refreshKey) {
        loading = true
        error = ""
        try {
            val firestore = FirebaseFirestore.getInstance()
            val currentProfileId = if (profile?.key == "shazy") "profile-two" else "profile-one"
            val snapshot = firestore
                .collection("couples")
                .document("our-little-world")
                .collection("diaryPosts")
                .orderBy("createdAt", Query.Direction.DESCENDING)
                .limit(40)
                .get()
                .await()
            val partnerDocument = snapshot.documents.firstOrNull { document ->
                val authorId = document.getString("authorId").orEmpty()
                val authorName = document.getString("authorName").orEmpty()
                document.getBoolean("deleting") != true &&
                    authorId != user.uid && authorId != currentProfileId &&
                    !authorName.equals(profile?.name, ignoreCase = true)
            }
            latestPost = partnerDocument?.let { document ->
                val date = document.getTimestamp("createdAt")?.toDate()
                FeedPost(
                    id = document.id,
                    authorName = document.getString("authorName") ?: "A partner",
                    text = document.getString("text")?.takeIf(String::isNotBlank)
                        ?: if (document.contains("telegramFileId")) "A photo shared ♡" else "A little moment shared ♡",
                    createdAt = date?.let { DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT).format(it) } ?: "Just now",
                    likedBy = document.get("likedBy") as? List<String> ?: emptyList(),
                    photoUrl = document.getString("photoUrl"),
                    telegramFileId = document.getString("telegramFileId"),
                    mediaMimeType = document.getString("photoMimeType") ?: document.getString("telegramMimeType"),
                    mediaType = document.getString("mediaType")
                )
            }
        } catch (exception: Exception) {
            error = when {
                exception.message?.contains("PERMISSION_DENIED", ignoreCase = true) == true -> "This account does not have access to the shared feed."
                else -> "Could not load the feed. Check your connection and try again."
            }
        } finally {
            loading = false
        }
    }

    LaunchedEffect(user.uid) {
        try {
            relationshipDate = FirebaseFirestore.getInstance()
                .collection("couples").document("our-little-world")
                .collection("settings").document("relationship")
                .get().await().getString("startDate")
        } catch (_: Exception) {
            relationshipDate = null
        }
    }

    LaunchedEffect(Unit) {
        while (true) {
            delay(30_000)
            dubaiToday = LocalDate.now(ZoneId.of("Asia/Dubai"))
        }
    }

    LaunchedEffect(user.uid, dubaiToday) {
        try {
            val items = FirebaseFirestore.getInstance().collection("couples").document("our-little-world")
                .collection("items").whereEqualTo("type", "specialDay").get().await().documents
            val today = dubaiToday
            reminders = items.mapNotNull { doc ->
                val date = doc.getString("date") ?: return@mapNotNull null
                val original = runCatching { LocalDate.parse(date) }.getOrNull() ?: return@mapNotNull null
                val eventDate = if (doc.getBoolean("recurring") == true) {
                    var candidate = original.withYear(today.year)
                    if (candidate.isBefore(today)) candidate = original.withYear(today.year + 1)
                    if (original.monthValue == 2 && original.dayOfMonth == 29 && !candidate.isLeapYear) candidate = original.withYear(today.year + 1)
                    candidate
                } else original
                val days = ChronoUnit.DAYS.between(today, eventDate)
                if (days !in 0..3) return@mapNotNull null
                SpecialReminder(doc.getString("title") ?: "Special day", eventDate.format(DateTimeFormatter.ofPattern("d MMMM yyyy", Locale.ENGLISH)), days)
            }.sortedBy { it.days }
        } catch (_: Exception) { reminders = emptyList() }
    }

    LaunchedEffect(latestPost?.id, refreshKey) {
        val postId = latestPost?.id ?: run { comments = emptyList(); return@LaunchedEffect }
        try {
            val docs = FirebaseFirestore.getInstance().collection("couples").document("our-little-world")
                .collection("diaryPosts").document(postId).collection("comments")
                .orderBy("createdAt", Query.Direction.ASCENDING).get().await().documents
            comments = docs.map { doc -> FeedComment(doc.id, doc.getString("authorName") ?: "Us", doc.getString("authorId") ?: "", doc.getString("text") ?: "", doc.getString("parentId"), doc.get("likedBy") as? List<String> ?: emptyList()) }
        } catch (_: Exception) { comments = emptyList() }
    }
    LaunchedEffect(latestPost?.id) { replyToComment = null; commentDraft = "" }

    LaunchedEffect(relationshipDate) {
        while (true) {
            val start = relationshipDate?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
            elapsedSeconds = if (start == null) 0 else {
                val zone = ZoneId.of("Asia/Dubai")
                maxOf(0L, Duration.between(start.atStartOfDay(zone), java.time.ZonedDateTime.now(zone)).seconds)
            }
            delay(1000)
        }
    }

    val dateLabel = relationshipDate?.let { value ->
        runCatching { LocalDate.parse(value).format(DateTimeFormatter.ofPattern("d MMM yyyy", java.util.Locale.ENGLISH)) }.getOrNull()
    } ?: "Choose date"
    val dayCount = elapsedSeconds / 86400
    val hourCount = (elapsedSeconds / 3600) % 24
    val minuteCount = (elapsedSeconds / 60) % 60
    val secondCount = elapsedSeconds % 60

    Column(modifier = Modifier.fillMaxSize()) {
        LazyColumn(
            modifier = Modifier.weight(1f),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(start = 12.dp, end = 12.dp, top = 4.dp, bottom = 14.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            item {
                Row(
                    modifier = Modifier.fillMaxWidth().height(42.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.End
                ) {
                    TextButton(onClick = { onNavigate("music") }) { Text("♫", fontSize = 21.sp, color = Rose) }
                    TextButton(onClick = { onNavigate("partner-chat") }) { Text("💬", fontSize = 19.sp, color = Rose) }
                    Box {
                        TextButton(onClick = { onNavigate("notifications") }) { Text("♡", fontSize = 21.sp, color = Rose) }
                        if (unreadNotificationCount > 0) Box(Modifier.align(Alignment.TopEnd).padding(top = 1.dp, end = 3.dp).size(15.dp).clip(CircleShape).background(Color(0xFFE52F74)), contentAlignment = Alignment.Center) {
                            Text(if (unreadNotificationCount > 9) "9+" else unreadNotificationCount.toString(), color = Color.White, fontSize = 8.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                    Box {
                        Box(Modifier.padding(start = 4.dp).size(36.dp).clip(CircleShape).background(Color(0xFFFFE1EC)).clickable { profileMenuOpen = true }, contentAlignment = Alignment.Center) {
                            if (profileAvatarUri != null) AsyncImage(model = profileAvatarUri, contentDescription = "Profile photo", modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                            else Text(profile?.initial ?: "♡", color = Rose, fontWeight = FontWeight.Bold)
                        }
                        DropdownMenu(expanded = profileMenuOpen, onDismissRequest = { profileMenuOpen = false }) {
                            DropdownMenuItem(text = { Text("My profile") }, onClick = { profileMenuOpen = false; onNavigate("profile") })
                            DropdownMenuItem(text = { Text("Sign out") }, onClick = { profileMenuOpen = false; onSignOut() })
                        }
                    }
                }
            }
            item {
                BoxWithConstraints(
                    modifier = Modifier.fillMaxWidth().aspectRatio(2f).clip(RoundedCornerShape(20.dp)).background(Color(0xFFFDE8EF))
                ) {
                    val imageHeight = maxWidth / 2f
                    Image(painterResource(R.drawable.dashboard_header), contentDescription = "Keby and Shazy, two hearts one journey", modifier = Modifier.fillMaxSize(), contentScale = ContentScale.FillBounds)
                    Row(
                        modifier = Modifier.offset(x = maxWidth * .038f, y = imageHeight * .561f)
                            .width(maxWidth * .522f).height(imageHeight * .14f),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceEvenly
                    ) {
                        listOf(dayCount.toString(), hourCount.toString().padStart(2, '0'), minuteCount.toString().padStart(2, '0'), secondCount.toString().padStart(2, '0')).forEach { value ->
                            Text(value, color = Color(0xFFA5003E), fontWeight = FontWeight.Black, fontSize = 18.sp, maxLines = 1)
                        }
                    }
            Text(
                        "♡  $dateLabel",
                        modifier = Modifier.offset(x = maxWidth * .217f, y = imageHeight * .448f)
                            .width(maxWidth * .19f).height(20.dp)
                            .clip(CircleShape).background(Color(0xFFFFF7FB)).border(1.dp, Color(0xFFF28AAC), CircleShape)
                            .padding(horizontal = 2.dp, vertical = 1.dp),
                        color = Color(0xFF92274F), fontWeight = FontWeight.Bold, fontSize = 7.sp, maxLines = 1
                    )
                    Box(Modifier.offset(x = maxWidth * .217f, y = imageHeight * .448f).width(maxWidth * .19f).height(20.dp).clickable { datePickerOpen = true })
                }
            }
            if (reminders.isNotEmpty()) item {
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Color(0xFFFFE8F0)).padding(horizontal = 14.dp, vertical = 8.dp)) {
                    reminders.take(3).forEach { reminder ->
                        Text("🎉  ${if (reminder.days == 0L) "Today: ${reminder.title}" else "${reminder.days} ${if (reminder.days == 1L) "day" else "days"} left to ${reminder.title}"} · ${reminder.date}", color = Color(0xFF96345F), fontSize = 11.sp, modifier = Modifier.padding(vertical = 3.dp))
                    }
                    if (reminders.size > 3) Text("And ${reminders.size - 3} more special days coming up", color = Color(0xFF96345F), fontSize = 10.sp)
                }
            }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth().height(228.dp)) {
                    Card(
                        modifier = Modifier.weight(1f).fillMaxSize(),
                        shape = RoundedCornerShape(23.dp),
                        colors = CardDefaults.cardColors(containerColor = Color(0xFFFFFDFE)),
                        border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFF3D5E1))
                    ) {
                        Column(Modifier.fillMaxSize().padding(11.dp).verticalScroll(rememberScrollState())) {
                            when {
                                loading -> Box(Modifier.fillMaxWidth().weight(1f), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Rose, modifier = Modifier.size(22.dp), strokeWidth = 2.dp) }
                                error.isNotBlank() -> Column(Modifier.fillMaxWidth().weight(1f), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
                                    Text(error, color = Color(0xFF815D6D), fontSize = 11.sp)
                                    TextButton(onClick = { refreshKey++ }) { Text("Try again", fontSize = 11.sp) }
                                }
                                latestPost == null -> Column(Modifier.fillMaxWidth().weight(1f), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
                                    BrandMark()
                                    Spacer(Modifier.height(8.dp))
                                    Text("Your moments", fontWeight = FontWeight.Bold, color = Color(0xFF96345F))
                                    Text("Share a little moment together.", color = Color(0xFF987B89), fontSize = 10.sp)
                                }
                                else -> Column(Modifier.fillMaxWidth().weight(1f)) {
                                    Text(latestPost!!.authorName, fontWeight = FontWeight.Bold, color = Ink, fontSize = 13.sp)
                                    Text(latestPost!!.createdAt, color = Color(0xFF9B7888), fontSize = 10.sp, modifier = Modifier.padding(top = 3.dp))
                                    Text(latestPost!!.text, color = Ink, fontSize = 12.sp, lineHeight = 17.sp, modifier = Modifier.padding(top = 9.dp), maxLines = 6)
                                    latestPostMediaUri?.let { uri ->
                                        androidx.compose.foundation.layout.Spacer(Modifier.height(8.dp))
                                        if (latestPost!!.mediaType == "video" || latestPost!!.mediaMimeType?.startsWith("video/") == true) AndroidView(factory = { view -> VideoView(view).apply { setVideoURI(uri); setOnPreparedListener { it.isLooping = false; start() } } }, modifier = Modifier.fillMaxWidth().height(160.dp))
                                        else AsyncImage(model = uri, contentDescription = "Shared photo", modifier = Modifier.fillMaxWidth().heightIn(max = 160.dp).clip(RoundedCornerShape(12.dp)), contentScale = ContentScale.Crop)
                                    }
                                    if (latestPostMediaUri == null) latestPost!!.photoUrl?.let { url -> AsyncImage(model = url, contentDescription = "Shared photo", modifier = Modifier.fillMaxWidth().heightIn(max = 160.dp).padding(top = 8.dp).clip(RoundedCornerShape(12.dp)), contentScale = ContentScale.Crop) }
                                    if (latestPost!!.telegramFileId != null && latestPostMediaUri == null) {
                                        if (latestPostMediaLoading) Text("Loading shared media…", color = Color(0xFF9B7888), fontSize = 10.sp, modifier = Modifier.padding(top = 6.dp))
                                        if (latestPostMediaError) TextButton(onClick = { latestPostMediaRetry++ }) { Text("Media unavailable · Retry", color = Rose, fontSize = 10.sp) }
                                    }
                                    val isLiked = user.uid in latestPost!!.likedBy
                                    TextButton(onClick = {
                                        val postId = latestPost!!.id
                                        val reference = FirebaseFirestore.getInstance().collection("couples").document("our-little-world").collection("diaryPosts").document(postId)
                                        FirebaseFirestore.getInstance().runTransaction { transaction ->
                                            val snapshot = transaction.get(reference)
                                            val actualLiked = (snapshot.get("likedBy") as? List<*>)?.contains(user.uid) == true
                                            if (actualLiked != isLiked) transaction.update(reference, "likedBy", if (actualLiked) FieldValue.arrayRemove(user.uid) else FieldValue.arrayUnion(user.uid))
                                        }.addOnSuccessListener { refreshKey++ }
                                    }) { Text("${if (isLiked) "❤️" else "♡"} ${latestPost!!.likedBy.size}", color = if (isLiked) Rose else Color(0xFF886D7A), fontSize = 11.sp) }
                                    comments.filter { it.parentId == null }.take(2).forEach { comment ->
                                        val commentLiked = user.uid in comment.likedBy
                                        Column(Modifier.fillMaxWidth().padding(top = 3.dp)) {
                                            Text("${comment.authorName}: ${comment.text}", color = Color(0xFF775C69), fontSize = 10.sp, maxLines = 2)
                                            Row(verticalAlignment = Alignment.CenterVertically) {
                                                TextButton(onClick = {
                                                    val ref = FirebaseFirestore.getInstance().collection("couples").document("our-little-world").collection("diaryPosts").document(latestPost!!.id).collection("comments").document(comment.id)
                                                    ref.update("likedBy", if (commentLiked) FieldValue.arrayRemove(user.uid) else FieldValue.arrayUnion(user.uid)).addOnSuccessListener { refreshKey++ }
                                                }) { Text("${if (commentLiked) "❤️" else "♡"} ${comment.likedBy.size}", fontSize = 9.sp) }
                                                TextButton(onClick = { replyToComment = comment }) { Text("Reply", fontSize = 9.sp, color = Rose) }
                                                comments.filter { it.parentId == comment.id }.forEach { reply -> Text("↳ ${reply.authorName}: ${reply.text}", color = Color(0xFF775C69), fontSize = 9.sp, maxLines = 1, modifier = Modifier.weight(1f)) }
                                            }
                                        }
                                    }
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        OutlinedTextField(value = commentDraft, onValueChange = { commentDraft = it }, modifier = Modifier.weight(1f), placeholder = { Text(if (replyToComment == null) "Write a comment…" else "Reply to ${replyToComment?.authorName}…", fontSize = 10.sp) }, singleLine = true)
                                        if (replyToComment != null) TextButton(onClick = { replyToComment = null }) { Text("×", color = Color(0xFF8B7180)) }
                                        TextButton(enabled = commentDraft.isNotBlank() && !commentSending, onClick = {
                                            val text = commentDraft.trim()
                                            if (text.isNotEmpty()) {
                                                val doc = FirebaseFirestore.getInstance().collection("couples").document("our-little-world").collection("diaryPosts").document(latestPost!!.id).collection("comments").document()
                                                val payload = mutableMapOf<String, Any>("authorId" to user.uid, "authorName" to (profile?.name ?: "Us"), "text" to text, "createdAt" to FieldValue.serverTimestamp(), "likedBy" to emptyList<String>())
                                                replyToComment?.id?.let { payload["parentId"] = it }
                                                commentSending = true
                                                doc.set(payload)
                                                    .addOnSuccessListener { commentDraft = ""; replyToComment = null; refreshKey++ }
                                                    .addOnFailureListener { Toast.makeText(context, "Could not send comment. Check your connection and retry.", Toast.LENGTH_SHORT).show() }
                                                    .addOnCompleteListener { commentSending = false }
                                            }
                                        }) { Text(if (commentSending) "Sending…" else "Send", fontSize = 10.sp) }
                                    }
                                }
                            }
                            HorizontalDivider(color = Color(0xFFF3E4EA))
                            TextButton(
                                onClick = { onNavigate("gallery") },
                                modifier = Modifier.fillMaxWidth().height(34.dp)
                            ) { Text("Open all posts  →", fontSize = 11.sp, color = Color(0xFFA13767), fontWeight = FontWeight.Bold) }
                        }
                    }
                    Card(
                        modifier = Modifier.weight(1f).fillMaxSize(),
                        shape = RoundedCornerShape(23.dp),
                        colors = CardDefaults.cardColors(containerColor = Color(0xFFFFFDFE)),
                        border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFF3D5E1))
                    ) {
                        Column(
                            Modifier.fillMaxSize().padding(10.dp).clickable { onNavigate("drawing") },
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Box(Modifier.fillMaxWidth().weight(1f).clip(RoundedCornerShape(17.dp)).background(Color(0xFFFFF2F7)), contentAlignment = Alignment.Center) {
                                when {
                                    drawingPreviewLoading -> CircularProgressIndicator(color = Rose, modifier = Modifier.size(24.dp), strokeWidth = 2.dp)
                                    drawingPreviewUri != null -> AsyncImage(model = drawingPreviewUri, contentDescription = "Latest shared drawing", modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                                    drawingQueryError -> Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                        Text("Could not load drawings", color = Color(0xFF8B7180), fontSize = 11.sp)
                                        TextButton(onClick = { drawingPreviewRetry++ }) { Text("Retry", color = Rose, fontSize = 11.sp) }
                                    }
                                    drawingPreviewError -> Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                        Text("Drawing preview unavailable", color = Color(0xFF8B7180), fontSize = 11.sp)
                                        TextButton(onClick = { drawingPreviewRetry++ }) { Text("Retry", color = Rose, fontSize = 11.sp) }
                                    }
                                    latestDrawing == null -> Column(horizontalAlignment = Alignment.CenterHorizontally) { Text("♡", color = Rose, fontSize = 40.sp); Text("No drawings yet", color = Color(0xFF8B7180), fontSize = 11.sp) }
                                    else -> Text("♡", color = Rose, fontSize = 40.sp)
                                }
                            }
                            Text("Open canvas ♡", color = Color(0xFFA43A6A), fontSize = 12.sp, fontWeight = FontWeight.Bold, modifier = Modifier.align(Alignment.CenterHorizontally))
                        }
                    }
                }
            }
            item {
                Column(modifier = Modifier.padding(top = 6.dp, bottom = 2.dp)) {
                    Text("A LITTLE SOMETHING FOR TODAY", color = Color(0xFFA23A69), fontSize = 9.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.4.sp)
                    Text("Grow closer, every day", color = Ink, fontSize = 21.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 4.dp, bottom = 8.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(9.dp), modifier = Modifier.fillMaxWidth()) {
                        Image(
                            painterResource(R.drawable.today_question), contentDescription = "Today's Question",
                            modifier = Modifier.weight(1f).height(126.dp).clip(RoundedCornerShape(18.dp)).clickable { onNavigate("questions") }, contentScale = ContentScale.Crop
                        )
                        Image(
                            painterResource(R.drawable.today_challenge), contentDescription = "Daily Challenge",
                            modifier = Modifier.weight(1f).height(126.dp).clip(RoundedCornerShape(18.dp)).clickable { onNavigate("challenges") }, contentScale = ContentScale.Crop
                        )
                    }
                }
            }
        }
        NativeBottomNavigation(context, onNavigate)
    }

    if (datePickerOpen) {
        val initialMillis = relationshipDate?.let { runCatching { LocalDate.parse(it).atStartOfDay(ZoneId.of("UTC")).toInstant().toEpochMilli() }.getOrNull() }
        val picker = rememberDatePickerState(initialSelectedDateMillis = initialMillis, selectableDates = object : SelectableDates {
            override fun isSelectableDate(utcTimeMillis: Long): Boolean = utcTimeMillis <= System.currentTimeMillis()
        })
        DatePickerDialog(onDismissRequest = { datePickerOpen = false }, confirmButton = {
            TextButton(onClick = {
                val millis = picker.selectedDateMillis
                if (millis != null) {
                    val chosen = java.time.Instant.ofEpochMilli(millis).atZone(ZoneId.of("UTC")).toLocalDate().toString()
                    FirebaseFirestore.getInstance().collection("couples").document("our-little-world").collection("settings").document("relationship")
                        .set(mapOf("startDate" to chosen, "updatedAt" to FieldValue.serverTimestamp()), com.google.firebase.firestore.SetOptions.merge())
                        .addOnSuccessListener { relationshipDate = chosen; Toast.makeText(context, "Your date together has been saved ♡", Toast.LENGTH_SHORT).show() }
                        .addOnFailureListener { Toast.makeText(context, "Could not save your date. Please try again.", Toast.LENGTH_SHORT).show() }
                }
                datePickerOpen = false
            }) { Text("Save") }
        }, dismissButton = { TextButton(onClick = { datePickerOpen = false }) { Text("Cancel") } }) { DatePicker(state = picker) }
    }
}

@Composable
private fun NativePlaceholderScreen(route: String, onBack: () -> Unit) {
    val titles = mapOf("memories" to "Memories", "games" to "Games", "gallery" to "Our Posts", "letters" to "Letters", "more" to "More", "drawing" to "Our Drawing Canvas", "questions" to "Today's Question", "challenges" to "Challenges")
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = onBack) { Text("‹ Home", color = Rose) }
            Text(titles[route] ?: "Our Little World", color = Ink, fontSize = 20.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(start = 6.dp))
        }
        Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
            Text("♡", color = Rose, fontSize = 48.sp)
            Text("Native ${titles[route] ?: "feature"} screen", color = Ink, fontSize = 21.sp, fontWeight = FontWeight.Bold)
            Text("This website section still needs its Firebase logic and actions added before the replacement app is complete.", color = Color(0xFF836C77), modifier = Modifier.padding(top = 10.dp), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
        }
    }
}

@Composable
private fun NativeVoiceNotePlayer(user: FirebaseUser, fileId: String?, mimeType: String?, durationMs: Long) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val scope = rememberCoroutineScope()
    var player by remember { mutableStateOf<MediaPlayer?>(null) }
    var loading by remember { mutableStateOf(false) }
    var playing by remember { mutableStateOf(false) }
    DisposableEffect(player) {
        val activePlayer = player
        activePlayer?.setOnCompletionListener { playing = false }
        onDispose { activePlayer?.release() }
    }
    if (fileId == null) return
    val seconds = (durationMs.coerceAtLeast(0) / 1000).toInt()
    TextButton(enabled = !loading, onClick = {
        val current = player
        if (current != null) {
            if (current.isPlaying) { current.pause(); playing = false } else { current.start(); playing = true }
        } else {
            loading = true
            scope.launch {
                try {
                    val audio = downloadTelegramAudio(context, user, fileId, mimeType) ?: error("Could not load voice note.")
                    val mediaPlayer = MediaPlayer()
                    mediaPlayer.setDataSource(audio.absolutePath)
                    mediaPlayer.setOnPreparedListener { it.start(); player = it; playing = true; loading = false }
                    mediaPlayer.setOnErrorListener { mp, _, _ -> mp.release(); loading = false; Toast.makeText(context, "Could not play voice note.", Toast.LENGTH_SHORT).show(); true }
                    mediaPlayer.prepareAsync()
                } catch (_: Exception) { loading = false; Toast.makeText(context, "Could not load voice note.", Toast.LENGTH_SHORT).show() }
            }
        }
    }) { Text("${if (loading) "◌" else if (playing) "Ⅱ" else "▶"} Voice note · ${seconds / 60}:${(seconds % 60).toString().padStart(2, '0')}", color = Rose, fontSize = 11.sp) }
}

@Composable
private fun NativeMoreScreen(onNavigate: (String) -> Unit, onSignOut: () -> Unit) {
    Column(Modifier.fillMaxSize().padding(18.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Text("More", color = Ink, fontSize = 25.sp, fontWeight = FontWeight.Bold)
            TextButton(onClick = onSignOut) { Text("Sign out", color = Rose) }
        }
        listOf(
            Triple("🎯", "Our Bucket List", "bucket"),
            Triple("🖼️", "Shared Gallery", "gallery-library"),
            Triple("♡", "Special Days", "special-days"),
            Triple("👤", "Profile", "profile"),
            Triple("✨", "Activities", "activities")
        ).forEach { (icon, title, route) ->
            Card(Modifier.fillMaxWidth().padding(top = 10.dp).clickable { onNavigate(route) }, colors = CardDefaults.cardColors(containerColor = Color.White), border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFF3D5E1))) {
                Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(icon, fontSize = 24.sp)
                    Text(title, modifier = Modifier.weight(1f).padding(start = 14.dp), color = Ink, fontWeight = FontWeight.SemiBold)
                    Text("›", color = Rose, fontSize = 24.sp)
                }
            }
        }
    }
}

@Composable
private fun NativeActivitiesScreen(onNavigate: (String) -> Unit, onBack: () -> Unit) {
    Column(Modifier.fillMaxSize().padding(18.dp)) {
        TextButton(onClick = onBack) { Text("‹ Home", color = Rose) }
        Text("Activities", color = Ink, fontSize = 25.sp, fontWeight = FontWeight.Bold)
        listOf("Daily Questions" to "questions", "Challenges" to "challenges", "Mini Games" to "games", "Live Drawing" to "drawing", "Letters" to "letters").forEach { (label, route) ->
            Card(Modifier.fillMaxWidth().padding(top = 10.dp).clickable { onNavigate(route) }, colors = CardDefaults.cardColors(containerColor = Color.White), border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFF3D5E1))) {
                Text(label, Modifier.padding(18.dp), color = Ink, fontWeight = FontWeight.SemiBold)
            }
        }
    }
}

@Composable
private fun NativeNotificationsScreen(user: FirebaseUser, onNavigate: (String) -> Unit, onBack: () -> Unit) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val key = partnerProfiles.firstOrNull { it.email.equals(user.email.orEmpty(), true) }?.key ?: "kebyy"
    val root = remember { FirebaseFirestore.getInstance().collection("couples").document("our-little-world").collection("notifications") }
    var notifications by remember { mutableStateOf<List<Map<String, Any?>>>(emptyList()) }
    var filterUnread by rememberSaveable { mutableStateOf(false) }
    var loading by remember { mutableStateOf(true) }
    var loadError by remember { mutableStateOf("") }
    var fromCache by remember { mutableStateOf(false) }
    var retryKey by remember { mutableIntStateOf(0) }
    var markingAll by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    DisposableEffect(key, retryKey) {
        loading = true
        loadError = ""
        val listener = root.whereEqualTo("recipientKey", key).addSnapshotListener(MetadataChanges.INCLUDE) { snapshot, error ->
            if (error != null) {
                loadError = "Notifications could not be loaded. Check your connection and retry."
                loading = false
            } else if (snapshot != null) {
                notifications = snapshot.documents.map { mapOf("id" to it.id) + it.data.orEmpty() }.sortedByDescending { (it["createdAt"] as? com.google.firebase.Timestamp)?.toDate()?.time ?: 0L }
                fromCache = snapshot.metadata.isFromCache
                loadError = ""
                loading = false
            }
        }
        onDispose { listener.remove() }
    }
    val visible = if (filterUnread) notifications.filter { it["readAt"] == null } else notifications
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = onBack) { Text("‹ Home", color = Rose) }
            Text("Notifications", color = Ink, fontSize = 22.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            TextButton(onClick = { filterUnread = !filterUnread }) { Text(if (filterUnread) "All" else "Unread", color = Rose) }
        }
        if (fromCache && loadError.isBlank()) Text("Offline · showing saved notifications", color = Color(0xFF8B7180), fontSize = 12.sp, modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp))
        if (loadError.isNotBlank() && notifications.isEmpty()) Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
            Text(loadError, color = Color(0xFF8B7180), textAlign = androidx.compose.ui.text.style.TextAlign.Center, modifier = Modifier.padding(horizontal = 24.dp))
            TextButton(onClick = { retryKey++ }) { Text("Retry", color = Rose) }
        }
        else if (loading && notifications.isEmpty()) Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Rose) }
        else if (visible.isEmpty()) Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text(if (filterUnread) "You're all caught up ♡" else "No notifications yet.", color = Color(0xFF8B7180)) }
        else LazyColumn(Modifier.fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
            if (loadError.isNotBlank()) item { Row(verticalAlignment = Alignment.CenterVertically) { Text(loadError, color = Color(0xFF8B7180), modifier = Modifier.weight(1f)); TextButton(onClick = { retryKey++ }) { Text("Retry", color = Rose) } } }
            val unreadItems = notifications.filter { it["readAt"] == null }
            if (unreadItems.isNotEmpty()) item {
                TextButton(enabled = !markingAll, modifier = Modifier.fillMaxWidth(), onClick = {
                    markingAll = true
                    scope.launch {
                        try {
                            unreadItems.mapNotNull { it["id"] as? String }.chunked(450).forEach { ids ->
                                val batch = FirebaseFirestore.getInstance().batch()
                                ids.forEach { id -> batch.update(root.document(id), "readAt", FieldValue.serverTimestamp()) }
                                batch.commit().await()
                            }
                        } catch (_: Exception) {
                            Toast.makeText(context, "Could not update notifications. Please retry.", Toast.LENGTH_SHORT).show()
                        } finally { markingAll = false }
                    }
                }) { Text(if (markingAll) "Marking read…" else "Mark all read · ${unreadItems.size}", color = Rose) }
            }
            items(visible, key = { it["id"] as String }) { item ->
                val read = item["readAt"] != null
                Card(Modifier.fillMaxWidth().clickable {
                    val id = item["id"] as String
                    val route = (item["route"] as? String)?.takeIf { it in listOf("home", "questions", "challenges", "letters", "memories", "drawing", "gallery", "bucket", "more", "games") } ?: "home"
                    if (read) onNavigate(route) else scope.launch {
                        runCatching { root.document(id).update("readAt", FieldValue.serverTimestamp()).await() }
                            .onSuccess { onNavigate(route) }
                            .onFailure { Toast.makeText(context, "Could not update this notification. Please retry.", Toast.LENGTH_SHORT).show() }
                    }
                }, colors = CardDefaults.cardColors(containerColor = if (read) Color.White else Color(0xFFFFF4F8)), border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFF3D5E1))) {
                    Column(Modifier.fillMaxWidth().padding(15.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) { Text(item["title"] as? String ?: "Our Little World", color = Ink, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f)); if (!read) Text("●", color = Rose, fontSize = 10.sp) }
                        Text(item["message"] as? String ?: "A new shared moment is waiting.", color = Color(0xFF775D6A), modifier = Modifier.padding(top = 5.dp))
                        Text((item["createdAt"] as? com.google.firebase.Timestamp)?.toDate()?.let { DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT).format(it) } ?: "Just now", color = Color(0xFF9B7888), fontSize = 11.sp, modifier = Modifier.padding(top = 7.dp))
                    }
                }
            }
        }
    }
}

@Composable
private fun NativePartnerChatScreen(user: FirebaseUser, onBack: () -> Unit) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val profile = partnerProfiles.firstOrNull { it.email.equals(user.email.orEmpty(), true) }
    val partner = partnerProfiles.firstOrNull { it.key != profile?.key } ?: partnerProfiles.last()
    val today = LocalDate.now(ZoneId.of("Asia/Dubai"))
    val dayKey = today.toString()
    val from = today.atStartOfDay(ZoneId.of("Asia/Dubai")).toInstant().toEpochMilli()
    val to = today.plusDays(1).atStartOfDay(ZoneId.of("Asia/Dubai")).toInstant().toEpochMilli() - 1
    val chatRoot = remember { FirebaseDatabase.getInstance().getReference("couples/our-little-world/partnerChat/messages") }
    val presenceRoot = remember { FirebaseDatabase.getInstance().getReference("couples/our-little-world/presence") }
    var messages by remember(dayKey) { mutableStateOf<List<Map<String, Any?>>>(emptyList()) }
    var presence by remember { mutableStateOf<Map<String, Map<String, Any?>>>(emptyMap()) }
    var draft by rememberSaveable(dayKey) { mutableStateOf("") }
    var sending by remember { mutableStateOf(false) }
    var recording by remember { mutableStateOf(false) }
    var uploadingVoice by remember { mutableStateOf(false) }
    var chatConnected by remember { mutableStateOf(false) }
    var chatLoading by remember { mutableStateOf(true) }
    var chatError by remember { mutableStateOf("") }
    var chatRetry by remember { mutableIntStateOf(0) }
    var voiceRecorder by remember { mutableStateOf<MediaRecorder?>(null) }
    var voiceFile by remember { mutableStateOf<File?>(null) }
    var voiceStartedAt by remember { mutableLongStateOf(0L) }
    val listState = androidx.compose.foundation.lazy.rememberLazyListState()
    val scope = rememberCoroutineScope()
    fun startChatVoiceRecording() {
        try {
            val file = File.createTempFile("olw-chat-voice-", ".m4a", context.cacheDir)
            val activeRecorder = if (android.os.Build.VERSION.SDK_INT >= 31) MediaRecorder(context) else MediaRecorder()
            activeRecorder.setAudioSource(MediaRecorder.AudioSource.MIC)
            activeRecorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            activeRecorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            activeRecorder.setOutputFile(file.absolutePath)
            activeRecorder.prepare(); activeRecorder.start()
            voiceFile = file; voiceRecorder = activeRecorder; voiceStartedAt = System.currentTimeMillis(); recording = true
        } catch (_: Exception) { Toast.makeText(context, "Allow microphone access to record a voice message.", Toast.LENGTH_SHORT).show() }
    }
    fun finishChatVoiceRecording() {
        val activeRecorder = voiceRecorder ?: return
        val file = voiceFile
        val duration = (System.currentTimeMillis() - voiceStartedAt).coerceAtLeast(0L)
        recording = false; voiceRecorder = null; voiceFile = null
        runCatching { activeRecorder.stop() }; activeRecorder.release()
        if (file == null || file.length() == 0L) { file?.delete(); return }
        scope.launch {
            uploadingVoice = true
            var uploadedMedia: Map<String, Any?>? = null
            try {
                val media = uploadTelegramMedia(context, user, Uri.fromFile(file), "Chat voice message · ${profile?.name ?: "Us"}", profile?.name ?: "Us", "audio/mp4", "New Chat Voice Message 🎙")
                uploadedMedia = media
                chatRoot.push().setValue(mapOf("uid" to user.uid, "profileKey" to profile?.key.orEmpty(), "name" to profile?.name.orEmpty(), "text" to "", "telegramAudioFileId" to media["telegramFileId"], "telegramAudioFileUniqueId" to media["telegramFileUniqueId"], "telegramAudioMimeType" to (media["telegramMimeType"] ?: "audio/mp4"), "voiceDurationMs" to duration, "telegramAudioMessageId" to media["telegramMessageId"], "telegramAudioChatId" to media["telegramChatId"], "createdAt" to com.google.firebase.database.ServerValue.TIMESTAMP)).await()
                Toast.makeText(context, "Voice message sent ♡", Toast.LENGTH_SHORT).show()
            } catch (_: Exception) {
                uploadedMedia?.let { runCatching { deleteTelegramMediaIfReferenced(user, it) } }
                Toast.makeText(context, "Voice message could not be sent.", Toast.LENGTH_SHORT).show()
            }
            finally { file.delete(); uploadingVoice = false }
        }
    }
    val voicePermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (!granted) Toast.makeText(context, "Allow microphone access to record a voice message.", Toast.LENGTH_SHORT).show()
        else Toast.makeText(context, "Microphone ready. Hold the mic to record.", Toast.LENGTH_SHORT).show()
    }
    fun toggleChatVoice() {
        if (recording) finishChatVoiceRecording()
        else if (androidx.core.content.ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) startChatVoiceRecording()
        else voicePermission.launch(Manifest.permission.RECORD_AUDIO)
    }
    val onVoicePressStart by rememberUpdatedState(newValue = {
        if (!uploadingVoice && !recording) {
            if (androidx.core.content.ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) startChatVoiceRecording()
            else voicePermission.launch(Manifest.permission.RECORD_AUDIO)
        }
    })
    val onVoicePressEnd by rememberUpdatedState(newValue = {
        if (recording) finishChatVoiceRecording()
    })
    DisposableEffect(Unit) { onDispose { runCatching { voiceRecorder?.stop() }; voiceRecorder?.release(); voiceFile?.delete() } }
    DisposableEffect(user.uid, dayKey, chatRetry) {
        chatLoading = true; chatError = ""
        val query = chatRoot.orderByChild("createdAt").startAt(from.toDouble()).endAt(to.toDouble()).limitToLast(100)
        val chatListener = object : ValueEventListener {
            override fun onDataChange(snapshot: DataSnapshot) {
                chatError = ""; chatLoading = false
                messages = snapshot.children.mapNotNull { child ->
                    val data = child.value as? Map<*, *> ?: return@mapNotNull null
                    data.entries.associate { it.key.toString() to it.value }.toMutableMap().apply { put("id", child.key.orEmpty()) }
                }.filter { ((it["createdAt"] as? Number)?.toLong() ?: 0L) in from..to }.sortedBy { (it["createdAt"] as? Number)?.toLong() ?: 0L }
            }
            override fun onCancelled(error: DatabaseError) { chatError = "Chat could not be loaded. Check your connection and retry."; chatLoading = false }
        }
        val presenceListener = object : ValueEventListener {
            override fun onDataChange(snapshot: DataSnapshot) { presence = snapshot.children.mapNotNull { child -> (child.value as? Map<*, *>)?.let { child.key.orEmpty() to it.entries.associate { entry -> entry.key.toString() to entry.value } } }.toMap() }
            override fun onCancelled(error: DatabaseError) = Unit
        }
        val myPresence = presenceRoot.child(user.uid)
        val connection = FirebaseDatabase.getInstance().getReference(".info/connected")
        val connectionListener = object : ValueEventListener {
            override fun onDataChange(snapshot: DataSnapshot) {
                chatConnected = snapshot.getValue(Boolean::class.java) == true
                if (chatConnected) {
                    val online = mapOf("uid" to user.uid, "name" to profile?.name.orEmpty(), "state" to "online", "lastSeen" to System.currentTimeMillis())
                    myPresence.setValue(online)
                    myPresence.onDisconnect().setValue(mapOf("uid" to user.uid, "name" to profile?.name.orEmpty(), "state" to "offline", "lastSeen" to com.google.firebase.database.ServerValue.TIMESTAMP))
                }
            }
            override fun onCancelled(error: DatabaseError) = Unit
        }
        chatRoot.addValueEventListener(chatListener); presenceRoot.addValueEventListener(presenceListener); connection.addValueEventListener(connectionListener)
        onDispose { chatRoot.removeEventListener(chatListener); presenceRoot.removeEventListener(presenceListener); connection.removeEventListener(connectionListener); myPresence.setValue(mapOf("uid" to user.uid, "name" to profile?.name.orEmpty(), "state" to "offline", "lastSeen" to System.currentTimeMillis())) }
    }
    LaunchedEffect(messages.size) { if (messages.isNotEmpty()) listState.animateScrollToItem(messages.lastIndex) }
    val partnerOnline = presence.values.any { it["uid"] != user.uid && it["name"] == partner.name && it["state"] == "online" }
    Column(Modifier.fillMaxSize().padding(12.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = onBack) { Text("‹ Home", color = Rose) }
            Column(Modifier.weight(1f).padding(start = 6.dp)) { Text(partner.name, color = Ink, fontSize = 21.sp, fontWeight = FontWeight.Bold); Text(if (!chatConnected) "Offline · saved messages sync when connected" else if (partnerOnline) "Online · just for us" else "Offline · just for us", color = if (partnerOnline && chatConnected) Color(0xFF24824C) else Color(0xFF9B7888), fontSize = 11.sp) }
        }
        LazyColumn(Modifier.weight(1f).fillMaxWidth(), state = listState, contentPadding = androidx.compose.foundation.layout.PaddingValues(vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (!chatConnected) item { Text("Offline · showing today's messages saved on this device", color = Color(0xFF8B7180), modifier = Modifier.fillMaxWidth().background(Color(0xFFFFEEF4), RoundedCornerShape(12.dp)).padding(10.dp)) }
            if (chatLoading) item { Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Rose) } }
            if (chatError.isNotBlank()) item { Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) { Text(chatError, color = Color(0xFF8B7180)); TextButton(onClick = { chatRetry++ }) { Text("Retry", color = Rose) } } }
            if (!chatLoading && chatError.isBlank() && messages.isEmpty()) item { Box(Modifier.fillMaxWidth().padding(top = 40.dp), contentAlignment = Alignment.Center) { Text("Say hello to ${partner.name} ♡", color = Color(0xFF8B7180)) } }
            items(messages, key = { it["id"] as String }) { item ->
                val mine = item["uid"] == user.uid
                Row(Modifier.fillMaxWidth(), horizontalArrangement = if (mine) Arrangement.End else Arrangement.Start) {
                    Column(Modifier.fillMaxWidth(0.84f).clip(RoundedCornerShape(18.dp)).background(if (mine) Color(0xFFFFE8F0) else Color.White).padding(12.dp)) {
                        val text = item["text"] as? String ?: ""
                        if (text.isNotBlank()) Text(text, color = Ink)
                        val voiceId = item["telegramAudioFileId"] as? String
                        if (voiceId != null) NativeVoiceNotePlayer(user, voiceId, item["telegramAudioMimeType"] as? String, (item["voiceDurationMs"] as? Number)?.toLong() ?: 0L)
                        Text("${if (mine) "You" else item["name"] as? String ?: partner.name} · ${((item["createdAt"] as? Number)?.toLong())?.let { DateFormat.getTimeInstance(DateFormat.SHORT).format(java.util.Date(it)) } ?: ""}", color = Color(0xFF9B7888), fontSize = 10.sp, modifier = Modifier.padding(top = 4.dp))
                    }
                }
            }
        }
        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(Color.White).border(1.dp, Color(0xFFF3D5E1), RoundedCornerShape(24.dp)).padding(horizontal = 10.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(draft, { if (it.length <= 1000) draft = it }, modifier = Modifier.weight(1f), placeholder = { Text("Write a message…") }, maxLines = 4, colors = androidx.compose.material3.OutlinedTextFieldDefaults.colors(unfocusedBorderColor = Color.Transparent, focusedBorderColor = Color.Transparent))
            TextButton(enabled = !uploadingVoice, onClick = { toggleChatVoice() }, modifier = Modifier.pointerInput(Unit) {
                detectTapGestures(onPress = {
                    onVoicePressStart()
                    tryAwaitRelease()
                    onVoicePressEnd()
                })
            }) { Text(if (recording) "● Release to send" else if (uploadingVoice) "…" else "🎙 Hold", color = if (recording) Color(0xFFB94062) else Rose, fontSize = 12.sp) }
            TextButton(enabled = draft.isNotBlank() && !sending && !recording, onClick = {
                sending = true
                val message = chatRoot.push()
                message.setValue(mapOf("uid" to user.uid, "profileKey" to profile?.key.orEmpty(), "name" to profile?.name.orEmpty(), "text" to draft.trim(), "createdAt" to com.google.firebase.database.ServerValue.TIMESTAMP))
                    .addOnSuccessListener { draft = ""; sending = false }
                    .addOnFailureListener { sending = false; Toast.makeText(context, "Message could not be sent.", Toast.LENGTH_SHORT).show() }
            }) { Text(if (sending) "…" else "➤", color = Rose, fontSize = 20.sp) }
        }
    }
}

@Composable
private fun NativeProfileScreen(user: FirebaseUser, onBack: () -> Unit) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val profile = partnerProfiles.firstOrNull { it.email.equals(user.email.orEmpty(), true) }
    val key = profile?.key ?: "kebyy"
    val reference = remember { FirebaseFirestore.getInstance().collection("couples").document("our-little-world").collection("settings").document("profiles") }
    var name by rememberSaveable { mutableStateOf(profile?.name ?: "") }
    var bio by rememberSaveable { mutableStateOf("") }
    var existing by remember { mutableStateOf<Map<String, Any?>>(emptyMap()) }
    var photo by remember { mutableStateOf<Uri?>(null) }
    var avatarUri by remember { mutableStateOf<Uri?>(null) }
    var avatarLoading by remember { mutableStateOf(false) }
    var avatarError by remember { mutableStateOf(false) }
    var avatarRetry by remember { mutableIntStateOf(0) }
    var saving by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { photo = it }
    DisposableEffect(key) {
        val listener = reference.addSnapshotListener { snapshot, _ ->
            val data = snapshot?.get(key) as? Map<String, Any?> ?: emptyMap()
            existing = data
            name = data["name"] as? String ?: profile?.name ?: ""
            bio = data["bio"] as? String ?: ""
        }
        onDispose { listener.remove() }
    }
    LaunchedEffect(photo, existing["avatar"], existing["avatarTelegramFileId"], avatarRetry) {
        avatarError = false
        if (photo != null) { avatarUri = photo; return@LaunchedEffect }
        val direct = existing["avatar"] as? String
        val fileId = existing["avatarTelegramFileId"] as? String
        if (!direct.isNullOrBlank()) { avatarUri = Uri.parse(direct); return@LaunchedEffect }
        if (fileId.isNullOrBlank()) { avatarUri = null; return@LaunchedEffect }
        avatarLoading = true
        try { avatarUri = Uri.fromFile(loadTelegramMediaFile(context, user, fileId, existing["avatarMimeType"] as? String ?: "image/jpeg") ?: error("Profile image unavailable")) }
        catch (_: Exception) { avatarError = true }
        finally { avatarLoading = false }
    }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        TextButton(onClick = onBack) { Text("‹ More", color = Rose) }
        Box(Modifier.fillMaxWidth().height(120.dp).clip(RoundedCornerShape(20.dp)).background(Brush.linearGradient(listOf(Color(0xFFF6C3D7), Color(0xFFFFF0F6), Color(0xFFE99DBB)))) )
        Box(Modifier.padding(start = 16.dp).offset(y = (-55).dp).size(112.dp).clip(CircleShape).background(Color(0xFFFFE4EF)).border(4.dp, Color.White, CircleShape), contentAlignment = Alignment.Center) {
            if (avatarUri != null) AsyncImage(model = avatarUri, contentDescription = "${name.ifBlank { profile?.name ?: "Profile" }} profile photo", modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
            else if (avatarLoading) CircularProgressIndicator(color = Rose, modifier = Modifier.size(24.dp), strokeWidth = 2.dp)
            else Text(profile?.initial ?: "♡", color = Rose, fontSize = 36.sp, fontWeight = FontWeight.Bold)
        }
        if (avatarError) TextButton(onClick = { avatarRetry++ }) { Text("Profile photo unavailable · Retry", color = Rose) }
        Text("Profile", color = Ink, fontSize = 25.sp, fontWeight = FontWeight.Bold, modifier = Modifier.offset(y = (-46).dp))
        Text("${profile?.name ?: "Our profile"} · ${user.email.orEmpty()}", color = Color(0xFF8B7180))
        OutlinedTextField(name, { if (it.length <= 40) name = it }, label = { Text("Display name") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(bio, { if (it.length <= 160) bio = it }, label = { Text("Bio") }, minLines = 3, modifier = Modifier.fillMaxWidth())
        OutlinedButton(onClick = { picker.launch("image/*") }, modifier = Modifier.fillMaxWidth()) { Text(if (photo != null) "Photo selected" else "Choose profile photo") }
        Button(enabled = !saving && name.isNotBlank(), onClick = {
            saving = true
            scope.launch {
                var uploaded: Map<String, Any?>? = null
                try {
                    uploaded = photo?.let { uploadTelegramMedia(context, user, it, "Profile photo · $name", name, "image/jpeg") }
                    val uploadedReferences = uploaded.orEmpty()
                    val previousNames = ((existing["previousNames"] as? List<*>)?.filterIsInstance<String>().orEmpty() + listOfNotNull((existing["name"] as? String)?.takeIf { it != name.trim() })).distinct()
                    val saved = existing.toMutableMap().apply {
                        put("name", name.trim()); put("bio", bio.trim()); put("bioConfigured", true); put("authUid", user.uid); put("previousNames", previousNames)
                        if (uploadedReferences.isNotEmpty()) { put("avatar", ""); put("avatarTelegramFileId", uploadedReferences["telegramFileId"] ?: ""); put("avatarMimeType", uploadedReferences["telegramMimeType"] ?: "image/jpeg") }
                        else { put("avatar", existing["avatar"] ?: ""); put("avatarTelegramFileId", existing["avatarTelegramFileId"] ?: ""); put("avatarMimeType", existing["avatarMimeType"] ?: "image/jpeg") }
                    }
                    reference.set(mapOf(key to saved, "updatedAt" to FieldValue.serverTimestamp()), com.google.firebase.firestore.SetOptions.merge()).await()
                    avatarUri = photo
                    photo = null
                    Toast.makeText(context, "Profile saved.", Toast.LENGTH_SHORT).show()
                } catch (_: Exception) {
                    uploaded?.let { runCatching { deleteTelegramMediaIfReferenced(user, it) } }
                    Toast.makeText(context, "Could not save profile. Check your connection.", Toast.LENGTH_SHORT).show()
                }
                finally { saving = false }
            }
        }, modifier = Modifier.fillMaxWidth(), colors = ButtonDefaults.buttonColors(containerColor = Rose)) { Text(if (saving) "Saving…" else "Save profile") }
    }
}

@Composable
private fun NativeMemoryMediaThumbnail(user: FirebaseUser, item: Map<String, Any?>, modifier: Modifier = Modifier) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val fileId = item?.get("telegramFileId") as? String
    val url = item?.get("url") as? String
    val isVideo = item["type"] == "video"
    val thumbnailUrl = item["thumbnailUrl"] as? String ?: if (!isVideo) url else null
    var localUri by remember(fileId, isVideo) { mutableStateOf<Uri?>(null) }
    LaunchedEffect(fileId, isVideo) {
        localUri = null
        if (!fileId.isNullOrBlank()) localUri = runCatching {
            val mime = item["mimeType"] as? String
            loadNativeMemoryThumbnail(context, user, fileId, mime, isVideo)
                ?: if (!isVideo) loadTelegramMediaFile(context, user, fileId, mime)?.let { Uri.fromFile(it) } else null
        }.getOrNull()
    }
    Box(modifier.clip(RoundedCornerShape(12.dp)).background(Color(0xFFFFEDF3)), contentAlignment = Alignment.Center) {
        when {
            localUri != null -> AsyncImage(model = localUri, contentDescription = item["name"] as? String ?: "Memory photo", modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
            fileId.isNullOrBlank() && !thumbnailUrl.isNullOrBlank() -> AsyncImage(model = thumbnailUrl, contentDescription = item["name"] as? String ?: "Memory photo", modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
            else -> Text("♡", color = Rose, fontSize = 28.sp)
        }
        if (isVideo) Text("▶", color = Color.White, modifier = Modifier.align(Alignment.Center).background(Color(0x88000000), CircleShape).padding(horizontal = 9.dp, vertical = 5.dp), fontSize = 15.sp)
    }
}

@Composable
private fun NativeMemoryThumbnail(user: FirebaseUser, memory: Map<String, Any?>) {
    val items = nativeMemoryMedia(memory)
    val item = items.firstOrNull { it["type"] != "video" } ?: items.firstOrNull()
    if (item != null) NativeMemoryMediaThumbnail(user, item, Modifier.size(88.dp))
    else Box(Modifier.size(88.dp).clip(RoundedCornerShape(12.dp)).background(Color(0xFFFFEDF3)), contentAlignment = Alignment.Center) { Text("♡", color = Rose, fontSize = 28.sp) }
}

private fun nativeMemoryMedia(memory: Map<String, Any?>): List<Map<String, Any?>> {
    val extras = (memory["mediaItems"] as? List<*>)?.filterIsInstance<Map<*, *>>().orEmpty()
        .map { item -> item.entries.associate { it.key.toString() to it.value } }
    val fileId = memory["telegramFileId"] as? String
    val url = memory["photoUrl"] as? String
    val primary = if (!fileId.isNullOrBlank() || !url.isNullOrBlank()) listOf(mapOf<String, Any?>(
        "type" to (memory["mediaType"] as? String ?: "photo"), "telegramFileId" to fileId,
        "url" to url, "mimeType" to memory["photoMimeType"], "name" to (memory["title"] as? String ?: "Memory photo"),
        "telegramMessageId" to memory["telegramMessageId"], "telegramChatId" to memory["telegramChatId"], "isPrimary" to true
    )) else emptyList()
    return primary + extras
}

private fun nativeMemorySortDate(memory: Map<String, Any?>): LocalDate {
    val rawDate = (memory["rawDate"] as? String).orEmpty()
    val displayDate = (memory["date"] as? String).orEmpty()
    return runCatching { LocalDate.parse(rawDate) }.getOrElse {
        runCatching { LocalDate.parse(displayDate, DateTimeFormatter.ofPattern("d MMM yyyy", Locale.UK)) }
            .getOrElse { LocalDate.ofEpochDay(0) }
    }
}

private fun sortNativeMemories(memories: List<Map<String, Any?>>): List<Map<String, Any?>> =
    memories.sortedWith(
        compareByDescending<Map<String, Any?>> { nativeMemorySortDate(it) }
            .thenByDescending { (it["createdAt"] as? com.google.firebase.Timestamp)?.toDate()?.time ?: (it["clientCreatedAt"] as? Number)?.toLong() ?: 0L }
    )

@Composable
@OptIn(ExperimentalMaterial3Api::class)
private fun NativeMemoriesScreen(user: FirebaseUser, onBack: () -> Unit) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val profile = partnerProfiles.firstOrNull { it.email.equals(user.email.orEmpty(), true) }
    val root = remember { FirebaseFirestore.getInstance().collection("couples").document("our-little-world").collection("items") }
    var memories by remember { mutableStateOf<List<Map<String, Any?>>>(emptyList()) }
    var visibleMemoryLimit by remember { mutableIntStateOf(20) }
    var isLoading by remember { mutableStateOf(true) }
    var isOffline by remember { mutableStateOf(false) }
    var loadError by remember { mutableStateOf<String?>(null) }
    var retryNonce by remember { mutableIntStateOf(0) }
    var selected by remember { mutableStateOf<Map<String, Any?>?>(null) }
    var title by rememberSaveable { mutableStateOf("") }
    var note by rememberSaveable { mutableStateOf("") }
    var rawDate by rememberSaveable { mutableStateOf("") }
    var pendingPrimaryUri by remember { mutableStateOf<Uri?>(null) }
    var pendingPrimaryName by remember { mutableStateOf("") }
    var dialog by remember { mutableStateOf(false) }
    var detailDialog by remember { mutableStateOf(false) }
    var confirmMemoryDelete by remember { mutableStateOf(false) }
    var memoryDatePickerOpen by remember { mutableStateOf(false) }
    var saving by remember { mutableStateOf(false) }
    var uploading by remember { mutableStateOf(false) }
    var viewingMedia by remember { mutableStateOf<Map<String, Any?>?>(null) }
    var confirmMediaDelete by remember { mutableStateOf(false) }
    var galleryMediaItems by remember { mutableStateOf<List<Map<String, Any?>>>(emptyList()) }
    var viewingMediaIndex by remember { mutableIntStateOf(-1) }
    var previewUri by remember { mutableStateOf<Uri?>(null) }
    var previewLoading by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val memoriesListState = androidx.compose.foundation.lazy.rememberLazyListState()
    val openMedia: (List<Map<String, Any?>>, Int) -> Unit = { items, targetIndex ->
        if (items.isNotEmpty()) {
            galleryMediaItems = items
            viewingMediaIndex = targetIndex.coerceIn(items.indices)
            val mediaMap = items[viewingMediaIndex]
            viewingMedia = mediaMap
            previewUri = null
            previewLoading = true
            scope.launch {
                try {
                    val fileId = mediaMap["telegramFileId"] as? String
                    val directUrl = mediaMap["url"] as? String
                    previewUri = if (!fileId.isNullOrBlank()) Uri.fromFile(loadTelegramMediaFile(context, user, fileId, mediaMap["mimeType"] as? String) ?: error("Media unavailable")) else Uri.parse(directUrl ?: error("Media unavailable"))
                } catch (_: Exception) { Toast.makeText(context, "Could not load memory media.", Toast.LENGTH_SHORT).show(); viewingMedia = null }
                finally { previewLoading = false }
            }
        }
    }
    val mediaPicker = rememberLauncherForActivityResult(ActivityResultContracts.GetMultipleContents()) { selectedUris ->
        val memoryId = selected?.get("id") as? String ?: return@rememberLauncherForActivityResult
        if (selectedUris.isEmpty()) return@rememberLauncherForActivityResult
        scope.launch {
            uploading = true
            try {
                val failedFiles = mutableListOf<String>()
                selectedUris.forEachIndexed { index, uri ->
                    val mime = context.contentResolver.getType(uri) ?: "application/octet-stream"
                    val fileName = context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor -> if (cursor.moveToFirst()) cursor.getString(0) else null } ?: "Memory media ${index + 1}"
                    if (!mime.startsWith("image/") && !mime.startsWith("video/")) { failedFiles += fileName; return@forEachIndexed }
                    var cleanupFailed = false
                    try {
                        val uploaded = uploadTelegramMedia(context, user, uri, "${title.ifBlank { "Our memory" }} · ${profile?.name ?: "Partner"}", profile?.name ?: "Partner", mime)
                        val mediaItem = mapOf<String, Any?>("type" to if (mime.startsWith("video/")) "video" else "photo", "telegramFileId" to uploaded["telegramFileId"], "telegramFileUniqueId" to uploaded["telegramFileUniqueId"], "mimeType" to mime, "name" to fileName, "telegramMessageId" to uploaded["telegramMessageId"], "telegramChatId" to uploaded["telegramChatId"], "createdAtMs" to System.currentTimeMillis())
                        val memoryRef = root.document(memoryId)
                        try { memoryRef.update("mediaItems", FieldValue.arrayUnion(mediaItem)).await() }
                        catch (saveError: Exception) {
                            cleanupFailed = runCatching { deleteTelegramMediaIfReferenced(user, mediaItem) }.isFailure
                            throw saveError
                        }
                        val currentSelected = selected?.takeIf { it["id"] == memoryId } ?: mapOf("id" to memoryId)
                        val currentItems = (currentSelected["mediaItems"] as? List<*>)?.toMutableList() ?: mutableListOf()
                        currentItems += mediaItem
                        selected = currentSelected + ("mediaItems" to currentItems)
                    } catch (_: Exception) { failedFiles += if (cleanupFailed) "$fileName (cleanup failed)" else fileName }
                }
                if (failedFiles.isEmpty()) Toast.makeText(context, "Memory media added.", Toast.LENGTH_SHORT).show()
                else Toast.makeText(context, "Could not add: ${failedFiles.joinToString().take(180)}", Toast.LENGTH_LONG).show()
            } catch (_: Exception) { Toast.makeText(context, "Could not add memory media. Check your connection.", Toast.LENGTH_SHORT).show() }
            finally { uploading = false }
        }
    }
    val primaryMediaPicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        val mime = context.contentResolver.getType(uri).orEmpty()
        if (!mime.startsWith("image/") && !mime.startsWith("video/")) {
            Toast.makeText(context, "Choose a photo or video.", Toast.LENGTH_SHORT).show()
        } else {
            pendingPrimaryUri = uri
            pendingPrimaryName = context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor -> if (cursor.moveToFirst()) cursor.getString(0) else null } ?: "Selected media"
        }
    }
    DisposableEffect(user.uid, retryNonce) {
        isLoading = true
        loadError = null
        val listener = root.whereEqualTo("type", "memory").orderBy("createdAt", Query.Direction.DESCENDING).addSnapshotListener { snapshot, error ->
            if (snapshot != null) {
                val latest = sortNativeMemories(snapshot.documents.map { mapOf("id" to it.id) + it.data.orEmpty() })
                memories = latest
                val selectedId = selected?.get("id") as? String
                if (selectedId != null) {
                    val refreshed = latest.firstOrNull { it["id"] == selectedId }
                    if (refreshed != null) selected = refreshed
                    else { selected = null; detailDialog = false; dialog = false }
                }
                isOffline = snapshot.metadata.isFromCache
                loadError = null
            } else if (error != null) loadError = "Could not load memories. Check your connection and try again."
            isLoading = false
        }
        onDispose { listener.remove() }
    }
    LaunchedEffect(memoriesListState, visibleMemoryLimit, memories.size) {
        snapshotFlow { memoriesListState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0 }
            .collect { lastVisible ->
                if (lastVisible >= visibleMemoryLimit - 3 && visibleMemoryLimit < memories.size) {
                    visibleMemoryLimit = (visibleMemoryLimit + 20).coerceAtMost(memories.size)
                }
            }
    }
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = onBack) { Text("‹ Home", color = Rose) }
            Text("Memories ♡", color = Ink, fontSize = 22.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            TextButton(onClick = { selected = null; title = ""; note = ""; rawDate = ""; pendingPrimaryUri = null; pendingPrimaryName = ""; dialog = true }) { Text("+ Add", color = Rose) }
        }
        if (isLoading && memories.isEmpty()) Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Column(horizontalAlignment = Alignment.CenterHorizontally) { CircularProgressIndicator(color = Rose); Text("Loading memories…", color = Color(0xFF8B7180), modifier = Modifier.padding(top = 12.dp)) } }
        else if (loadError != null && memories.isEmpty()) Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Column(horizontalAlignment = Alignment.CenterHorizontally) { Text(loadError.orEmpty(), color = Color(0xFF8B7180)); TextButton(onClick = { retryNonce++ }) { Text("Retry", color = Rose) } } }
        else if (memories.isEmpty()) Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text("Your shared memories will appear here.", color = Color(0xFF8B7180)) }
        else LazyColumn(state = memoriesListState, modifier = Modifier.fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            if (isOffline) item { Text("Showing saved memories. New changes will appear when you’re back online.", color = Color(0xFF8B7180), modifier = Modifier.fillMaxWidth().background(Color(0xFFFFEDF3), RoundedCornerShape(12.dp)).padding(12.dp)) }
            if (loadError != null) item { Row(verticalAlignment = Alignment.CenterVertically) { Text(loadError.orEmpty(), color = Color(0xFF8B7180), modifier = Modifier.weight(1f)); TextButton(onClick = { retryNonce++ }) { Text("Retry", color = Rose) } } }
            items(memories.take(visibleMemoryLimit), key = { it["id"] as String }) { memory ->
                Card(Modifier.fillMaxWidth().clickable { selected = memory; detailDialog = true }, colors = CardDefaults.cardColors(containerColor = Color.White), border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFF3D5E1))) {
                    Row(Modifier.padding(12.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        NativeMemoryThumbnail(user, memory)
                        Column(Modifier.weight(1f)) {
                            Text(memory["title"] as? String ?: "Our Memory", color = Ink, fontWeight = FontWeight.Bold)
                            Text(memory["date"] as? String ?: memory["rawDate"] as? String ?: "", color = Rose, fontSize = 12.sp)
                            Text(memory["note"] as? String ?: "A little moment, kept close.", color = Color(0xFF715B66), modifier = Modifier.padding(top = 6.dp), maxLines = 3)
                            val extras = (memory["mediaItems"] as? List<*>)?.size ?: 0
                            val primary = if (!((memory["telegramFileId"] as? String).isNullOrBlank()) || !((memory["photoUrl"] as? String).isNullOrBlank())) 1 else 0
                            val count = extras + primary
                            if (count > 0) Text("📷  $count photo/video${if (count == 1) "" else "s"}", color = Rose, fontSize = 12.sp, modifier = Modifier.padding(top = 6.dp))
                        }
                    }
                }
            }
        }
    }
    if (detailDialog && selected != null) {
        val memory = selected!!
        val media = nativeMemoryMedia(memory)
        val index = memories.indexOfFirst { it["id"] == memory["id"] }
        AlertDialog(
            onDismissRequest = { detailDialog = false },
            title = { Text(memory["title"] as? String ?: "Our Memory", color = Ink) },
            text = {
                Column(Modifier.fillMaxWidth().heightIn(max = 440.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    val primaryIndex = media.indexOfFirst { it["isPrimary"] == true }
                    if (primaryIndex >= 0) {
                        Card(Modifier.fillMaxWidth().clickable { openMedia(media, primaryIndex) }, colors = CardDefaults.cardColors(containerColor = Color(0xFFFFEDF3)), shape = RoundedCornerShape(14.dp)) {
                            NativeMemoryMediaThumbnail(user, media[primaryIndex], Modifier.fillMaxWidth().height(150.dp))
                        }
                    }
                    Text(memory["date"] as? String ?: memory["rawDate"] as? String ?: "A moment to remember", color = Rose, fontSize = 13.sp)
                    Text(memory["note"] as? String ?: "A little moment, kept close.", color = Color(0xFF715B66))
                    if (media.isNotEmpty()) {
                        Text("Photos and videos · ${media.size}", color = Ink, fontWeight = FontWeight.SemiBold)
                        val galleryRows = ((media.size + 2) / 3).coerceAtMost(3).coerceAtLeast(1)
                        LazyVerticalGrid(columns = GridCells.Fixed(3), modifier = Modifier.fillMaxWidth().height((galleryRows * 116).dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            items(media.size) { mediaIndex ->
                                val item = media[mediaIndex]
                                Card(Modifier.fillMaxWidth().clickable(enabled = !uploading) { openMedia(media, mediaIndex) }, colors = CardDefaults.cardColors(containerColor = Color.White), border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFF3D5E1))) {
                                    Column(Modifier.padding(6.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                                        NativeMemoryMediaThumbnail(user, item, Modifier.fillMaxWidth().height(86.dp))
                                        Text(item["name"] as? String ?: "${if (item["type"] == "video") "Video" else "Photo"} ${mediaIndex + 1}", color = Rose, fontSize = 11.sp, maxLines = 1)
                                    }
                                }
                            }
                        }
                    } else Text("No photos or videos added yet.", color = Color(0xFF8B7180), fontSize = 13.sp)
                    TextButton(enabled = !uploading, onClick = { mediaPicker.launch("*/*") }) { Text(if (uploading) "Uploading media…" else "+ Add photos or videos", color = Rose) }
                }
            },
            confirmButton = {
                Row {
                    TextButton(enabled = index > 0, onClick = { if (index > 0) selected = memories[index - 1] }) { Text("‹ Previous", color = Rose) }
                    TextButton(enabled = index >= 0 && index < memories.lastIndex, onClick = { if (index >= 0 && index < memories.lastIndex) selected = memories[index + 1] }) { Text("Next ›", color = Rose) }
                    TextButton(onClick = {
                        title = memory["title"] as? String ?: ""; note = memory["note"] as? String ?: ""; rawDate = (memory["rawDate"] as? String).orEmpty().ifBlank { runCatching { LocalDate.parse(memory["date"] as? String ?: "", DateTimeFormatter.ofPattern("d MMM yyyy", Locale.UK)).toString() }.getOrDefault("") }; pendingPrimaryUri = null; pendingPrimaryName = ""
                        detailDialog = false; dialog = true
                    }) { Text("Edit", color = Rose) }
                }
            },
            dismissButton = { TextButton(onClick = { detailDialog = false }) { Text("Close", color = Color(0xFF8B7180)) } }
        )
    }
    if (dialog) AlertDialog(onDismissRequest = { if (!saving && !uploading) { dialog = false; pendingPrimaryUri = null; pendingPrimaryName = "" } }, title = { Text(if (selected == null) "Add Memory" else "Edit Memory") }, text = {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(title, { title = it }, label = { Text("Title") }, singleLine = true, enabled = !saving && !uploading)
            OutlinedTextField(rawDate, {}, label = { Text("Date") }, placeholder = { Text("Choose a date") }, singleLine = true, readOnly = true, enabled = !saving && !uploading, trailingIcon = { TextButton(enabled = !saving && !uploading, onClick = { memoryDatePickerOpen = true }) { Text("Choose") } })
            TextButton(enabled = !saving && !uploading, onClick = { primaryMediaPicker.launch("*/*") }) {
                Text(if (pendingPrimaryUri != null) "Change selected media" else "Add or replace main photo/video", color = Rose)
            }
            if (pendingPrimaryUri != null) Row(verticalAlignment = Alignment.CenterVertically) {
                Text(pendingPrimaryName, color = Color(0xFF715B66), modifier = Modifier.weight(1f), maxLines = 1)
                TextButton(onClick = { pendingPrimaryUri = null; pendingPrimaryName = "" }) { Text("Remove", color = Rose) }
            } else if (selected?.let { !((it["telegramFileId"] as? String).isNullOrBlank()) || !((it["photoUrl"] as? String).isNullOrBlank()) } == true) {
                Text("Current main media will be kept unless replaced.", color = Color(0xFF8B7180), fontSize = 12.sp)
            }
            OutlinedTextField(note, { note = it }, label = { Text("Memory note") }, minLines = 3, enabled = !saving && !uploading)
            val memoryMedia = selected?.let(::nativeMemoryMedia).orEmpty()
            if (selected != null) {
                TextButton(enabled = !uploading, onClick = { mediaPicker.launch("*/*") }) { Text(if (uploading) "Uploading media…" else "+ Add photos or videos (${memoryMedia.size})", color = Rose) }
                memoryMedia.forEachIndexed { index, item ->
                    TextButton(onClick = {
                        openMedia(memoryMedia, index)
                    }) { Text("${if (item["type"] == "video") "🎬" else "📷"} ${item["name"] ?: "Memory media ${index + 1}"}", color = Ink) }
                }
            }
        }
    }, confirmButton = { TextButton(enabled = title.isNotBlank() && rawDate.isNotBlank() && runCatching { LocalDate.parse(rawDate) }.isSuccess && !saving && !uploading, onClick = {
        saving = true
        val formatted = LocalDate.parse(rawDate).format(DateTimeFormatter.ofPattern("d MMM yyyy", Locale.UK))
        val id = selected?.get("id") as? String
        scope.launch {
            var uploadedPrimary: Map<String, Any?>? = null
            var saved = false
            var cleanupFailed = false
            try {
                val payload = mutableMapOf<String, Any?>("title" to title.trim(), "date" to formatted, "rawDate" to rawDate.trim(), "note" to note.trim())
                pendingPrimaryUri?.let { uri ->
                    val mime = context.contentResolver.getType(uri) ?: "application/octet-stream"
                    if (!mime.startsWith("image/") && !mime.startsWith("video/")) error("Choose a photo or video.")
                    val compressed = if (mime.startsWith("image/")) prepareNativeMemoryPhoto(context, uri) else null
                    try {
                        val uploaded = uploadTelegramMedia(context, user, uri, "Memory · ${title.trim()}", profile?.name ?: "Partner", mime, "New Memory Uploaded 💖", compressed, if (compressed != null) "image/jpeg" else mime)
                        uploadedPrimary = uploaded
                        payload["mediaType"] = if (mime.startsWith("video/")) "video" else "image"
                        payload["photoUrl"] = ""
                        payload["telegramFileId"] = uploaded["telegramFileId"]
                        payload["telegramFileUniqueId"] = uploaded["telegramFileUniqueId"]
                        payload["telegramMimeType"] = uploaded["telegramMimeType"]
                        payload["photoMimeType"] = uploaded["telegramMimeType"] ?: mime
                        payload["telegramMessageId"] = uploaded["telegramMessageId"]
                        payload["telegramChatId"] = uploaded["telegramChatId"]
                    } finally { compressed?.delete() }
                }
                val reference = if (id == null) {
                    root.add(payload + mapOf("type" to "memory", "author" to user.uid, "createdAt" to FieldValue.serverTimestamp(), "clientCreatedAt" to System.currentTimeMillis())).await()
                } else {
                    root.document(id).set(payload, com.google.firebase.firestore.SetOptions.merge()).await()
                    root.document(id)
                }
                saved = true
                pendingPrimaryUri = null; pendingPrimaryName = ""; dialog = false
                Toast.makeText(context, if (id == null) "Memory saved ♡" else "Memory updated ♡", Toast.LENGTH_SHORT).show()
                if (id == null) runCatching { notifyPostPartner(profile, "memory", "${profile?.name ?: "Your partner"} added a new memory.", reference.id, "memories") }
            } catch (_: Exception) {
                if (!saved) uploadedPrimary?.let { cleanupFailed = runCatching { deleteTelegramMediaIfReferenced(user, it) }.isFailure }
                Toast.makeText(context, if (cleanupFailed) "Memory save failed and its Telegram upload could not be cleaned up." else "Could not save memory. Check your connection and try again.", Toast.LENGTH_LONG).show()
            } finally { saving = false }
        }
    }) { Text(if (saving) "Saving…" else "Save") } }, dismissButton = { Row {
        if (selected != null) TextButton(onClick = { confirmMemoryDelete = true }) { Text("Delete", color = Color(0xFFB94062)) }
        TextButton(enabled = !saving && !uploading, onClick = { dialog = false; pendingPrimaryUri = null; pendingPrimaryName = "" }) { Text("Cancel") }
    } })
    if (memoryDatePickerOpen) {
        val initialDateMillis = runCatching { LocalDate.parse(rawDate).atStartOfDay(ZoneId.of("UTC")).toInstant().toEpochMilli() }.getOrNull()
        val memoryDatePickerState = rememberDatePickerState(initialSelectedDateMillis = initialDateMillis)
        DatePickerDialog(onDismissRequest = { memoryDatePickerOpen = false }, confirmButton = { TextButton(onClick = {
            memoryDatePickerState.selectedDateMillis?.let { millis -> rawDate = java.time.Instant.ofEpochMilli(millis).atZone(ZoneId.of("UTC")).toLocalDate().toString() }
            memoryDatePickerOpen = false
        }) { Text("OK") } }, dismissButton = { TextButton(onClick = { memoryDatePickerOpen = false }) { Text("Cancel") } }) { DatePicker(state = memoryDatePickerState) }
    }
    if (confirmMemoryDelete && selected != null) {
        val memoryId = selected?.get("id") as? String
        AlertDialog(
            onDismissRequest = { confirmMemoryDelete = false },
            title = { Text("Delete this memory?") },
            text = { Text("This memory will be removed for both of you.") },
            confirmButton = { TextButton(enabled = !saving, onClick = {
                if (memoryId == null) { confirmMemoryDelete = false; return@TextButton }
                saving = true
                scope.launch {
                    try {
                        root.document(memoryId).delete().await()
                        selected = null; dialog = false; detailDialog = false; confirmMemoryDelete = false
                        Toast.makeText(context, "Memory deleted.", Toast.LENGTH_SHORT).show()
                    } catch (_: Exception) { Toast.makeText(context, "Could not delete memory.", Toast.LENGTH_SHORT).show() }
                    finally { saving = false }
                }
            }) { Text(if (saving) "Deleting…" else "Delete", color = Color(0xFFB94062)) } },
            dismissButton = { TextButton(onClick = { confirmMemoryDelete = false }) { Text("Cancel") } }
        )
    }
    if (viewingMedia != null) {
        val item = viewingMedia!!
        var imageScale by remember(viewingMediaIndex) { mutableFloatStateOf(1f) }
        var imageOffset by remember(viewingMediaIndex) { mutableStateOf(androidx.compose.ui.geometry.Offset.Zero) }
        val transformState = rememberTransformableState { zoomChange, panChange, _ ->
            val nextScale = (imageScale * zoomChange).coerceIn(1f, 5f)
            imageScale = nextScale
            imageOffset = if (nextScale > 1f) imageOffset + panChange else androidx.compose.ui.geometry.Offset.Zero
        }
        val photoIndices = galleryMediaItems.indices.filter { galleryMediaItems[it]["type"] != "video" }
        val photoPosition = photoIndices.indexOf(viewingMediaIndex)
        val swipeModifier = if (item["type"] != "video" && photoPosition >= 0) Modifier.pointerInput(viewingMediaIndex, imageScale, photoIndices) {
            var distance = 0f
            detectHorizontalDragGestures(
                onHorizontalDrag = { _, amount -> if (imageScale <= 1.01f) distance += amount },
                onDragEnd = {
                    if (kotlin.math.abs(distance) > 60f && photoIndices.size > 1) {
                        val nextPosition = (photoPosition + (if (distance < 0f) 1 else -1) + photoIndices.size) % photoIndices.size
                        openMedia(galleryMediaItems, photoIndices[nextPosition])
                    }
                    distance = 0f
                },
                onDragCancel = { distance = 0f }
            )
        } else Modifier
        androidx.compose.ui.window.Dialog(onDismissRequest = { viewingMedia = null }, properties = androidx.compose.ui.window.DialogProperties(usePlatformDefaultWidth = false)) {
            Surface(Modifier.fillMaxSize().padding(12.dp), color = Color(0xFF21151D), shape = RoundedCornerShape(20.dp)) {
                Column(Modifier.fillMaxSize().padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Text(item["name"] as? String ?: "Memory media", color = Color.White, modifier = Modifier.weight(1f), maxLines = 1)
                        TextButton(onClick = { viewingMedia = null }) { Text("Close", color = Color.White) }
                    }
                    Box(Modifier.weight(1f).fillMaxWidth().then(swipeModifier), contentAlignment = Alignment.Center) {
                        when {
                            previewLoading -> CircularProgressIndicator(color = Rose)
                            previewUri == null -> Text("Preview unavailable", color = Color.White)
                            item["type"] == "video" -> AndroidView(factory = { view -> VideoView(view).apply { setVideoURI(previewUri); setOnPreparedListener { it.isLooping = false; start() } } }, modifier = Modifier.fillMaxWidth().heightIn(max = 680.dp))
                            else -> AsyncImage(
                                model = previewUri,
                                contentDescription = item["name"] as? String,
                                modifier = Modifier.fillMaxSize().graphicsLayer {
                                    scaleX = imageScale; scaleY = imageScale
                                    translationX = imageOffset.x; translationY = imageOffset.y
                                }.transformable(transformState),
                                contentScale = ContentScale.Fit
                            )
                        }
                    }
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
                        if (photoIndices.size > 1 && photoPosition >= 0) {
                            TextButton(onClick = { openMedia(galleryMediaItems, photoIndices[(photoPosition - 1 + photoIndices.size) % photoIndices.size]) }) { Text("‹ Previous", color = Color.White) }
                            Text("${photoPosition + 1} / ${photoIndices.size}", color = Color.White)
                            TextButton(onClick = { openMedia(galleryMediaItems, photoIndices[(photoPosition + 1) % photoIndices.size]) }) { Text("Next ›", color = Color.White) }
                        }
                    }
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
                        TextButton(onClick = { confirmMediaDelete = true }) { Text("Delete this media", color = Color(0xFFFF8AAE)) }
                        TextButton(onClick = { viewingMedia = null }) { Text("Close", color = Color.White) }
                    }
                }
            }
        }
    }
    if (confirmMediaDelete && viewingMedia != null) {
        val item = viewingMedia!!
        val label = if (item["type"] == "video") "video" else "photo"
        AlertDialog(
            onDismissRequest = { confirmMediaDelete = false },
            title = { Text("Delete this $label?") },
            text = { Text("This will remove the $label from this memory for both of you.") },
            confirmButton = { TextButton(onClick = { confirmMediaDelete = false; scope.launch { try {
                val memoryId = selected?.get("id") as? String ?: error("Memory not selected")
                if (item["isPrimary"] == true) {
                    root.document(memoryId).update(mapOf(
                        "telegramFileId" to FieldValue.delete(), "telegramFileUniqueId" to FieldValue.delete(),
                        "photoUrl" to FieldValue.delete(), "mediaType" to FieldValue.delete(),
                        "photoMimeType" to FieldValue.delete(), "telegramMessageId" to FieldValue.delete(),
                        "telegramChatId" to FieldValue.delete()
                    )).await()
                } else root.document(memoryId).update("mediaItems", FieldValue.arrayRemove(item)).await()
                val telegramRemoved = runCatching { deleteTelegramMediaIfReferenced(user, item) }.isSuccess
                galleryMediaItems = galleryMediaItems.filterIndexed { index, _ -> index != viewingMediaIndex }
                viewingMedia = null
                selected = mapOf("id" to memoryId) + root.document(memoryId).get().await().data.orEmpty()
                Toast.makeText(context, if (telegramRemoved) "Media deleted from this memory." else "Media removed here; its Telegram copy could not be deleted.", Toast.LENGTH_LONG).show()
            } catch (_: Exception) { Toast.makeText(context, "Could not delete memory media.", Toast.LENGTH_SHORT).show() } } }) { Text("Delete", color = Color(0xFFB94062)) } },
            dismissButton = { TextButton(onClick = { confirmMediaDelete = false }) { Text("Cancel") } }
        )
    }
}

@Composable
private fun NativeSharedGalleryScreen(user: FirebaseUser, onBack: () -> Unit) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val profile = partnerProfiles.firstOrNull { it.email.equals(user.email.orEmpty(), true) }
    val root = remember { FirebaseFirestore.getInstance().collection("couples").document("our-little-world").collection("items") }
    var folders by remember { mutableStateOf<List<Map<String, Any?>>>(emptyList()) }
    var media by remember { mutableStateOf<List<Map<String, Any?>>>(emptyList()) }
    var folder by remember { mutableStateOf<Map<String, Any?>?>(null) }
    var title by rememberSaveable { mutableStateOf("") }
    var creating by remember { mutableStateOf(false) }
    var uploading by remember { mutableStateOf(false) }
    var viewing by remember { mutableStateOf<Map<String, Any?>?>(null) }
    var previewUri by remember { mutableStateOf<Uri?>(null) }
    var previewLoading by remember { mutableStateOf(false) }
    var previewError by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }
    var deleting by remember { mutableStateOf(false) }
    var imageScale by remember { mutableFloatStateOf(1f) }
    var imageOffset by remember { mutableStateOf(androidx.compose.ui.geometry.Offset.Zero) }
    var galleryLoading by remember { mutableStateOf(true) }
    var galleryError by remember { mutableStateOf("") }
    var galleryOffline by remember { mutableStateOf(false) }
    var galleryRetry by remember { mutableIntStateOf(0) }
    var foldersReady by remember { mutableStateOf(false) }
    var mediaReady by remember { mutableStateOf(false) }
    var foldersOffline by remember { mutableStateOf(false) }
    var mediaOffline by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    fun folderMediaItems(): List<Map<String, Any?>> = media.filter { it["folderId"] == folder?.get("id") }
        .sortedByDescending { (it["createdAtMs"] as? Number)?.toLong() ?: 0L }
    fun openGalleryItem(item: Map<String, Any?>) {
        viewing = item; previewUri = null; previewError = false; previewLoading = true
        imageScale = 1f; imageOffset = androidx.compose.ui.geometry.Offset.Zero
        scope.launch {
            try {
                val fileId = item["telegramFileId"] as? String
                val directUrl = item["photoUrl"] as? String ?: item["url"] as? String
                previewUri = if (!fileId.isNullOrBlank()) Uri.fromFile(loadTelegramMediaFile(context, user, fileId, item["mimeType"] as? String) ?: error("Media unavailable"))
                    else directUrl?.let(Uri::parse) ?: error("Media unavailable")
            } catch (_: Exception) { previewError = true }
            finally { previewLoading = false }
        }
    }
    fun moveGalleryViewer(delta: Int) {
        val items = folderMediaItems()
        val currentIndex = items.indexOfFirst { it["id"] == viewing?.get("id") }
        if (items.size > 1 && currentIndex >= 0) openGalleryItem(items[(currentIndex + delta + items.size) % items.size])
    }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.GetMultipleContents()) { selected ->
        val activeFolder = folder ?: return@rememberLauncherForActivityResult
        if (selected.isEmpty()) return@rememberLauncherForActivityResult
        scope.launch {
            uploading = true
            try {
                val failures = mutableListOf<String>()
                selected.forEach { uri ->
                    val mime = context.contentResolver.getType(uri) ?: "application/octet-stream"
                    val fileName = context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor -> if (cursor.moveToFirst()) cursor.getString(0) else null } ?: "Media"
                    if (!mime.startsWith("image/") && !mime.startsWith("video/")) { failures += fileName; return@forEach }
                    var uploaded: Map<String, Any?>? = null
                    try {
                        val references = uploadTelegramMedia(context, user, uri, "${activeFolder["title"]} · ${profile?.name ?: "Partner"} · ${DateFormat.getDateTimeInstance().format(java.util.Date())}", profile?.name ?: "Partner", mime)
                        uploaded = references
                        root.add(mapOf("type" to "galleryMedia", "folderId" to activeFolder["id"], "author" to user.uid, "fileName" to fileName, "mediaType" to if (mime.startsWith("video/")) "video" else "photo", "mimeType" to mime, "telegramFileId" to references["telegramFileId"], "telegramFileUniqueId" to references["telegramFileUniqueId"], "telegramMessageId" to references["telegramMessageId"], "telegramChatId" to references["telegramChatId"], "createdAtMs" to System.currentTimeMillis(), "createdAt" to FieldValue.serverTimestamp())).await()
                    } catch (_: Exception) {
                        val cleanupFailed = uploaded?.let { runCatching { deleteTelegramMediaIfReferenced(user, it) }.isFailure } == true
                        failures += if (cleanupFailed) "$fileName (cleanup failed)" else fileName
                    }
                }
                if (failures.isEmpty()) Toast.makeText(context, "Gallery upload complete.", Toast.LENGTH_SHORT).show()
                else Toast.makeText(context, "Could not upload: ${failures.joinToString().take(180)}", Toast.LENGTH_LONG).show()
            } catch (_: Exception) { Toast.makeText(context, "Could not upload media. Check your connection and try again.", Toast.LENGTH_SHORT).show() }
            finally { uploading = false }
        }
    }
    DisposableEffect(user.uid, galleryRetry) {
        galleryLoading = true; galleryError = ""; foldersReady = false; mediaReady = false
        val foldersListener = root.whereEqualTo("type", "galleryFolder").addSnapshotListener(com.google.firebase.firestore.MetadataChanges.INCLUDE) { snapshot, error ->
            if (snapshot != null) { folders = snapshot.documents.map { mapOf("id" to it.id) + it.data.orEmpty() }.sortedByDescending { (it["createdAtMs"] as? Number)?.toLong() ?: 0L }; foldersOffline = snapshot.metadata.isFromCache; galleryOffline = foldersOffline || mediaOffline; foldersReady = true }
            else if (error != null) galleryError = "Could not load gallery folders. Check your connection and retry."
            galleryLoading = !(foldersReady && mediaReady) && galleryError.isBlank()
        }
        val mediaListener = root.whereEqualTo("type", "galleryMedia").addSnapshotListener(com.google.firebase.firestore.MetadataChanges.INCLUDE) { snapshot, error ->
            if (snapshot != null) { media = snapshot.documents.map { mapOf("id" to it.id) + it.data.orEmpty() }; mediaOffline = snapshot.metadata.isFromCache; galleryOffline = foldersOffline || mediaOffline; mediaReady = true }
            else if (error != null) galleryError = "Could not load gallery media. Check your connection and retry."
            galleryLoading = !(foldersReady && mediaReady) && galleryError.isBlank()
        }
        onDispose { foldersListener.remove(); mediaListener.remove() }
    }
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = { if (folder != null) folder = null else onBack() }) { Text(if (folder != null) "‹ Gallery" else "‹ More", color = Rose) }
            Text(folder?.get("title") as? String ?: "Shared Gallery", color = Ink, fontSize = 20.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            if (folder == null) TextButton(onClick = { creating = true }) { Text("+ Folder", color = Rose) }
            else TextButton(enabled = !uploading, onClick = { picker.launch("*/*") }) { Text(if (uploading) "Uploading…" else "+ Upload") }
        }
        val visible = if (folder == null) folders else media.filter { it["folderId"] == folder?.get("id") }.sortedByDescending { (it["createdAtMs"] as? Number)?.toLong() ?: 0L }
        if (galleryOffline) Text("Offline · showing gallery items saved on this device", color = Color(0xFF8B7180), fontSize = 12.sp, modifier = Modifier.fillMaxWidth().background(Color(0xFFFFEEF4)).padding(10.dp))
        if (galleryLoading && visible.isEmpty()) Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Rose) }
        else if (galleryError.isNotBlank() && visible.isEmpty()) Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) { Column(horizontalAlignment = Alignment.CenterHorizontally) { Text(galleryError, color = Color(0xFF8B7180)); TextButton(onClick = { galleryRetry++ }) { Text("Retry", color = Rose) } } }
        else if (visible.isEmpty()) Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) { Text(if (folder == null) "Create a shared folder to collect your photos and videos." else "No photos or videos in this folder yet.", color = Color(0xFF8B7180)) }
        else LazyColumn(Modifier.weight(1f).fillMaxWidth(), contentPadding = androidx.compose.foundation.layout.PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
            items(visible, key = { it["id"] as String }) { item ->
                Card(Modifier.fillMaxWidth().clickable {
                    if (folder == null) folder = item
                    else openGalleryItem(item)
                }, colors = CardDefaults.cardColors(containerColor = Color.White), border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFF3D5E1))) {
                    Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(if (folder == null) "🖼️" else if (item["mediaType"] == "video") "🎬" else "📷", fontSize = 24.sp)
                        Column(Modifier.weight(1f).padding(start = 12.dp)) { Text(item["title"] as? String ?: item["fileName"] as? String ?: "Media", color = Ink, fontWeight = FontWeight.SemiBold); if (folder == null) Text("${media.count { it["folderId"] == item["id"] }} items", color = Color(0xFF8B7180), fontSize = 12.sp) }
                    }
                }
            }
        }
    }
    if (creating) AlertDialog(onDismissRequest = { creating = false }, title = { Text("New gallery folder") }, text = { OutlinedTextField(title, { title = it }, label = { Text("Folder name") }, singleLine = true) }, confirmButton = { TextButton(enabled = title.isNotBlank(), onClick = {
        root.add(mapOf("type" to "galleryFolder", "title" to title.trim(), "author" to user.uid, "createdAtMs" to System.currentTimeMillis(), "createdAt" to FieldValue.serverTimestamp())).addOnSuccessListener { creating = false; title = "" }
    }) { Text("Create") } }, dismissButton = { TextButton(onClick = { creating = false }) { Text("Cancel") } })
    if (viewing != null) {
        val item = viewing!!
        val itemsInFolder = folderMediaItems()
        val viewerIndex = itemsInFolder.indexOfFirst { it["id"] == item["id"] }
        val dateMillis = (item["createdAt"] as? com.google.firebase.Timestamp)?.toDate()?.time ?: (item["createdAtMs"] as? Number)?.toLong()
        val viewerTransform = rememberTransformableState { zoomChange, panChange, _ ->
            val nextScale = (imageScale * zoomChange).coerceIn(1f, 4f)
            imageScale = nextScale
            imageOffset = if (nextScale > 1f) imageOffset + panChange else androidx.compose.ui.geometry.Offset.Zero
        }
        var horizontalSwipe by remember(item["id"], imageScale) { mutableFloatStateOf(0f) }
        val swipeModifier = if (item["mediaType"] != "video") Modifier.pointerInput(item["id"], imageScale) {
            detectHorizontalDragGestures(onHorizontalDrag = { _, amount -> if (imageScale <= 1.02f) horizontalSwipe += amount }, onDragEnd = {
                if (kotlin.math.abs(horizontalSwipe) > 65f && itemsInFolder.size > 1) moveGalleryViewer(if (horizontalSwipe < 0f) 1 else -1)
                horizontalSwipe = 0f
            }, onDragCancel = { horizontalSwipe = 0f })
        } else Modifier
        androidx.compose.ui.window.Dialog(onDismissRequest = { viewing = null; confirmDelete = false }, properties = androidx.compose.ui.window.DialogProperties(usePlatformDefaultWidth = false)) {
            Surface(Modifier.fillMaxSize().padding(12.dp), color = Color(0xFF21151D), shape = RoundedCornerShape(20.dp)) {
                Column(Modifier.fillMaxSize().padding(14.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(item["fileName"] as? String ?: "Gallery media", color = Color.White, fontWeight = FontWeight.SemiBold, maxLines = 1)
                            Text(dateMillis?.let { DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT).format(Date(it)) } ?: "Shared media", color = Color(0xFFD4BBC8), fontSize = 11.sp)
                        }
                        if (viewerIndex >= 0) Text("${viewerIndex + 1} / ${itemsInFolder.size}", color = Color(0xFFD4BBC8), fontSize = 12.sp)
                        TextButton(onClick = { viewing = null; confirmDelete = false }) { Text("Close", color = Color.White) }
                    }
                    Box(Modifier.weight(1f).fillMaxWidth().then(swipeModifier), contentAlignment = Alignment.Center) {
                        when {
                            previewLoading -> CircularProgressIndicator(color = Rose)
                            previewError || previewUri == null -> Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Text("Preview unavailable", color = Color.White)
                                TextButton(onClick = { openGalleryItem(item) }) { Text("Retry", color = Color(0xFFFFA6C5)) }
                            }
                            item["mediaType"] == "video" -> AndroidView(factory = { view -> VideoView(view).apply { setVideoURI(previewUri); setOnPreparedListener { it.isLooping = false; start() } } }, modifier = Modifier.fillMaxWidth().heightIn(max = 720.dp))
                            else -> AsyncImage(model = previewUri, contentDescription = item["fileName"] as? String, modifier = Modifier.fillMaxSize().graphicsLayer { scaleX = imageScale; scaleY = imageScale; translationX = imageOffset.x; translationY = imageOffset.y }.transformable(viewerTransform), contentScale = ContentScale.Fit)
                        }
                    }
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                        TextButton(enabled = itemsInFolder.size > 1 && viewerIndex >= 0, onClick = { moveGalleryViewer(-1) }) { Text("‹ Previous", color = Color.White) }
                        Row {
                            if (item["mediaType"] != "video") {
                                TextButton(onClick = { imageScale = (imageScale - 0.5f).coerceAtLeast(1f); if (imageScale <= 1f) imageOffset = androidx.compose.ui.geometry.Offset.Zero }) { Text("−", color = Color.White) }
                                Text("${(imageScale * 100).toInt()}%", color = Color(0xFFD4BBC8), modifier = Modifier.align(Alignment.CenterVertically))
                                TextButton(onClick = { imageScale = (imageScale + 0.5f).coerceAtMost(4f) }) { Text("+", color = Color.White) }
                                TextButton(onClick = { imageScale = 1f; imageOffset = androidx.compose.ui.geometry.Offset.Zero }) { Text("Reset", color = Color.White) }
                            }
                        }
                        TextButton(enabled = itemsInFolder.size > 1 && viewerIndex >= 0, onClick = { moveGalleryViewer(1) }) { Text("Next ›", color = Color.White) }
                    }
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
                        TextButton(enabled = !deleting, onClick = { confirmDelete = true }) { Text("Delete", color = Color(0xFFFFA6C5)) }
                    }
                }
            }
        }
    }
    if (confirmDelete && viewing != null) AlertDialog(
        onDismissRequest = { if (!deleting) confirmDelete = false },
        title = { Text("Delete this gallery item?") },
        text = { Text("It will be removed from your shared gallery.") },
        confirmButton = { TextButton(enabled = !deleting, onClick = {
            val item = viewing ?: return@TextButton
            deleting = true
            scope.launch {
                var telegramDeleteFailed = false
                try {
                    val chat = item["telegramChatId"]?.toString().orEmpty()
                    val message = (item["telegramMessageId"] as? Number)?.toLong() ?: item["telegramMessageId"]?.toString()?.toLongOrNull()
                    if (message != null) telegramDeleteFailed = runCatching { deleteTelegramGalleryMessage(user, chat, message) }.isFailure
                    root.document(item["id"] as String).delete().await()
                    viewing = null; confirmDelete = false
                    Toast.makeText(context, if (telegramDeleteFailed) "Removed from Gallery. Telegram kept its copy." else "Media deleted from Gallery.", Toast.LENGTH_SHORT).show()
                } catch (_: Exception) { Toast.makeText(context, "Could not delete this gallery item.", Toast.LENGTH_SHORT).show() }
                finally { deleting = false }
            }
        }) { Text(if (deleting) "Deleting…" else "Delete", color = Color(0xFFB94062)) } },
        dismissButton = { TextButton(enabled = !deleting, onClick = { confirmDelete = false }) { Text("Keep item") } }
    )
}

@Composable
private fun NativeLettersScreen(user: FirebaseUser, onBack: () -> Unit) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val ownProfile = partnerProfiles.firstOrNull { it.email.equals(user.email.orEmpty(), true) }
    val ownKey = ownProfile?.key ?: "kebyy"
    val other = partnerProfiles.firstOrNull { it.key != ownKey } ?: partnerProfiles.last()
    val root = remember { FirebaseFirestore.getInstance().collection("couples").document("our-little-world").collection("items") }
    val secureContents = remember { FirebaseFirestore.getInstance().collection("couples").document("our-little-world").collection("scheduledLetterContents") }
    var letters by remember { mutableStateOf<List<Map<String, Any?>>>(emptyList()) }
    var tab by rememberSaveable { mutableStateOf("Inbox") }
    var compose by remember { mutableStateOf(false) }
    var showLetterPreview by remember { mutableStateOf(false) }
    var letterPreviewLoading by remember { mutableStateOf(false) }
    var letterPreviewBitmap by remember { mutableStateOf<Bitmap?>(null) }
    val draftPrefs = remember(user.uid) { context.getSharedPreferences("letter-draft-${user.uid}", Context.MODE_PRIVATE) }
    var recipient by rememberSaveable { mutableStateOf(draftPrefs.getString("recipient", other.name) ?: other.name) }
    var bodyValue by remember { mutableStateOf(letterHtmlToTextFieldValue(draftPrefs.getString("body", "") ?: "")) }
    var letterFontSize by rememberSaveable { mutableIntStateOf(draftPrefs.getInt("fontSize", 20).coerceIn(14, 38)) }
    var scheduled by rememberSaveable { mutableStateOf(draftPrefs.getBoolean("scheduled", false)) }
    var deliverAt by rememberSaveable { mutableStateOf(draftPrefs.getString("deliverAt", "") ?: "") }
    var replyToId by rememberSaveable { mutableStateOf("") }
    var editingScheduledId by rememberSaveable { mutableStateOf("") }
    var cancelScheduled by remember { mutableStateOf<Map<String, Any?>?>(null) }
    var opened by remember { mutableStateOf<Map<String, Any?>?>(null) }
    var openedBody by remember { mutableStateOf("") }
    var openedLoading by remember { mutableStateOf(false) }
    var openedError by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var loading by remember { mutableStateOf(true) }
    var loadError by remember { mutableStateOf("") }
    var isOffline by remember { mutableStateOf(false) }
    var retry by remember { mutableIntStateOf(0) }
    var actionError by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()
    DisposableEffect(user.uid, retry) {
        loading = true; loadError = ""
        val listener = root.whereEqualTo("type", "letter").addSnapshotListener(com.google.firebase.firestore.MetadataChanges.INCLUDE) { snapshot, error ->
            if (error != null) { loadError = "Letters could not be loaded. Check your connection and retry."; loading = false; return@addSnapshotListener }
            if (snapshot != null) {
                letters = snapshot.documents.orEmpty().map { mapOf("id" to it.id) + it.data.orEmpty() }
                isOffline = snapshot.metadata.isFromCache
                loadError = ""; loading = false
            }
        }
        onDispose { listener.remove() }
    }
    var clockNow by remember { mutableLongStateOf(System.currentTimeMillis()) }
    val nextScheduledDelivery = letters.asSequence().filter { it["status"] == "Scheduled" }.mapNotNull { (it["deliverDate"] as? com.google.firebase.Timestamp)?.toDate()?.time }.filter { it > clockNow }.minOrNull()
    LaunchedEffect(nextScheduledDelivery) {
        val target = nextScheduledDelivery ?: return@LaunchedEffect
        delay((target - System.currentTimeMillis() + 50L).coerceAtLeast(0L))
        clockNow = System.currentTimeMillis()
    }
    val now = clockNow
    val visible = letters.filter { letter ->
        val date = (letter["deliverDate"] as? com.google.firebase.Timestamp)?.toDate()?.time ?: 0L
        val delivered = letter["status"] != "Scheduled" || date <= now
        when (tab) {
            "Inbox" -> letter["author"] != user.uid && letter["recipient"] in listOf(ownKey, ownProfile?.name) && delivered
            "Sent" -> letter["author"] == user.uid && delivered
            else -> letter["author"] == user.uid && letter["status"] == "Scheduled" && !delivered
        }
    }.sortedByDescending { (it["createdAt"] as? com.google.firebase.Timestamp)?.toDate()?.time ?: 0L }
    fun beginScheduledEdit(letter: Map<String, Any?>) {
        scope.launch {
            busy = true; actionError = ""
            try {
                val id = letter["id"] as? String ?: error("Letter reference is missing.")
                val protected = secureContents.document(id).get().await().getString("body") ?: letter["body"] as? String ?: ""
                val date = (letter["deliverDate"] as? com.google.firebase.Timestamp)?.toDate()?.toInstant()?.atZone(ZoneId.of("Asia/Dubai"))?.toLocalDateTime()
                    ?: error("Scheduled delivery date is missing.")
                recipient = letter["recipient"] as? String ?: other.name
                bodyValue = letterHtmlToTextFieldValue(protected)
                letterFontSize = letterFontSizeFromHtml(protected)
                scheduled = true; editingScheduledId = id; replyToId = ""
                deliverAt = date.format(DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm"))
                draftPrefs.edit().putString("recipient", recipient).putString("body", protected).putBoolean("scheduled", true).putString("deliverAt", deliverAt).putInt("fontSize", letterFontSize).apply()
                compose = true
            } catch (_: Exception) { actionError = "Could not open the protected scheduled letter. Check your connection and retry." }
            finally { busy = false }
        }
    }
    fun openLetter(letter: Map<String, Any?>) {
        opened = letter; openedBody = ""; openedError = ""; openedLoading = false
        val delivery = (letter["deliverDate"] as? com.google.firebase.Timestamp)?.toDate()?.time ?: 0L
        if (letter["status"] == "Scheduled" && delivery > System.currentTimeMillis() && letter["author"] != user.uid) {
            openedBody = "🔒 Scheduled Surprise (Hidden)"; return
        }
        openedLoading = true
        scope.launch {
            try {
                val legacyBody = letter["body"] as? String
                openedBody = if (letter["status"] == "Scheduled" && legacyBody != null) {
                    val letterId = letter["id"] as String
                    val secureRecipient = if (letter["author"] == user.uid) { if (letter["recipient"] == ownProfile?.name) ownKey else other.key } else ownKey
                    val migration = FirebaseFirestore.getInstance().batch()
                    migration.set(secureContents.document(letterId), mapOf("author" to letter["author"], "recipient" to secureRecipient, "deliverDate" to letter["deliverDate"], "body" to legacyBody))
                    migration.update(root.document(letterId), "body", FieldValue.delete())
                    migration.commit().await()
                    legacyBody
                } else legacyBody ?: if (letter["status"] == "Scheduled") secureContents.document(letter["id"] as String).get().await().getString("body").orEmpty() else ""
                if (letter["author"] != user.uid && letter["readAt"] == null) root.document(letter["id"] as String).update("readAt", FieldValue.serverTimestamp()).await()
            } catch (_: Exception) { openedError = "Could not open this letter. Check your connection and try again." }
            finally { openedLoading = false }
        }
    }
    fun persistLetterDraft(value: TextFieldValue = bodyValue) {
        draftPrefs.edit().putString("body", letterTextFieldValueToHtml(value, letterFontSize)).putInt("fontSize", letterFontSize).putString("recipient", recipient).putBoolean("scheduled", scheduled).putString("deliverAt", deliverAt).apply()
    }
    fun toggleLetterMark(kind: String) {
        val range = bodyValue.selection.min.coerceIn(0, bodyValue.text.length) until bodyValue.selection.max.coerceIn(0, bodyValue.text.length)
        if (range.isEmpty()) { actionError = "Select some text first, then choose bold, italic, or underline."; return }
        actionError = ""
        val enabled = !range.all { index ->
            val marks = letterMarksAt(bodyValue.annotatedString, index)
            when (kind) { "bold" -> marks.bold; "italic" -> marks.italic; else -> marks.underline }
        }
        val style = when (kind) {
            "bold" -> SpanStyle(fontWeight = if (enabled) FontWeight.Bold else FontWeight.Normal)
            "italic" -> SpanStyle(fontStyle = if (enabled) FontStyle.Italic else FontStyle.Normal)
            else -> SpanStyle(textDecoration = if (enabled) TextDecoration.Underline else TextDecoration.None)
        }
        val annotated = AnnotatedString.Builder(bodyValue.annotatedString).apply { addStyle(style, range.first, range.last + 1) }.toAnnotatedString()
        bodyValue = bodyValue.copy(annotatedString = annotated)
        persistLetterDraft(bodyValue)
    }
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = onBack) { Text("‹ Home", color = Rose) }
            Text("Letters 💌", color = Ink, fontSize = 22.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            TextButton(onClick = {
                editingScheduledId = ""
                bodyValue = letterHtmlToTextFieldValue(draftPrefs.getString("body", "") ?: "")
                recipient = draftPrefs.getString("recipient", other.name) ?: other.name
                scheduled = draftPrefs.getBoolean("scheduled", false)
                deliverAt = draftPrefs.getString("deliverAt", "") ?: ""
                letterFontSize = draftPrefs.getInt("fontSize", 20).coerceIn(14, 38)
                replyToId = ""; actionError = ""; compose = true
            }) { Text("Write", color = Rose) }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) { listOf("Inbox", "Sent", "Scheduled").forEach { value -> TextButton(onClick = { tab = value }) { Text(value, color = if (tab == value) Rose else Color.Gray, fontWeight = if (tab == value) FontWeight.Bold else FontWeight.Normal) } } }
        if (actionError.isNotBlank() && !compose) Text(actionError, color = Color(0xFFB94062), fontSize = 12.sp, modifier = Modifier.fillMaxWidth().background(Color(0xFFFFEEF4)).padding(10.dp))
        if (isOffline && !loading) Text("Offline · showing saved letters", color = Color(0xFF8B7180), fontSize = 12.sp, modifier = Modifier.fillMaxWidth().background(Color(0xFFFFEEF4)).padding(horizontal = 16.dp, vertical = 7.dp))
        if (loading) Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Column(horizontalAlignment = Alignment.CenterHorizontally) { CircularProgressIndicator(color = Rose); Text("Opening your letters…", color = Color(0xFF8B7180), modifier = Modifier.padding(top = 10.dp)) } }
        else if (loadError.isNotBlank()) Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Column(horizontalAlignment = Alignment.CenterHorizontally) { Text(loadError, color = Color(0xFF8B7180)); TextButton(onClick = { retry++ }) { Text("Try again", color = Rose) } } }
        else if (visible.isEmpty()) Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text("No letters in $tab yet. Write something from the heart ♡", color = Color(0xFF8B7180)) }
        else LazyColumn(Modifier.fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
            items(visible, key = { it["id"] as String }) { letter ->
                val deliveryTime = (letter["deliverDate"] as? com.google.firebase.Timestamp)?.toDate()?.time ?: 0L
                val locked = letter["status"] == "Scheduled" && deliveryTime > System.currentTimeMillis() && letter["author"] != user.uid
                Card(Modifier.fillMaxWidth().clickable { openLetter(letter) }, colors = CardDefaults.cardColors(containerColor = Color.White), border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFF3D5E1))) {
                    Column(Modifier.padding(15.dp)) {
                        Text(if (letter["author"] == user.uid) "To ${letter["recipient"] ?: other.name}" else "From ${letter["authorName"] ?: other.name}", color = Ink, fontWeight = FontWeight.Bold)
                        Text(if (locked) "🔒 Scheduled Surprise (Hidden)" else if (letter["readAt"] == null && letter["author"] != user.uid) "Open your love letter →" else "Tap to read your letter", color = Rose, fontSize = 12.sp, modifier = Modifier.padding(top = 5.dp))
                        if (tab == "Scheduled" && letter["author"] == user.uid && letter["status"] == "Scheduled" && deliveryTime > System.currentTimeMillis()) {
                            Row {
                                TextButton(enabled = !busy, onClick = { beginScheduledEdit(letter) }) { Text("Edit schedule", color = Rose) }
                                TextButton(enabled = !busy, onClick = { cancelScheduled = letter }) { Text("Cancel letter", color = Color(0xFFB94062)) }
                            }
                        }
                    }
                }
            }
        }
    }
    if (compose) AlertDialog(onDismissRequest = { compose = false }, title = { Text(if (editingScheduledId.isNotBlank()) "Edit Scheduled Letter ♡" else if (replyToId.isNotBlank()) "Write a Reply ♡" else "Write a Letter ♡") }, text = {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row { TextButton(onClick = { recipient = other.name; draftPrefs.edit().putString("recipient", recipient).apply() }) { Text("To ${other.name}", color = if (recipient == other.name) Rose else Color.Gray) }; TextButton(onClick = { recipient = ownProfile?.name ?: "Keby"; draftPrefs.edit().putString("recipient", recipient).apply() }) { Text("To me", color = if (recipient != other.name) Rose else Color.Gray) } }
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(3.dp)) {
                listOf("bold" to "B", "italic" to "I", "underline" to "U").forEach { (kind, label) ->
                    OutlinedButton(onClick = { toggleLetterMark(kind) }, contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 10.dp, vertical = 2.dp)) {
                        Text(label, fontWeight = if (kind == "bold") FontWeight.Bold else FontWeight.Medium, fontStyle = if (kind == "italic") FontStyle.Italic else FontStyle.Normal, textDecoration = if (kind == "underline") TextDecoration.Underline else TextDecoration.None, color = Rose)
                    }
                }
                TextButton(onClick = { letterFontSize = (letterFontSize - 2).coerceAtLeast(14); persistLetterDraft() }) { Text("A−", color = Rose) }
                TextButton(onClick = { letterFontSize = (letterFontSize + 2).coerceAtMost(38); persistLetterDraft() }) { Text("A+", color = Rose) }
                TextButton(enabled = bodyValue.text.isNotBlank() && !busy, onClick = {
                    letterPreviewLoading = true; showLetterPreview = true
                    val html = letterTextFieldValueToHtml(bodyValue, letterFontSize)
                    val author = ownProfile?.name ?: "You"
                    val size = letterFontSize
                    scope.launch {
                        try { letterPreviewBitmap?.recycle(); letterPreviewBitmap = withContext(Dispatchers.IO) { renderNativeLetterBitmap(html, author, size) } }
                        catch (_: Exception) { actionError = "Could not prepare the letter preview." }
                        finally { letterPreviewLoading = false }
                    }
                }) { Text("Preview ♡", color = Rose, fontSize = 11.sp) }
            }
            OutlinedTextField(value = bodyValue, onValueChange = { if (it.text.length <= 12000) { bodyValue = it; persistLetterDraft(it); actionError = "" } }, label = { Text("Your letter") }, minLines = 5, textStyle = androidx.compose.ui.text.TextStyle(fontSize = letterFontSize.sp, lineHeight = (letterFontSize + 9).sp, color = Ink, fontFamily = androidx.compose.ui.text.font.FontFamily.Cursive), modifier = Modifier.fillMaxWidth().background(Color(0xFFFFFCFD), RoundedCornerShape(10.dp)))
            Text("Select text, then use B, I, or U · $letterFontSize px", color = Color(0xFF8B7180), fontSize = 10.sp)
            if (editingScheduledId.isBlank()) Row(verticalAlignment = Alignment.CenterVertically) { androidx.compose.material3.Checkbox(checked = scheduled, onCheckedChange = { scheduled = it; draftPrefs.edit().putBoolean("scheduled", it).apply() }); Text("Schedule for later") }
            if (scheduled) OutlinedTextField(deliverAt, { deliverAt = it; draftPrefs.edit().putString("deliverAt", it).apply() }, label = { Text("Delivery date and time (YYYY-MM-DDTHH:MM)") }, singleLine = true)
            if (actionError.isNotBlank()) Text(actionError, color = Color(0xFFB94062), fontSize = 12.sp)
        }
    }, confirmButton = { TextButton(enabled = bodyValue.text.isNotBlank() && !busy && (!scheduled || runCatching { java.time.LocalDateTime.parse(deliverAt).atZone(ZoneId.of("Asia/Dubai")).toInstant().toEpochMilli() > System.currentTimeMillis() }.getOrDefault(false)), onClick = {
        busy = true
        scope.launch {
            try {
                val isScheduled = scheduled
                val isReply = replyToId.isNotBlank()
                val deliveryMillis = if (isScheduled) java.time.LocalDateTime.parse(deliverAt).atZone(ZoneId.of("Asia/Dubai")).toInstant().toEpochMilli() else System.currentTimeMillis()
                val editId = editingScheduledId
                val reference = if (editId.isNotBlank()) root.document(editId) else root.document()
                val deliveryStamp = com.google.firebase.Timestamp(java.util.Date(deliveryMillis))
                val bodyHtml = letterTextFieldValueToHtml(bodyValue, letterFontSize)
                val payload = mapOf("type" to "letter", "recipient" to recipient, "status" to if (scheduled) "Scheduled" else "Sent", "deliverDate" to deliveryStamp, "author" to user.uid, "authorName" to ownProfile?.name.orEmpty()) + if (replyToId.isNotBlank()) mapOf("replyTo" to replyToId) else emptyMap()
                val batch = FirebaseFirestore.getInstance().batch()
                if (editId.isBlank()) batch.set(reference, payload + mapOf("createdAt" to FieldValue.serverTimestamp()) + if (isScheduled) emptyMap() else mapOf("body" to bodyHtml))
                val protectedPayload = mapOf("author" to user.uid, "recipient" to if (recipient == ownProfile?.name) ownKey else other.key, "deliverDate" to deliveryStamp, "body" to bodyHtml)
                if (editId.isNotBlank()) {
                    FirebaseFirestore.getInstance().runTransaction { transaction ->
                        val current = transaction.get(reference)
                        val currentDelivery = current.getTimestamp("deliverDate")?.toDate()?.time ?: 0L
                        if (current.getString("status") != "Scheduled" || currentDelivery <= System.currentTimeMillis() || current.getString("author") != user.uid) throw IllegalStateException("This scheduled letter has already reached its delivery time.")
                        transaction.update(reference, payload)
                        transaction.set(secureContents.document(reference.id), protectedPayload, com.google.firebase.firestore.SetOptions.merge())
                        null
                    }.await()
                } else {
                    if (isScheduled) batch.set(secureContents.document(reference.id), protectedPayload)
                    batch.commit().await()
                }
                if (editId.isBlank()) runCatching {
                    val authorName = ownProfile?.name ?: "You"
                    var bitmap: Bitmap? = null
                    val imageFile = File(context.cacheDir, "letter-${System.currentTimeMillis()}.jpg")
                    try {
                        bitmap = withContext(Dispatchers.IO) { renderNativeLetterBitmap(bodyHtml, authorName, letterFontSize) }
                        imageFile.outputStream().use { output -> if (!bitmap!!.compress(Bitmap.CompressFormat.JPEG, 94, output)) error("Could not render letter image") }
                        uploadTelegramMedia(context, user, Uri.fromFile(imageFile), "Letter from $authorName", authorName, "image/jpeg", "Letter Image 💌", imageFile, "image/jpeg")
                    } finally { bitmap?.recycle(); imageFile.delete() }
                }.onFailure { Toast.makeText(context, "Letter saved, but its image could not be shared.", Toast.LENGTH_LONG).show() }
                if (!isScheduled && recipient != ownProfile?.name) notifyPostPartner(ownProfile, "letter", if (isReply) "New reply received." else "New letter received.", reference.id, "letters")
                Toast.makeText(context, if (editId.isNotBlank()) "Scheduled letter updated ♡" else if (isScheduled) "Letter scheduled ♡" else "Letter sent ♡", Toast.LENGTH_SHORT).show()
                bodyValue = TextFieldValue(""); deliverAt = ""; scheduled = false; compose = false; replyToId = ""; editingScheduledId = ""; actionError = ""; draftPrefs.edit().clear().apply()
            } catch (_: Exception) { actionError = if (editingScheduledId.isNotBlank()) "Could not update this scheduled letter. Check your connection and try again." else "Could not send this letter. Check your connection and try again." }
            finally { busy = false }
        }
    }) { Text(if (busy) "Saving…" else if (editingScheduledId.isNotBlank()) "Save changes" else if (scheduled) "Schedule" else "Send with love") } }, dismissButton = { TextButton(onClick = { compose = false }) { Text("Cancel") } })
    if (showLetterPreview) androidx.compose.ui.window.Dialog(onDismissRequest = { showLetterPreview = false; letterPreviewBitmap?.recycle(); letterPreviewBitmap = null }, properties = androidx.compose.ui.window.DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(Modifier.fillMaxSize().padding(14.dp), color = Color(0xFF21151D), shape = RoundedCornerShape(20.dp)) {
            Column(Modifier.fillMaxSize().padding(14.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text("Letter preview · Not sent", color = Color.White, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                    TextButton(onClick = { showLetterPreview = false; letterPreviewBitmap?.recycle(); letterPreviewBitmap = null }) { Text("Back to edit", color = Color.White) }
                }
                Box(Modifier.weight(1f).fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Color.White), contentAlignment = Alignment.Center) {
                    when { letterPreviewLoading -> CircularProgressIndicator(color = Rose); letterPreviewBitmap != null -> Image(letterPreviewBitmap!!.asImageBitmap(), contentDescription = "Handwritten style letter preview", modifier = Modifier.fillMaxSize().padding(12.dp), contentScale = ContentScale.Fit); else -> Text(actionError.ifBlank { "Preview unavailable" }, color = Color(0xFF8B7180)) }
                }
                Text("This preview is not sent yet. Sending the letter also shares its image.", color = Color(0xFFD4BBC8), fontSize = 12.sp, modifier = Modifier.padding(top = 10.dp))
                TextButton(onClick = { showLetterPreview = false; letterPreviewBitmap?.recycle(); letterPreviewBitmap = null }) { Text("Continue editing", color = Color(0xFFFFA6C5)) }
            }
        }
    }
    if (cancelScheduled != null) {
        val target = cancelScheduled!!
        AlertDialog(
            onDismissRequest = { if (!busy) cancelScheduled = null },
            title = { Text("Cancel scheduled letter?") },
            text = { Text("This will remove the letter and its protected message. It cannot be undone.") },
            confirmButton = { TextButton(enabled = !busy, onClick = {
                val id = target["id"] as? String ?: return@TextButton
                busy = true; actionError = ""
                scope.launch {
                    try {
                        val reference = root.document(id)
                        FirebaseFirestore.getInstance().runTransaction { transaction ->
                            val current = transaction.get(reference)
                            val deliveryTime = current.getTimestamp("deliverDate")?.toDate()?.time ?: 0L
                            if (current.getString("status") != "Scheduled" || deliveryTime <= System.currentTimeMillis() || current.getString("author") != user.uid) throw IllegalStateException("This letter has already been delivered.")
                            transaction.delete(reference); transaction.delete(secureContents.document(id)); null
                        }.await()
                        cancelScheduled = null
                        Toast.makeText(context, "Scheduled letter cancelled.", Toast.LENGTH_SHORT).show()
                    } catch (_: Exception) { actionError = "Could not cancel the scheduled letter. Check your connection and retry." }
                    finally { busy = false }
                }
            }) { Text(if (busy) "Cancelling…" else "Cancel letter", color = Color(0xFFB94062)) } },
            dismissButton = { TextButton(enabled = !busy, onClick = { cancelScheduled = null }) { Text("Keep letter", color = Rose) } }
        )
    }
    if (opened != null) {
        val current = opened!!
        val replies = letters.filter { it["replyTo"] == current["id"] }.sortedBy { (it["createdAt"] as? com.google.firebase.Timestamp)?.toDate()?.time ?: 0L }
        AlertDialog(onDismissRequest = { opened = null }, title = { Text("Your letter 💌") }, text = { Column(Modifier.verticalScroll(rememberScrollState())) {
            if (openedLoading) Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Rose) }
            else if (openedError.isNotBlank()) Column(horizontalAlignment = Alignment.CenterHorizontally) { Text(openedError, color = Color(0xFF8B7180)); TextButton(onClick = { openLetter(current) }) { Text("Try again", color = Rose) } }
            else {
                val openedFontSize = letterFontSizeFromHtml(openedBody)
                Text(letterHtmlToTextFieldValue(openedBody).annotatedString, color = Ink, fontSize = openedFontSize.sp, lineHeight = (openedFontSize + 8).sp, fontFamily = androidx.compose.ui.text.font.FontFamily.Cursive)
                replies.forEach { reply ->
                    Text("— ${reply["authorName"] ?: "Reply"} —", color = Rose, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 12.dp))
                    val replyBody = reply["body"] as? String ?: "Open this reply to read it."
                    val replyFontSize = letterFontSizeFromHtml(replyBody)
                    Text(letterHtmlToTextFieldValue(replyBody).annotatedString, color = Color(0xFF715B66), fontSize = replyFontSize.sp, lineHeight = (replyFontSize + 8).sp)
                }
            }
        } }, confirmButton = { Row {
            if (current["author"] != user.uid && current["status"] != "Scheduled") TextButton(onClick = { recipient = other.name; replyToId = current["id"] as? String ?: ""; compose = true; opened = null }) { Text("Reply", color = Rose) }
            TextButton(onClick = { opened = null }) { Text("Close") }
        } })
    }
}

@Composable
private fun NativeChallengesScreen(user: FirebaseUser, onBack: () -> Unit) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val profile = partnerProfiles.firstOrNull { it.email.equals(user.email.orEmpty(), true) }
    val ownKey = profile?.key ?: "kebyy"
    val other = partnerProfiles.firstOrNull { it.key != ownKey } ?: partnerProfiles.last()
    val db = remember { FirebaseFirestore.getInstance() }
    val couple = remember { db.collection("couples").document("our-little-world") }
    val itemsRef = remember { couple.collection("items") }
    val assignmentsRef = remember { couple.collection("challengeAssignments") }
    val dayKey = LocalDate.now(ZoneId.of("Asia/Dubai")).toString()
    val snapId = "$dayKey-send-snap"
    val waterId = "$dayKey-drink-water"
    val historyStart = remember(dayKey) { LocalDate.parse(dayKey).minusDays(30).toString() }
    var assignments by remember { mutableStateOf<Map<String, Map<String, Any?>>>(emptyMap()) }
    var custom by remember { mutableStateOf<List<Map<String, Any?>>>(emptyList()) }
    var waters by remember { mutableStateOf<List<Map<String, Any?>>>(emptyList()) }
    var historyAssignments by remember { mutableStateOf<List<Map<String, Any?>>>(emptyList()) }
    var historyWaters by remember { mutableStateOf<List<Map<String, Any?>>>(emptyList()) }
    var showHistory by rememberSaveable { mutableStateOf(false) }
    var completionItem by remember { mutableStateOf<Map<String, Any?>?>(null) }
    var completionNote by rememberSaveable { mutableStateOf("") }
    var completionPhoto by remember { mutableStateOf<Uri?>(null) }
    var photoUploading by remember { mutableStateOf(false) }
    var proofPreviewUri by remember { mutableStateOf<Uri?>(null) }
    var proofPreviewName by remember { mutableStateOf("") }
    var proofLoading by remember { mutableStateOf(false) }
    var title by rememberSaveable { mutableStateOf("") }
    var description by rememberSaveable { mutableStateOf("") }
    var duration by rememberSaveable { mutableIntStateOf(7) }
    var kind by rememberSaveable { mutableStateOf("challenge") }
    var editing by remember { mutableStateOf<Map<String, Any?>?>(null) }
    var showCompose by remember { mutableStateOf(false) }
    var saving by remember { mutableStateOf(false) }
    var challengeClock by remember { mutableLongStateOf(System.currentTimeMillis()) }
    var challengeLoading by remember { mutableStateOf(true) }
    var challengeOffline by remember { mutableStateOf(false) }
    var challengeError by remember { mutableStateOf(false) }
    var challengeRetry by remember { mutableIntStateOf(0) }
    val scope = rememberCoroutineScope()
    LaunchedEffect(Unit) { while (true) { delay(1_000); challengeClock = System.currentTimeMillis() } }
    val completionPhotoPicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri -> completionPhoto = uri }
    DisposableEffect(user.uid, dayKey, challengeRetry) {
        challengeLoading = true
        challengeOffline = false
        challengeError = false
        val ready = mutableSetOf<String>()
        val offline = mutableSetOf<String>()
        val failed = mutableSetOf<String>()
        fun updateState(source: String, snapshot: com.google.firebase.firestore.QuerySnapshot?, error: com.google.firebase.firestore.FirebaseFirestoreException?, update: (com.google.firebase.firestore.QuerySnapshot) -> Unit) {
            if (error != null) {
                failed.add(source)
                if (ready.add(source)) challengeLoading = ready.size < 5
            } else if (snapshot != null) {
                failed.remove(source)
                update(snapshot)
                if (snapshot.metadata.isFromCache) offline.add(source) else offline.remove(source)
                if (ready.add(source)) challengeLoading = ready.size < 5
            }
            challengeOffline = offline.isNotEmpty()
            challengeError = failed.isNotEmpty()
        }
        val assignmentListener = assignmentsRef.addSnapshotListener(MetadataChanges.INCLUDE) { snapshot, error -> updateState("assignments", snapshot, error) { assignments = it.documents.associate { doc -> doc.id to doc.data.orEmpty() } } }
        val customListener = itemsRef.whereEqualTo("type", "customChallenge").addSnapshotListener(MetadataChanges.INCLUDE) { snapshot, error -> updateState("custom", snapshot, error) { custom = it.documents.map { doc -> mapOf("id" to doc.id) + doc.data.orEmpty() } } }
        val waterListener = itemsRef.whereEqualTo("type", "waterChallenge").whereEqualTo("dayKey", dayKey).addSnapshotListener(MetadataChanges.INCLUDE) { snapshot, error -> updateState("water", snapshot, error) { waters = it.documents.map { doc -> mapOf("id" to doc.id) + doc.data.orEmpty() } } }
        val historyAssignmentListener = assignmentsRef.whereGreaterThanOrEqualTo("challengeDate", historyStart).orderBy("challengeDate", Query.Direction.DESCENDING).addSnapshotListener(MetadataChanges.INCLUDE) { snapshot, error -> updateState("historyAssignments", snapshot, error) { historyAssignments = it.documents.map { doc -> mapOf("id" to doc.id) + doc.data.orEmpty() } } }
        val historyWaterListener = itemsRef.whereGreaterThanOrEqualTo("dayKey", historyStart).whereLessThan("dayKey", dayKey).addSnapshotListener(MetadataChanges.INCLUDE) { snapshot, error -> updateState("historyWater", snapshot, error) { historyWaters = it.documents.map { doc -> mapOf("id" to doc.id) + doc.data.orEmpty() }.filter { row -> row["type"] == "waterChallenge" } } }
        onDispose { assignmentListener.remove(); customListener.remove(); waterListener.remove(); historyAssignmentListener.remove(); historyWaterListener.remove() }
    }
    LaunchedEffect(dayKey) {
        for ((id, titleText, descriptionText) in listOf(Triple(snapId, "Send Snap 📸", "Share your daily moments with each other 💗"), Triple(waterId, "Drink Water 💧", "Track eight glasses of water each."))) {
            val ref = assignmentsRef.document(id)
            runCatching {
                db.runTransaction { tx ->
                    if (!tx.get(ref).exists()) tx.set(ref, mapOf("title" to titleText, "description" to descriptionText, "challengeDate" to dayKey, "challengeId" to if (id == snapId) "send-snap" else "drink-water", "status" to "upcoming", "acceptedBy" to emptyList<Any>(), "skippedBy" to emptyList<Any>(), "completedBy" to emptyList<Any>()))
                }.await()
            }
        }
    }
    fun setCompose(item: Map<String, Any?>?) {
        editing = item; title = item?.get("title") as? String ?: ""; description = item?.get("description") as? String ?: ""; duration = (item?.get("durationDays") as? Number)?.toInt() ?: 7; kind = item?.get("kind") as? String ?: "challenge"; showCompose = true
    }
    val dailySnap = assignments[snapId].orEmpty()
    val snapPeople = (dailySnap["completedBy"] as? List<*>)?.filterIsInstance<Map<String, Any?>>() ?: emptyList()
    val sentByMe = snapPeople.any { it["uid"] == user.uid || it["profileKey"] == ownKey }
    val dailyWater = assignments[waterId].orEmpty()
    val completedWater = (dailyWater["completedBy"] as? List<*>)?.filterIsInstance<Map<String, Any?>>() ?: emptyList()
    val myWater = waters.firstOrNull { it["profileKey"] == ownKey }?.let { (it["count"] as? Number)?.toInt() }?.coerceIn(0, 8) ?: 0
    val partnerWater = waters.firstOrNull { it["profileKey"] == other.key }?.let { (it["count"] as? Number)?.toInt() }?.coerceIn(0, 8) ?: 0
    fun changeWater(delta: Int, status: (Boolean) -> Unit) {
        status(true)
        scope.launch {
            val ref = itemsRef.document("water-$dayKey-$ownKey")
            try {
                val updatedCount = db.runTransaction { tx ->
                    val snapshot = tx.get(ref)
                    val previous = (snapshot.getLong("count") ?: 0L).toInt().coerceIn(0, 8)
                    val next = (previous + delta).coerceIn(0, 8)
                    tx.set(ref, mapOf("type" to "waterChallenge", "dayKey" to dayKey, "profileKey" to ownKey, "uid" to user.uid, "author" to user.uid, "name" to profile?.name.orEmpty(), "count" to next, "createdAt" to FieldValue.serverTimestamp(), "updatedAtMs" to System.currentTimeMillis()), com.google.firebase.firestore.SetOptions.merge())
                    next
                }.await()
                if (updatedCount == 8 && !completedWater.any { it["uid"] == user.uid || it["profileKey"] == ownKey }) {
                    db.runTransaction { tx ->
                        val refAssign = assignmentsRef.document(waterId); val current = tx.get(refAssign).data.orEmpty()
                        val done = (current["completedBy"] as? List<*>)?.filterIsInstance<Map<String, Any?>>()?.filterNot { it["uid"] == user.uid || it["profileKey"] == ownKey }.orEmpty() + mapOf("uid" to user.uid, "profileKey" to ownKey, "name" to profile?.name.orEmpty(), "note" to "Reached today's 8-glass water goal.", "completedAt" to System.currentTimeMillis())
                        val accepted = (current["acceptedBy"] as? List<*>)?.filterIsInstance<Map<String, Any?>>()?.filterNot { it["uid"] == user.uid || it["profileKey"] == ownKey }.orEmpty() + mapOf("uid" to user.uid, "profileKey" to ownKey, "name" to profile?.name.orEmpty())
                        tx.set(refAssign, current + mapOf("completedBy" to done, "acceptedBy" to accepted, "status" to if (done.size >= 2) "completed" else "in-progress", "completedAt" to if (done.size >= 2) FieldValue.serverTimestamp() else null), com.google.firebase.firestore.SetOptions.merge())
                    }.await()
                }
            } catch (_: Exception) { Toast.makeText(context, "Could not update water progress.", Toast.LENGTH_SHORT).show() }
            finally { status(false) }
        }
    }
    fun setCustomAction(item: Map<String, Any?>, action: String, completionMeta: Map<String, Any?> = emptyMap()) {
        val ref = item["id"] as? String ?: return
        scope.launch {
            try {
                db.runTransaction { tx ->
                    val docRef = itemsRef.document(ref); val current = tx.get(docRef).data ?: error("This challenge is no longer available.")
                    if (current["author"] == user.uid) error("You cannot act on a challenge you created.")
                    val actions = (current["actions"] as? List<*>)?.filterIsInstance<Map<String, Any?>>()?.toMutableList() ?: mutableListOf()
                    val previous = actions.firstOrNull { it["profileKey"] == ownKey }
                    if (action == "accept") {
                        if (current["status"] != "upcoming" && current["status"] != "in-progress") error("This challenge is no longer open.")
                        if (previous?.get("status") == "accepted") return@runTransaction
                        actions.removeAll { it["profileKey"] == ownKey }; actions.add(mapOf("uid" to user.uid, "profileKey" to ownKey, "name" to profile?.name.orEmpty(), "status" to "accepted", "updatedAtMs" to System.currentTimeMillis()))
                        tx.update(docRef, mapOf("status" to "in-progress", "actions" to actions, "acceptedBy" to user.uid, "acceptedAtMs" to System.currentTimeMillis()))
                    } else {
                        if (current["status"] != "in-progress") error("Accept this challenge before completing it.")
                        actions.removeAll { it["profileKey"] == ownKey }; actions.add(mapOf("uid" to user.uid, "profileKey" to ownKey, "name" to profile?.name.orEmpty(), "status" to "completed", "updatedAtMs" to System.currentTimeMillis()))
                        tx.update(docRef, mapOf("status" to "completed", "completedBy" to user.uid, "completedByKey" to ownKey, "completedAtMs" to System.currentTimeMillis(), "actions" to actions) + completionMeta)
                    }
                }.await()
            } catch (e: Exception) { Toast.makeText(context, e.message ?: "Could not update challenge.", Toast.LENGTH_SHORT).show() }
        }
    }
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = onBack) { Text("‹ Home", color = Rose) }
            Text("Challenges", color = Ink, fontSize = 22.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            TextButton(onClick = { setCompose(null) }) { Text("+ Give", color = Rose) }
        }
        LazyColumn(Modifier.fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            if (challengeLoading) item { Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) { CircularProgressIndicator(Modifier.size(18.dp), color = Rose, strokeWidth = 2.dp); Text("Loading shared challenges…", color = Color(0xFF806979), fontSize = 13.sp) } }
            if (challengeOffline) item { Text("Showing saved challenge data while offline.", color = Color(0xFF806979), fontSize = 12.sp, modifier = Modifier.fillMaxWidth().background(Color(0xFFFFF1F6), RoundedCornerShape(10.dp)).padding(10.dp)) }
            if (challengeError) item { Row(Modifier.fillMaxWidth().background(Color(0xFFFFF1F6), RoundedCornerShape(10.dp)).padding(8.dp), verticalAlignment = Alignment.CenterVertically) { Text("Some shared challenge data could not load.", color = Color(0xFFB94062), fontSize = 12.sp, modifier = Modifier.weight(1f)); TextButton(onClick = { challengeRetry++ }) { Text("Retry", color = Rose) } } }
            item { TextButton(onClick = { showHistory = !showHistory }) { Text(if (showHistory) "Hide 30-day history" else "View 30-day history", color = Rose) } }
            if (showHistory) {
                val days = (historyAssignments.mapNotNull { it["challengeDate"] as? String } + historyWaters.mapNotNull { it["dayKey"] as? String }).distinct().sortedDescending()
                item { Text("Recent daily activity · 30 days", color = Ink, fontWeight = FontWeight.Bold) }
                if (days.isEmpty()) item { Text("No recent Snap or water activity yet.", color = Color(0xFF8B7180)) }
                items(days, key = { "history-$it" }) { day ->
                    val snap = historyAssignments.firstOrNull { (it["challengeDate"] == day || (it["id"] as? String)?.startsWith(day) == true) && ((it["completedBy"] as? List<*>)?.isNotEmpty() == true) }
                    val dayWater = historyWaters.filter { it["dayKey"] == day }
                    Card(colors = CardDefaults.cardColors(containerColor = Color.White), border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFF3D5E1))) {
                        Column(Modifier.fillMaxWidth().padding(13.dp)) {
                            Text(runCatching { LocalDate.parse(day).format(DateTimeFormatter.ofPattern("EEEE d MMMM", Locale.ENGLISH)) }.getOrDefault(day), color = Rose, fontWeight = FontWeight.Bold)
                            if (snap != null) {
                                val names = (snap["completedBy"] as? List<*>)?.filterIsInstance<Map<String, Any?>>()?.mapNotNull { it["name"] as? String }?.joinToString(" & ").orEmpty()
                                Text("📸 Snap sent · ${names.ifBlank { "Both partners" }}", color = Ink, modifier = Modifier.padding(top = 5.dp))
                            }
                            if (dayWater.isNotEmpty()) partnerProfiles.forEach { person ->
                                val tracker = dayWater.filter { it["profileKey"] == person.key }.maxByOrNull { (it["updatedAtMs"] as? Number)?.toLong() ?: 0L }
                                val count = ((tracker?.get("count") as? Number)?.toInt() ?: 0).coerceIn(0, 8)
                                val reached = count >= 8
                                Text("💧 ${person.name} · $count/8 glasses · ${if (reached) "Goal reached ✓" else "Goal missed —"}", color = if (reached) Color(0xFF715B66) else Color(0xFF8B7180), modifier = Modifier.padding(top = 3.dp))
                            }
                        }
                    }
                }
                val completedCustomHistory = custom.filter { it["status"] == "completed" }.sortedByDescending { (it["completedAtMs"] as? Number)?.toLong() ?: 0L }
                if (completedCustomHistory.isNotEmpty()) item { Text("Completed challenges & punishments", color = Ink, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 6.dp)) }
                items(completedCustomHistory, key = { "completed-${it["id"]}" }) { done ->
                    Card(colors = CardDefaults.cardColors(containerColor = Color.White), border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFF3D5E1))) { Column(Modifier.padding(12.dp)) { Text("✓ ${done["title"] ?: "Challenge"}", color = Ink, fontWeight = FontWeight.SemiBold); Text(done["note"] as? String ?: "Completed", color = Color(0xFF8B7180), fontSize = 12.sp); Text((done["completedBy"] as? String)?.let { if (it == user.uid) "Completed by you" else "Completed by your partner" } ?: "Completed", color = Rose, fontSize = 11.sp) } }
                }
            }
            item {
                Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = Color.White), border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFF3D5E1))) {
                    Column(Modifier.padding(16.dp)) {
                        Text("Daily Snap 📸", color = Ink, fontSize = 18.sp, fontWeight = FontWeight.Bold)
                        Text(if (sentByMe) "Your Snap is marked sent today ✓" else "Share today's photo on Snapchat and mark it sent.", color = Color(0xFF806979), modifier = Modifier.padding(vertical = 8.dp))
                        if (!sentByMe) Button(enabled = !saving, onClick = {
                            saving = true
                            scope.launch {
                                val ref = assignmentsRef.document(snapId)
                                try { db.runTransaction { tx ->
                                    val current = tx.get(ref).data.orEmpty()
                                    val completed = (current["completedBy"] as? List<*>)?.filterIsInstance<Map<String, Any?>>()?.filterNot { it["uid"] == user.uid || it["profileKey"] == ownKey }.orEmpty() + mapOf("uid" to user.uid, "profileKey" to ownKey, "name" to profile?.name.orEmpty(), "note" to "Sent today's Snap 📸", "completedAt" to System.currentTimeMillis())
                                    val accepted = (current["acceptedBy"] as? List<*>)?.filterIsInstance<Map<String, Any?>>()?.filterNot { it["uid"] == user.uid || it["profileKey"] == ownKey }.orEmpty() + mapOf("uid" to user.uid, "profileKey" to ownKey, "name" to profile?.name.orEmpty())
                                    tx.set(ref, current + mapOf("completedBy" to completed, "acceptedBy" to accepted, "status" to if (completed.size >= 2) "completed" else "in-progress", "completedAt" to if (completed.size >= 2) FieldValue.serverTimestamp() else null), com.google.firebase.firestore.SetOptions.merge())
                                }.await() } catch (_: Exception) { Toast.makeText(context, "Could not update today's Snap.", Toast.LENGTH_SHORT).show() }
                                finally { saving = false }
                            }
                        }, colors = ButtonDefaults.buttonColors(containerColor = Rose)) { Text("Mark Snap sent") }
                    }
                }
            }
            item {
                Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = Color.White), border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFF3D5E1))) {
                    Column(Modifier.padding(16.dp)) {
                        Text("Drink Water 💧", color = Ink, fontSize = 18.sp, fontWeight = FontWeight.Bold)
                        Text("You: $myWater/8 glasses · ${other.name}: $partnerWater/8 glasses", color = Color(0xFF806979), modifier = Modifier.padding(vertical = 8.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedButton(enabled = myWater > 0 && !saving, onClick = { changeWater(-1) { saving = it } }) { Text("− Remove") }
                            Button(enabled = myWater < 8 && !saving, onClick = { changeWater(1) { saving = it } }, colors = ButtonDefaults.buttonColors(containerColor = Rose)) { Text("+ Add glass") }
                        }
                    }
                }
            }
            item { Text("Challenge & Punishment Hub", color = Ink, fontSize = 19.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 8.dp)) }
            if (custom.isEmpty()) item { Text("No custom challenges yet. Send one to your partner ♡", color = Color(0xFF8B7180)) }
            items(custom.sortedByDescending { (it["createdAtMs"] as? Number)?.toLong() ?: 0L }, key = { it["id"] as String }) { item ->
                val mine = item["author"] == user.uid
                val actions = (item["actions"] as? List<*>)?.filterIsInstance<Map<String, Any?>>() ?: emptyList()
                val myAction = actions.firstOrNull { it["profileKey"] == ownKey }
                Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = Color.White), border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFF3D5E1))) {
                    Column(Modifier.padding(15.dp)) {
                        Text("${if (item["kind"] == "punishment") "💌 Punishment" else "✨ Challenge"} · ${item["status"] ?: "upcoming"}", color = Rose, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        Text(item["title"] as? String ?: "Challenge", color = Ink, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 5.dp))
                        Text(item["description"] as? String ?: "", color = Color(0xFF806979), modifier = Modifier.padding(top = 4.dp))
                        Text(if (mine) "Sent by you" else "From ${item["authorName"] ?: other.name}", color = Color(0xFF9B7888), fontSize = 11.sp, modifier = Modifier.padding(top = 5.dp))
                        val deadline = (item["deadlineAt"] as? Number)?.toLong() ?: 0L
                        if (deadline > 0 && item["status"] != "completed") {
                            val remaining = deadline - challengeClock
                            val seconds = (remaining.coerceAtLeast(0L) / 1_000L).toInt()
                            val days = seconds / 86_400
                            val hours = (seconds % 86_400) / 3_600
                            val minutes = (seconds % 3_600) / 60
                            val rest = seconds % 60
                            Text(if (remaining <= 0) "Due now" else "Due in ${days}d ${hours.toString().padStart(2, '0')}h ${minutes.toString().padStart(2, '0')}m ${rest.toString().padStart(2, '0')}s", color = if (remaining <= 0) Color(0xFFB94062) else Rose, fontSize = 11.sp, modifier = Modifier.padding(top = 4.dp))
                        }
                        val proof = item["telegramFileId"] as? String
                        if (item["note"] is String && (item["note"] as String).isNotBlank()) Text("Completion note · ${item["note"]}", color = Color(0xFF715B66), fontSize = 12.sp, modifier = Modifier.padding(top = 4.dp))
                        if (!proof.isNullOrBlank()) TextButton(onClick = {
                            proofPreviewName = item["title"] as? String ?: "Challenge completion"
                            proofPreviewUri = null; proofLoading = true
                            scope.launch {
                                try { val file = loadTelegramMediaFile(context, user, proof, item["photoMimeType"] as? String ?: "image/jpeg") ?: error("Photo unavailable"); proofPreviewUri = Uri.fromFile(file) }
                                catch (_: Exception) { Toast.makeText(context, "Could not load completion photo. Check your connection and retry.", Toast.LENGTH_SHORT).show() }
                                finally { proofLoading = false }
                            }
                        }) { Text("📷 View completion photo", color = Rose, fontSize = 11.sp) }
                        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            if (mine && item["status"] != "completed") TextButton(onClick = { setCompose(item) }) { Text("Edit", color = Rose) }
                            if (mine && item["status"] != "completed") TextButton(onClick = {
                                val id = item["id"] as String
                                db.runTransaction { tx ->
                                    val ref = itemsRef.document(id)
                                    if (tx.get(ref).getString("author") != user.uid) throw IllegalStateException("Only the sender can delete this challenge.")
                                    tx.delete(ref)
                                }.addOnFailureListener { Toast.makeText(context, "Could not delete challenge.", Toast.LENGTH_SHORT).show() }
                            }) { Text("Delete", color = Color(0xFFB94062)) }
                            if (!mine && item["status"] != "completed") TextButton(onClick = { if (myAction == null) setCustomAction(item, "accept") else { completionItem = item; completionNote = ""; completionPhoto = null } }) { Text(if (myAction == null) "Accept" else "Complete") }
                        }
                    }
                }
            }
        }
    }
    if (completionItem != null) {
        val target = completionItem!!
        AlertDialog(
            onDismissRequest = { if (!photoUploading) completionItem = null },
            title = { Text("Complete challenge ♡") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(target["title"] as? String ?: "Challenge", color = Ink, fontWeight = FontWeight.Bold)
                    OutlinedTextField(completionNote, { completionNote = it.take(500) }, label = { Text("Completion note (optional)") }, minLines = 2)
                    TextButton(enabled = !photoUploading, onClick = { completionPhotoPicker.launch("image/*") }) { Text(if (completionPhoto == null) "+ Add completion photo" else "✓ Photo selected · change", color = Rose) }
                    if (completionPhoto != null) Text("The photo will upload to the existing authenticated media service.", color = Color(0xFF8B7180), fontSize = 11.sp)
                }
            },
            confirmButton = { TextButton(enabled = !photoUploading, onClick = {
                photoUploading = true
                scope.launch {
                    try {
                        var meta: Map<String, Any?> = mapOf("note" to completionNote.trim())
                        completionPhoto?.let { uri ->
                            val mime = context.contentResolver.getType(uri) ?: "image/jpeg"
                            val uploaded = uploadTelegramMedia(context, user, uri, "${profile?.name ?: "Partner"} · ${System.currentTimeMillis()}", profile?.name ?: "Partner", mime, "Challenge Completion Photo 📸")
                            meta = meta + mapOf("photoUrl" to "", "telegramFileId" to uploaded["telegramFileId"], "telegramFileUniqueId" to (uploaded["telegramFileUniqueId"] ?: ""), "telegramMessageId" to uploaded["telegramMessageId"], "telegramChatId" to uploaded["telegramChatId"], "photoMimeType" to (uploaded["telegramMimeType"] ?: mime))
                        }
                        setCustomAction(target, "complete", meta)
                        completionItem = null; completionPhoto = null
                    } catch (_: Exception) { Toast.makeText(context, "Could not upload completion proof. Check your connection and retry.", Toast.LENGTH_SHORT).show() }
                    finally { photoUploading = false }
                }
            }) { Text(if (photoUploading) "Uploading…" else "Complete", color = Rose) } },
            dismissButton = { TextButton(enabled = !photoUploading, onClick = { completionItem = null }) { Text("Cancel", color = Color(0xFF8B7180)) } }
        )
    }
    if (proofPreviewUri != null || proofLoading) AlertDialog(onDismissRequest = { if (!proofLoading) proofPreviewUri = null }, title = { Text(proofPreviewName) }, text = {
        if (proofLoading) Box(Modifier.fillMaxWidth().height(250.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Rose) }
        else proofPreviewUri?.let { AsyncImage(model = it, contentDescription = proofPreviewName, modifier = Modifier.fillMaxWidth().height(300.dp), contentScale = ContentScale.Fit) }
    }, confirmButton = { TextButton(onClick = { proofPreviewUri = null }) { Text("Close", color = Rose) } })
    if (showCompose) AlertDialog(onDismissRequest = { showCompose = false }, title = { Text(if (editing == null) "Send a challenge" else "Edit challenge") }, text = {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row { listOf("challenge", "punishment").forEach { value -> TextButton(onClick = { kind = value }) { Text(if (value == "challenge") "Challenge" else "Punishment", color = if (kind == value) Rose else Color.Gray) } } }
            OutlinedTextField(title, { title = it }, label = { Text("Title") }, singleLine = true)
            OutlinedTextField(description, { description = it }, label = { Text("What should they do?") }, minLines = 3)
            if (editing == null) OutlinedTextField(duration.toString(), { duration = it.toIntOrNull()?.coerceIn(1, 90) ?: duration }, label = { Text("Deadline in days (1–90)") }, singleLine = true)
        }
    }, confirmButton = { TextButton(enabled = title.isNotBlank() && description.isNotBlank() && !saving, onClick = {
        saving = true
        scope.launch {
            val ref = editing?.get("id") as? String
            val nowMs = System.currentTimeMillis()
            val payload = mapOf("title" to title.trim(), "description" to description.trim(), "kind" to kind, "durationDays" to duration, "updatedAtMs" to nowMs)
            try {
                if (ref == null) {
                    val newRef = itemsRef.document()
                    newRef.set(payload + mapOf("type" to "customChallenge", "createdAtMs" to nowMs, "deadlineAt" to nowMs + duration * 86_400_000L, "extensionRequested" to false, "status" to "upcoming", "author" to user.uid, "authorKey" to ownKey, "authorName" to profile?.name.orEmpty(), "recipientKey" to other.key, "assignedAtMs" to nowMs, "sentAtMs" to nowMs, "sentDate" to dayKey, "actions" to emptyList<Any>())).await()
                    notifyPostPartner(profile, "challenge", "${profile?.name ?: "Your partner"} sent ${if (kind == "punishment") "a punishment" else "a challenge"}: ${title.trim()}".take(240), newRef.id, "challenges")
        } else itemsRef.document(ref).update(mapOf("title" to title.trim(), "description" to description.trim(), "kind" to kind, "updatedAtMs" to nowMs)).await()
                showCompose = false; title = ""; description = ""
            } catch (_: Exception) { Toast.makeText(context, "Could not save challenge.", Toast.LENGTH_SHORT).show() }
            finally { saving = false }
        }
    }) { Text(if (saving) "Saving…" else "Save") } }, dismissButton = { TextButton(onClick = { showCompose = false }) { Text("Cancel") } })


}

@Composable
private fun NativeDrawingThumbnail(user: FirebaseUser, drawing: Map<String, Any?>, modifier: Modifier = Modifier) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val fileId = drawing["telegramFileId"] as? String
    val mime = drawing["mimeType"] as? String ?: "image/jpeg"
    var imageUri by remember(fileId) { mutableStateOf<Uri?>(null) }
    LaunchedEffect(fileId) {
        imageUri = null
        if (!fileId.isNullOrBlank()) imageUri = runCatching { loadTelegramMediaFile(context, user, fileId, mime)?.let { Uri.fromFile(it) } }.getOrNull()
    }
    Box(modifier.clip(RoundedCornerShape(12.dp)).background(Color(0xFFFFEDF3)), contentAlignment = Alignment.Center) {
        imageUri?.let { AsyncImage(model = it, contentDescription = "Saved drawing preview", modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop) } ?: Text("🎨", fontSize = 30.sp)
    }
}

private fun renderNativeDrawingBitmap(strokes: List<NativeDrawStroke>, baseImage: Bitmap?, artistName: String, timestamp: String): Bitmap {
    val width = 1200
    val height = 1600
    val footerHeight = 56
    val bitmap = Bitmap.createBitmap(width, height + footerHeight, Bitmap.Config.ARGB_8888)
    val canvas = android.graphics.Canvas(bitmap)
    canvas.drawColor(android.graphics.Color.WHITE)
    baseImage?.let { canvas.drawBitmap(it, null, android.graphics.Rect(0, 0, width, height), android.graphics.Paint(android.graphics.Paint.FILTER_BITMAP_FLAG or android.graphics.Paint.ANTI_ALIAS_FLAG)) }
    strokes.forEach { stroke ->
        val paint = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
            color = stroke.color
            alpha = (android.graphics.Color.alpha(stroke.color) * stroke.opacity.coerceIn(0f, 1f)).toInt().coerceIn(0, 255)
            style = android.graphics.Paint.Style.STROKE
            strokeCap = android.graphics.Paint.Cap.ROUND
            strokeJoin = android.graphics.Paint.Join.ROUND
        }
        val lineWidth = minOf(width, height) * stroke.width
        if (stroke.points.size == 1) {
            paint.style = android.graphics.Paint.Style.FILL
            paint.alpha = (paint.alpha * if (stroke.tool == "pencil") 0.75f else 1f).toInt()
            canvas.drawCircle(stroke.points[0].x * width, stroke.points[0].y * height, lineWidth / 2f, paint)
        } else {
            val path = android.graphics.Path().apply {
                moveTo(stroke.points.first().x * width, stroke.points.first().y * height)
                for (index in 1 until stroke.points.lastIndex) {
                    val control = stroke.points[index]
                    val next = stroke.points[index + 1]
                    val middleX = (control.x + next.x) * width / 2f
                    val middleY = (control.y + next.y) * height / 2f
                    quadTo(control.x * width, control.y * height, middleX, middleY)
                }
                lineTo(stroke.points.last().x * width, stroke.points.last().y * height)
            }
            if (stroke.tool == "pencil") {
                paint.alpha = (paint.alpha * 0.55f).toInt()
                paint.strokeWidth = lineWidth
                canvas.drawPath(path, paint)
                paint.alpha = (android.graphics.Color.alpha(stroke.color) * stroke.opacity.coerceIn(0f, 1f) * 0.40f).toInt()
                paint.strokeWidth = maxOf(1f, lineWidth * 0.55f)
                canvas.drawPath(path, paint)
            } else {
                paint.strokeWidth = lineWidth
                canvas.drawPath(path, paint)
            }
        }
    }
    canvas.drawRect(0f, height.toFloat(), width.toFloat(), (height + footerHeight).toFloat(), android.graphics.Paint().apply { color = 0xFFFFF9FC.toInt() })
    canvas.drawLine(0f, height.toFloat(), width.toFloat(), height.toFloat(), android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply { color = 0xFFF0DFE7.toInt(); strokeWidth = 2f })
    canvas.drawText("Drawn by $artistName • $timestamp", 24f, height + 35f, android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply { color = 0xFF806B75.toInt(); textSize = 20f })
    return bitmap
}

@Composable
private fun NativeDrawingScreen(user: FirebaseUser, onBack: () -> Unit) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val profile = partnerProfiles.firstOrNull { it.email.equals(user.email.orEmpty(), true) }
    val key = profile?.key ?: "kebyy"
    val strokesRef = remember { FirebaseDatabase.getInstance().getReference("couples/our-little-world/drawing/strokes") }
    val presenceRef = remember { FirebaseDatabase.getInstance().getReference("couples/our-little-world/drawing/presence") }
    val drawingsRef = remember { FirebaseFirestore.getInstance().collection("couples").document("our-little-world").collection("drawingMessages") }
    var strokes by remember { mutableStateOf<List<NativeDrawStroke>>(emptyList()) }
    var undoableStrokeIds by remember { mutableStateOf<List<String>>(emptyList()) }
    var redoStrokes by remember { mutableStateOf<List<NativeDrawStroke>>(emptyList()) }
    var clearedSnapshot by remember { mutableStateOf<List<NativeDrawStroke>>(emptyList()) }
    var presence by remember { mutableStateOf<Map<String, Map<String, Any?>>>(emptyMap()) }
    var currentPoints by remember { mutableStateOf<List<NativeDrawPoint>>(emptyList()) }
    var color by remember { mutableStateOf(Color(0xFFDC4D88)) }
    var tool by rememberSaveable { mutableStateOf("pen") }
    var brushSize by rememberSaveable { mutableFloatStateOf(5f) }
    var brushOpacity by rememberSaveable { mutableFloatStateOf(1f) }
    var brushSettings by remember { mutableStateOf(mapOf("pen" to (5f to 1f), "pencil" to (4f to 0.75f), "marker" to (24f to 0.8f), "eraser" to (20f to 1f))) }
    var connected by remember { mutableStateOf(false) }
    var confirmClear by remember { mutableStateOf(false) }
    var showCustomColor by remember { mutableStateOf(false) }
    var customRed by remember { mutableFloatStateOf(220f) }
    var customGreen by remember { mutableFloatStateOf(77f) }
    var customBlue by remember { mutableFloatStateOf(136f) }
    var showHistory by remember { mutableStateOf(false) }
    var showSavedDrawings by remember { mutableStateOf(false) }
    var savedDrawings by remember { mutableStateOf<List<Map<String, Any?>>>(emptyList()) }
    var historyLoading by remember { mutableStateOf(true) }
    var historyOffline by remember { mutableStateOf(false) }
    var historyError by remember { mutableStateOf("") }
    var historyRetry by remember { mutableIntStateOf(0) }
    var savedImage by remember { mutableStateOf<Bitmap?>(null) }
    var clearedImageSnapshot by remember { mutableStateOf<Bitmap?>(null) }
    var previewDrawing by remember { mutableStateOf<Map<String, Any?>?>(null) }
    var previewUri by remember { mutableStateOf<Uri?>(null) }
    var previewLoading by remember { mutableStateOf(false) }
    var deletingDrawing by remember { mutableStateOf(false) }
    var confirmSavedDrawingDelete by remember { mutableStateOf(false) }
    var savingDrawing by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val outbox = remember(user.uid) { NativeDrawingOutbox(context, user.uid) }
    var outboxEntries by remember(user.uid) { mutableStateOf(outbox.all()) }
    var canvasZoom by rememberSaveable { mutableFloatStateOf(1f) }
    var canvasOffset by remember { mutableStateOf(androidx.compose.ui.geometry.Offset.Zero) }
    val observedDrawingOperationKeys = remember(user.uid) { mutableSetOf<String>() }
    val canvasTransformState = rememberTransformableState { zoomChange, panChange, _ ->
        val nextZoom = (canvasZoom * zoomChange).coerceIn(0.5f, 4f)
        canvasZoom = nextZoom
        canvasOffset = if (nextZoom > 1f) canvasOffset + panChange else androidx.compose.ui.geometry.Offset.Zero
    }
    fun projectOfflineDrawingOperation(operation: Map<String, Any?>) {
        when (operation["type"] as? String) {
            "stroke" -> nativeDrawStrokeFromMap(operation)?.let { strokes = strokes + it; undoableStrokeIds = (undoableStrokeIds + it.id).takeLast(30); redoStrokes = emptyList(); clearedSnapshot = emptyList(); savedImage = null }
            "undo" -> {
                val id = operation["strokeId"] as? String
                val removed = strokes.firstOrNull { it.id == id }
                if (removed != null) { strokes = strokes.filterNot { it.id == id }; undoableStrokeIds = undoableStrokeIds.filterNot { it == id }; redoStrokes = (redoStrokes + removed).takeLast(30) }
            }
            "redo" -> (operation["stroke"] as? Map<*, *>)?.let { nativeDrawStrokeFromMap(it) }?.let { strokes = strokes + it; undoableStrokeIds = (undoableStrokeIds + it.id).takeLast(30); redoStrokes = redoStrokes.filterNot { redo -> redo.id == it.id } }
            "clear" -> { clearedSnapshot = strokes; clearedImageSnapshot = savedImage; strokes = emptyList(); undoableStrokeIds = emptyList(); redoStrokes = emptyList(); savedImage = null }
            "restore" -> {
                val restored = (operation["strokes"] as? List<*>)?.mapNotNull { nativeDrawStrokeFromMap(it as? Map<*, *> ?: return@mapNotNull null) }.orEmpty()
                strokes = restored; undoableStrokeIds = restored.takeLast(30).map { it.id }; redoStrokes = emptyList(); clearedSnapshot = emptyList()
            }
        }
    }
    suspend fun submitDrawingOperation(raw: Map<String, Any?>) {
        val operation = raw + mapOf("uid" to user.uid, "opId" to UUID.randomUUID().toString())
        if (connected) {
            try { strokesRef.push().setValue(operation).await() }
            catch (_: Exception) { outbox.add(operation); outboxEntries = outbox.all(); projectOfflineDrawingOperation(operation) }
        } else {
            outbox.add(operation)
            outboxEntries = outbox.all()
            projectOfflineDrawingOperation(operation)
        }
    }
    val colors = listOf(Color(0xFF1C1C1E), Color(0xFF8E8E93), Color(0xFFDC4D88), Color(0xFFFF2D55), Color(0xFFFF3B30), Color(0xFFFF9500), Color(0xFFFFCC00), Color(0xFF34C759), Color(0xFF30B0C7), Color(0xFF007AFF), Color(0xFF263B72), Color(0xFFAF52DE), Color(0xFFA2845E), Color.White)
    DisposableEffect(user.uid, historyRetry) {
        historyLoading = true
        historyError = ""
        val historyListener = drawingsRef.orderBy("createdAt", Query.Direction.DESCENDING).addSnapshotListener { snapshot, error ->
            if (snapshot != null) {
                savedDrawings = snapshot.documents.map { mapOf("id" to it.id) + it.data.orEmpty() }
                historyOffline = snapshot.metadata.isFromCache
                historyError = ""
            } else if (error != null) historyError = "Could not load saved drawings. Check your connection and try again."
            historyLoading = false
        }
        onDispose { historyListener.remove() }
    }
    DisposableEffect(user.uid) {
        var isInitialDrawingSnapshot = true
        var isFlushingOutbox = false
        val strokeListener = object : ValueEventListener {
            override fun onDataChange(snapshot: DataSnapshot) {
                val operations = snapshot.children.mapNotNull { child ->
                    val value = child.value as? Map<*, *> ?: return@mapNotNull null
                    child.key.orEmpty() to value
                }
                val unseenOperations = operations.filter { it.first !in observedDrawingOperationKeys }
                val partnerClear = !isInitialDrawingSnapshot && unseenOperations.any { (_, value) -> value["type"] == "clear" && value["uid"] != user.uid }
                if (partnerClear) {
                    outbox.removeTypes(setOf("stroke", "redo", "undo"))
                    outboxEntries = outbox.all()
                } else if (isInitialDrawingSnapshot) {
                    val latestClearMs = operations.filter { (_, value) -> value["type"] == "clear" && value["uid"] != user.uid }
                        .maxOfOrNull { (_, value) -> (value["createdAt"] as? Number)?.toLong() ?: 0L } ?: 0L
                    if (latestClearMs > 0L) { outbox.removeStaleBefore(latestClearMs); outboxEntries = outbox.all() }
                }
                if (!isInitialDrawingSnapshot) {
                    if (partnerClear && savedImage != null) { clearedImageSnapshot = savedImage; savedImage = null }
                    else if (unseenOperations.any { (_, value) -> value["type"] in setOf("stroke", "undo", "redo", "restore") }) {
                        savedImage = null
                        clearedImageSnapshot = null
                    }
                }
                observedDrawingOperationKeys.addAll(operations.map { it.first })
                isInitialDrawingSnapshot = false
                var active = mutableListOf<NativeDrawStroke>()
                var undone = mutableListOf<NativeDrawStroke>()
                var undoable = mutableListOf<String>()
                var clearBackup = mutableListOf<NativeDrawStroke>()
                val projectedOperations = operations.map { it.first to it.second } + outbox.all().mapIndexed { index, value -> "~queued-$index" to value }
                val seenOperationIds = mutableSetOf<String>()
                projectedOperations.forEach { (_, value) ->
                    val opId = value["opId"] as? String
                    if (opId != null && !seenOperationIds.add(opId)) return@forEach
                    when (value["type"] as? String) {
                        "clear" -> { clearBackup = active.toMutableList(); active = mutableListOf(); undone = mutableListOf(); undoable = mutableListOf() }
                        "stroke" -> {
                            nativeDrawStrokeFromMap(value)?.let { active.add(it); undone.clear(); clearBackup.clear(); undoable.add(it.id); if (undoable.size > 30) undoable.removeAt(0) }
                        }
                        "undo" -> active.firstOrNull { it.id == value["strokeId"] }?.let { removed -> active.removeAll { it.id == removed.id }; undoable.remove(removed.id); if (undone.none { it.id == removed.id }) { undone.add(removed); if (undone.size > 30) undone.removeAt(0) } }
                        "redo" -> {
                            val nested = value["stroke"] as? Map<*, *>
                            nativeDrawStrokeFromMap(nested ?: emptyMap<Any, Any>())?.let { restored -> if (active.none { it.id == restored.id }) active.add(restored); undone.removeAll { it.id == restored.id }; clearBackup.clear(); undoable.add(restored.id); if (undoable.size > 30) undoable.removeAt(0) }
                        }
                        "restore" -> { val restored = (value["strokes"] as? List<*>)?.mapNotNull { raw -> nativeDrawStrokeFromMap(raw as? Map<*, *> ?: return@mapNotNull null) }.orEmpty(); active = restored.toMutableList(); undone.clear(); clearBackup.clear(); undoable = restored.takeLast(30).map { it.id }.toMutableList() }
                    }
                }
                strokes = active
                undoableStrokeIds = undoable
                redoStrokes = undone
                clearedSnapshot = clearBackup
            }
            override fun onCancelled(error: DatabaseError) { connected = false }
        }
        val presenceListener = object : ValueEventListener {
            override fun onDataChange(snapshot: DataSnapshot) { presence = snapshot.children.mapNotNull { child -> (child.value as? Map<*, *>)?.let { child.key.orEmpty() to it.entries.associate { entry -> entry.key.toString() to entry.value } } }.toMap() }
            override fun onCancelled(error: DatabaseError) = Unit
        }
        val presenceRefForMe = presenceRef.child(key)
        val connectedRef = FirebaseDatabase.getInstance().getReference(".info/connected")
        val connectedListener = object : ValueEventListener {
            override fun onDataChange(snapshot: DataSnapshot) {
                connected = snapshot.getValue(Boolean::class.java) == true
                if (connected) {
                    presenceRefForMe.setValue(mapOf("name" to profile?.name.orEmpty(), "uid" to user.uid, "state" to "online", "lastSeen" to System.currentTimeMillis()))
                    presenceRefForMe.onDisconnect().setValue(mapOf("name" to profile?.name.orEmpty(), "uid" to user.uid, "state" to "offline", "lastSeen" to System.currentTimeMillis()))
                    if (!isFlushingOutbox && outbox.all().isNotEmpty()) {
                        isFlushingOutbox = true
                        scope.launch {
                            try {
                                for (operation in outbox.all()) {
                                    val opId = operation["opId"] as? String ?: continue
                                    try {
                                        val current = strokesRef.get().await()
                                        val alreadyWritten = current.children.any { it.child("opId").getValue(String::class.java) == opId }
                                        val latestPartnerClear = current.children.mapNotNull { child ->
                                            val type = child.child("type").getValue(String::class.java)
                                            val uid = child.child("uid").getValue(String::class.java)
                                            if (type == "clear" && uid != user.uid) child.child("createdAt").getValue(Long::class.java) else null
                                        }.maxOrNull() ?: 0L
                                        val operationType = operation["type"] as? String
                                        val operationTime = (operation["createdAt"] as? Number)?.toLong() ?: Long.MAX_VALUE
                                        val staleByPartnerClear = operationType != null && operationType in setOf("stroke", "redo", "undo") && latestPartnerClear > 0L && operationTime <= latestPartnerClear
                                        if (staleByPartnerClear) { outbox.remove(opId); outboxEntries = outbox.all(); continue }
                                        if (!alreadyWritten) strokesRef.push().setValue(operation).await()
                                        outbox.remove(opId)
                                        outboxEntries = outbox.all()
                                    } catch (_: Exception) { break }
                                }
                            } finally {
                                isFlushingOutbox = false
                            }
                        }
                    }
                }
            }
            override fun onCancelled(error: DatabaseError) { connected = false }
        }
        strokesRef.addValueEventListener(strokeListener); presenceRef.addValueEventListener(presenceListener); connectedRef.addValueEventListener(connectedListener)
        onDispose {
            strokesRef.removeEventListener(strokeListener); presenceRef.removeEventListener(presenceListener); connectedRef.removeEventListener(connectedListener)
            presenceRefForMe.setValue(mapOf("name" to profile?.name.orEmpty(), "uid" to user.uid, "state" to "offline", "lastSeen" to System.currentTimeMillis()))
        }
    }
    val partnerOnline = presence.values.any { it["uid"] != user.uid && it["state"] == "online" }
    val saveDrawing: () -> Unit = {
        if (strokes.isEmpty() && savedImage == null) Toast.makeText(context, "Add a drawing before sending.", Toast.LENGTH_SHORT).show()
        else if (!savingDrawing) {
            savingDrawing = true
            scope.launch {
                var exportFile: File? = null
                var uploaded: Map<String, Any?>? = null
                var saved = false
                val previousStrokes = strokes
                try {
                    val now = System.currentTimeMillis()
                    val artist = profile?.name ?: user.displayName ?: "Partner"
                    val timestamp = DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT).format(Date(now))
                    val bitmap = renderNativeDrawingBitmap(previousStrokes, savedImage, artist, timestamp)
                    exportFile = File(context.cacheDir, "canvas-drawing-$now.jpg")
                    exportFile.outputStream().use { output -> if (!bitmap.compress(Bitmap.CompressFormat.JPEG, 94, output)) error("Could not prepare drawing image.") }
                    bitmap.recycle()
                    uploaded = uploadTelegramMedia(context, user, Uri.fromFile(exportFile), "$artist · $timestamp", artist, "image/jpeg", "New Canvas Drawing 🎨", exportFile, "image/jpeg")
                    val references = uploaded.orEmpty()
                    val document = mapOf("authorId" to user.uid, "authorName" to artist, "telegramFileId" to references["telegramFileId"], "telegramFileUniqueId" to references["telegramFileUniqueId"], "telegramChatId" to references["telegramChatId"], "telegramMessageId" to references["telegramMessageId"], "mimeType" to "image/jpeg", "createdAtMs" to now, "createdAt" to FieldValue.serverTimestamp())
                    val drawingReference = drawingsRef.add(document).await()
                    saved = true
                    runCatching { notifyPostPartner(profile, "drawing", "${profile?.name ?: "Your partner"} added a new drawing! 🎨", drawingReference.id, "drawing") }
                    outbox.removeTypes(setOf("stroke", "redo", "undo")); outboxEntries = outbox.all()
                    submitDrawingOperation(mapOf("type" to "clear", "createdAt" to System.currentTimeMillis()))
                    strokes = emptyList(); undoableStrokeIds = emptyList(); redoStrokes = emptyList(); clearedSnapshot = emptyList(); clearedImageSnapshot = null; currentPoints = emptyList(); savedImage = null
                    Toast.makeText(context, "Drawing saved to your shared gallery ♡", Toast.LENGTH_SHORT).show()
                } catch (_: Exception) {
                    if (!saved) uploaded?.let { runCatching { deleteTelegramMediaIfReferenced(user, it) } }
                    Toast.makeText(context, "Could not save drawing. Check your connection and try again.", Toast.LENGTH_LONG).show()
                } finally { exportFile?.delete(); savingDrawing = false }
            }
        }
    }
    val openDrawingPreview: (Map<String, Any?>) -> Unit = { drawing ->
        previewDrawing = drawing
        previewUri = null
        previewLoading = true
        scope.launch {
            try {
                val fileId = drawing["telegramFileId"] as? String
                val photoUrl = drawing["photoUrl"] as? String ?: drawing["thumbnailUrl"] as? String
                previewUri = if (!fileId.isNullOrBlank()) Uri.fromFile(loadTelegramMediaFile(context, user, fileId, drawing["mimeType"] as? String ?: "image/jpeg") ?: error("Drawing preview is unavailable")) else Uri.parse(photoUrl ?: error("Drawing preview is unavailable"))
            } catch (_: Exception) { previewDrawing = null; Toast.makeText(context, "Could not open this saved drawing.", Toast.LENGTH_SHORT).show() }
            finally { previewLoading = false }
        }
    }
    Column(Modifier.fillMaxSize().padding(12.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = onBack) { Text("‹ Home", color = Rose) }
            Column(Modifier.weight(1f)) { Text("Our Canvas ♡", color = Ink, fontSize = 21.sp, fontWeight = FontWeight.Bold); Text(if (!connected) "Offline · changes sync when reconnected" else if (partnerOnline) "Both online · drawing together" else "You're online · waiting for your person", color = Color(0xFF8B7180), fontSize = 11.sp) }
            TextButton(onClick = { showSavedDrawings = true }) { Text("Gallery", color = Rose) }
            TextButton(onClick = { showHistory = true }) { Text("Strokes", color = Rose) }
            TextButton(enabled = strokes.isNotEmpty() || savedImage != null, onClick = { confirmClear = true }) { Text("Clear", color = Rose) }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
            TextButton(enabled = !savingDrawing && (strokes.isNotEmpty() || savedImage != null), onClick = saveDrawing) { Text(if (savingDrawing) "Saving…" else "Save & Send ♡", color = Rose) }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
            listOf("pen" to "Pen", "pencil" to "Pencil", "marker" to "Marker", "eraser" to "Eraser").forEach { (id, label) -> TextButton(onClick = {
                brushSettings = brushSettings + (tool to (brushSize to brushOpacity))
                tool = id
                val settings = brushSettings[id] ?: (5f to 1f)
                brushSize = settings.first; brushOpacity = settings.second
            }) { Text(if (tool == id) "● $label" else label, color = if (tool == id) Rose else Color(0xFF806979), fontSize = 11.sp) } }
        }
        Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), horizontalArrangement = Arrangement.SpaceEvenly) {
            colors.forEach { swatch -> Box(Modifier.size(26.dp).clip(CircleShape).background(swatch).border(if (color == swatch) 3.dp else 1.dp, if (swatch == Color.White) Color.LightGray else Color.White, CircleShape).clickable { color = swatch } ) }
            TextButton(onClick = { showCustomColor = true }) { Text("Custom", color = Rose, fontSize = 11.sp) }
        }
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text("Size", color = Color(0xFF806979), fontSize = 11.sp)
            androidx.compose.material3.Slider(value = brushSize, onValueChange = { brushSize = it; brushSettings = brushSettings + (tool to (it to brushOpacity)) }, valueRange = 2f..60f, modifier = Modifier.weight(1f))
            Text("${brushSize.toInt()} px", color = Color(0xFF806979), fontSize = 11.sp)
        }
        if (tool != "eraser") Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text("Opacity", color = Color(0xFF806979), fontSize = 11.sp)
            androidx.compose.material3.Slider(value = brushOpacity, onValueChange = { brushOpacity = it; brushSettings = brushSettings + (tool to (brushSize to it)) }, valueRange = 0.1f..1f, modifier = Modifier.weight(1f))
            Text("${(brushOpacity * 100).toInt()}%", color = Color(0xFF806979), fontSize = 11.sp)
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
            val canRestoreClear = strokes.isEmpty() && (clearedSnapshot.isNotEmpty() || clearedImageSnapshot != null)
            TextButton(enabled = undoableStrokeIds.isNotEmpty() || canRestoreClear, onClick = {
                if (strokes.isEmpty() && clearedSnapshot.isNotEmpty()) {
                    scope.launch { submitDrawingOperation(mapOf("type" to "restore", "strokes" to clearedSnapshot.map { mapOf("id" to it.id, "uid" to it.uid, "color" to it.color.toLong(), "size" to it.width * 800f, "tool" to it.tool, "opacity" to it.opacity, "points" to it.points.map { p -> mapOf("x" to p.x, "y" to p.y) }) }, "createdAt" to System.currentTimeMillis())) }
                    savedImage = clearedImageSnapshot ?: savedImage
                    clearedImageSnapshot = null
                } else if (strokes.isEmpty() && clearedImageSnapshot != null) {
                    savedImage = clearedImageSnapshot; clearedImageSnapshot = null
                } else undoableStrokeIds.lastOrNull()?.let { id -> scope.launch { submitDrawingOperation(mapOf("type" to "undo", "strokeId" to id, "createdAt" to System.currentTimeMillis())) } }
            }) { Text(if (canRestoreClear) "Restore last clear" else "Undo", color = Rose) }
            TextButton(enabled = redoStrokes.isNotEmpty(), onClick = { redoStrokes.lastOrNull()?.let { stroke -> scope.launch { submitDrawingOperation(mapOf("type" to "redo", "stroke" to mapOf("id" to stroke.id, "uid" to stroke.uid, "color" to stroke.color.toLong(), "size" to stroke.width * 800f, "tool" to stroke.tool, "opacity" to stroke.opacity, "points" to stroke.points.map { mapOf("x" to it.x, "y" to it.y) }), "createdAt" to System.currentTimeMillis())) } } }) { Text("Redo", color = Rose) }
            TextButton(enabled = canvasZoom > 0.5f, onClick = { canvasZoom = (canvasZoom - 0.25f).coerceAtLeast(0.5f); if (canvasZoom <= 1f) canvasOffset = androidx.compose.ui.geometry.Offset.Zero }) { Text("−", color = Rose) }
            Text("${(canvasZoom * 100).toInt()}%", color = Color(0xFF806979), fontSize = 11.sp)
            TextButton(enabled = canvasZoom < 4f, onClick = { canvasZoom = (canvasZoom + 0.25f).coerceAtMost(4f) }) { Text("+", color = Rose) }
            TextButton(onClick = { canvasZoom = 1f; canvasOffset = androidx.compose.ui.geometry.Offset.Zero }) { Text("Reset", color = Rose, fontSize = 11.sp) }
        }
        Canvas(Modifier.weight(1f).fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(Color.White).border(1.dp, Color(0xFFF3D5E1), RoundedCornerShape(20.dp)).graphicsLayer { scaleX = canvasZoom; scaleY = canvasZoom; translationX = canvasOffset.x; translationY = canvasOffset.y }.transformable(canvasTransformState).pointerInput(color, connected, tool, brushSize, brushOpacity, canvasZoom) {
            detectDragGestures(onDragStart = { point -> currentPoints = listOf(NativeDrawPoint(point.x / size.width, point.y / size.height)) }, onDrag = { change, _ ->
                change.consume()
                val next = NativeDrawPoint(change.position.x / size.width, change.position.y / size.height)
                currentPoints = currentPoints + next
            }, onDragEnd = {
                val sentPoints = currentPoints
                currentPoints = emptyList()
                if (sentPoints.isNotEmpty()) {
                    val id = UUID.randomUUID().toString()
                    val actualColor = (if (tool == "eraser") Color.White else color).value.toLong()
                    val payloadPoints = sentPoints.map { mapOf("x" to it.x, "y" to it.y) }
                    scope.launch { submitDrawingOperation(mapOf("type" to "stroke", "id" to id, "color" to actualColor, "size" to brushSize, "opacity" to if (tool == "eraser") 1f else brushOpacity, "tool" to tool, "points" to payloadPoints, "createdAt" to System.currentTimeMillis())) }
                }
            })
        }) {
            savedImage?.let { image -> drawImage(image.asImageBitmap(), dstSize = IntSize(size.width.toInt(), size.height.toInt())) }
            val activeColor = (if (tool == "eraser") Color.White else color).value.toLong().toInt()
            val all = strokes + listOfNotNull(if (currentPoints.isNotEmpty()) NativeDrawStroke("local", user.uid, activeColor, brushSize / 800f, currentPoints, tool, if (tool == "eraser") 1f else brushOpacity) else null)
            all.forEach { stroke ->
                val pts = stroke.points
                val strokeColor = Color(stroke.color).copy(alpha = stroke.opacity.coerceIn(0.1f, 1f))
                val strokeWidth = size.minDimension * stroke.width
                if (pts.size == 1) drawCircle(strokeColor, radius = strokeWidth / 2, center = androidx.compose.ui.geometry.Offset(pts[0].x * size.width, pts[0].y * size.height))
                else {
                    val path = Path().apply {
                        moveTo(pts.first().x * size.width, pts.first().y * size.height)
                        for (index in 1 until pts.lastIndex) {
                            val midpointX = (pts[index].x + pts[index + 1].x) * size.width / 2
                            val midpointY = (pts[index].y + pts[index + 1].y) * size.height / 2
                            quadraticTo(pts[index].x * size.width, pts[index].y * size.height, midpointX, midpointY)
                        }
                        lineTo(pts.last().x * size.width, pts.last().y * size.height)
                    }
                    if (stroke.tool == "pencil") {
                        drawPath(path, strokeColor.copy(alpha = strokeColor.alpha * 0.55f), style = Stroke(strokeWidth, cap = StrokeCap.Round, join = androidx.compose.ui.graphics.StrokeJoin.Round))
                        drawPath(path, strokeColor.copy(alpha = strokeColor.alpha * 0.40f), style = Stroke(maxOf(1f, strokeWidth * 0.55f), cap = StrokeCap.Round, join = androidx.compose.ui.graphics.StrokeJoin.Round))
                    } else drawPath(path, strokeColor, style = Stroke(strokeWidth, cap = StrokeCap.Round, join = androidx.compose.ui.graphics.StrokeJoin.Round))
                }
            }
        }
        Text(if (!connected) "Offline · ${outboxEntries.size} changes saved on this device for sync." else if (outboxEntries.isNotEmpty()) "Syncing ${outboxEntries.size} saved changes…" else "${strokes.size} shared strokes · changes sync live.", color = Color(0xFF8B7180), fontSize = 11.sp, modifier = Modifier.padding(top = 8.dp))
    }
    if (confirmClear) AlertDialog(onDismissRequest = { confirmClear = false }, title = { Text("Clear the shared canvas?") }, text = { Text("This clears the canvas for both of you. You can restore this version with Undo.") }, confirmButton = { TextButton(onClick = { outbox.removeTypes(setOf("stroke", "redo", "undo")); outboxEntries = outbox.all(); scope.launch { submitDrawingOperation(mapOf("type" to "clear", "createdAt" to System.currentTimeMillis())) }; confirmClear = false }) { Text("Clear", color = Color(0xFFB94062)) } }, dismissButton = { TextButton(onClick = { confirmClear = false }) { Text("Keep drawing", color = Rose) } })
    if (showCustomColor) AlertDialog(
        onDismissRequest = { showCustomColor = false },
        title = { Text("Custom drawing color", color = Ink) },
        text = {
            Column {
                Box(Modifier.fillMaxWidth().height(34.dp).clip(RoundedCornerShape(10.dp)).background(Color(customRed.toInt(), customGreen.toInt(), customBlue.toInt())))
                listOf("Red" to customRed, "Green" to customGreen, "Blue" to customBlue).forEach { (label, value) ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(label, color = Color(0xFF806979), fontSize = 12.sp, modifier = Modifier.width(48.dp))
                        androidx.compose.material3.Slider(value = value, onValueChange = { next ->
                            when (label) { "Red" -> customRed = next; "Green" -> customGreen = next; else -> customBlue = next }
                        }, valueRange = 0f..255f, modifier = Modifier.weight(1f))
                    }
                }
                Text("#%02X%02X%02X".format(customRed.toInt(), customGreen.toInt(), customBlue.toInt()), color = Ink, fontSize = 12.sp)
            }
        },
        confirmButton = { TextButton(onClick = { color = Color(customRed.toInt(), customGreen.toInt(), customBlue.toInt()); showCustomColor = false }) { Text("Use color", color = Rose) } },
        dismissButton = { TextButton(onClick = { showCustomColor = false }) { Text("Cancel", color = Color(0xFF806979)) } }
    )
    if (showHistory) AlertDialog(onDismissRequest = { showHistory = false }, title = { Text("Canvas history · ${strokes.size} strokes") }, text = { Column(Modifier.heightIn(max = 420.dp).verticalScroll(rememberScrollState())) { if (strokes.isEmpty()) Text("No active strokes on the canvas.", color = Color(0xFF8B7180)); strokes.takeLast(30).asReversed().forEach { stroke -> Row(Modifier.fillMaxWidth().padding(vertical = 3.dp), verticalAlignment = Alignment.CenterVertically) { Text("${stroke.tool.replaceFirstChar { it.uppercase() }} · ${if (stroke.uid == user.uid) "You" else "Partner"}", color = Ink, modifier = Modifier.weight(1f)); TextButton(enabled = stroke.id in undoableStrokeIds, onClick = { scope.launch { submitDrawingOperation(mapOf("type" to "undo", "strokeId" to stroke.id, "createdAt" to System.currentTimeMillis())) } }) { Text("Undo", color = Rose) } } } } }, confirmButton = { TextButton(onClick = { showHistory = false }) { Text("Done", color = Rose) } })
    if (showSavedDrawings) AlertDialog(
        onDismissRequest = { showSavedDrawings = false },
        title = { Text("Drawing gallery · ${savedDrawings.size} saved") },
        text = {
            Column {
                if (historyOffline) Text("Offline · showing saved drawings from this device", color = Color(0xFF8B7180), fontSize = 12.sp, modifier = Modifier.padding(bottom = 8.dp))
                when {
                    historyLoading -> Box(Modifier.fillMaxWidth().height(180.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Rose) }
                    historyError.isNotBlank() && savedDrawings.isEmpty() -> Column(horizontalAlignment = Alignment.CenterHorizontally) { Text(historyError, color = Color(0xFF8B7180)); TextButton(onClick = { historyRetry++ }) { Text("Retry", color = Rose) } }
                    savedDrawings.isEmpty() -> Text("No drawings saved yet.", color = Color(0xFF8B7180))
                    else -> LazyColumn(Modifier.fillMaxWidth().heightIn(max = 440.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        items(savedDrawings, key = { it["id"] as String }) { drawing ->
                            Card(Modifier.fillMaxWidth().clickable { openDrawingPreview(drawing) }, colors = CardDefaults.cardColors(containerColor = Color.White), border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFF3D5E1))) {
                                Row(Modifier.padding(8.dp), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                                    NativeDrawingThumbnail(user, drawing, Modifier.size(76.dp))
                                    Column(Modifier.weight(1f)) {
                                        Text("By ${drawing["authorName"] ?: "Us"}", color = Ink, fontWeight = FontWeight.SemiBold)
                                        val date = (drawing["createdAt"] as? com.google.firebase.Timestamp)?.toDate() ?: (drawing["createdAtMs"] as? Number)?.toLong()?.let(::Date)
                                        Text(date?.let { DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT).format(it) } ?: "Saved drawing", color = Color(0xFF8B7180), fontSize = 12.sp)
                                    }
                                    Text("›", color = Rose, fontSize = 22.sp)
                                }
                            }
                        }
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = { showSavedDrawings = false }) { Text("Close", color = Rose) } }
    )
    if (previewDrawing != null) {
        val drawing = previewDrawing!!
        androidx.compose.ui.window.Dialog(onDismissRequest = { previewDrawing = null }, properties = androidx.compose.ui.window.DialogProperties(usePlatformDefaultWidth = false)) {
            Surface(Modifier.fillMaxSize().padding(12.dp), color = Color(0xFF21151D), shape = RoundedCornerShape(20.dp)) {
                Column(Modifier.fillMaxSize().padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Text("By ${drawing["authorName"] ?: "Us"}", color = Color.White, modifier = Modifier.weight(1f))
                        TextButton(onClick = { previewDrawing = null }) { Text("Close", color = Color.White) }
                    }
                    Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                        when {
                            previewLoading -> CircularProgressIndicator(color = Rose)
                            previewUri == null -> Text("Preview unavailable", color = Color.White)
                            else -> AsyncImage(model = previewUri, contentDescription = "Saved drawing", modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Fit)
                        }
                    }
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
                        TextButton(enabled = !previewLoading && previewUri != null, onClick = {
                            val restored = previewUri?.path?.let { path -> BitmapFactory.decodeFile(path) }
                            if (restored == null) Toast.makeText(context, "Could not load this drawing onto the canvas.", Toast.LENGTH_SHORT).show()
                            else { savedImage?.recycle(); savedImage = restored; strokes = emptyList(); redoStrokes = emptyList(); currentPoints = emptyList(); previewDrawing = null; showSavedDrawings = false; Toast.makeText(context, "Drawing loaded on canvas ♡", Toast.LENGTH_SHORT).show() }
                        }) { Text("Load on canvas ♡", color = Color.White) }
                        TextButton(onClick = { confirmSavedDrawingDelete = true }) { Text("Delete", color = Color(0xFFFF8AAE)) }
                    }
                }
            }
        }
    }
    if (confirmSavedDrawingDelete && previewDrawing != null) AlertDialog(
        onDismissRequest = { if (!deletingDrawing) confirmSavedDrawingDelete = false },
        title = { Text("Delete this drawing?") },
        text = { Text("This drawing will be removed from your shared gallery.") },
        confirmButton = { TextButton(enabled = !deletingDrawing, onClick = {
            val id = previewDrawing?.get("id") as? String ?: return@TextButton
            deletingDrawing = true
            scope.launch {
                try { drawingsRef.document(id).delete().await(); confirmSavedDrawingDelete = false; previewDrawing = null; Toast.makeText(context, "Drawing deleted.", Toast.LENGTH_SHORT).show() }
                catch (_: Exception) { Toast.makeText(context, "Could not delete this drawing.", Toast.LENGTH_SHORT).show() }
                finally { deletingDrawing = false }
            }
        }) { Text(if (deletingDrawing) "Deleting…" else "Delete", color = Color(0xFFB94062)) } },
        dismissButton = { TextButton(enabled = !deletingDrawing, onClick = { confirmSavedDrawingDelete = false }) { Text("Cancel") } }
    )
}

@Composable
private fun NativeGamesScreen(user: FirebaseUser, onBack: () -> Unit) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val profile = partnerProfiles.firstOrNull { it.email.equals(user.email.orEmpty(), true) }
    var game by rememberSaveable { mutableStateOf("") }
    if (game == "sos") {
        NativeSosGameScreen(user, onBack = { game = "" })
        return
    }
    if (game == "true-false") {
        NativeTrueFalseScreen(user, onBack = { game = "" })
        return
    }
    val reference = remember { FirebaseDatabase.getInstance().getReference("couples/our-little-world/games/matches/memory-match") }
    var room by remember { mutableStateOf<Map<String, Any?>>(emptyMap()) }
    var busy by remember { mutableStateOf(false) }
    var memoryTimer by remember { mutableStateOf<Job?>(null) }
    val scope = rememberCoroutineScope()
    val emojiTiles = listOf("🌸", "🌙", "🍓", "🐻", "💌", "🦋", "✨", "🧸", "🌻", "💖")
    DisposableEffect(user.uid) {
        val listener = object : ValueEventListener {
            override fun onDataChange(snapshot: DataSnapshot) {
                room = (snapshot.value as? Map<*, *>)?.entries?.associate { it.key.toString() to it.value } ?: emptyMap()
                val status = room["status"] as? String
                val players = room["players"] as? Map<*, *>
                val me = players?.get(user.uid) as? Map<*, *>
                val state = me?.get("state") as? Map<*, *>
                if (status == "playing" && room["turnUid"] == user.uid && state == null) {
                    val deck = (emojiTiles + emojiTiles).shuffled()
                    reference.runTransaction(object : com.google.firebase.database.Transaction.Handler {
                        override fun doTransaction(data: com.google.firebase.database.MutableData): com.google.firebase.database.Transaction.Result {
                            val current = data.value as? Map<*, *> ?: return com.google.firebase.database.Transaction.abort()
                            if (current["status"] != "playing" || current["turnUid"] != user.uid) return com.google.firebase.database.Transaction.abort()
                            val currentPlayers = current["players"] as? Map<*, *> ?: return com.google.firebase.database.Transaction.abort()
                            val currentMe = currentPlayers[user.uid] as? Map<*, *> ?: return com.google.firebase.database.Transaction.abort()
                            if (currentMe["state"] != null) return com.google.firebase.database.Transaction.abort()
                            val playersCopy = currentPlayers.entries.associate { it.key.toString() to (it.value as? Map<*, *>)?.entries?.associate { p -> p.key.toString() to p.value }.orEmpty() }.toMutableMap()
                            playersCopy[user.uid] = playersCopy[user.uid].orEmpty() + ("state" to mapOf("cards" to deck, "flipped" to emptyList<Int>(), "matched" to emptyList<Int>(), "moves" to 0, "locked" to false))
                            data.value = current.entries.associate { it.key.toString() to it.value }.toMutableMap().apply { put("players", playersCopy) }
                            return com.google.firebase.database.Transaction.success(data)
                        }
                        override fun onComplete(error: DatabaseError?, committed: Boolean, snapshot: DataSnapshot?) { }
                    }, false)
                }
            }
            override fun onCancelled(error: DatabaseError) { }
        }
        reference.addValueEventListener(listener)
        onDispose { memoryTimer?.cancel(); reference.removeEventListener(listener) }
    }
    val players = room["players"] as? Map<*, *> ?: emptyMap<Any, Any>()
    val playerIds = (room["playerUids"] as? List<*>)?.filterIsInstance<String>().orEmpty()
    val own = players[user.uid] as? Map<*, *>
    val state = own?.get("state") as? Map<*, *>
    val cards = (state?.get("cards") as? List<*>)?.filterIsInstance<String>().orEmpty()
    val flipped = (state?.get("flipped") as? List<*>)?.mapNotNull { (it as? Number)?.toInt() }.orEmpty()
    val matched = (state?.get("matched") as? List<*>)?.mapNotNull { (it as? Number)?.toInt() }.orEmpty()
    val moves = (state?.get("moves") as? Number)?.toInt() ?: 0
    val isTurn = room["status"] == "playing" && room["turnUid"] == user.uid
    var recordedMatchId by rememberSaveable { mutableStateOf("") }
    LaunchedEffect(room["matchId"], room["status"], room["winnerUid"]) {
        val matchId = room["matchId"] as? String ?: return@LaunchedEffect
        if (room["status"] != "finished" || recordedMatchId == matchId || user.uid !in playerIds) return@LaunchedEffect
        val winner = room["winnerUid"] as? String ?: ""
        val scores = playerIds.associateWith { uid -> ((players[uid] as? Map<*, *>)?.get("score") as? Number)?.toInt() ?: 0 }
        try {
            FirebaseFirestore.getInstance().collection("couples").document("our-little-world").collection("items").document("game-match-$matchId")
                .set(mapOf("type" to "game", "game" to "Memory Match", "result" to if (winner.isBlank()) "draw" else "won", "winnerUid" to winner, "players" to playerIds, "scores" to scores, "matchId" to matchId, "author" to user.uid, "authorId" to (profile?.key ?: user.uid), "createdAt" to FieldValue.serverTimestamp()), com.google.firebase.firestore.SetOptions.merge()).await()
            if (winner == user.uid) notifyPostPartner(profile, "game", "${profile?.name ?: "Your partner"} won a game of Memory Match!", matchId, "games")
            recordedMatchId = matchId
        } catch (_: Exception) { Toast.makeText(context, "Match ended, but the result could not be saved.", Toast.LENGTH_SHORT).show() }
    }
    fun updateOwnState(next: Map<String, Any?>) {
        val matchId = room["matchId"] as? String ?: return
        reference.runTransaction(object : com.google.firebase.database.Transaction.Handler {
            override fun doTransaction(data: com.google.firebase.database.MutableData): com.google.firebase.database.Transaction.Result {
                val current = data.value as? Map<*, *> ?: return com.google.firebase.database.Transaction.abort()
                if (current["matchId"] != matchId || current["status"] != "playing" || current["turnUid"] != user.uid) return com.google.firebase.database.Transaction.abort()
                data.child("players").child(user.uid).child("state").value = next
                data.child("updatedAt").value = System.currentTimeMillis()
                return com.google.firebase.database.Transaction.success(data)
            }
            override fun onComplete(error: DatabaseError?, committed: Boolean, snapshot: DataSnapshot?) { if (!committed || error != null) busy = false }
        }, false)
    }
    fun startOrJoin() {
        busy = true
        reference.runTransaction(object : com.google.firebase.database.Transaction.Handler {
            override fun doTransaction(data: com.google.firebase.database.MutableData): com.google.firebase.database.Transaction.Result {
                val current = data.value as? Map<*, *>
                if (current == null || current["status"] in listOf("finished", "cancelled")) {
                    data.value = mapOf("matchId" to "${System.currentTimeMillis()}-${user.uid}", "game" to "memory-match", "status" to "waiting", "playerUids" to listOf(user.uid), "turnUid" to "", "winnerUid" to "", "players" to mapOf(user.uid to mapOf("name" to (profile?.name ?: "Player"), "score" to 0, "completed" to false, "state" to null)), "createdAt" to System.currentTimeMillis(), "updatedAt" to System.currentTimeMillis())
                    return com.google.firebase.database.Transaction.success(data)
                }
                val ids = (current["playerUids"] as? List<*>)?.filterIsInstance<String>().orEmpty()
                if (current["status"] == "waiting" && user.uid !in ids && ids.size == 1) {
                    val playersMap = current["players"] as? Map<*, *> ?: emptyMap<Any, Any>()
                    val playersCopy = playersMap.entries.associate { it.key.toString() to it.value }.toMutableMap()
                    playersCopy[user.uid] = mapOf("name" to (profile?.name ?: "Player"), "score" to 0, "completed" to false, "state" to null)
                    data.child("playerUids").value = ids + user.uid
                    data.child("players").value = playersCopy
                    data.child("status").value = "playing"
                    data.child("turnUid").value = ids.first()
                    data.child("updatedAt").value = System.currentTimeMillis()
                    return com.google.firebase.database.Transaction.success(data)
                }
                return com.google.firebase.database.Transaction.abort()
            }
            override fun onComplete(error: DatabaseError?, committed: Boolean, snapshot: DataSnapshot?) {
                busy = false
                if (error != null) Toast.makeText(context, "The game room could not be reached.", Toast.LENGTH_SHORT).show()
            }
        }, false)
    }
    Column(Modifier.fillMaxSize().padding(12.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) { TextButton(onClick = { if (game.isNotEmpty()) game = "" else onBack() }) { Text(if (game.isNotEmpty()) "‹ Games" else "‹ Home", color = Rose) }; Text(if (game.isNotEmpty()) "Memory Match" else "Mini Games", color = Ink, fontSize = 22.sp, fontWeight = FontWeight.Bold) }
        if (game.isEmpty()) {
            Text("Choose a game to play together", color = Color(0xFF8B7180), modifier = Modifier.padding(vertical = 10.dp))
            listOf("SOS" to "🔠", "Memory Match" to "🧠", "Find the Words" to "🔎", "True or False" to "💡", "Emoji Decoder" to "🧩", "Battleship" to "🚢", "Ludo" to "🎲").forEach { (label, icon) ->
                Card(Modifier.fillMaxWidth().padding(vertical = 5.dp).clickable { when (label) { "Memory Match" -> game = "memory"; "SOS" -> game = "sos"; "True or False" -> game = "true-false"; else -> Toast.makeText(context, "$label is still being ported.", Toast.LENGTH_SHORT).show() } }, colors = CardDefaults.cardColors(containerColor = Color.White), border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFF3D5E1))) { Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) { Text(icon, fontSize = 25.sp); Text(label, Modifier.weight(1f).padding(start = 12.dp), color = Ink, fontWeight = FontWeight.SemiBold); Text("›", color = Rose, fontSize = 24.sp) } }
            }
        } else {
            when (room["status"] as? String) {
                null, "finished", "cancelled" -> Column(Modifier.fillMaxWidth().padding(vertical = 24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(when (room["status"]) { "finished" -> if (room["winnerUid"] == user.uid) "You won! 🎉" else if (room["winnerUid"] == "") "It's a draw ♡" else "Your partner won this match."; "cancelled" -> "The last match was cancelled."; else -> "Start a match, then your partner joins from their device." }, color = Ink, fontWeight = FontWeight.SemiBold)
                    if (room["status"] == "finished") Text(playerIds.joinToString(" · ") { uid -> "${(players[uid] as? Map<*, *>)?.get("name") ?: "Player"}: ${(players[uid] as? Map<*, *>)?.get("score") ?: 0} moves" }, color = Color(0xFF8B7180), modifier = Modifier.padding(top = 8.dp))
                    Button(enabled = !busy, onClick = ::startOrJoin, colors = ButtonDefaults.buttonColors(containerColor = Rose), modifier = Modifier.padding(top = 12.dp)) { Text(if (room["status"] == "finished") "Play again" else "Start / Join match") }
                }
                "waiting" -> Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth().padding(22.dp)) { Text(if (playerIds.firstOrNull() == user.uid) "Waiting for your partner to join from their device…" else "Your partner is waiting for you to join.", color = Ink); if (playerIds.firstOrNull() != user.uid) Button(onClick = ::startOrJoin, colors = ButtonDefaults.buttonColors(containerColor = Rose)) { Text("Join match") } }
                "playing" -> {
                    Text(if (isTurn) "Your turn · ${matched.size / 2}/10 pairs · $moves moves" else "Waiting for your partner's turn…", color = if (isTurn) Rose else Color(0xFF8B7180), fontWeight = FontWeight.Bold, modifier = Modifier.padding(8.dp))
                    Column(Modifier.fillMaxWidth().weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        cards.chunked(4).forEachIndexed { rowIndex, row -> Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            row.forEachIndexed { columnIndex, symbol ->
                                val index = rowIndex * 4 + columnIndex
                                val visible = index in flipped || index in matched
                                Card(Modifier.weight(1f).height(66.dp).clickable(enabled = isTurn && !busy && state?.get("locked") != true && !visible) {
                                    val nextFlipped = flipped + index
                                    if (nextFlipped.size == 2) {
                                        val totalMoves = moves + 1
                                        if (cards[nextFlipped[0]] == cards[nextFlipped[1]]) updateOwnState(mapOf("cards" to cards, "flipped" to emptyList<Int>(), "matched" to (matched + nextFlipped).distinct(), "moves" to totalMoves, "locked" to false))
                                        else {
                                            updateOwnState(mapOf("cards" to cards, "flipped" to nextFlipped, "matched" to matched, "moves" to totalMoves, "locked" to true))
                                            memoryTimer?.cancel()
                                            memoryTimer = scope.launch { delay(850); updateOwnState(mapOf("cards" to cards, "flipped" to emptyList<Int>(), "matched" to matched, "moves" to totalMoves, "locked" to false)) }
                                        }
                                    } else updateOwnState(mapOf("cards" to cards, "flipped" to nextFlipped, "matched" to matched, "moves" to moves, "locked" to false))
                                }, colors = CardDefaults.cardColors(containerColor = if (index in matched) Color(0xFFFFEEF5) else Color.White), border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFF3D5E1))) { Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text(if (visible) symbol else "♡", color = Rose, fontSize = 26.sp) } }
                            }
                            repeat(4 - row.size) { Spacer(Modifier.weight(1f)) }
                        } }
                    }
                    if (cards.isNotEmpty() && matched.size == cards.size && isTurn) Button(onClick = {
                        val opponent = playerIds.firstOrNull { it != user.uid } ?: return@Button
                        val matchId = room["matchId"] as? String ?: return@Button
                        reference.runTransaction(object : com.google.firebase.database.Transaction.Handler {
                            override fun doTransaction(data: com.google.firebase.database.MutableData): com.google.firebase.database.Transaction.Result {
                                val current = data.value as? Map<*, *> ?: return com.google.firebase.database.Transaction.abort()
                                if (current["matchId"] != matchId || current["turnUid"] != user.uid) return com.google.firebase.database.Transaction.abort()
                                val playerData = data.child("players").child(user.uid)
                                playerData.child("score").value = moves
                                playerData.child("completed").value = true
                                playerData.child("state").value = null
                                val otherData = data.child("players").child(opponent)
                                if (otherData.child("completed").getValue(Boolean::class.java) == true) {
                                    val ownMoves = moves
                                    val otherMoves = otherData.child("score").getValue(Int::class.java) ?: 0
                                    data.child("status").value = "finished"
                                    data.child("winnerUid").value = when { ownMoves < otherMoves -> user.uid; ownMoves > otherMoves -> opponent; else -> "" }
                                    data.child("turnUid").value = ""
                                } else data.child("turnUid").value = opponent
                                data.child("updatedAt").value = System.currentTimeMillis()
                                return com.google.firebase.database.Transaction.success(data)
                            }
                            override fun onComplete(error: DatabaseError?, committed: Boolean, snapshot: DataSnapshot?) { if (!committed) busy = false }
                        }, false)
                    }, colors = ButtonDefaults.buttonColors(containerColor = Rose), modifier = Modifier.fillMaxWidth()) { Text("Finish your turn") }
                    else if (cards.isNotEmpty() && isTurn && state?.get("completed") == true) Text("Waiting for your partner to finish their round…", color = Color(0xFF8B7180))
                }
            }
        }
    }
}

@Composable
private fun NativeMusicScreen(user: FirebaseUser, onBack: () -> Unit) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val profile = partnerProfiles.firstOrNull { it.email.equals(user.email.orEmpty(), true) }
    val db = remember { FirebaseFirestore.getInstance() }
    val itemsRef = remember { db.collection("couples").document("our-little-world").collection("items") }
    val musicRef = remember { FirebaseDatabase.getInstance().getReference("couples/our-little-world/music") }
    val sessionRef = remember { musicRef.child("session") }
    val queueRef = remember { musicRef.child("queue") }
    var session by remember { mutableStateOf<Map<String, Any?>>(emptyMap()) }
    var queue by remember { mutableStateOf<Map<String, Map<String, Any?>>>(emptyMap()) }
    var library by remember { mutableStateOf<List<Map<String, Any?>>>(emptyList()) }
    var mediaPlayer by remember { mutableStateOf<MediaPlayer?>(null) }
    var loadedFileId by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var uploading by remember { mutableStateOf(false) }
    var saving by remember { mutableStateOf(false) }
    var prepared by remember { mutableStateOf(false) }
    var playbackError by remember { mutableStateOf(false) }
    var playbackRetry by remember { mutableIntStateOf(0) }
    var requestedListen by remember { mutableStateOf(false) }
    var positionMs by remember { mutableLongStateOf(0L) }
    var durationMs by remember { mutableLongStateOf(0L) }
    var localVolume by rememberSaveable { mutableFloatStateOf(1f) }
    var statusText by remember { mutableStateOf("Choose a saved song or upload audio to our shared player.") }
    val scope = rememberCoroutineScope()
    val latestQueue by rememberUpdatedState(queue)
    val filePicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            uploading = true
            try {
                val mime = context.contentResolver.getType(uri) ?: "audio/mpeg"
                if (!mime.startsWith("audio/")) error("Choose an audio file. Video-to-audio conversion is not available in this native build yet.")
                val length = runCatching { context.contentResolver.openAssetFileDescriptor(uri, "r")?.use { it.length } ?: -1L }.getOrDefault(-1L)
                if (length > 50L * 1024L * 1024L) error("Choose an audio file smaller than 50 MB.")
                val name = context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor -> if (cursor.moveToFirst()) cursor.getString(0) else null } ?: "Our song"
                val uploaded = uploadTelegramMedia(context, user, uri, name, profile?.name ?: "Partner", mime, "New Music Track 🎵")
                val now = System.currentTimeMillis()
                val track = mapOf<String, Any?>("url" to null, "path" to null, "telegramFileId" to uploaded["telegramFileId"], "telegramFileUniqueId" to uploaded["telegramFileUniqueId"], "mimeType" to (uploaded["telegramMimeType"] ?: mime), "telegramMessageId" to uploaded["telegramMessageId"], "telegramChatId" to uploaded["telegramChatId"], "name" to name, "saved" to false, "addedBy" to user.uid, "addedByName" to (profile?.name ?: "Partner"), "addedAt" to now, "time" to 0, "playing" to false, "status" to "ready")
                var previousTrack: Map<*, *>? = null
                var shouldQueue = false
                sessionRef.runTransaction(object : com.google.firebase.database.Transaction.Handler {
                    override fun doTransaction(data: com.google.firebase.database.MutableData): com.google.firebase.database.Transaction.Result {
                        val current = data.value as? Map<*, *>
                        if (current != null && current["ownerUid"] != null && current["ended"] != true) { shouldQueue = true; return com.google.firebase.database.Transaction.abort() }
                        previousTrack = current
                        data.value = track + mapOf("ownerUid" to user.uid, "ownerName" to (profile?.name ?: "Partner"), "status" to "ready", "playing" to false, "ended" to false, "time" to 0, "startedAt" to now, "updatedAt" to now, "lastActionUid" to user.uid, "lastActionName" to (profile?.name ?: "Partner"))
                        return com.google.firebase.database.Transaction.success(data)
                    }
                    override fun onComplete(error: DatabaseError?, committed: Boolean, snapshot: DataSnapshot?) {
                        scope.launch {
                            if (error != null) { statusText = error.message; return@launch }
                            if (committed) {
                                previousTrack?.let { old -> if (old["saved"] != true) runCatching { deleteTelegramMediaIfReferenced(user, old) } }
                                statusText = "Uploaded. Tap Play when you're ready ♫"
                            } else if (shouldQueue) {
                                val key = queueRef.push().key ?: error("Could not create a music queue entry.")
                                queueRef.child(key).setValue(track).await()
                                statusText = "Uploaded and added to the shared queue ♫"
                            } else statusText = "The music session changed before the upload could be placed."
                        }
                    }
                }, false)
            } catch (e: Exception) { statusText = e.message ?: "The song could not be uploaded." }
            finally { uploading = false }
        }
    }
    DisposableEffect(user.uid) {
        val sessionListener = object : ValueEventListener {
            override fun onDataChange(snapshot: DataSnapshot) {
                val incoming = (snapshot.value as? Map<*, *>)?.entries?.associate { it.key.toString() to it.value }.orEmpty()
                val targetMs = (((incoming["time"] as? Number)?.toDouble() ?: 0.0) * 1000).toLong()
                if (prepared && mediaPlayer != null && kotlin.math.abs(mediaPlayer?.currentPosition?.toLong()?.minus(targetMs) ?: 0L) > 2500L) runCatching { mediaPlayer?.seekTo(targetMs.coerceIn(0L, durationMs).toInt()) }
                session = incoming
                statusText = when {
                    incoming.isEmpty() -> "Choose a saved song or upload audio to our shared player."
                    incoming["status"] == "uploading" -> "${incoming["ownerName"] ?: "Your partner"} is uploading a song…"
                    incoming["ended"] == true -> "Song finished. Replay it, save it, or choose another song."
                    incoming["playing"] == true && !requestedListen -> "Playing · tap Listen to hear it on this device."
                    incoming["playing"] == true -> "Playing · controlled by ${incoming["ownerName"] ?: "your partner"}"
                    else -> "Ready · controlled by ${incoming["ownerName"] ?: "your partner"}"
                }
            }
            override fun onCancelled(error: DatabaseError) { statusText = "Shared music session could not be loaded." }
        }
        val queueListener = object : ValueEventListener {
            override fun onDataChange(snapshot: DataSnapshot) {
                queue = (snapshot.value as? Map<*, *>)?.entries?.associate { entry -> entry.key.toString() to ((entry.value as? Map<*, *>)?.entries?.associate { it.key.toString() to it.value }.orEmpty()) }.orEmpty()
            }
            override fun onCancelled(error: DatabaseError) { statusText = "Music queue could not be loaded." }
        }
        val libraryListener = itemsRef.whereEqualTo("type", "musicTrack").addSnapshotListener { snapshot, _ -> library = snapshot?.documents.orEmpty().map { mapOf("id" to it.id) + it.data.orEmpty() }.sortedByDescending { (it["savedAtMs"] as? Number)?.toLong() ?: 0L } }
        sessionRef.addValueEventListener(sessionListener); queueRef.addValueEventListener(queueListener)
        onDispose { sessionRef.removeEventListener(sessionListener); queueRef.removeEventListener(queueListener); libraryListener.remove() }
    }
    val currentFileId = session["telegramFileId"] as? String ?: ""
    val isPlaying = session["playing"] == true
    val ownerUid = session["ownerUid"] as? String
    val sessionStartedAt = (session["startedAt"] as? Number)?.toLong() ?: 0L
    val latestSession by rememberUpdatedState(session)
    val latestOwnerUid by rememberUpdatedState(ownerUid)
    val latestSessionStartedAt by rememberUpdatedState(sessionStartedAt)
    LaunchedEffect(currentFileId, playbackRetry) {
        requestedListen = false; prepared = false; playbackError = false; loading = currentFileId.isNotBlank(); positionMs = 0L; durationMs = 0L
        mediaPlayer?.release(); mediaPlayer = null; loadedFileId = ""
        if (currentFileId.isBlank()) { statusText = "Choose a saved song or upload audio to our shared player."; return@LaunchedEffect }
        try {
            statusText = "Loading the song from Telegram…"
            val file = loadTelegramMediaFile(context, user, currentFileId, session["mimeType"] as? String) ?: error("The audio file could not be downloaded.")
            val created = MediaPlayer()
            created.setVolume(localVolume, localVolume)
            created.setDataSource(file.absolutePath)
            created.setOnPreparedListener { mp ->
                prepared = true; loading = false; durationMs = mp.duration.toLong().coerceAtLeast(0L)
                positionMs = (((session["time"] as? Number)?.toDouble() ?: 0.0) * 1000).toLong().coerceIn(0L, durationMs)
                runCatching { mp.seekTo(positionMs.toInt()) }
                if (requestedListen && session["playing"] == true) runCatching { mp.start(); statusText = "Playing · controlled by ${session["ownerName"] ?: "your partner"}" }
                else if (session["playing"] == true) statusText = "Ready · tap Listen to hear this song here."
                else statusText = "Ready · tap Play to listen ♫"
            }
            created.setOnCompletionListener {
                scope.launch {
                    if (latestOwnerUid != user.uid || latestSessionStartedAt <= 0L) {
                        requestedListen = false
                        statusText = "Song ended on this device; waiting for the shared player."
                        return@launch
                    }
                    val next = latestQueue.entries.sortedWith(compareBy({ (it.value["addedAt"] as? Number)?.toLong() ?: 0L }, { it.key }))
                        .firstOrNull { !(it.value["telegramFileId"] as? String).isNullOrBlank() }
                    val previous = latestSession
                    val nextStartedAt = System.currentTimeMillis()
                    sessionRef.runTransaction(object : com.google.firebase.database.Transaction.Handler {
                        override fun doTransaction(data: com.google.firebase.database.MutableData): com.google.firebase.database.Transaction.Result {
                            val current = data.value as? Map<*, *> ?: return com.google.firebase.database.Transaction.abort()
                            if ((current["startedAt"] as? Number)?.toLong() != latestSessionStartedAt || current["ownerUid"] != user.uid || current["ended"] == true) return com.google.firebase.database.Transaction.abort()
                            data.value = if (next == null) {
                                current.entries.associate { it.key.toString() to it.value } + mapOf("playing" to false, "ended" to true, "time" to 0, "updatedAt" to nextStartedAt)
                            } else {
                                next.value + mapOf("ownerUid" to user.uid, "ownerName" to (profile?.name ?: "Partner"), "status" to "ready", "playing" to true, "ended" to false, "time" to 0, "startedAt" to nextStartedAt, "updatedAt" to nextStartedAt, "lastActionUid" to user.uid, "lastActionName" to (profile?.name ?: "Partner"))
                            }
                            return com.google.firebase.database.Transaction.success(data)
                        }
                        override fun onComplete(error: DatabaseError?, committed: Boolean, snapshot: DataSnapshot?) {
                            if (error == null && committed) {
                                if (next == null) {
                                    requestedListen = false
                                    statusText = "Song finished. Replay it, save it, or choose another song."
                                } else {
                                    queueRef.child(next.key).removeValue()
                                    requestedListen = true
                                    statusText = "Playing next song ♫"
                                    if (previous["saved"] != true) scope.launch { runCatching { deleteTelegramMediaIfReferenced(user, previous) } }
                                }
                            } else {
                                requestedListen = false
                                statusText = "Playback changed elsewhere; the queue was not advanced."
                            }
                        }
                    }, false)
                }
            }
            created.setOnErrorListener { _, _, _ -> statusText = "This audio format could not be played."; loading = false; playbackError = true; true }
            mediaPlayer = created; loadedFileId = currentFileId; created.prepareAsync()
        } catch (_: Exception) { loading = false; playbackError = true; statusText = "The song could not be loaded. Check your connection and retry." }
    }
    DisposableEffect(mediaPlayer) { val active = mediaPlayer; onDispose { runCatching { active?.release() } } }
    LaunchedEffect(mediaPlayer, isPlaying, ownerUid, sessionStartedAt, requestedListen) {
        val mp = mediaPlayer ?: return@LaunchedEffect
        if (!isPlaying) { requestedListen = false; runCatching { if (mp.isPlaying) mp.pause() } }
        else if (requestedListen && prepared && !mp.isPlaying) runCatching { mp.start() }
        while (true) {
            if (prepared) {
                positionMs = runCatching { mp.currentPosition.toLong() }.getOrDefault(positionMs)
                if (isPlaying && ownerUid == user.uid && sessionStartedAt > 0) {
                    sessionRef.updateChildren(mapOf("time" to positionMs / 1000.0)).addOnFailureListener { }
                }
            }
            delay(4000)
        }
    }
    LaunchedEffect(localVolume, mediaPlayer) { runCatching { mediaPlayer?.setVolume(localVolume, localVolume) } }

    fun writePlayback(values: Map<String, Any?>, success: String) {
        sessionRef.runTransaction(object : com.google.firebase.database.Transaction.Handler {
            override fun doTransaction(data: com.google.firebase.database.MutableData): com.google.firebase.database.Transaction.Result {
                val current = data.value as? Map<*, *> ?: return com.google.firebase.database.Transaction.abort()
                if ((current["startedAt"] as? Number)?.toLong() != sessionStartedAt) return com.google.firebase.database.Transaction.abort()
                data.value = current.entries.associate { it.key.toString() to it.value }.toMutableMap().apply {
                    putAll(values); put("updatedAt", System.currentTimeMillis()); put("lastActionUid", user.uid); put("lastActionName", profile?.name ?: "Partner")
                }
                return com.google.firebase.database.Transaction.success(data)
            }
            override fun onComplete(error: DatabaseError?, committed: Boolean, snapshot: DataSnapshot?) { statusText = if (error == null && committed) success else "Playback changed elsewhere; refresh and try again." }
        }, false)
    }
    fun saveCurrent() {
        if (currentFileId.isBlank() || session["saved"] == true || saving) return
        saving = true
        val data = mapOf("type" to "musicTrack", "telegramFileId" to currentFileId, "telegramFileUniqueId" to session["telegramFileUniqueId"], "mimeType" to (session["mimeType"] ?: "audio/mpeg"), "telegramMessageId" to session["telegramMessageId"], "telegramChatId" to session["telegramChatId"], "name" to (session["name"] ?: "Our song"), "savedBy" to user.uid, "savedAtMs" to System.currentTimeMillis(), "author" to user.uid)
        val expectedStartedAt = sessionStartedAt
        scope.launch {
            var doc: com.google.firebase.firestore.DocumentReference? = null
            try {
                doc = itemsRef.add(data).await()
                val savedDoc = doc
                val update = kotlinx.coroutines.CompletableDeferred<Boolean>()
                sessionRef.runTransaction(object : com.google.firebase.database.Transaction.Handler {
                    override fun doTransaction(data: com.google.firebase.database.MutableData): com.google.firebase.database.Transaction.Result {
                        val current = data.value as? Map<*, *> ?: return com.google.firebase.database.Transaction.abort()
                        if ((current["startedAt"] as? Number)?.toLong() != expectedStartedAt || current["telegramFileId"] != currentFileId) return com.google.firebase.database.Transaction.abort()
                        data.child("saved").value = true; data.child("libraryId").value = savedDoc.id; data.child("updatedAt").value = System.currentTimeMillis()
                        return com.google.firebase.database.Transaction.success(data)
                    }
                    override fun onComplete(error: DatabaseError?, committed: Boolean, snapshot: DataSnapshot?) { if (!update.isCompleted) update.complete(error == null && committed) }
                }, false)
                if (!update.await()) error("The music session ended before the song could be saved.")
                statusText = "Saved to our music ♫"
                runCatching { notifyPostPartner(profile, "music", "${profile?.name ?: "Your partner"} saved a song to your music.", savedDoc.id, "home") }
            } catch (_: Exception) {
                doc?.let { runCatching { it.delete().await() } }
                statusText = "This song could not be saved."
            } finally { saving = false }
        }
    }
    fun startSaved(track: Map<String, Any?>) {
        val now = System.currentTimeMillis()
        val info = track.filterKeys { it in listOf("telegramFileId", "telegramFileUniqueId", "mimeType", "telegramMessageId", "telegramChatId", "name") }
        sessionRef.runTransaction(object : com.google.firebase.database.Transaction.Handler {
            override fun doTransaction(data: com.google.firebase.database.MutableData): com.google.firebase.database.Transaction.Result {
                val current = data.value as? Map<*, *>
                if (current?.get("ownerUid") != null && current["ended"] != true) return com.google.firebase.database.Transaction.abort()
                data.value = info + mapOf("ownerUid" to user.uid, "ownerName" to (profile?.name ?: "Partner"), "status" to "ready", "saved" to true, "playing" to false, "ended" to false, "time" to 0, "startedAt" to now, "updatedAt" to now, "lastActionUid" to user.uid, "lastActionName" to (profile?.name ?: "Partner"))
                return com.google.firebase.database.Transaction.success(data)
            }
            override fun onComplete(error: DatabaseError?, committed: Boolean, snapshot: DataSnapshot?) { statusText = if (error == null && committed) "Ready · tap Play to listen ♫" else "The shared player is already in use." }
        }, false)
    }
    fun stopSong() {
        val old = session
        sessionRef.runTransaction(object : com.google.firebase.database.Transaction.Handler {
            override fun doTransaction(data: com.google.firebase.database.MutableData): com.google.firebase.database.Transaction.Result {
                val current = data.value as? Map<*, *> ?: return com.google.firebase.database.Transaction.abort()
                if ((current["startedAt"] as? Number)?.toLong() != sessionStartedAt) return com.google.firebase.database.Transaction.abort()
                data.value = null
                return com.google.firebase.database.Transaction.success(data)
            }
            override fun onComplete(error: DatabaseError?, committed: Boolean, snapshot: DataSnapshot?) {
                if (error == null && committed) {
                    requestedListen = false; mediaPlayer?.pause(); statusText = "Song stopped. Choose another song."
                    if (old["saved"] != true) scope.launch { runCatching { deleteTelegramMediaIfReferenced(user, old) } }
                } else statusText = "The music session changed before it could stop."
            }
        }, false)
    }

    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) { TextButton(onClick = onBack) { Text("‹ Home", color = Rose) }; Text("Our Music ♫", color = Ink, fontSize = 22.sp, fontWeight = FontWeight.Bold) }
        Card(Modifier.fillMaxWidth().padding(top = 10.dp), colors = CardDefaults.cardColors(containerColor = Color.White), border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFF3D5E1))) {
            Column(Modifier.fillMaxWidth().padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Text(session["name"] as? String ?: "No song selected", color = Ink, fontWeight = FontWeight.Bold, fontSize = 18.sp, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                Text(statusText, color = Color(0xFF8B7180), fontSize = 12.sp, modifier = Modifier.padding(vertical = 8.dp), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                if (playbackError && currentFileId.isNotBlank()) TextButton(onClick = { playbackRetry++ }) { Text("Retry loading song", color = Rose) }
                androidx.compose.material3.Slider(value = if (durationMs > 0) (positionMs.toFloat() / durationMs).coerceIn(0f, 1f) else 0f, onValueChange = { fraction ->
                    positionMs = (durationMs * fraction).toLong(); runCatching { if (prepared) mediaPlayer?.seekTo(positionMs.toInt()) }
                }, onValueChangeFinished = { writePlayback(mapOf("time" to positionMs / 1000.0), "Position synced") }, enabled = prepared && durationMs > 0)
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) { Text(java.text.SimpleDateFormat("m:ss", Locale.getDefault()).format(java.util.Date(positionMs)), color = Color.Gray, fontSize = 11.sp); Text(java.text.SimpleDateFormat("m:ss", Locale.getDefault()).format(java.util.Date(durationMs)), color = Color.Gray, fontSize = 11.sp) }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly, verticalAlignment = Alignment.CenterVertically) {
                    Button(enabled = currentFileId.isNotBlank() && !uploading, onClick = {
                        if (session["playing"] == true) { requestedListen = true; runCatching { mediaPlayer?.start() }; statusText = "Listening on this device." }
                        else { requestedListen = true; writePlayback(mapOf("playing" to true, "ended" to false, "time" to positionMs / 1000.0, "startedAt" to System.currentTimeMillis(), "status" to "ready"), "Playing ♫"); runCatching { if (prepared) mediaPlayer?.start() } }
                    }, colors = ButtonDefaults.buttonColors(containerColor = Rose)) { Text(if (isPlaying) "Listen" else "Play") }
                    OutlinedButton(enabled = isPlaying, onClick = { requestedListen = false; runCatching { mediaPlayer?.pause() }; writePlayback(mapOf("playing" to false, "time" to positionMs / 1000.0), "Paused") }) { Text("Pause", color = Rose) }
                    OutlinedButton(enabled = currentFileId.isNotBlank(), onClick = { requestedListen = true; writePlayback(mapOf("playing" to true, "ended" to false, "time" to 0, "startedAt" to System.currentTimeMillis()), "Replaying ♫"); runCatching { mediaPlayer?.seekTo(0); if (prepared) mediaPlayer?.start() } }) { Text("Replay", color = Rose) }
                }
                if (session["ownerUid"] != null) Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
                    TextButton(enabled = session["saved"] != true && !saving, onClick = ::saveCurrent) { Text(if (saving) "Saving…" else "Save ♡", color = Rose) }
                    TextButton(onClick = ::stopSong) { Text("Stop song", color = Color(0xFFB94062)) }
                }
                Text("This device's volume", color = Color(0xFF8B7180), fontSize = 11.sp)
                androidx.compose.material3.Slider(value = localVolume, onValueChange = { localVolume = it }, modifier = Modifier.fillMaxWidth())
                TextButton(enabled = !uploading, onClick = { filePicker.launch("audio/*") }) { Text(if (uploading) "Uploading…" else "+ Upload audio") }
            }
        }
        Text("Saved music", color = Ink, fontSize = 18.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 14.dp, bottom = 5.dp))
        LazyColumn(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(7.dp)) {
            items(library, key = { it["id"] as String }) { track ->
                Card(colors = CardDefaults.cardColors(containerColor = Color.White), border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFF3D5E1))) {
                    Row(Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(track["name"] as? String ?: "Our song", color = Ink, modifier = Modifier.weight(1f), maxLines = 1)
                        TextButton(enabled = ownerUid == null || session["ended"] == true, onClick = { startSaved(track) }) { Text("Play", color = Rose) }
                        TextButton(enabled = track["telegramFileId"] != currentFileId, onClick = {
                            scope.launch { try { itemsRef.document(track["id"] as String).delete().await(); deleteTelegramMediaIfReferenced(user, track); statusText = "Removed from saved music." } catch (_: Exception) { statusText = "Could not remove this saved song." } }
                        }) { Text("×", color = Color(0xFFB94062), fontSize = 18.sp) }
                    }
                }
            }
        }
        Text("Up next", color = Ink, fontSize = 18.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 8.dp, bottom = 4.dp))
        LazyColumn(Modifier.heightIn(max = 150.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            items(queue.entries.sortedWith(compareBy({ (it.value["addedAt"] as? Number)?.toLong() ?: 0L }, { it.key })), key = { it.key }) { entry ->
                Row(Modifier.fillMaxWidth().background(Color.White, RoundedCornerShape(12.dp)).padding(horizontal = 10.dp, vertical = 5.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(entry.value["name"] as? String ?: "Queued song", color = Ink, modifier = Modifier.weight(1f), maxLines = 1)
                    TextButton(onClick = {
                        val next = entry.value
                        var previous: Map<*, *>? = null
                        sessionRef.runTransaction(object : com.google.firebase.database.Transaction.Handler {
                            override fun doTransaction(data: com.google.firebase.database.MutableData): com.google.firebase.database.Transaction.Result {
                                val current = data.value as? Map<*, *>
                                if (current?.get("status") == "uploading") return com.google.firebase.database.Transaction.abort()
                                previous = current
                                val now = System.currentTimeMillis()
                                data.value = next + mapOf("ownerUid" to user.uid, "ownerName" to (profile?.name ?: "Partner"), "status" to "ready", "playing" to true, "ended" to false, "time" to 0, "startedAt" to now, "updatedAt" to now, "lastActionUid" to user.uid, "lastActionName" to (profile?.name ?: "Partner"))
                                return com.google.firebase.database.Transaction.success(data)
                            }
                            override fun onComplete(error: DatabaseError?, committed: Boolean, snapshot: DataSnapshot?) {
                                if (error == null && committed) {
                                    queueRef.child(entry.key).removeValue(); requestedListen = true; statusText = "Playing next song ♫"
                                    previous?.let { old -> if (old["saved"] != true) scope.launch { runCatching { deleteTelegramMediaIfReferenced(user, old) } } }
                                } else statusText = "Queued song could not replace the current upload."
                            }
                        }, false)
                    }) { Text("Play now", color = Rose) }
                    TextButton(onClick = { queueRef.child(entry.key).removeValue() }) { Text("×", color = Color(0xFFB94062)) }
                }
            }
        }
    }
}

@Composable
private fun NativeSosGameScreen(user: FirebaseUser, onBack: () -> Unit) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val profile = partnerProfiles.firstOrNull { it.email.equals(user.email.orEmpty(), true) }
    val reference = remember { FirebaseDatabase.getInstance().getReference("couples/our-little-world/games/sos") }
    var room by remember { mutableStateOf<Map<String, Any?>>(emptyMap()) }
    var letter by rememberSaveable { mutableStateOf("S") }
    var busy by remember { mutableStateOf(false) }
    var recordedMatchId by rememberSaveable { mutableStateOf("") }
    val scope = rememberCoroutineScope()
    DisposableEffect(user.uid) {
        val listener = object : ValueEventListener {
            override fun onDataChange(snapshot: DataSnapshot) { room = (snapshot.value as? Map<*, *>)?.entries?.associate { it.key.toString() to it.value }.orEmpty() }
            override fun onCancelled(error: DatabaseError) { Toast.makeText(context, "SOS match could not be loaded.", Toast.LENGTH_SHORT).show() }
        }
        reference.addValueEventListener(listener)
        onDispose { reference.removeEventListener(listener) }
    }
    val ids = (room["playerUids"] as? List<*>)?.filterIsInstance<String>().orEmpty()
    val board = (room["board"] as? List<*>)?.map { it as? String ?: "" }?.take(100) ?: emptyList()
    val scores = room["scores"] as? Map<*, *> ?: emptyMap<Any, Any>()
    val players = room["players"] as? Map<*, *> ?: emptyMap<Any, Any>()
    val turnUid = room["turnUid"] as? String
    val status = room["status"] as? String
    val isTurn = status == "playing" && turnUid == user.uid
    val scopeId = room["matchId"] as? String ?: ""

    fun startOrJoin() {
        busy = true
        reference.runTransaction(object : com.google.firebase.database.Transaction.Handler {
            override fun doTransaction(data: com.google.firebase.database.MutableData): com.google.firebase.database.Transaction.Result {
                val current = data.value as? Map<*, *>
                val currentStatus = current?.get("status") as? String
                val currentIds = (current?.get("playerUids") as? List<*>)?.filterIsInstance<String>().orEmpty()
                if (currentStatus == "waiting" && currentIds.size == 1 && user.uid !in currentIds) {
                    val first = currentIds.first()
                    val currentPlayers = current["players"] as? Map<*, *> ?: emptyMap<Any, Any>()
                    val nextPlayers = currentPlayers.entries.associate { it.key.toString() to it.value }.toMutableMap()
                    nextPlayers[user.uid] = mapOf("name" to (profile?.name ?: "Player"))
                    val currentScores = current["scores"] as? Map<*, *> ?: emptyMap<Any, Any>()
                    val nextScores = currentScores.entries.associate { it.key.toString() to it.value }.toMutableMap()
                    nextScores[user.uid] = 0
                    data.value = current.entries.associate { it.key.toString() to it.value }.toMutableMap().apply {
                        put("playerUids", listOf(first, user.uid)); put("players", nextPlayers); put("scores", nextScores); put("status", "playing")
                        put("turnUid", if (System.currentTimeMillis() % 2L == 0L) first else user.uid); put("turnDeadline", System.currentTimeMillis() + 20_000L); put("turnNumber", 1); put("updatedAt", System.currentTimeMillis())
                    }
                    return com.google.firebase.database.Transaction.success(data)
                }
                if (currentStatus == "waiting" && user.uid in currentIds) return com.google.firebase.database.Transaction.abort()
                if (currentStatus == "playing") return com.google.firebase.database.Transaction.abort()
                data.value = mapOf("matchId" to "${System.currentTimeMillis()}-${user.uid}", "status" to "waiting", "playerUids" to listOf(user.uid), "players" to mapOf(user.uid to mapOf("name" to (profile?.name ?: "Player"))), "board" to List(100) { "" }, "owners" to List(100) { "" }, "scores" to mapOf(user.uid to 0), "timeoutCounts" to emptyMap<String, Int>(), "lines" to emptyList<Any>(), "turnUid" to "", "turnDeadline" to 0L, "turnNumber" to 0, "createdAt" to System.currentTimeMillis(), "updatedAt" to System.currentTimeMillis())
                return com.google.firebase.database.Transaction.success(data)
            }
            override fun onComplete(error: DatabaseError?, committed: Boolean, snapshot: DataSnapshot?) {
                busy = false
                if (error != null) Toast.makeText(context, "Could not reach the SOS game room.", Toast.LENGTH_SHORT).show()
                else if (!committed && status == "waiting" && user.uid in ids) Toast.makeText(context, "Waiting for your partner to join this match.", Toast.LENGTH_SHORT).show()
            }
        }, false)
    }

    fun playMove(index: Int) {
        if (!isTurn || busy || board.getOrElse(index) { "" }.isNotEmpty()) return
        busy = true
        reference.runTransaction(object : com.google.firebase.database.Transaction.Handler {
            override fun doTransaction(data: com.google.firebase.database.MutableData): com.google.firebase.database.Transaction.Result {
                val current = data.value as? Map<*, *> ?: return com.google.firebase.database.Transaction.abort()
                val currentBoard = (current["board"] as? List<*>)?.map { it as? String ?: "" }?.toMutableList() ?: return com.google.firebase.database.Transaction.abort()
                val currentIds = (current["playerUids"] as? List<*>)?.filterIsInstance<String>().orEmpty()
                if (current["status"] != "playing" || current["turnUid"] != user.uid || index !in currentBoard.indices || currentBoard[index].isNotEmpty()) return com.google.firebase.database.Transaction.abort()
                currentBoard[index] = letter
                val oldLines = (current["lines"] as? List<*>)?.filterIsInstance<Map<*, *>>().orEmpty()
                val known = oldLines.mapNotNull { (it["cells"] as? List<*>)?.joinToString("-") { n -> n.toString() } }.toMutableSet()
                val newLines = mutableListOf<Map<String, Any>>()
                val row = index / 10; val col = index % 10
                listOf(0 to 1, 1 to 0, 1 to 1, 1 to -1).forEach { (dr, dc) ->
                    for (offset in -2..0) {
                        val cells = (0..2).map { step -> Pair(row + dr * (offset + step), col + dc * (offset + step)) }
                        if (cells.any { it.first !in 0..9 || it.second !in 0..9 }) continue
                        val indexes = cells.map { it.first * 10 + it.second }
                        val key = indexes.joinToString("-")
                        if (indexes.map { currentBoard[it] }.joinToString("") == "SOS" && known.add(key)) newLines += mapOf("cells" to indexes, "uid" to user.uid)
                    }
                }
                val currentScores = current["scores"] as? Map<*, *> ?: emptyMap<Any, Any>()
                val nextScores = currentScores.entries.associate { it.key.toString() to ((it.value as? Number)?.toInt() ?: 0) }.toMutableMap()
                nextScores[user.uid] = (nextScores[user.uid] ?: 0) + newLines.size
                val lines = oldLines.map { it.entries.associate { e -> e.key.toString() to e.value } } + newLines
                val opponent = currentIds.firstOrNull { it != user.uid }.orEmpty()
                val complete = currentBoard.all { it.isNotEmpty() }
                val winner = when { !complete -> null; nextScores[user.uid] == nextScores[opponent] -> ""; (nextScores[user.uid] ?: 0) > (nextScores[opponent] ?: 0) -> user.uid; else -> opponent }
                data.value = current.entries.associate { it.key.toString() to it.value }.toMutableMap().apply {
                    put("board", currentBoard); put("owners", currentBoard.mapIndexed { i, _ -> if (i == index) user.uid else ((current["owners"] as? List<*>)?.getOrNull(i) as? String ?: "") })
                    put("lastMove", index); put("scores", nextScores); put("lines", lines); put("status", if (complete) "finished" else "playing")
                    put("turnUid", if (complete) "" else if (newLines.isNotEmpty()) user.uid else opponent); put("turnNumber", ((current["turnNumber"] as? Number)?.toInt() ?: 0) + 1)
                    put("turnDeadline", if (complete) 0L else System.currentTimeMillis() + 20_000L); put("updatedAt", System.currentTimeMillis())
                    if (winner != null) put("winnerUid", winner)
                }
                return com.google.firebase.database.Transaction.success(data)
            }
            override fun onComplete(error: DatabaseError?, committed: Boolean, snapshot: DataSnapshot?) {
                busy = false
                if (error != null) Toast.makeText(context, "Could not save that SOS move.", Toast.LENGTH_SHORT).show()
                else if (!committed) Toast.makeText(context, "That square changed or it is your partner's turn.", Toast.LENGTH_SHORT).show()
            }
        }, false)
    }

    LaunchedEffect(scopeId, status) {
        if (status != "finished" || scopeId.isBlank() || scopeId == recordedMatchId || user.uid !in ids) return@LaunchedEffect
        recordedMatchId = scopeId
        runCatching {
            val winner = room["winnerUid"] as? String ?: ""
            FirebaseFirestore.getInstance().collection("couples").document("our-little-world").collection("items").document("sos-$scopeId")
                .set(mapOf("type" to "game", "game" to "SOS", "result" to if (winner.isBlank()) "draw" else "won", "winnerUid" to winner, "players" to ids, "scores" to scores.entries.associate { it.key.toString() to it.value }, "matchId" to scopeId, "author" to user.uid, "authorId" to (profile?.key ?: user.uid), "createdAt" to FieldValue.serverTimestamp()), com.google.firebase.firestore.SetOptions.merge()).await()
            if (winner == user.uid) notifyPostPartner(profile, "game", "${profile?.name ?: "Your partner"} won a game of SOS!", scopeId, "games")
        }
    }

    Column(Modifier.fillMaxSize().padding(horizontal = 10.dp, vertical = 4.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) { TextButton(onClick = onBack) { Text("‹ Games", color = Rose) }; Text("SOS", color = Ink, fontSize = 21.sp, fontWeight = FontWeight.Bold) }
        val outcome = when (status) {
            "waiting" -> if (ids.firstOrNull() == user.uid) "Waiting for your partner to join…" else "Your partner is waiting. Join the match!"
            "playing" -> if (isTurn) "Your turn · choose S or O" else "Partner's turn · ${scores[turnUid]?.toString() ?: "0"} points"
            "finished" -> if ((room["winnerUid"] as? String).isNullOrBlank()) "It's a tie ♡" else if (room["winnerUid"] == user.uid) "You won! 🎉" else "Your partner won this match."
            "cancelled" -> "This match was cancelled."
            else -> "Make SOS lines. Complete a line to keep your turn."
        }
        Text(outcome, color = Ink, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(vertical = 8.dp))
        if (ids.isNotEmpty()) Text(ids.joinToString("   ·   ") { uid -> "${(players[uid] as? Map<*, *>)?.get("name") ?: "Player"}: ${scores[uid] ?: 0}" }, color = Rose, fontSize = 12.sp)
        if (status == "playing" && isTurn) Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.padding(6.dp)) { listOf("S", "O").forEach { choice -> OutlinedButton(onClick = { letter = choice }, border = androidx.compose.foundation.BorderStroke(1.dp, if (letter == choice) Rose else Color.LightGray)) { Text(choice, color = if (letter == choice) Rose else Ink, fontWeight = FontWeight.Bold) } } }
        if (board.size == 100 && status == "playing") Column(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            board.chunked(10).forEachIndexed { r, row -> Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                row.forEachIndexed { c, value ->
                    val index = r * 10 + c
                    Card(Modifier.weight(1f).height(31.dp).clickable(enabled = isTurn && !busy && value.isEmpty()) { playMove(index) }, colors = CardDefaults.cardColors(containerColor = if (value.isEmpty()) Color.White else Color(0xFFFFEEF5)), border = androidx.compose.foundation.BorderStroke(0.5.dp, Color(0xFFF0D5E0))) {
                        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text(value, color = if (value == "S") Rose else Color(0xFF9B4270), fontSize = 12.sp, fontWeight = FontWeight.Bold) }
                    }
                }
            } }
        }
        if (status != "playing") Button(enabled = !busy, onClick = ::startOrJoin, colors = ButtonDefaults.buttonColors(containerColor = Rose), modifier = Modifier.padding(top = 12.dp)) { Text(if (status == "finished") "Play again" else if (status == "waiting" && user.uid !in ids) "Join match" else "Start / Join match") }
    }
}

@Composable
private fun NativeTrueFalseScreen(user: FirebaseUser, onBack: () -> Unit) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val profile = partnerProfiles.firstOrNull { it.email.equals(user.email.orEmpty(), true) }
    val localBank = remember {
        runCatching {
            val json = context.assets.open("true_false_question_bank.json").bufferedReader().use { org.json.JSONObject(it.readText()) }
            val array = json.getJSONArray("questions")
            (0 until array.length()).map { index ->
                val obj = array.getJSONObject(index)
                mapOf("id" to obj.getString("id"), "factId" to obj.getInt("factId"), "category" to obj.getString("category"), "statement" to obj.getString("statement"), "answer" to obj.getBoolean("answer"), "explanation" to obj.getString("explanation"), "sourceTitle" to obj.getString("sourceTitle"), "sourceUrl" to obj.getString("sourceUrl"))
            }
        }.getOrDefault(emptyList())
    }
    val gamesRef = remember { FirebaseDatabase.getInstance().getReference("couples/our-little-world/games") }
    val bankRef = remember { gamesRef.child("questionBanks/trueFalse") }
    val roomRef = remember { gamesRef.child("matches/true-false") }
    var room by remember { mutableStateOf<Map<String, Any?>>(emptyMap()) }
    var bankReady by remember { mutableStateOf(false) }
    var bankError by remember { mutableStateOf(false) }
    var bankRetry by remember { mutableIntStateOf(0) }
    var busy by remember { mutableStateOf(false) }
    var recordedMatchId by rememberSaveable { mutableStateOf("") }
    val scope = rememberCoroutineScope()
    LaunchedEffect(localBank.size, bankRetry) {
        if (localBank.isEmpty()) { bankError = true; return@LaunchedEffect }
        bankReady = true
        try {
            val snapshot = kotlinx.coroutines.withTimeout(8_000) { bankRef.get().await() }
            val current = snapshot.value as? Map<*, *>
            val count = (current?.get("questionCount") as? Number)?.toInt()
            val existingQuestions = current?.get("questions") as? List<*>
            val bankValid = current?.get("version") == 2 && count == localBank.size && existingQuestions?.size == localBank.size && existingQuestions.all { item ->
                val q = item as? Map<*, *>
                q?.get("id") is String && q["statement"] is String && q["answer"] is Boolean && q["explanation"] is String && q["sourceUrl"] is String
            }
            if (!bankValid) {
                bankRef.runTransaction(object : com.google.firebase.database.Transaction.Handler {
                    override fun doTransaction(data: com.google.firebase.database.MutableData): com.google.firebase.database.Transaction.Result {
                        val existing = data.value as? Map<*, *>
                        val existingCount = (existing?.get("questionCount") as? Number)?.toInt()
                        val existingArray = existing?.get("questions") as? List<*>
                        val valid = existing?.get("version") == 2 && existingCount == localBank.size && existingArray?.size == localBank.size && existingArray.all { item ->
                            val q = item as? Map<*, *>
                            q?.get("id") is String && q["statement"] is String && q["answer"] is Boolean && q["explanation"] is String && q["sourceUrl"] is String
                        }
                        if (valid) return com.google.firebase.database.Transaction.success(data)
                        data.value = mapOf("version" to 2, "questionCount" to localBank.size, "seededAt" to System.currentTimeMillis(), "questions" to localBank)
                        return com.google.firebase.database.Transaction.success(data)
                    }
                    override fun onComplete(error: DatabaseError?, committed: Boolean, snapshot: DataSnapshot?) {
                        bankError = error != null || !committed
                    }
                }, false)
            } else bankError = false
        } catch (_: Exception) { bankError = true }
    }
    DisposableEffect(user.uid) {
        val listener = object : ValueEventListener {
            override fun onDataChange(snapshot: DataSnapshot) { room = (snapshot.value as? Map<*, *>)?.entries?.associate { it.key.toString() to it.value }.orEmpty() }
            override fun onCancelled(error: DatabaseError) { Toast.makeText(context, "True or False match could not be loaded.", Toast.LENGTH_SHORT).show() }
        }
        roomRef.addValueEventListener(listener)
        onDispose { roomRef.removeEventListener(listener) }
    }
    val ids = (room["playerUids"] as? List<*>)?.filterIsInstance<String>().orEmpty()
    val players = room["players"] as? Map<*, *> ?: emptyMap<Any, Any>()
    val answers = room["trueFalseAnswers"] as? Map<*, *> ?: emptyMap<Any, Any>()
    val status = room["status"] as? String
    val phase = room["trueFalsePhase"] as? String ?: "answering"
    val index = (room["trueFalseQuestionIndex"] as? Number)?.toInt() ?: 0
    val questions = room["trueFalseQuestions"] as? List<*> ?: emptyList<Any>()
    val question = questions.getOrNull(index) as? Map<*, *>
    val myAnswer = answers[user.uid] as? Boolean
    val partnerUid = ids.firstOrNull { it != user.uid }
    val partnerAnswered = partnerUid != null && answers.containsKey(partnerUid)
    val matchId = room["matchId"] as? String ?: ""

    fun startOrJoin() {
        if (!bankReady) { Toast.makeText(context, "Question bank is still loading.", Toast.LENGTH_SHORT).show(); return }
        busy = true
        val picked = localBank.groupBy { it["factId"] }.values.shuffled().take(12).mapNotNull { variants -> variants.randomOrNull() }
        roomRef.runTransaction(object : com.google.firebase.database.Transaction.Handler {
            override fun doTransaction(data: com.google.firebase.database.MutableData): com.google.firebase.database.Transaction.Result {
                val current = data.value as? Map<*, *>
                val currentStatus = current?.get("status") as? String
                val currentIds = (current?.get("playerUids") as? List<*>)?.filterIsInstance<String>().orEmpty()
                if (currentStatus == "waiting" && user.uid !in currentIds) {
                    val currentPlayers = current["players"] as? Map<*, *> ?: emptyMap<Any, Any>()
                    val nextPlayers = currentPlayers.entries.associate { it.key.toString() to it.value }.toMutableMap()
                    nextPlayers[user.uid] = mapOf("name" to (profile?.name ?: "Player"), "score" to 0, "completed" to false, "state" to null)
                    data.value = current.entries.associate { it.key.toString() to it.value }.toMutableMap().apply { put("playerUids", currentIds + user.uid); put("players", nextPlayers); put("status", "playing"); put("turnUid", currentIds.firstOrNull().orEmpty()); put("updatedAt", System.currentTimeMillis()) }
                    return com.google.firebase.database.Transaction.success(data)
                }
                if (currentStatus == "waiting" || currentStatus == "playing") return com.google.firebase.database.Transaction.abort()
                data.value = mapOf("matchId" to "${System.currentTimeMillis()}-${user.uid}", "game" to "true-false", "status" to "waiting", "playerUids" to listOf(user.uid), "turnUid" to "", "winnerUid" to "", "trueFalseQuestions" to picked, "trueFalseQuestionIndex" to 0, "trueFalseAnswers" to emptyMap<String, Boolean>(), "trueFalsePhase" to "answering", "emojiDecoderQuestions" to emptyList<Any>(), "emojiDecoderQuestionIndex" to 0, "emojiDecoderLastAnswer" to "", "emojiDecoderLastCorrect" to false, "emojiDecoderLastGuesserUid" to "", "players" to mapOf(user.uid to mapOf("name" to (profile?.name ?: "Player"), "score" to 0, "completed" to false, "state" to null)), "createdAt" to System.currentTimeMillis(), "updatedAt" to System.currentTimeMillis())
                return com.google.firebase.database.Transaction.success(data)
            }
            override fun onComplete(error: DatabaseError?, committed: Boolean, snapshot: DataSnapshot?) {
                busy = false
                if (error != null) Toast.makeText(context, "Could not start or join this match.", Toast.LENGTH_SHORT).show()
                else if (!committed) Toast.makeText(context, "This match is already waiting for your partner or in progress.", Toast.LENGTH_SHORT).show()
            }
        }, false)
    }

    fun answer(value: Boolean) {
        if (busy || status != "playing" || phase != "answering" || answers.containsKey(user.uid) || question == null) return
        busy = true
        roomRef.runTransaction(object : com.google.firebase.database.Transaction.Handler {
            override fun doTransaction(data: com.google.firebase.database.MutableData): com.google.firebase.database.Transaction.Result {
                val current = data.value as? Map<*, *> ?: return com.google.firebase.database.Transaction.abort()
                if (current["status"] != "playing" || current["trueFalsePhase"] != "answering" || (current["trueFalseQuestionIndex"] as? Number)?.toInt() != index) return com.google.firebase.database.Transaction.abort()
                val currentIds = (current["playerUids"] as? List<*>)?.filterIsInstance<String>().orEmpty()
                if (user.uid !in currentIds) return com.google.firebase.database.Transaction.abort()
                val currentAnswers = current["trueFalseAnswers"] as? Map<*, *> ?: emptyMap<Any, Any>()
                if (currentAnswers.containsKey(user.uid)) return com.google.firebase.database.Transaction.abort()
                val nextAnswers = currentAnswers.entries.associate { it.key.toString() to it.value }.toMutableMap()
                nextAnswers[user.uid] = value
                val bothAnswered = currentIds.all { nextAnswers.containsKey(it) }
                val currentPlayers = current["players"] as? Map<*, *> ?: emptyMap<Any, Any>()
                val nextPlayers = currentPlayers.entries.associate { entry ->
                    val uid = entry.key.toString(); val player = (entry.value as? Map<*, *>)?.entries?.associate { it.key.toString() to it.value }?.toMutableMap() ?: mutableMapOf()
                    if (bothAnswered) {
                        val currentQuestion = (current["trueFalseQuestions"] as? List<*>)?.getOrNull(index) as? Map<*, *>
                        if (nextAnswers[uid] == currentQuestion?.get("answer")) player["score"] = ((player["score"] as? Number)?.toInt() ?: 0) + 1
                    }
                    uid to player
                }.toMutableMap()
                data.value = current.entries.associate { it.key.toString() to it.value }.toMutableMap().apply { put("trueFalseAnswers", nextAnswers); put("trueFalsePhase", if (bothAnswered) "reveal" else "answering"); put("players", nextPlayers); put("updatedAt", System.currentTimeMillis()) }
                return com.google.firebase.database.Transaction.success(data)
            }
            override fun onComplete(error: DatabaseError?, committed: Boolean, snapshot: DataSnapshot?) { busy = false; if (error != null || !committed) Toast.makeText(context, "Your answer could not be saved.", Toast.LENGTH_SHORT).show() }
        }, false)
    }

    fun nextFact() {
        busy = true
        roomRef.runTransaction(object : com.google.firebase.database.Transaction.Handler {
            override fun doTransaction(data: com.google.firebase.database.MutableData): com.google.firebase.database.Transaction.Result {
                val current = data.value as? Map<*, *> ?: return com.google.firebase.database.Transaction.abort()
                if (current["status"] != "playing" || current["trueFalsePhase"] != "reveal") return com.google.firebase.database.Transaction.abort()
                val currentIndex = (current["trueFalseQuestionIndex"] as? Number)?.toInt() ?: 0
                val currentQuestions = current["trueFalseQuestions"] as? List<*> ?: return com.google.firebase.database.Transaction.abort()
                val final = currentIndex >= currentQuestions.lastIndex
                val currentPlayers = current["players"] as? Map<*, *> ?: emptyMap<Any, Any>()
                val scoreByUid = currentPlayers.mapValues { ((it.value as? Map<*, *>)?.get("score") as? Number)?.toInt() ?: 0 }
                val winner = when { !final -> current["winnerUid"]; scoreByUid.values.distinct().size < 2 -> ""; (scoreByUid[user.uid] ?: 0) > (scoreByUid[partnerUid] ?: 0) -> user.uid; else -> partnerUid }
                data.value = current.entries.associate { it.key.toString() to it.value }.toMutableMap().apply {
                    put("status", if (final) "finished" else "playing"); put("trueFalsePhase", if (final) "finished" else "answering"); put("trueFalseQuestionIndex", if (final) currentIndex else currentIndex + 1); put("trueFalseAnswers", emptyMap<String, Boolean>()); put("updatedAt", System.currentTimeMillis())
                    if (final) { put("turnUid", ""); put("winnerUid", winner ?: "") }
                }
                return com.google.firebase.database.Transaction.success(data)
            }
            override fun onComplete(error: DatabaseError?, committed: Boolean, snapshot: DataSnapshot?) { busy = false; if (error != null || !committed) Toast.makeText(context, "Could not continue to the next fact.", Toast.LENGTH_SHORT).show() }
        }, false)
    }

    fun cancelWaiting() {
        roomRef.runTransaction(object : com.google.firebase.database.Transaction.Handler {
            override fun doTransaction(data: com.google.firebase.database.MutableData): com.google.firebase.database.Transaction.Result {
                val current = data.value as? Map<*, *> ?: return com.google.firebase.database.Transaction.abort()
                if (current["status"] != "waiting" || (current["playerUids"] as? List<*>)?.firstOrNull() != user.uid) return com.google.firebase.database.Transaction.abort()
                data.child("status").value = "cancelled"; data.child("updatedAt").value = System.currentTimeMillis()
                return com.google.firebase.database.Transaction.success(data)
            }
            override fun onComplete(error: DatabaseError?, committed: Boolean, snapshot: DataSnapshot?) { if (error != null || !committed) Toast.makeText(context, "The waiting match could not be cancelled.", Toast.LENGTH_SHORT).show() }
        }, false)
    }

    LaunchedEffect(matchId, status) {
        if (status != "finished" || matchId.isBlank() || matchId == recordedMatchId || user.uid !in ids) return@LaunchedEffect
        recordedMatchId = matchId
        val winner = room["winnerUid"] as? String ?: ""
        runCatching {
            FirebaseFirestore.getInstance().collection("couples").document("our-little-world").collection("items").document("truefalse-$matchId")
                .set(mapOf("type" to "game", "game" to "True or False", "result" to if (winner.isBlank()) "draw" else "won", "winnerUid" to winner, "players" to ids, "scores" to players.entries.associate { it.key.toString() to ((it.value as? Map<*, *>)?.get("score") ?: 0) }, "matchId" to matchId, "author" to user.uid, "authorId" to (profile?.key ?: user.uid), "createdAt" to FieldValue.serverTimestamp()), com.google.firebase.firestore.SetOptions.merge()).await()
            if (winner == user.uid) notifyPostPartner(profile, "game", "${profile?.name ?: "Your partner"} won True or False!", matchId, "games")
        }
    }

    Column(Modifier.fillMaxSize().padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) { TextButton(onClick = onBack) { Text("‹ Games", color = Rose) }; Text("True or False", color = Ink, fontSize = 21.sp, fontWeight = FontWeight.Bold) }
        if (bankError && bankReady) TextButton(onClick = { bankError = false; bankRetry++ }) { Text("Question bank sync is pending · Retry", color = Rose, fontSize = 11.sp) }
        when {
            bankError && !bankReady -> Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.weight(1f), verticalArrangement = Arrangement.Center) { Text("The question bank could not be loaded.", color = Ink); TextButton(onClick = { bankError = false; bankRetry++ }) { Text("Try again", color = Rose) } }
            !bankReady -> Box(Modifier.weight(1f), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Rose) }
            status == "waiting" -> Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                Text(if (ids.firstOrNull() == user.uid) "Your question pack is ready. Waiting for your partner…" else "Your partner is ready to play. Join the match!", color = Ink)
                Text("Answer separately. The answer appears after both of you submit.", color = Color(0xFF8B7180), modifier = Modifier.padding(top = 8.dp))
                if (user.uid !in ids) Button(enabled = !busy, onClick = ::startOrJoin, colors = ButtonDefaults.buttonColors(containerColor = Rose), modifier = Modifier.padding(top = 12.dp)) { Text("Join match") }
                else TextButton(onClick = ::cancelWaiting) { Text("Cancel match", color = Rose) }
            }
            status == "playing" && question != null -> {
                if (user.uid !in ids) {
                    Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) { Text("This match is already in progress with your partner.", color = Color(0xFF8B7180), textAlign = androidx.compose.ui.text.style.TextAlign.Center) }
                } else {
                val myPlayer = players[user.uid] as? Map<*, *>
                val partnerPlayer = partnerUid?.let { players[it] as? Map<*, *> }
                Text("${myPlayer?.get("name") ?: "You"}: ${myPlayer?.get("score") ?: 0}    ·    ${partnerPlayer?.get("name") ?: "Partner"}: ${partnerPlayer?.get("score") ?: 0}", color = Rose, fontSize = 12.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(vertical = 10.dp))
                Text("${question["category"] ?: "Fact"}  ·  FACT ${index + 1} / ${questions.size}", color = Color(0xFF9B4270), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                Text(question["statement"] as? String ?: "", color = Ink, fontSize = 21.sp, fontWeight = FontWeight.SemiBold, textAlign = androidx.compose.ui.text.style.TextAlign.Center, modifier = Modifier.padding(vertical = 22.dp))
                if (phase == "reveal") {
                    Text("Correct answer: ${if (question["answer"] == true) "True" else "False"}", color = Rose, fontWeight = FontWeight.Bold)
                    ids.forEach { uid -> Text("${(players[uid] as? Map<*, *>)?.get("name") ?: "Player"} answered ${if (answers[uid] == true) "True" else "False"}${if (answers[uid] == question["answer"]) " · +1" else ""}", color = Color(0xFF715B66), modifier = Modifier.padding(top = 4.dp)) }
                    Text(question["explanation"] as? String ?: "", color = Ink, textAlign = androidx.compose.ui.text.style.TextAlign.Center, modifier = Modifier.padding(top = 14.dp))
                    Text(question["sourceTitle"] as? String ?: "", color = Color(0xFF8B7180), fontSize = 11.sp, modifier = Modifier.padding(top = 7.dp))
                    Button(enabled = !busy, onClick = ::nextFact, colors = ButtonDefaults.buttonColors(containerColor = Rose), modifier = Modifier.padding(top = 18.dp)) { Text(if (index == questions.lastIndex) "See our final score" else "Next fact →") }
                } else if (myAnswer == null) {
                    Row(horizontalArrangement = Arrangement.spacedBy(18.dp), modifier = Modifier.padding(vertical = 14.dp)) {
                        Button(enabled = !busy, onClick = { answer(true) }, colors = ButtonDefaults.buttonColors(containerColor = Rose)) { Text("✓  True") }
                        Button(enabled = !busy, onClick = { answer(false) }, colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF9A7181))) { Text("✕  False") }
                    }
                } else Text(if (partnerAnswered) "Both answers are in — revealing…" else "Your answer is locked. Waiting for your partner…", color = Color(0xFF8B7180), modifier = Modifier.padding(top = 18.dp))
                }
            }
            status == "finished" -> {
                val winner = room["winnerUid"] as? String ?: ""
                val myScore = (players[user.uid] as? Map<*, *>)?.get("score") as? Number ?: 0
                val otherScore = partnerUid?.let { (players[it] as? Map<*, *>)?.get("score") as? Number } ?: 0
                Text(if (winner.isBlank()) "It's a tie ♡" else if (winner == user.uid) "You won this round! 🎉" else "Your partner won this round!", color = Ink, fontSize = 22.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 28.dp))
                Text("$myScore  —  $otherScore", color = Rose, fontSize = 20.sp, modifier = Modifier.padding(12.dp))
                Button(enabled = !busy, onClick = ::startOrJoin, colors = ButtonDefaults.buttonColors(containerColor = Rose)) { Text("Play again") }
            }
            else -> {
                Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) { Text("Make a guess, learn a new fact, and compare your points.", color = Color(0xFF8B7180), textAlign = androidx.compose.ui.text.style.TextAlign.Center) }
                if (bankReady) Button(enabled = !busy, onClick = ::startOrJoin, colors = ButtonDefaults.buttonColors(containerColor = Rose)) { Text(if (status == "cancelled") "Start a new match" else "Start a match") }
            }
        }
    }
}

@Composable
private fun NativeBucketScreen(user: FirebaseUser, onBack: () -> Unit) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val profile = partnerProfiles.firstOrNull { it.email.equals(user.email.orEmpty(), true) }
    val root = remember { FirebaseFirestore.getInstance().collection("couples").document("our-little-world").collection("items") }
    var items by remember { mutableStateOf<List<Map<String, Any?>>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var loadError by remember { mutableStateOf("") }
    var fromCache by remember { mutableStateOf(false) }
    var retryToken by remember { mutableIntStateOf(0) }
    var filter by rememberSaveable { mutableStateOf("All") }
    var editing by remember { mutableStateOf<Map<String, Any?>?>(null) }
    var title by rememberSaveable { mutableStateOf("") }
    var dateStr by rememberSaveable { mutableStateOf("") }
    var status by rememberSaveable { mutableStateOf("Upcoming") }
    var saving by remember { mutableStateOf(false) }
    var dialogOpen by remember { mutableStateOf(false) }
    var confirmBucketDelete by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    DisposableEffect(user.uid, retryToken) {
        loading = true
        loadError = ""
        val listener = root.whereEqualTo("type", "bucket").orderBy("createdAt", Query.Direction.DESCENDING).addSnapshotListener(MetadataChanges.INCLUDE) { snapshot, error ->
            if (error != null) {
                loadError = "Could not load the bucket list. Check your connection and retry."
                loading = false
            } else if (snapshot != null) {
                items = snapshot.documents.map { mapOf("id" to it.id) + it.data.orEmpty() }
                fromCache = snapshot.metadata.isFromCache
                loadError = ""
                loading = false
            }
        }
        onDispose { listener.remove() }
    }
    val filtered = items.filter { filter == "All" || (it["status"] as? String ?: if (it["done"] == true) "Completed" else "Upcoming") == filter }
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 5.dp), verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = onBack) { Text("‹ More", color = Rose) }
            Text("Our Bucket List", color = Ink, fontSize = 20.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.weight(1f))
            TextButton(onClick = { editing = null; title = ""; dateStr = LocalDate.now().year.toString(); status = "Upcoming"; dialogOpen = true }) { Text("+ New Dream", color = Rose) }
        }
        Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp), horizontalArrangement = Arrangement.SpaceEvenly) {
            listOf("All", "Upcoming", "In Progress", "Completed").forEach { tab -> TextButton(onClick = { filter = tab }) { Text(tab, color = if (filter == tab) Rose else Color(0xFF8B7180), fontWeight = if (filter == tab) FontWeight.Bold else FontWeight.Normal, fontSize = 11.sp) } }
        }
        if (fromCache && loadError.isBlank()) Text("Offline · showing saved bucket list", color = Color(0xFF8B7180), fontSize = 12.sp, modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp))
        if (loadError.isNotBlank()) Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
            Text(loadError, color = Color(0xFF8B7180), textAlign = androidx.compose.ui.text.style.TextAlign.Center, modifier = Modifier.padding(horizontal = 24.dp))
            TextButton(onClick = { retryToken++ }) { Text("Retry", color = Rose) }
        }
        else if (loading && items.isEmpty()) Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Rose) }
        else if (filtered.isEmpty()) Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text("No dreams here yet. Add something you want to do together ♡", color = Color(0xFF8B7180)) }
        else LazyColumn(Modifier.fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(filtered, key = { it["id"] as String }) { item ->
                val itemStatus = item["status"] as? String ?: if (item["done"] == true) "Completed" else "Upcoming"
                Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = Color.White), border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFF3D5E1))) {
                    Row(Modifier.fillMaxWidth().clickable {
                        editing = item; title = item["title"] as? String ?: ""; dateStr = item["dateStr"] as? String ?: LocalDate.now().year.toString(); status = itemStatus; dialogOpen = true
                    }.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(if (itemStatus == "Completed") "✅" else "🎯", fontSize = 22.sp)
                        Column(Modifier.weight(1f).padding(start = 12.dp)) { Text(item["title"] as? String ?: "A dream together", color = Ink, fontWeight = FontWeight.Bold); Text(item["dateStr"] as? String ?: "", color = Color(0xFF9B7888), fontSize = 12.sp) }
                        Text(itemStatus, color = if (itemStatus == "Completed") Color(0xFF24824C) else Rose, fontSize = 11.sp)
                    }
                }
            }
        }
    }
    if (dialogOpen) {
        AlertDialog(onDismissRequest = { dialogOpen = false; editing = null; title = "" }, title = { Text(if (editing == null) "Add to Bucket List" else "Edit Dream") }, text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(title, { title = it }, label = { Text("Dream title") }, singleLine = true)
                OutlinedTextField(dateStr, { dateStr = it }, label = { Text("Target date / year") }, singleLine = true)
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) { listOf("Upcoming", "In Progress", "Completed").forEach { value -> TextButton(onClick = { status = value }) { Text(value, fontSize = 10.sp, color = if (status == value) Rose else Color.Gray) } } }
            }
        }, confirmButton = {
            TextButton(enabled = !saving && title.isNotBlank(), onClick = {
                saving = true
                val payload = mapOf("title" to title.trim(), "dateStr" to (dateStr.trim().ifBlank { LocalDate.now().year.toString() }), "status" to status, "done" to (status == "Completed"))
                val id = editing?.get("id") as? String
                val task = if (id == null) root.add(payload + mapOf("type" to "bucket", "author" to user.uid, "createdAt" to FieldValue.serverTimestamp(), "clientCreatedAt" to System.currentTimeMillis())) else root.document(id).set(payload, com.google.firebase.firestore.SetOptions.merge())
                task.addOnSuccessListener { reference ->
                    if (id == null) (reference as? com.google.firebase.firestore.DocumentReference)?.id?.let { newId -> scope.launch { runCatching { notifyPostPartner(profile, "bucket", "${profile?.name ?: "Your partner"} added a bucket-list dream.", newId, "bucket") } } }
                    else if ((editing?.get("status") as? String) != status) scope.launch { runCatching { notifyPostPartner(profile, "bucket", "${profile?.name ?: "Your partner"} ${if (status == "Completed") "completed" else "updated"} a bucket-list dream.", "$id-$status-${System.currentTimeMillis()}", "bucket") } }
                    editing = null; title = ""; dialogOpen = false; saving = false
                }.addOnFailureListener { saving = false; Toast.makeText(context, "Could not save this dream.", Toast.LENGTH_SHORT).show() }
            }) { Text(if (saving) "Saving…" else "Save") }
        }, dismissButton = {
            Row {
                if (editing != null) TextButton(onClick = {
                    val id = editing?.get("id") as? String ?: return@TextButton
                    confirmBucketDelete = true
                }) { Text("Delete", color = Color(0xFFB94062)) }
                TextButton(onClick = { editing = null; title = ""; dialogOpen = false }) { Text("Cancel") }
            }
        })
    }
    if (confirmBucketDelete) AlertDialog(
        onDismissRequest = { confirmBucketDelete = false },
        title = { Text("Delete this dream?") },
        text = { Text("This will remove the shared bucket-list item.") },
        confirmButton = { TextButton(enabled = !saving, onClick = {
            val id = editing?.get("id") as? String ?: return@TextButton
            saving = true
            root.document(id).delete().addOnSuccessListener {
                confirmBucketDelete = false; editing = null; title = ""; dialogOpen = false; saving = false
            }.addOnFailureListener {
                saving = false
                Toast.makeText(context, "Could not delete this dream. Please retry.", Toast.LENGTH_SHORT).show()
            }
        }) { Text("Delete", color = Color(0xFFB94062)) } },
        dismissButton = { TextButton(onClick = { confirmBucketDelete = false }) { Text("Cancel", color = Rose) } }
    )
}

@Composable
private fun NativeSpecialDaysScreen(user: FirebaseUser, onBack: () -> Unit) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val profile = partnerProfiles.firstOrNull { it.email.equals(user.email.orEmpty(), true) }
    val root = remember { FirebaseFirestore.getInstance().collection("couples").document("our-little-world").collection("items") }
    var days by remember { mutableStateOf<List<Map<String, Any?>>>(emptyList()) }
    var editing by remember { mutableStateOf<Map<String, Any?>?>(null) }
    var title by rememberSaveable { mutableStateOf("") }
    var category by rememberSaveable { mutableStateOf("Birthday") }
    var date by rememberSaveable { mutableStateOf("") }
    var recurring by rememberSaveable { mutableStateOf(true) }
    var saving by remember { mutableStateOf(false) }
    var dialogOpen by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }
    var loading by remember { mutableStateOf(true) }
    var loadError by remember { mutableStateOf("") }
    var fromCache by remember { mutableStateOf(false) }
    var retryKey by remember { mutableIntStateOf(0) }
    val scope = rememberCoroutineScope()
    var today by remember { mutableStateOf(LocalDate.now(ZoneId.of("Asia/Dubai"))) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(30_000)
            today = LocalDate.now(ZoneId.of("Asia/Dubai"))
        }
    }
    DisposableEffect(user.uid, retryKey) {
        loading = true
        loadError = ""
        val listener = root.whereEqualTo("type", "specialDay").orderBy("createdAt", Query.Direction.DESCENDING).addSnapshotListener(MetadataChanges.INCLUDE) { snapshot, error ->
            if (error != null) {
                loadError = "Could not load special days. Check your connection and retry."
                loading = false
            } else if (snapshot != null) {
                days = snapshot.documents.map { mapOf("id" to it.id) + it.data.orEmpty() }
                fromCache = snapshot.metadata.isFromCache
                loadError = ""
                loading = false
            }
        }
        onDispose { listener.remove() }
    }
    val sorted = days.mapNotNull { item ->
        val original = runCatching { LocalDate.parse(item["date"] as? String ?: "") }.getOrNull() ?: return@mapNotNull null
        val repeat = item["recurring"] == true
        val occurrence = if (!repeat) original else (today.year..(today.year + 8)).firstNotNullOfOrNull { year -> runCatching { LocalDate.of(year, original.month, original.dayOfMonth) }.getOrNull()?.takeIf { !it.isBefore(today) } }
        occurrence?.let { Triple(item, java.time.temporal.ChronoUnit.DAYS.between(today, it), it) }
    }.sortedWith { a, b ->
        when {
            (a.second < 0) != (b.second < 0) -> if (a.second < 0) 1 else -1
            else -> a.second.compareTo(b.second)
        }
    }
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 5.dp), verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = onBack) { Text("‹ More", color = Rose) }
            Text("Special Days ♡", color = Ink, fontSize = 20.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.weight(1f))
            TextButton(onClick = { editing = null; title = ""; category = "Birthday"; date = ""; recurring = true; dialogOpen = true }) { Text("+ Add day", color = Rose) }
        }
        if (fromCache && loadError.isBlank()) Text("Offline · showing saved special days", color = Color(0xFF8B7180), fontSize = 12.sp, modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp))
        if (loadError.isNotBlank() && days.isEmpty()) Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
            Text(loadError, color = Color(0xFF8B7180), textAlign = androidx.compose.ui.text.style.TextAlign.Center, modifier = Modifier.padding(horizontal = 24.dp))
            TextButton(onClick = { retryKey++ }) { Text("Retry", color = Rose) }
        }
        else if (loading && days.isEmpty()) Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Rose) }
        else if (sorted.isEmpty()) Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text("No special days saved yet. Add a birthday or anniversary ♡", color = Color(0xFF8B7180)) }
        else LazyColumn(Modifier.fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
            if (loadError.isNotBlank()) item { Row(verticalAlignment = Alignment.CenterVertically) { Text(loadError, color = Color(0xFF8B7180), modifier = Modifier.weight(1f)); TextButton(onClick = { retryKey++ }) { Text("Retry", color = Rose) } } }
            items(sorted, key = { it.first["id"] as String }) { (item, daysLeft, nextDate) ->
                Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = Color.White), border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFF3D5E1))) {
                    Row(Modifier.fillMaxWidth().clickable {
                        editing = item; title = item["title"] as? String ?: ""; category = item["category"] as? String ?: "Birthday"; date = item["date"] as? String ?: ""; recurring = item["recurring"] == true; dialogOpen = true
                    }.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(when (item["category"] as? String) { "Birthday" -> "🎂"; "Anniversary" -> "💞"; "Celebration" -> "🎉"; else -> "📅" }, fontSize = 22.sp)
                        Column(Modifier.weight(1f).padding(start = 12.dp)) { Text(item["title"] as? String ?: "Special day", color = Ink, fontWeight = FontWeight.Bold); Text("${item["category"] ?: "Other"} · ${nextDate?.format(DateTimeFormatter.ofPattern("d MMMM yyyy", Locale.ENGLISH)) ?: ""}${if (item["recurring"] == true) " · Every year" else ""}", color = Color(0xFF9B7888), fontSize = 11.sp) }
                        Text(if (daysLeft == 0L) "Today" else if (daysLeft > 0) "$daysLeft days" else "${-daysLeft} days ago", color = Rose, fontSize = 11.sp)
                    }
                }
            }
        }
    }
    if (dialogOpen) AlertDialog(onDismissRequest = { editing = null; title = ""; dialogOpen = false }, title = { Text(if (editing == null) "Add a special day" else "Edit special day") }, text = {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(title, { title = it.take(80) }, label = { Text("Name") }, singleLine = true)
            Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) { listOf("Birthday", "Anniversary", "Celebration", "Other").forEach { value -> TextButton(onClick = { category = value }) { Text(value, fontSize = 9.sp, color = if (value == category) Rose else Color.Gray) } } }
            OutlinedTextField(date, { date = it }, label = { Text("Date (YYYY-MM-DD)") }, singleLine = true)
            Row(verticalAlignment = Alignment.CenterVertically) { androidx.compose.material3.Checkbox(checked = recurring, onCheckedChange = { recurring = it }); Text("Repeat every year") }
        }
    }, confirmButton = { TextButton(enabled = title.isNotBlank() && !saving && runCatching { LocalDate.parse(date) }.isSuccess, onClick = {
        saving = true
        val payload = mapOf("title" to title.trim(), "category" to category, "date" to date, "recurring" to recurring)
        val id = editing?.get("id") as? String
        val task = if (id == null) root.add(payload + mapOf("type" to "specialDay", "author" to user.uid, "createdAt" to FieldValue.serverTimestamp(), "clientCreatedAt" to System.currentTimeMillis())) else root.document(id).set(payload, com.google.firebase.firestore.SetOptions.merge())
        task.addOnSuccessListener { reference ->
            val sourceId = if (id == null) (reference as? com.google.firebase.firestore.DocumentReference)?.id.orEmpty() else "$id-updated-${System.currentTimeMillis()}"
            scope.launch { runCatching { notifyPostPartner(profile, "specialDay", "${profile?.name ?: "Your partner"} ${if (id == null) "added" else "updated"} a special day.", sourceId, "more") } }
            editing = null; title = ""; dialogOpen = false; saving = false
        }.addOnFailureListener { saving = false; Toast.makeText(context, "Could not save this day.", Toast.LENGTH_SHORT).show() }
    }) { Text(if (saving) "Saving…" else "Save day") } }, dismissButton = { Row {
        if (editing != null) TextButton(onClick = {
            confirmDelete = true
        }) { Text("Delete", color = Color(0xFFB94062)) }
        TextButton(onClick = { editing = null; title = ""; dialogOpen = false }) { Text("Cancel") }
    } })
    if (confirmDelete) AlertDialog(
        onDismissRequest = { confirmDelete = false },
        title = { Text("Delete this special day?") },
        text = { Text("This day will be removed for both of you.") },
        confirmButton = { TextButton(enabled = !saving, onClick = {
            val id = editing?.get("id") as? String ?: return@TextButton
            saving = true
            root.document(id).delete().addOnSuccessListener {
                confirmDelete = false; editing = null; title = ""; dialogOpen = false; saving = false
            }.addOnFailureListener {
                saving = false
                Toast.makeText(context, "Could not delete this day. Please retry.", Toast.LENGTH_SHORT).show()
            }
        }) { Text("Delete", color = Color(0xFFB94062)) } },
        dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text("Cancel", color = Rose) } }
    )
}

@Composable
private fun NativeQuestionScreen(user: FirebaseUser, onBack: () -> Unit) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val profile = partnerProfiles.firstOrNull { it.email.equals(user.email.orEmpty(), true) }
    val ownKey = profile?.key ?: "kebyy"
    val partnerKey = if (ownKey == "kebyy") "shazy" else "kebyy"
    val todayKey = LocalDate.now(ZoneId.of("Asia/Dubai")).toString()
    val firestore = remember { FirebaseFirestore.getInstance() }
    val dailyRef = remember(todayKey) { firestore.collection("coupleDailyQuestions").document("our-little-world").collection("days").document(todayKey) }
    var question by remember { mutableStateOf<Map<String, Any>?>(null) }
    var participants by remember { mutableStateOf<Map<String, Map<String, Any>>>(emptyMap()) }
    var ownAnswer by remember { mutableStateOf<String?>(null) }
    var partnerAnswer by remember { mutableStateOf<String?>(null) }
    var draft by rememberSaveable { mutableStateOf("") }
    var editDraft by rememberSaveable { mutableStateOf("") }
    var history by remember { mutableStateOf<List<Map<String, Any>>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var saving by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    var retryKey by remember { mutableIntStateOf(0) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(todayKey, retryKey) {
        loading = true; error = ""
        try {
            val bankRef = firestore.collection("coupleQuestionBank").document("our-little-world").collection("questions")
            val metaRef = firestore.collection("coupleQuestionBank").document("our-little-world").collection("meta").document("v1")
            if (!metaRef.get().await().exists()) {
                val batch = firestore.batch()
                var count = 0
                nativeQuestionBank.forEach { category ->
                    category.questions.forEachIndexed { index, pair ->
                        batch.set(bankRef.document(pair.first), mapOf("categoryId" to category.id, "category" to "${category.emoji} ${category.label}", "question" to pair.second, "position" to index + 1))
                        count++
                    }
                }
                batch.set(metaRef, mapOf("version" to "v1", "questionCount" to count, "seededAt" to FieldValue.serverTimestamp()))
                batch.commit().await()
            }
            if (!dailyRef.get().await().exists()) {
                val epochDay = LocalDate.parse(todayKey).toEpochDay()
                val categoryIndex = Math.floorMod(epochDay, nativeQuestionBank.size.toLong()).toInt()
                val category = nativeQuestionBank[categoryIndex]
                val dayIndex = Math.floorDiv(epochDay, nativeQuestionBank.size.toLong())
                val pair = category.questions[Math.floorMod(dayIndex, category.questions.size.toLong()).toInt()]
                val record = mapOf("id" to pair.first, "categoryId" to category.id, "category" to "${category.emoji} ${category.label}", "question" to pair.second, "dayKey" to todayKey, "createdAt" to FieldValue.serverTimestamp())
                firestore.runTransaction { transaction ->
                    if (!transaction.get(dailyRef).exists()) transaction.set(dailyRef, record)
                }.await()
            }
            question = dailyRef.get().await().data
            val migrationFailures = try { migrateNativeLegacyQuestionAnswers(context, user, ownKey) }
            catch (_: Exception) { 1 }
            if (migrationFailures > 0) Toast.makeText(context, "Some older question answers could not be moved yet. They will be retried next time.", Toast.LENGTH_LONG).show()
            val historySnapshot = firestore.collection("coupleDailyQuestions").document("our-little-world").collection("days").orderBy("dayKey", Query.Direction.DESCENDING).limit(90).get().await()
            history = historySnapshot.documents.mapNotNull { doc -> doc.data?.plus("id" to doc.id) }
        } catch (exception: Exception) {
            error = "Today's Question could not be loaded. Check your connection and try again."
        } finally { loading = false }
    }

    DisposableEffect(todayKey) {
        val participantsRef = dailyRef.collection("participants")
        val questionListener = dailyRef.addSnapshotListener { snapshot, _ -> if (snapshot?.exists() == true) question = snapshot.data }
        val participantListener = participantsRef.addSnapshotListener { snapshot, _ ->
            participants = snapshot?.documents.orEmpty().associate { doc -> doc.id to doc.data.orEmpty() }
        }
        onDispose { questionListener.remove(); participantListener.remove() }
    }

    LaunchedEffect(participants[ownKey], participants[partnerKey], todayKey) {
        val ownExists = participants.containsKey(ownKey)
        val both = ownExists && participants.containsKey(partnerKey)
        ownAnswer = if (ownExists) runCatching { dailyRef.collection("answers").document(ownKey).get().await().getString("answer") }.getOrNull() else null
        partnerAnswer = if (both) runCatching { dailyRef.collection("answers").document(partnerKey).get().await().getString("answer") }.getOrNull() else null
    }

    val answeredByMe = participants.containsKey(ownKey)
    val bothAnswered = answeredByMe && participants.containsKey(partnerKey)
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 5.dp), verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = onBack) { Text("‹ Home", color = Rose) }
            Text("Today's Question", color = Ink, fontSize = 20.sp, fontWeight = FontWeight.Bold)
        }
        if (loading) Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Rose) }
        else if (error.isNotBlank()) Column(Modifier.weight(1f).fillMaxWidth(), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
            Text(error, color = Color(0xFF815D6D), modifier = Modifier.padding(20.dp))
            TextButton(onClick = { retryKey++; loading = true; error = "" }) { Text("Try again") }
        }
        else LazyColumn(Modifier.weight(1f), contentPadding = androidx.compose.foundation.layout.PaddingValues(14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            item {
                Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = Color.White), border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFF3D5E1))) {
                    Column(Modifier.padding(18.dp)) {
                        Text(question?.get("category") as? String ?: "💗 About Us", color = Rose, fontWeight = FontWeight.Bold)
                        Text(question?.get("question") as? String ?: "", color = Color(0xFF60283F), fontSize = 20.sp, fontWeight = FontWeight.Bold, lineHeight = 29.sp, modifier = Modifier.padding(top = 12.dp))
                        if (!answeredByMe) {
                            OutlinedTextField(draft, { if (it.length <= 1200) draft = it }, modifier = Modifier.fillMaxWidth().padding(top = 12.dp), minLines = 3, label = { Text("Your private answer") })
                            Button(enabled = draft.isNotBlank() && !saving, onClick = {
                                saving = true
                                val answerRef = dailyRef.collection("answers").document(ownKey)
                                val participantRef = dailyRef.collection("participants").document(ownKey)
                                firestore.runTransaction { transaction ->
                                    if (transaction.get(answerRef).exists()) throw IllegalStateException("You have already answered this question.")
                                    transaction.set(answerRef, mapOf("profileKey" to ownKey, "answer" to draft.trim(), "answeredAt" to FieldValue.serverTimestamp()))
                                    transaction.set(participantRef, mapOf("profileKey" to ownKey, "answeredAt" to FieldValue.serverTimestamp()))
                                }.addOnSuccessListener {
                                    saving = false; draft = ""
                                    scope.launch { runCatching { notifyPostPartner(profile, "question", "${profile?.name ?: "Your partner"} answered a daily question.", todayKey, "questions") } }
                                }.addOnFailureListener { saving = false; Toast.makeText(context, it.message ?: "Could not save your answer.", Toast.LENGTH_SHORT).show() }
                            }, modifier = Modifier.align(Alignment.End).padding(top = 8.dp), shape = RoundedCornerShape(20.dp)) { Text(if (saving) "Saving…" else "Answer Now ♡") }
                        } else Text(if (bothAnswered) "You both answered. Your answers are revealed below." else "Your answer is locked until your partner answers.", color = Color(0xFF8B7180), modifier = Modifier.padding(top = 12.dp))
                        if (!answeredByMe && participants.containsKey(partnerKey)) Text("Your partner has answered. Add yours to reveal both answers.", color = Color(0xFF8B7180), modifier = Modifier.padding(top = 7.dp))
                        Text("Your answer", color = Rose, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 16.dp))
                        Text(ownAnswer ?: if (answeredByMe) "Loading your answer…" else "Your answer will appear here after you submit.", color = Ink, modifier = Modifier.padding(top = 4.dp))
                        Text(if (partnerKey == "kebyy") "Keby's answer" else "Shazy's answer", color = Rose, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 12.dp))
                        Text(if (bothAnswered) partnerAnswer ?: "Loading partner answer…" else "🔒 Answer hidden until both partners answer", color = if (bothAnswered) Ink else Color(0xFF8B7180), modifier = Modifier.padding(top = 4.dp))
                        TextButton(enabled = participants.isEmpty() && !editing, onClick = { editDraft = question?.get("question") as? String ?: ""; editing = true }, modifier = Modifier.align(Alignment.End).padding(top = 10.dp)) { Text("Edit today's question", color = Rose) }
                    }
                }
            }
            item { Text("Question History", color = Ink, fontSize = 21.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 8.dp)) }
            items(history.filter { it["dayKey"] != todayKey }, key = { it["id"] as String }) { record ->
                NativeQuestionHistoryCard(user, profile, ownKey, partnerKey, record)
            }
        }
    }
    if (editing) AlertDialog(onDismissRequest = { editing = false }, title = { Text("Ask your own question ♡") }, text = {
        OutlinedTextField(editDraft, { if (it.length <= 300) editDraft = it }, modifier = Modifier.fillMaxWidth(), minLines = 3, label = { Text("Today's question") })
    }, confirmButton = { TextButton(enabled = editDraft.isNotBlank(), onClick = {
        val updated = editDraft.trim()
        dailyRef.collection("participants").get().addOnSuccessListener { current ->
            if (current.isEmpty) dailyRef.update("question", updated).addOnSuccessListener { question = question.orEmpty() + ("question" to updated); editing = false }.addOnFailureListener { Toast.makeText(context, "Could not update today's question.", Toast.LENGTH_SHORT).show() }
            else Toast.makeText(context, "Today's question is locked after an answer is submitted.", Toast.LENGTH_SHORT).show()
        }
    }) { Text("Save question") } }, dismissButton = { TextButton(onClick = { editing = false }) { Text("Cancel") } })
}

@Composable
private fun NativeQuestionHistoryCard(
    user: FirebaseUser,
    profile: PartnerProfile?,
    ownKey: String,
    partnerKey: String,
    record: Map<String, Any>
) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val dayId = record["id"] as? String ?: return
    val db = remember { FirebaseFirestore.getInstance() }
    val dayRef = remember(dayId) { db.collection("coupleDailyQuestions").document("our-little-world").collection("days").document(dayId) }
    var statuses by remember(dayId) { mutableStateOf<Map<String, Map<String, Any>>>(emptyMap()) }
    var ownAnswer by remember(dayId) { mutableStateOf<String?>(null) }
    var partnerAnswer by remember(dayId) { mutableStateOf<String?>(null) }
    var draft by rememberSaveable(dayId) { mutableStateOf("") }
    var saving by remember(dayId) { mutableStateOf(false) }
    var loadError by remember(dayId) { mutableStateOf("") }
    val scope = rememberCoroutineScope()
    DisposableEffect(dayId) {
        val listener = dayRef.collection("participants").addSnapshotListener { snapshot, error ->
            if (error != null) loadError = "Answers could not be loaded."
            else if (snapshot != null) {
                statuses = snapshot.documents.associate { it.id to it.data.orEmpty() }
                loadError = ""
            }
        }
        onDispose { listener.remove() }
    }
    DisposableEffect(dayId, ownKey) {
        val listener = dayRef.collection("answers").document(ownKey).addSnapshotListener { snapshot, error ->
            if (error != null) loadError = "Answers could not be loaded."
            else ownAnswer = snapshot?.getString("answer")
        }
        onDispose { listener.remove() }
    }
    val bothAnswered = statuses.containsKey(ownKey) && statuses.containsKey(partnerKey)
    DisposableEffect(dayId, partnerKey, bothAnswered) {
        if (!bothAnswered) {
            partnerAnswer = null
            onDispose { }
        } else {
            val listener = dayRef.collection("answers").document(partnerKey).addSnapshotListener { snapshot, error ->
                if (error != null) loadError = "Answers could not be loaded."
                else partnerAnswer = snapshot?.getString("answer")
            }
            onDispose { listener.remove() }
        }
    }
    Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = Color.White), border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFF3D5E1))) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
            Text(record["dayKey"] as? String ?: "", color = Color(0xFF9B7888), fontSize = 12.sp)
            Text(record["question"] as? String ?: "", color = Ink, fontWeight = FontWeight.SemiBold)
            if (loadError.isNotBlank()) Text(loadError, color = Color(0xFF9B7888), fontSize = 12.sp)
            if (!statuses.containsKey(ownKey)) {
                OutlinedTextField(draft, { if (it.length <= 1200) draft = it }, modifier = Modifier.fillMaxWidth(), minLines = 2, label = { Text("You missed this one — write your answer") })
                TextButton(enabled = draft.isNotBlank() && !saving, onClick = {
                    saving = true
                    val answerRef = dayRef.collection("answers").document(ownKey)
                    val participantRef = dayRef.collection("participants").document(ownKey)
                    val answerText = draft.trim()
                    scope.launch {
                        runCatching {
                            db.runTransaction { transaction ->
                                if (transaction.get(answerRef).exists()) throw IllegalStateException("You already answered this question.")
                                transaction.set(answerRef, mapOf("profileKey" to ownKey, "answer" to answerText, "answeredAt" to FieldValue.serverTimestamp()))
                                transaction.set(participantRef, mapOf("profileKey" to ownKey, "answeredAt" to FieldValue.serverTimestamp()))
                            }.await()
                        }.onSuccess {
                            draft = ""
                            runCatching { notifyPostPartner(profile, "question", "${profile?.name ?: "Your partner"} answered a past daily question.", dayId, "questions") }
                        }.onFailure { Toast.makeText(context, it.message ?: "Could not save this answer.", Toast.LENGTH_SHORT).show() }
                        saving = false
                    }
                }) { Text(if (saving) "Saving…" else "Answer this question ♡", color = Rose) }
            }
            Text("${profile?.name ?: "You"}: ${ownAnswer ?: if (statuses.containsKey(ownKey)) "Loading your answer…" else "Not answered yet"}", color = Ink)
            val partnerName = partnerProfiles.firstOrNull { it.key == partnerKey }?.name ?: "Your partner"
            val partnerText = when {
                bothAnswered -> partnerAnswer ?: "Loading partner's answer…"
                statuses.containsKey(partnerKey) -> "Answered · locked until both answer"
                else -> "Not answered yet"
            }
            Text("$partnerName: $partnerText", color = if (bothAnswered) Ink else Color(0xFF8B7180))
        }
    }
}

@Composable
private fun NativePostsScreen(user: FirebaseUser, onBack: () -> Unit) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val profile = partnerProfiles.firstOrNull { it.email.equals(user.email.orEmpty(), ignoreCase = true) }
    var posts by remember { mutableStateOf<List<NativePost>>(emptyList()) }
    var selectedProfile by rememberSaveable { mutableStateOf("all") }
    var draft by rememberSaveable { mutableStateOf("") }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf("") }
    var postsOffline by remember { mutableStateOf(false) }
    var sending by remember { mutableStateOf(false) }
    var selectedPost by remember { mutableStateOf<NativePost?>(null) }
    var editingPost by remember { mutableStateOf<NativePost?>(null) }
    var deletingPost by remember { mutableStateOf<NativePost?>(null) }
    var editDraft by rememberSaveable { mutableStateOf("") }
    var editingComment by remember { mutableStateOf<FeedComment?>(null) }
    var commentEditDraft by rememberSaveable { mutableStateOf("") }
    var comments by remember { mutableStateOf<List<FeedComment>>(emptyList()) }
    var replyDraft by rememberSaveable { mutableStateOf("") }
    var selectedPhoto by remember { mutableStateOf<Uri?>(null) }
    var photoCropX by rememberSaveable { mutableFloatStateOf(50f) }
    var photoCropY by rememberSaveable { mutableFloatStateOf(50f) }
    var postVoice by remember { mutableStateOf<VoiceAttachment?>(null) }
    var replyVoice by remember { mutableStateOf<VoiceAttachment?>(null) }
    var replyVoicePostId by remember { mutableStateOf("") }
    var recording by remember { mutableStateOf(false) }
    var recordingTarget by remember { mutableStateOf("") }
    var pendingRecordingTarget by remember { mutableStateOf("") }
    var recorder by remember { mutableStateOf<MediaRecorder?>(null) }
    var recordingFile by remember { mutableStateOf<File?>(null) }
    var recordingStartedAt by remember { mutableLongStateOf(0L) }
    var olderPosts by remember { mutableStateOf<List<NativePost>>(emptyList()) }
    var livePagePosts by remember { mutableStateOf<List<NativePost>>(emptyList()) }
    var lastDocument by remember { mutableStateOf<DocumentSnapshot?>(null) }
    var canLoadMore by remember { mutableStateOf(false) }
    var loadingMore by remember { mutableStateOf(false) }
    var loadMoreError by remember { mutableStateOf("") }
    var hasPaged by remember { mutableStateOf(false) }
    var feedListenerKey by remember { mutableIntStateOf(0) }
    val latestOlderPosts by rememberUpdatedState(olderPosts)
    val previousLivePage by rememberUpdatedState(livePagePosts)
    val scope = rememberCoroutineScope()
    val photoPicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { selectedPhoto = it; photoCropX = 50f; photoCropY = 50f }

    fun startRecording(target: String) {
        try {
            val file = File.createTempFile("olw-voice-", ".m4a", context.cacheDir)
            val mediaRecorder = if (android.os.Build.VERSION.SDK_INT >= 31) MediaRecorder(context) else MediaRecorder()
            mediaRecorder.setAudioSource(MediaRecorder.AudioSource.MIC)
            mediaRecorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            mediaRecorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            mediaRecorder.setOutputFile(file.absolutePath)
            mediaRecorder.prepare()
            mediaRecorder.start()
            recorder = mediaRecorder
            recordingFile = file
            recordingTarget = target
            recordingStartedAt = System.currentTimeMillis()
            recording = true
        } catch (_: Exception) { Toast.makeText(context, "Could not start recording. Allow microphone access and try again.", Toast.LENGTH_SHORT).show() }
    }

    fun finishRecording() {
        val activeRecorder = recorder ?: return
        val file = recordingFile
        val target = recordingTarget
        val duration = (System.currentTimeMillis() - recordingStartedAt).coerceAtLeast(0)
        recording = false
        recorder = null
        recordingFile = null
        runCatching { activeRecorder.stop() }
        activeRecorder.release()
        if (file == null || !file.exists() || file.length() == 0L) { file?.delete(); return }
        scope.launch {
            try {
                val media = uploadTelegramMedia(context, user, Uri.fromFile(file), "Post voice note · ${(profile?.name ?: "Us")}", profile?.name ?: "Us", "audio/mp4")
                val attachment = VoiceAttachment(media["telegramFileId"] as String, media["voiceMimeType"] as? String ?: "audio/mp4", duration, media["telegramFileUniqueId"] as? String ?: "", media["telegramMessageId"], media["telegramChatId"])
                if (target == "post") postVoice = attachment else { replyVoice = attachment; replyVoicePostId = target.substringAfter(":") }
                Toast.makeText(context, "Voice note ready ♡", Toast.LENGTH_SHORT).show()
            } catch (_: Exception) { Toast.makeText(context, "Voice note could not be uploaded.", Toast.LENGTH_SHORT).show() }
            finally { file.delete() }
        }
    }

    val microphonePermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) startRecording(pendingRecordingTarget)
        else Toast.makeText(context, "Allow microphone access to record a voice note.", Toast.LENGTH_SHORT).show()
    }
    fun toggleRecording(target: String) {
        if (recording) {
            if (recordingTarget == target) finishRecording()
            else Toast.makeText(context, "Finish the current voice recording first.", Toast.LENGTH_SHORT).show()
        } else if (androidx.core.content.ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) startRecording(target)
        else { pendingRecordingTarget = target; microphonePermission.launch(Manifest.permission.RECORD_AUDIO) }
    }

    DisposableEffect(Unit) { onDispose { runCatching { recorder?.stop() }; recorder?.release(); recordingFile?.delete() } }

    DisposableEffect(user.uid, feedListenerKey) {
        val query = FirebaseFirestore.getInstance().collection("couples").document("our-little-world").collection("diaryPosts")
            .orderBy("createdAt", Query.Direction.DESCENDING).limit(50)
        val listener: ListenerRegistration = query.addSnapshotListener(com.google.firebase.firestore.MetadataChanges.INCLUDE) { snapshot, exception ->
            if (exception != null) { error = "Posts could not be loaded. Check your connection and try again."; loading = false }
            else if (snapshot != null) {
                postsOffline = snapshot.metadata.isFromCache
                val live = snapshot.documents.filter { it.getBoolean("deleting") != true }.map { it.toNativePost() }
                val ids = live.mapTo(mutableSetOf()) { it.id }
                val deletingIds = snapshot.documents.filter { it.getBoolean("deleting") == true }.mapTo(mutableSetOf()) { it.id }
                val displaced = previousLivePage.filter { it.id !in ids && it.id !in deletingIds }
                val retainedOlder = latestOlderPosts.filter { it.id !in deletingIds }
                olderPosts = (displaced + retainedOlder).distinctBy { it.id }
                livePagePosts = live
                posts = (live + displaced + retainedOlder.filter { older -> older.id !in ids && displaced.none { old -> old.id == older.id } }).distinctBy { it.id }
                if (!hasPaged) {
                    lastDocument = snapshot.documents.lastOrNull()
                    canLoadMore = snapshot.size() == 50
                }
                loading = false
                error = ""
            }
        }
        onDispose { listener.remove() }
    }

    LaunchedEffect(selectedPost?.id) {
        val postId = selectedPost?.id ?: run { comments = emptyList(); return@LaunchedEffect }
        val ref = FirebaseFirestore.getInstance().collection("couples").document("our-little-world").collection("diaryPosts").document(postId).collection("comments")
        val listener = ref.orderBy("createdAt", Query.Direction.ASCENDING).addSnapshotListener { snapshot, _ ->
            comments = snapshot?.documents.orEmpty().map { doc -> FeedComment(doc.id, doc.getString("authorName") ?: "Us", doc.getString("authorId") ?: "", doc.getString("text") ?: "", doc.getString("parentId"), doc.get("likedBy") as? List<String> ?: emptyList(), doc.getString("telegramAudioFileId"), doc.getString("voiceMimeType"), doc.getLong("voiceDurationMs") ?: 0L) }
        }
        try { kotlinx.coroutines.awaitCancellation() } finally { listener.remove() }
    }

    val visiblePosts = posts.filter { post ->
        if (selectedProfile == "all") true
        else {
            val wanted = partnerProfiles.firstOrNull { it.key == selectedProfile }
            wanted != null && (post.authorName.equals(wanted.name, true) || post.authorId == if (wanted.key == "shazy") "profile-two" else "profile-one")
        }
    }

    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = onBack) { Text("‹ Home", color = Rose) }
            Text("Our Posts ♡", fontSize = 20.sp, fontWeight = FontWeight.Bold, color = Ink)
        }
        Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            (listOf("all" to "All posts") + partnerProfiles.map { it.key to it.name }).forEach { (key, label) ->
                OutlinedButton(onClick = { selectedProfile = key }, shape = RoundedCornerShape(18.dp), colors = ButtonDefaults.outlinedButtonColors(containerColor = if (selectedProfile == key) Color(0xFFFFE4EE) else Color.White), modifier = Modifier.weight(1f)) { Text(label, fontSize = 11.sp, maxLines = 1) }
            }
        }
        if (selectedProfile == "all") {
            Column(Modifier.fillMaxWidth().padding(12.dp).clip(RoundedCornerShape(18.dp)).background(Color.White).padding(12.dp)) {
                OutlinedTextField(value = draft, onValueChange = { draft = it }, modifier = Modifier.fillMaxWidth(), placeholder = { Text("What's happening?", color = Color(0xFF9B7888)) }, minLines = 2, maxLines = 5)
                selectedPhoto?.let { uri ->
                    BoxWithConstraints(Modifier.fillMaxWidth().aspectRatio(4f / 3f).padding(top = 8.dp).clip(RoundedCornerShape(14.dp)).pointerInput(uri) {
                        detectDragGestures { change, drag ->
                            change.consume()
                            photoCropX = (photoCropX - drag.x / size.width * 100f).coerceIn(0f, 100f)
                            photoCropY = (photoCropY - drag.y / size.height * 100f).coerceIn(0f, 100f)
                        }
                    }) {
                        AsyncImage(model = uri, contentDescription = "Drag to adjust photo crop", modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop, alignment = BiasAlignment((photoCropX - 50f) / 50f, (photoCropY - 50f) / 50f))
                        Text("Drag to adjust photo", color = Color.White, fontSize = 10.sp, modifier = Modifier.align(Alignment.BottomCenter).background(Color(0x66000000)).padding(horizontal = 8.dp, vertical = 4.dp))
                    }
                }
                postVoice?.let { NativeVoiceNotePlayer(user, it.fileId, it.mimeType, it.durationMs) }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    TextButton(onClick = { photoPicker.launch("image/*") }) { Text(if (selectedPhoto == null) "📷 Photo" else "Change photo", color = Rose) }
                    TextButton(onClick = { toggleRecording("post") }) { Text(if (recording && recordingTarget == "post") "● Stop voice" else if (postVoice != null) "🎙 Replace voice" else "🎙 Voice", color = Rose) }
                    TextButton(enabled = (draft.isNotBlank() || selectedPhoto != null || postVoice != null) && !sending && !recording, onClick = {
                        val text = draft.trim()
                        val photo = selectedPhoto
                        val voice = postVoice
                        if (text.isBlank() && photo == null && voice == null) return@TextButton
                        sending = true
                        scope.launch {
                            try {
                                val mediaData = photo?.let { uploadTelegramMedia(context, user, it, java.text.DateFormat.getDateTimeInstance().format(java.util.Date()), profile?.name ?: "Us", "image/jpeg") } ?: emptyMap()
                                val data = mutableMapOf<String, Any>("authorId" to user.uid, "authorName" to (profile?.name ?: "Us"), "wallId" to "our-little-world", "text" to text, "createdAt" to FieldValue.serverTimestamp(), "likedBy" to emptyList<String>())
                                mediaData.forEach { (key, value) -> if (value != null) data[key] = value }
                                if (photo != null) data["photoPosition"] = "${photoCropX.toInt()}% ${photoCropY.toInt()}%"
                                voice?.let { voice ->
                                    data["telegramAudioFileId"] = voice.fileId
                                    data["telegramAudioFileUniqueId"] = voice.fileUniqueId
                                    voice.messageId?.let { data["telegramAudioMessageId"] = it }
                                    voice.chatId?.let { data["telegramAudioChatId"] = it }
                                    data["voiceMimeType"] = voice.mimeType
                                    data["voiceDurationMs"] = voice.durationMs
                                }
                                val postRef = FirebaseFirestore.getInstance().collection("couples").document("our-little-world").collection("diaryPosts").add(data).await()
                                runCatching { notifyPostPartner(profile, "post", "${profile?.name ?: "Your partner"} shared a new post.", postRef.id, "gallery") }
                                draft = ""; selectedPhoto = null; postVoice = null
                                Toast.makeText(context, "Posted! ✨", Toast.LENGTH_SHORT).show()
                            } catch (e: Exception) { Toast.makeText(context, e.message ?: "Could not post.", Toast.LENGTH_SHORT).show() }
                            finally { sending = false }
                        }
                    }) { Text(if (sending) "Posting…" else "Post", color = Rose, fontWeight = FontWeight.Bold) }
                }
            }
            Text("Photos and voice notes use the existing signed-in media service.", color = Color(0xFF8D7180), fontSize = 10.sp, modifier = Modifier.padding(horizontal = 16.dp, vertical = 2.dp))
        }
        LazyColumn(Modifier.weight(1f), contentPadding = androidx.compose.foundation.layout.PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            if (postsOffline && !loading) item { Text("Offline · showing posts saved on this device", color = Color(0xFF8B7180), fontSize = 12.sp, modifier = Modifier.fillMaxWidth().background(Color(0xFFFFEEF4), RoundedCornerShape(12.dp)).padding(10.dp)) }
            if (loading) item { Box(Modifier.fillMaxWidth().padding(30.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Rose) } }
            else if (error.isNotBlank()) item { Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth().padding(20.dp)) {
                Text(error, color = Color(0xFF815D6D))
                TextButton(onClick = {
                    loading = true; error = ""; posts = emptyList(); olderPosts = emptyList(); livePagePosts = emptyList(); lastDocument = null; canLoadMore = false; loadingMore = false; hasPaged = false; feedListenerKey++
                }) { Text("Try again") }
            } }
            else if (visiblePosts.isEmpty()) item { Text(if (selectedProfile == "all") "No posts yet. Share your first thought!" else "No posts yet.", color = Color(0xFF8B7180), modifier = Modifier.padding(24.dp)) }
            items(visiblePosts, key = { it.id }) { post ->
                var postBitmap by remember(post.id) { mutableStateOf<Bitmap?>(null) }
                var postBitmapLoading by remember(post.id) { mutableStateOf(false) }
                var postBitmapError by remember(post.id) { mutableStateOf(false) }
                var postBitmapRetry by remember(post.id) { mutableIntStateOf(0) }
                val imageAlignment = remember(post.photoPosition) {
                    val values = post.photoPosition?.split(" ")?.mapNotNull { it.trimEnd('%').toFloatOrNull() }
                    if (values?.size == 2) BiasAlignment(((values[0] - 50f) / 50f).coerceIn(-1f, 1f), ((values[1] - 50f) / 50f).coerceIn(-1f, 1f)) else Alignment.Center
                }
                LaunchedEffect(post.telegramFileId, postBitmapRetry) {
                    postBitmap = null; postBitmapError = false
                    val fileId = post.telegramFileId ?: return@LaunchedEffect
                    postBitmapLoading = true
                    try { postBitmap = loadPostPhoto(context, user, fileId, post.telegramMimeType) ?: error("Image unavailable") }
                    catch (_: Exception) { postBitmapError = true }
                    finally { postBitmapLoading = false }
                }
                val isLiked = user.uid in post.likedBy
                val isOwnPost = post.authorId == user.uid
                Card(shape = RoundedCornerShape(20.dp), colors = CardDefaults.cardColors(containerColor = Color.White), border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFF3D5E1)), modifier = Modifier.fillMaxWidth().clickable { selectedPost = post }) {
                    Column(Modifier.fillMaxWidth().padding(14.dp)) {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Column { Text(post.authorName, color = Ink, fontWeight = FontWeight.Bold); Text(post.createdAt, color = Color(0xFF9B7888), fontSize = 11.sp) }
                            if (isOwnPost) Row {
                                TextButton(onClick = { editDraft = post.text; editingPost = post }) { Text("Edit", fontSize = 11.sp) }
                                TextButton(onClick = { deletingPost = post }) { Text("Delete", color = Color(0xFFB94062), fontSize = 11.sp) }
                            }
                        }
                        if (post.text.isNotBlank()) Text(post.text, color = Ink, modifier = Modifier.padding(top = 10.dp))
                        val photoModel: Any? = postBitmap ?: post.photoUrl
                        if (photoModel != null) AsyncImage(model = photoModel, contentDescription = "Post photo", modifier = Modifier.fillMaxWidth().heightIn(max = 300.dp).padding(top = 8.dp).clip(RoundedCornerShape(14.dp)), contentScale = ContentScale.Crop, alignment = imageAlignment)
                        else if (post.telegramFileId != null) Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                            if (postBitmapLoading) CircularProgressIndicator(color = Rose, modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                            Text(if (postBitmapError) "Photo unavailable" else "Loading photo…", color = Color(0xFF8B7180), fontSize = 11.sp, modifier = Modifier.padding(start = 6.dp))
                            if (postBitmapError) TextButton(onClick = { postBitmapRetry++ }) { Text("Retry", color = Rose, fontSize = 11.sp) }
                        }
                        post.telegramAudioFileId?.let { NativeVoiceNotePlayer(user, it, post.voiceMimeType, post.voiceDurationMs) }
                        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                            TextButton(onClick = {
                                val ref = FirebaseFirestore.getInstance().collection("couples").document("our-little-world").collection("diaryPosts").document(post.id)
                                scope.launch {
                                    runCatching {
                                        FirebaseFirestore.getInstance().runTransaction { transaction ->
                                            val actualLiked = (transaction.get(ref).get("likedBy") as? List<*>)?.contains(user.uid) == true
                                            if (actualLiked != isLiked) transaction.update(ref, "likedBy", if (actualLiked) FieldValue.arrayRemove(user.uid) else FieldValue.arrayUnion(user.uid))
                                        }.await()
                                        if (!isLiked) notifyPostPartner(profile, "like", "${profile?.name ?: "Your partner"} liked a post.", "${post.id}-${user.uid}-${System.currentTimeMillis()}", "gallery")
                                    }.onFailure { Toast.makeText(context, "Could not update the like.", Toast.LENGTH_SHORT).show() }
                                }
                            }) { Text("${if (isLiked) "❤️" else "♡"} ${post.likedBy.size}", color = if (isLiked) Rose else Color(0xFF806876)) }
                            TextButton(onClick = { selectedPost = post }) { Text("💬 Replies", color = Color(0xFF806876)) }
                        }
                    }
                }
            }
            if (canLoadMore || loadMoreError.isNotBlank()) item {
                TextButton(enabled = !loadingMore, modifier = Modifier.fillMaxWidth(), onClick = {
                    val cursor = lastDocument ?: return@TextButton
                    loadingMore = true; loadMoreError = ""
                    hasPaged = true
                    FirebaseFirestore.getInstance().collection("couples").document("our-little-world").collection("diaryPosts").orderBy("createdAt", Query.Direction.DESCENDING).startAfter(cursor).limit(50).get()
                        .addOnSuccessListener { snapshot ->
                            val ids = posts.mapTo(mutableSetOf()) { it.id }
                            val pageItems = snapshot.documents.filter { it.getBoolean("deleting") != true && it.id !in ids }.map { it.toNativePost() }
                            olderPosts = (olderPosts + pageItems).distinctBy { it.id }
                            posts = (livePagePosts + olderPosts).distinctBy { it.id }
                            lastDocument = snapshot.documents.lastOrNull() ?: lastDocument
                            canLoadMore = snapshot.size() == 50
                            loadingMore = false
                        }.addOnFailureListener { loadingMore = false; loadMoreError = "Could not load older posts. Tap to retry." }
                }) { Text(if (loadingMore) "Loading…" else if (loadMoreError.isNotBlank()) "Retry loading older posts" else "Load older posts", color = Rose) }
            }
        }
    }

    selectedPost?.let { post ->
        AlertDialog(onDismissRequest = { selectedPost = null; replyDraft = "" }, title = { Text("Post & replies", color = Ink) }, text = {
            Column(Modifier.heightIn(max = 440.dp).verticalScroll(rememberScrollState())) {
                Text(post.authorName, fontWeight = FontWeight.Bold, color = Ink)
                if (post.text.isNotBlank()) Text(post.text, color = Ink, modifier = Modifier.padding(top = 4.dp))
                comments.forEach { comment ->
                    Text("${comment.authorName}: ${comment.text}", color = Color(0xFF775C69), modifier = Modifier.padding(top = 10.dp))
                    comment.telegramAudioFileId?.let { NativeVoiceNotePlayer(user, it, comment.voiceMimeType, comment.voiceDurationMs) }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        val liked = user.uid in comment.likedBy
                        TextButton(onClick = {
                            val ref = FirebaseFirestore.getInstance().collection("couples").document("our-little-world").collection("diaryPosts").document(post.id).collection("comments").document(comment.id)
                            scope.launch {
                                runCatching { ref.update("likedBy", if (liked) FieldValue.arrayRemove(user.uid) else FieldValue.arrayUnion(user.uid)).await() }
                                    .onSuccess { if (!liked) runCatching { notifyPostPartner(profile, "like", "${profile?.name ?: "Your partner"} liked a comment.", "${comment.id}-${user.uid}-${System.currentTimeMillis()}", "gallery") } }
                                    .onFailure { Toast.makeText(context, "Could not update the like.", Toast.LENGTH_SHORT).show() }
                            }
                        }) { Text("${if (liked) "❤️" else "♡"} ${comment.likedBy.size}", color = if (liked) Rose else Color(0xFF9B7888), fontSize = 10.sp) }
                        if (comment.authorId == user.uid) {
                            TextButton(onClick = { commentEditDraft = comment.text; editingComment = comment }) { Text("Edit", fontSize = 10.sp) }
                            TextButton(onClick = {
                                scope.launch {
                                    runCatching {
                                        FirebaseFirestore.getInstance().collection("couples").document("our-little-world").collection("diaryPosts").document(post.id).collection("comments").document(comment.id).delete().await()
                                    }.onFailure { Toast.makeText(context, "Could not delete reply.", Toast.LENGTH_SHORT).show() }
                                }
                            }) { Text("Delete", color = Color(0xFFB94062), fontSize = 10.sp) }
                        }
                    }
                }
                if (comments.isEmpty()) Text("No replies yet. Start the conversation ♡", color = Color(0xFF8C737D), modifier = Modifier.padding(top = 12.dp))
                OutlinedTextField(value = replyDraft, onValueChange = { replyDraft = it }, modifier = Modifier.fillMaxWidth().padding(top = 12.dp), placeholder = { Text("Write a reply…") }, singleLine = true)
                if (replyVoicePostId == post.id) replyVoice?.let { NativeVoiceNotePlayer(user, it.fileId, it.mimeType, it.durationMs) }
                TextButton(onClick = { toggleRecording("reply:${post.id}") }) { Text(if (recording && recordingTarget == "reply:${post.id}") "● Stop voice" else "🎙 Record voice note", color = Rose) }
            }
        }, confirmButton = {
            TextButton(enabled = replyDraft.isNotBlank() || (replyVoicePostId == post.id && replyVoice != null), onClick = {
                val text = replyDraft.trim()
                val voice = replyVoice.takeIf { replyVoicePostId == post.id }
                if (text.isNotBlank() || voice != null) {
                    val data = mutableMapOf<String, Any>("authorId" to user.uid, "authorName" to (profile?.name ?: "Us"), "text" to text, "createdAt" to FieldValue.serverTimestamp(), "likedBy" to emptyList<String>())
                    voice?.let { data["telegramAudioFileId"] = it.fileId; data["telegramAudioFileUniqueId"] = it.fileUniqueId; data["voiceMimeType"] = it.mimeType; data["voiceDurationMs"] = it.durationMs; it.messageId?.let { id -> data["telegramAudioMessageId"] = id }; it.chatId?.let { id -> data["telegramAudioChatId"] = id } }
                    scope.launch {
                        runCatching { FirebaseFirestore.getInstance().collection("couples").document("our-little-world").collection("diaryPosts").document(post.id).collection("comments").add(data).await() }
                            .onSuccess { reference ->
                                replyDraft = ""; replyVoice = null; replyVoicePostId = ""
                                runCatching { notifyPostPartner(profile, "comment", "${profile?.name ?: "Your partner"} replied to a post.", reference.id, "gallery") }
                            }
                            .onFailure { Toast.makeText(context, "Could not send reply.", Toast.LENGTH_SHORT).show() }
                    }
                }
            }) { Text("Reply") }
        }, dismissButton = { TextButton(onClick = { selectedPost = null }) { Text("Close") } })
    }
    editingPost?.let { post ->
        AlertDialog(onDismissRequest = { editingPost = null }, title = { Text("Edit post") }, text = {
            OutlinedTextField(value = editDraft, onValueChange = { editDraft = it }, modifier = Modifier.fillMaxWidth(), minLines = 2)
        }, confirmButton = {
            TextButton(onClick = {
                val text = editDraft.trim()
                if (text.isNotBlank() || post.photoUrl != null || post.telegramFileId != null || post.telegramAudioFileId != null) {
                    scope.launch {
                        runCatching {
                            FirebaseFirestore.getInstance().collection("couples").document("our-little-world").collection("diaryPosts").document(post.id).update("text", text).await()
                        }.onSuccess { editingPost = null }
                            .onFailure { Toast.makeText(context, "Could not save post changes.", Toast.LENGTH_SHORT).show() }
                    }
                } else {
                    editingPost = null
                }
            }) { Text("Save") }
        }, dismissButton = { TextButton(onClick = { editingPost = null }) { Text("Cancel") } })
    }
    editingComment?.let { comment ->
        val postId = selectedPost?.id
        AlertDialog(onDismissRequest = { editingComment = null }, title = { Text("Edit comment") }, text = {
            OutlinedTextField(value = commentEditDraft, onValueChange = { commentEditDraft = it }, modifier = Modifier.fillMaxWidth(), minLines = 2)
        }, confirmButton = {
            TextButton(onClick = {
                if (!postId.isNullOrBlank() && commentEditDraft.trim().isNotBlank()) {
                    scope.launch {
                        runCatching {
                            FirebaseFirestore.getInstance().collection("couples").document("our-little-world").collection("diaryPosts").document(postId).collection("comments").document(comment.id).update("text", commentEditDraft.trim()).await()
                        }.onSuccess { editingComment = null }
                            .onFailure { Toast.makeText(context, "Could not save reply changes.", Toast.LENGTH_SHORT).show() }
                    }
                } else {
                    editingComment = null
                }
            }) { Text("Save") }
        }, dismissButton = { TextButton(onClick = { editingComment = null }) { Text("Cancel") } })
    }
    deletingPost?.let { post ->
        AlertDialog(onDismissRequest = { deletingPost = null }, title = { Text("Delete post?") }, text = { Text("This will remove your post.") }, confirmButton = {
            TextButton(onClick = {
                scope.launch {
                    try {
                        val firestore = FirebaseFirestore.getInstance()
                        val postRef = firestore.collection("couples").document("our-little-world").collection("diaryPosts").document(post.id)
                        postRef.update("deleting", true).await()
                        val commentRef = postRef.collection("comments")
                        val commentDocs = commentRef.get().await().documents
                        commentDocs.chunked(450).forEach { group ->
                            val batch = firestore.batch()
                            group.forEach { batch.delete(it.reference) }
                            batch.commit().await()
                        }
                        postRef.delete().await()
                        olderPosts = olderPosts.filterNot { it.id == post.id }
                        posts = posts.filterNot { it.id == post.id }
                        deletingPost = null
                        selectedPost = null
                        Toast.makeText(context, "Post deleted.", Toast.LENGTH_SHORT).show()
                    } catch (_: Exception) { Toast.makeText(context, "Could not delete post.", Toast.LENGTH_SHORT).show() }
                }
            }) { Text("Delete", color = Color(0xFFB94062)) }
        }, dismissButton = { TextButton(onClick = { deletingPost = null }) { Text("Cancel") } })
    }
}

@Composable
private fun NativeBottomNavigation(context: android.content.Context, onNavigate: (String) -> Unit) {
    val items = listOf("⌂" to "Home", "♡" to "Memories", "🎮" to "Games", "▣" to "Post", "✉" to "Letters", "⋮" to "More")
    Row(
        modifier = Modifier.fillMaxWidth().padding(start = 12.dp, end = 12.dp, bottom = 8.dp, top = 4.dp)
            .clip(RoundedCornerShape(24.dp)).background(Color.White).border(1.dp, Color(0xFFF3D3E0), RoundedCornerShape(24.dp))
            .padding(vertical = 7.dp),
        horizontalArrangement = Arrangement.SpaceEvenly,
        verticalAlignment = Alignment.CenterVertically
    ) {
        items.forEachIndexed { index, item ->
            Column(
                modifier = Modifier.weight(1f).clickable {
                    onNavigate(listOf("home", "memories", "games", "gallery", "letters", "more")[index])
                }.padding(vertical = 2.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(item.first, color = if (index == 0) Rose else Color(0xFF7C6571), fontSize = 19.sp, lineHeight = 21.sp)
                Text(item.second, color = if (index == 0) Rose else Color(0xFF7C6571), fontSize = 8.sp, fontWeight = if (index == 0) FontWeight.Bold else FontWeight.Medium, maxLines = 1)
            }
        }
    }
}
