package com.caab.vantracker

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
    fun setShiftActive(active: Boolean, routeId: String?, promise: Promise) {
        try {
            getPrefs().edit()
                .putBoolean("shift_active", active)
                .putString("active_route_id", routeId)
                .apply()
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("SET_SHIFT_ACTIVE_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun getShiftActive(promise: Promise) {
        try {
            val active = getPrefs().getBoolean("shift_active", false)
            promise.resolve(active)
        } catch (e: Exception) {
            promise.reject("GET_SHIFT_ACTIVE_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun getActiveRouteId(promise: Promise) {
        try {
            val routeId = getPrefs().getString("active_route_id", null)
            promise.resolve(routeId)
        } catch (e: Exception) {
            promise.reject("GET_ACTIVE_ROUTE_ID_ERROR", e.message, e)
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
