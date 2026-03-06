/* eslint-disable @typescript-eslint/no-require-imports */
const {
  withAndroidManifest,
  withDangerousMod,
  AndroidConfig,
} = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

// --- Manifest modifications (T002) ---

function withBootRestartManifest(config) {
  config = AndroidConfig.Permissions.withPermissions(config, [
    "android.permission.RECEIVE_BOOT_COMPLETED",
  ]);

  config = withAndroidManifest(config, (modConfig) => {
    const mainApp = modConfig.modResults.manifest.application?.[0];
    if (!mainApp) return modConfig;

    if (!mainApp.receiver) {
      mainApp.receiver = [];
    }

    const packageName = modConfig.android?.package ?? "com.caab.vantracker";
    const receiverName = `${packageName}.BootRestartReceiver`;

    const exists = mainApp.receiver.some(
      (r) => r.$?.["android:name"] === receiverName,
    );
    if (exists) return modConfig;

    mainApp.receiver.push({
      $: {
        "android:name": receiverName,
        "android:directBootAware": "true",
        "android:exported": "true",
        "android:enabled": "true",
      },
      "intent-filter": [
        {
          action: [
            {
              $: {
                "android:name":
                  "android.intent.action.LOCKED_BOOT_COMPLETED",
              },
            },
            {
              $: { "android:name": "android.intent.action.BOOT_COMPLETED" },
            },
            {
              $: {
                "android:name": "android.intent.action.MY_PACKAGE_REPLACED",
              },
            },
          ],
        },
      ],
    });

    return modConfig;
  });

  return config;
}

// --- DeviceProtectedStorage native module generation (T003) ---

function generateDeviceProtectedStorageKt(packageName) {
  return `package ${packageName}

import android.content.Context
import android.content.SharedPreferences
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise

class DeviceProtectedStorage(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "DeviceProtectedStorage"

    private fun getPrefs(): SharedPreferences {
        val ctx = reactApplicationContext.createDeviceProtectedStorageContext()
        return ctx.getSharedPreferences("device_protected_prefs", Context.MODE_PRIVATE)
    }

    @ReactMethod
    fun setTracking(enabled: Boolean, promise: Promise) {
        try {
            getPrefs().edit().putBoolean("tracking_enabled", enabled).apply()
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("SET_TRACKING_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun getTracking(promise: Promise) {
        try {
            val enabled = getPrefs().getBoolean("tracking_enabled", false)
            promise.resolve(enabled)
        } catch (e: Exception) {
            promise.reject("GET_TRACKING_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun consumeBootTrigger(promise: Promise) {
        try {
            val prefs = getPrefs()
            val trigger = prefs.getString("boot_trigger", null)
            if (trigger != null) {
                prefs.edit().remove("boot_trigger").apply()
            }
            promise.resolve(trigger)
        } catch (e: Exception) {
            promise.reject("CONSUME_BOOT_TRIGGER_ERROR", e.message, e)
        }
    }
}
`;
}

function generateDeviceProtectedStoragePackageKt(packageName) {
  return `package ${packageName}

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class DeviceProtectedStoragePackage : ReactPackage {
    override fun createNativeModules(
        reactContext: ReactApplicationContext
    ): List<NativeModule> {
        return listOf(DeviceProtectedStorage(reactContext))
    }

    override fun createViewManagers(
        reactContext: ReactApplicationContext
    ): List<ViewManager<*, *>> {
        return emptyList()
    }
}
`;
}

// --- BootRestartReceiver native code generation (T004) ---

