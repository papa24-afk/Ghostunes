package com.ghosttunes.app;

import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
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
    }
}
