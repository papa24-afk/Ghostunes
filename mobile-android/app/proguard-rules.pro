# kotlinx.serialization
-keepattributes *Annotation*, InnerClasses, Signature, Exceptions
-dontnote kotlinx.serialization.**
-keepclassmembers class kotlinx.serialization.json.** { *** Companion; }
-keepclasseswithmembers class kotlinx.serialization.json.** { kotlinx.serialization.KSerializer serializer(...); }
-keep,includedescriptorclasses class com.ghosttunes.mobile.**$$serializer { *; }
-keepclassmembers class com.ghosttunes.mobile.** { *** Companion; }
-keepclasseswithmembers class com.ghosttunes.mobile.** { kotlinx.serialization.KSerializer serializer(...); }

# Retrofit (interfaces are used via reflection proxies)
-keep,allowobfuscation,allowshrinking interface retrofit2.Call
-keep,allowobfuscation,allowshrinking class retrofit2.Response
-keep,allowobfuscation,allowshrinking class kotlin.coroutines.Continuation
-keep interface com.ghosttunes.mobile.data.net.GhosttunesApi { *; }
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**

# NewPipeExtractor (direct YouTube streaming) and its JavaScript engine.
-keep class org.schabi.newpipe.extractor.** { *; }
-keep class org.mozilla.javascript.** { *; }
-keep class org.mozilla.classfile.ClassFileWriter
-keep class com.grack.nanojson.** { *; }
-keep class com.google.protobuf.** { *; }
-dontwarn org.mozilla.javascript.tools.**
-dontwarn java.beans.**
-dontwarn javax.script.**
-dontwarn jdk.dynalink.**
-dontwarn org.jsoup.**
-dontwarn javax.annotation.**