function generateBootRestartReceiverKt(packageName) {
  return `package ${packageName}

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.os.Build
import android.util.Log

class BootRestartReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "BootRestartReceiver"
        private const val PREFS_NAME = "device_protected_prefs"
        private const val BOOT_LOOP_THRESHOLD_MS = 60_000L
    }

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        Log.d(TAG, "Received broadcast: \$action")

        val prefs = getDeviceProtectedPrefs(context) ?: run {
            Log.w(TAG, "Could not access device-protected storage")
            return
        }

        val trackingEnabled = prefs.getBoolean("tracking_enabled", false)
        if (!trackingEnabled) {
            Log.d(TAG, "Tracking not enabled, ignoring broadcast")
            return
        }

        // Boot-loop guard
        val lastAttempt = prefs.getLong("last_boot_attempt", 0L)
        val now = System.currentTimeMillis()
        if (now - lastAttempt < BOOT_LOOP_THRESHOLD_MS) {
            Log.w(TAG, "Boot-loop guard: skipping (last attempt \${now - lastAttempt}ms ago)")
            return
        }

        // Write trigger source for JS layer to consume
        val triggerSource = when (action) {
            "android.intent.action.MY_PACKAGE_REPLACED" -> "app_update"
            else -> "boot"
        }
        prefs.edit().putString("boot_trigger", triggerSource).apply()

        // Launch MainActivity — record boot attempt only on success
        try {
            val launchIntent = Intent(context, Class.forName("\${context.packageName}.MainActivity"))
            launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(launchIntent)
            prefs.edit().putLong("last_boot_attempt", now).apply()
            Log.d(TAG, "Launched MainActivity with trigger: \$triggerSource")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to launch MainActivity", e)
        }
    }

    private fun getDeviceProtectedPrefs(context: Context): SharedPreferences? {
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                val deviceContext = context.createDeviceProtectedStorageContext()
                deviceContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            } else {
                // Fallback for Android < 7.0: use regular prefs
                context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to get device-protected prefs", e)
            null
        }
    }
}
`;
}

// --- Native file generation via withDangerousMod ---

function withBootRestartNativeFiles(config) {
  return withDangerousMod(config, [
    "android",
    (modConfig) => {
      const packageName = modConfig.android?.package ?? "com.caab.vantracker";
      const packagePath = packageName.replace(/\./g, "/");
      const projectRoot = modConfig.modRequest.projectRoot;
      const javaDir = path.join(
        projectRoot,
        "android",
        "app",
        "src",
        "main",
        "java",
        packagePath,
      );

      fs.mkdirSync(javaDir, { recursive: true });

      fs.writeFileSync(
        path.join(javaDir, "DeviceProtectedStorage.kt"),
        generateDeviceProtectedStorageKt(packageName),
      );

      fs.writeFileSync(
        path.join(javaDir, "DeviceProtectedStoragePackage.kt"),
        generateDeviceProtectedStoragePackageKt(packageName),
      );

      fs.writeFileSync(
        path.join(javaDir, "BootRestartReceiver.kt"),
        generateBootRestartReceiverKt(packageName),
      );

      return modConfig;
    },
  ]);
}

// --- Register native package in MainApplication ---

function withBootRestartPackageRegistration(config) {
  return withDangerousMod(config, [
    "android",
    (modConfig) => {
      const packageName = modConfig.android?.package ?? "com.caab.vantracker";
      const packagePath = packageName.replace(/\./g, "/");
      const projectRoot = modConfig.modRequest.projectRoot;
      const mainAppPath = path.join(
        projectRoot,
        "android",
        "app",
        "src",
        "main",
        "java",
        packagePath,
        "MainApplication.kt",
      );

      if (!fs.existsSync(mainAppPath)) return modConfig;

      let content = fs.readFileSync(mainAppPath, "utf-8");

      const registrationLine = `add(DeviceProtectedStoragePackage())`;
      if (content.includes(registrationLine)) return modConfig;

      // New architecture: PackageList(this).packages.apply { ... }
      const newArchMarker = "// add(MyReactNativePackage())";
      // Old architecture: val packages = PackageList(this).packages
      const oldArchMarker = "val packages = PackageList(this).packages";

      if (content.includes(newArchMarker)) {
        content = content.replace(
          newArchMarker,
          `${newArchMarker}\n          ${registrationLine}`,
        );
        fs.writeFileSync(mainAppPath, content);
      } else if (content.includes(oldArchMarker)) {
        content = content.replace(
          oldArchMarker,
          `${oldArchMarker}\n            packages.${registrationLine}`,
        );
        fs.writeFileSync(mainAppPath, content);
      } else {
        throw new Error(
          `[withBootRestart] Could not find package registration markers in ${mainAppPath}. ` +
            `React Native template may have changed; plugin needs update.`,
        );
      }

      return modConfig;
    },
  ]);
}

// --- Main plugin export ---

function withBootRestart(config) {
  config = withBootRestartManifest(config);
  config = withBootRestartNativeFiles(config);
  config = withBootRestartPackageRegistration(config);
  return config;
}

module.exports = withBootRestart;
