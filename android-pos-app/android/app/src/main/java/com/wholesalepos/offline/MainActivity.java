package com.wholesalepos.offline;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(LicenseSecureStorePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
