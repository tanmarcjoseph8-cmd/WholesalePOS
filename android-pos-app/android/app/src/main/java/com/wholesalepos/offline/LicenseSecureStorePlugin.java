package com.wholesalepos.offline;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.HashSet;
import java.util.Set;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name = "LicenseSecureStore")
public class LicenseSecureStorePlugin extends Plugin {
    private static final String KEY_ALIAS = "wholesalepos_license_secure_clock_v1";
    private static final String PREFS = "wholesalepos_license_protected";
    private static final String STATE = "encrypted_state";

    @PluginMethod
    public synchronized void getState(PluginCall call) {
        try { call.resolve(toJs(readState())); }
        catch (Exception error) { call.reject("Protected license state could not be read.", error); }
    }

    @PluginMethod
    public synchronized void recordVerification(PluginCall call) {
        try {
            String licenseId = call.getString("licenseId");
            if (licenseId == null || licenseId.isEmpty()) { call.reject("License ID is required."); return; }
            boolean successfulLaunch = Boolean.TRUE.equals(call.getBoolean("successfulLaunch", false));
            JSONObject state = readState();
            long current = System.currentTimeMillis();
            long previousVerified = state.optLong("lastVerifiedTime", 0L);
            if (current >= previousVerified) state.put("lastVerifiedTime", current);
            if (successfulLaunch && current >= state.optLong("lastSuccessfulLaunch", 0L)) state.put("lastSuccessfulLaunch", current);
            if (!licenseId.equals(state.optString("warningLicenseId", ""))) {
                state.put("warningLicenseId", licenseId);
                state.put("dismissedWarnings", new JSONArray());
            }
            writeState(state);
            call.resolve(toJs(state));
        } catch (Exception error) { call.reject("Protected license state could not be updated.", error); }
    }

    @PluginMethod
    public synchronized void dismissWarning(PluginCall call) {
        try {
            String licenseId = call.getString("licenseId");
            Integer thresholdDays = call.getInt("thresholdDays");
            if (licenseId == null || thresholdDays == null) { call.reject("License warning information is required."); return; }
            JSONObject state = readState();
            Set<Integer> dismissed = new HashSet<>();
            if (licenseId.equals(state.optString("warningLicenseId", ""))) {
                JSONArray values = state.optJSONArray("dismissedWarnings");
                if (values != null) for (int index = 0; index < values.length(); index++) dismissed.add(values.optInt(index));
            }
            dismissed.add(thresholdDays);
            JSONArray values = new JSONArray();
            for (Integer value : dismissed) values.put(value);
            state.put("warningLicenseId", licenseId);
            state.put("dismissedWarnings", values);
            writeState(state);
            call.resolve(toJs(state));
        } catch (Exception error) { call.reject("License warning could not be dismissed.", error); }
    }

    private JSONObject readState() throws Exception {
        String envelope = preferences().getString(STATE, null);
        if (envelope == null) return new JSONObject();
        JSONObject encoded = new JSONObject(envelope);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(encoded.getString("iv"), Base64.NO_WRAP)));
        byte[] plaintext = cipher.doFinal(Base64.decode(encoded.getString("ciphertext"), Base64.NO_WRAP));
        try { return new JSONObject(new String(plaintext, StandardCharsets.UTF_8)); }
        finally { java.util.Arrays.fill(plaintext, (byte) 0); }
    }

    private void writeState(JSONObject state) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key());
        byte[] plaintext = state.toString().getBytes(StandardCharsets.UTF_8);
        try {
            JSONObject envelope = new JSONObject();
            envelope.put("iv", Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP));
            envelope.put("ciphertext", Base64.encodeToString(cipher.doFinal(plaintext), Base64.NO_WRAP));
            if (!preferences().edit().putString(STATE, envelope.toString()).commit()) throw new IllegalStateException("Secure state was not persisted.");
        } finally { java.util.Arrays.fill(plaintext, (byte) 0); }
    }

    private SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (store.containsAlias(KEY_ALIAS)) return ((KeyStore.SecretKeyEntry) store.getEntry(KEY_ALIAS, null)).getSecretKey();
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setKeySize(256).build());
        return generator.generateKey();
    }

    private SharedPreferences preferences() { return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    private JSObject toJs(JSONObject state) throws Exception {
        JSObject result = new JSObject();
        result.put("lastVerifiedTime", state.has("lastVerifiedTime") ? state.getLong("lastVerifiedTime") : JSONObject.NULL);
        result.put("lastSuccessfulLaunch", state.has("lastSuccessfulLaunch") ? state.getLong("lastSuccessfulLaunch") : JSONObject.NULL);
        result.put("warningLicenseId", state.has("warningLicenseId") ? state.getString("warningLicenseId") : JSONObject.NULL);
        result.put("dismissedWarnings", new JSArray(state.optJSONArray("dismissedWarnings") == null ? "[]" : state.getJSONArray("dismissedWarnings").toString()));
        return result;
    }
}
