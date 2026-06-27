package com.capitalcrew

import android.annotation.SuppressLint
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity

@SuppressLint("SetJavaScriptEnabled", "ClickableViewAccessibility", "AddJavascriptInterface")
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        window.setFlags(
            WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS
        )

        webView = WebView(this).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            setOverScrollMode(View.OVER_SCROLL_NEVER)
            isVerticalScrollBarEnabled = false
            isHorizontalScrollBarEnabled = false
        }
        setContentView(webView)

        val settings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.cacheMode = WebSettings.LOAD_DEFAULT
        settings.setSupportZoom(true)
        settings.builtInZoomControls = true
        settings.displayZoomControls = false
        settings.loadWithOverviewMode = true
        settings.useWideViewPort = true
        settings.mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
        settings.mediaPlaybackRequiresUserGesture = false
        CookieManager.getInstance().setAcceptCookie(true)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)
        }

        webView.webViewClient = object : WebViewClient() {
            private var htmlPatched = false

            override fun shouldInterceptRequest(
                view: android.webkit.WebView?,
                request: WebResourceRequest?
            ): WebResourceResponse? {
                val url = request?.url?.toString() ?: return null
                if ((url.endsWith("/") || url.endsWith("index.html")) && !htmlPatched) {
                    htmlPatched = true
                    try {
                        val connection = java.net.URL(url).openConnection() as java.net.HttpURLConnection
                        connection.requestMethod = "GET"
                        connection.setRequestProperty("User-Agent", System.getProperty("http.agent") ?: "Mozilla/5.0")
                        connection.connect()
                        val contentType = connection.contentType ?: "text/html; charset=UTF-8"
                        val input = connection.inputStream.bufferedReader().use { it.readText() }
                        val patched = input
                            .replace(
                                "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover\" />",
                                "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes, viewport-fit=cover\" />"
                            )
                            .replace(
                                "touch-action: none;",
                                "touch-action: manipulation;"
                            )
                            .replace(
                                "overscroll-behavior: none;",
                                "overscroll-behavior: contain;"
                            )
                            .replace(
                                "body { position: fixed; inset: 0; }",
                                "body { position: fixed; inset: env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px); }"
                            )
                            .replace(
                                "visibility:hidden",
                                "visibility:visible"
                            )
                            .replace(
                                "display:none!important",
                                "display:flex!important"
                            )
                        return WebResourceResponse("text/html", "UTF-8", patched.byteInputStream())
                    } catch (ignored: Exception) {
                        ignored.printStackTrace()
                    }
                }
                return null
            }

            override fun onPageFinished(view: android.webkit.WebView?, url: String?) {
                super.onPageFinished(view, url)
                view?.evaluateJavascript(
                    """
                    (function() {
                      var orientLock = document.getElementById('cc-orient-lock');
                      if (orientLock) {
                        orientLock.style.display = 'none';
                        orientLock.remove();
                      }
                      document.body.classList.remove('is-portrait');
                      document.body.classList.add('is-landscape');
                      try {
                        screen.orientation.lock('landscape');
                      } catch(e) {}
                      Object.defineProperty(window, 'innerWidth', {
                        get: function() { return Math.max(screen.width, screen.availWidth, 1920); }
                      });
                      Object.defineProperty(window, 'innerHeight', {
                        get: function() { return Math.min(screen.height, screen.availHeight, 1080); }
                      });
                      document.getElementById('game-container').style.visibility = 'visible';
                      document.getElementById('cc-mobile-controls').style.display = 'block';
                    })()
                    """.trimIndent(),
                    null
                )
            }
        }

        webView.loadUrl("https://capital-crew.pages.dev")
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
        webView.resumeTimers()
    }

    override fun onPause() {
        super.onPause()
        webView.onPause()
        webView.pauseTimers()
    }

    override fun onDestroy() {
        super.onDestroy()
        webView.destroy()
    }

    override fun onBackPressed() {
        if (webView.canGoBack()) super.onBackPressed() else if (webView.canGoBack()) webView.goBack() else super.onBackPressed()
    }
}
