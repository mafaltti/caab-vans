import { useRef, useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Linking,
  BackHandler,
  Platform,
} from "react-native";
import { WebView, type WebViewNavigation } from "react-native-webview";
import type { ShouldStartLoadRequest } from "react-native-webview/lib/WebViewTypes";
import type { WebViewMessageEvent } from "react-native-webview";
import { getSettings } from "@/storage/settings";
import { useFocusEffect } from "expo-router";

const HISTORY_SHIM = `
(function() {
  var origPush = history.pushState;
  var origReplace = history.replaceState;
  function notify() {
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'navState',
      canGoBack: history.length > 1
    }));
  }
  history.pushState = function() {
    origPush.apply(this, arguments);
    notify();
  };
  history.replaceState = function() {
    origReplace.apply(this, arguments);
    notify();
  };
  window.addEventListener('popstate', notify);
  true;
})();
`;

export default function DriverScreen() {
  const webViewRef = useRef<WebView>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [baseUrl, setBaseUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const settings = await getSettings();
        if (settings?.apiBaseUrl) {
          setBaseUrl(settings.apiBaseUrl);
        }
      })();
    }, []),
  );

  const onNavigationStateChange = useCallback((navState: WebViewNavigation) => {
    setCanGoBack(navState.canGoBack);
  }, []);

  const onMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === "navState") {
        setCanGoBack(data.canGoBack);
      }
    } catch {
      // Ignore non-JSON messages
    }
  }, []);

  const handleShouldStartLoad = useCallback(
    (event: ShouldStartLoadRequest): boolean => {
      const { url } = event;

      if (url.startsWith("about:") || url.startsWith("data:")) {
        return true;
      }

      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        Linking.openURL(url).catch(() => {});
        return false;
      }

      if (baseUrl && url.startsWith(baseUrl)) {
        return true;
      }

      Linking.openURL(url).catch(() => {});
      return false;
    },
    [baseUrl],
  );

  // Android back button: go back in WebView first
  useEffect(() => {
    if (Platform.OS !== "android") return;

    const onBackPress = () => {
      if (canGoBack) {
        webViewRef.current?.goBack();
        return true;
      }
      return false;
    };

    const sub = BackHandler.addEventListener("hardwareBackPress", onBackPress);
    return () => sub.remove();
  }, [canGoBack]);

  if (!baseUrl) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Failed to load driver page</Text>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={() => {
            setLoadError(false);
            webViewRef.current?.reload();
          }}
        >
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ uri: `${baseUrl}/driver` }}
        style={styles.webview}
        javaScriptEnabled
        domStorageEnabled
        thirdPartyCookiesEnabled
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#2563eb" />
          </View>
        )}
        onNavigationStateChange={onNavigationStateChange}
        onShouldStartLoadWithRequest={handleShouldStartLoad}
        onError={() => setLoadError(true)}
        injectedJavaScript={HISTORY_SHIM}
        onMessage={onMessage}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webview: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    padding: 24,
  },
  loadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f8fafc",
  },
  errorText: {
    fontSize: 16,
    color: "#64748b",
    marginBottom: 16,
    textAlign: "center",
  },
  retryButton: {
    backgroundColor: "#2563eb",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  retryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
