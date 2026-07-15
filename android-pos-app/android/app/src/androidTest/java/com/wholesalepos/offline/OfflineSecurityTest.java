package com.wholesalepos.offline;

import static org.junit.Assert.assertEquals;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class OfflineSecurityTest {
    @Test
    public void applicationHasNoInternetPermission() {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertEquals("com.wholesalepos.offline.debug", context.getPackageName());
        assertEquals(
            PackageManager.PERMISSION_DENIED,
            context.checkSelfPermission(Manifest.permission.INTERNET)
        );
    }
}
