package com.ghosttunes.app;

import android.content.Intent;
import android.net.Uri;
import android.nfc.NfcAdapter;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String HANDOFF_SCHEME = "ghosttunes";
    private static final String HANDOFF_HOST = "handoff";
    private static final int HANDOFF_MAX_ATTEMPTS = 40;
    private static final long HANDOFF_RETRY_MS = 500;
    // Fires the trigger only once JS has set window.__ghosttunesHandoffReady (cold start loads the app first).
    private static final String HANDOFF_JS =
        "(function(){if(window.__ghosttunesHandoffReady){" +
        "window.dispatchEvent(new CustomEvent('ghosttunes:handoff',{detail:{source:'nfc'}}));" +
        "return 'ok';}return 'wait';})()";

    private final Handler handoffHandler = new Handler(Looper.getMainLooper());
    private int handoffAttempts = 0;
    private final Runnable handoffDispatch = new Runnable() {
        @Override
        public void run() {
            WebView webView = getBridge() != null ? getBridge().getWebView() : null;
            if (webView == null) {
                retryHandoff();
                return;
            }
            webView.evaluateJavascript(HANDOFF_JS, value -> {
                if (!"\"ok\"".equals(value)) retryHandoff();
            });
        }
    };

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        try {
            // 1. Force hardware acceleration and seamless dark system bars
            Window window = getWindow();
            window.setFlags(
                WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED,
                WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED
            );

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                window.setStatusBarColor(0xFF09090B); // Ghosttunes dark charcoal
                window.setNavigationBarColor(0xFF09090B);
            }

            // 2. Request highest available display refresh rate (90Hz / 120Hz smooth scrolling)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                WindowManager.LayoutParams params = window.getAttributes();
                params.preferredDisplayModeId = 0; // 0 chooses system default highest performance mode
                window.setAttributes(params);
            }

            // 3. Optimize WebView rendering pipeline
            WebView webView = getBridge() != null ? getBridge().getWebView() : null;
            if (webView != null) {
                // Use GPU hardware layer for fast compositing
                webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);

                // Disable laggy rubber-banding and scrollbar rendering
                webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
                webView.setVerticalScrollBarEnabled(false);
                webView.setHorizontalScrollBarEnabled(false);

                // Pre-rasterize offscreen content so fast scrolls never jank or stutter
                WebSettings settings = webView.getSettings();
                if (settings != null) {
                    settings.setDomStorageEnabled(true);
                    settings.setDatabaseEnabled(true);
                    settings.setCacheMode(WebSettings.LOAD_DEFAULT);
                    settings.setMediaPlaybackRequiresUserGesture(false);
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                        settings.setOffscreenPreRaster(true);
                    }
                }
            }
        } catch (Exception ignored) {
        }

        // Launched by tapping the NFC sticker (skip when the activity is merely being recreated).
        if (savedInstanceState == null) handleHandoffIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleHandoffIntent(intent);
    }

    @Override
    public void onDestroy() {
        handoffHandler.removeCallbacks(handoffDispatch);
        super.onDestroy();
    }

    private void handleHandoffIntent(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (!NfcAdapter.ACTION_NDEF_DISCOVERED.equals(action) && !Intent.ACTION_VIEW.equals(action)) return;
        Uri data = intent.getData();
        if (data == null
            || !HANDOFF_SCHEME.equalsIgnoreCase(data.getScheme())
            || !HANDOFF_HOST.equalsIgnoreCase(data.getHost())) return;

        // Consume it so a later recreation doesn't fire the handoff again.
        intent.setAction(Intent.ACTION_MAIN);
        intent.setData(null);

        handoffAttempts = 0;
        handoffHandler.removeCallbacks(handoffDispatch);
        handoffHandler.post(handoffDispatch);
    }

    private void retryHandoff() {
        if (++handoffAttempts < HANDOFF_MAX_ATTEMPTS) {
            handoffHandler.postDelayed(handoffDispatch, HANDOFF_RETRY_MS);
        }
    }
}
