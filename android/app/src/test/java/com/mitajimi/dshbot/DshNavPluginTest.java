package com.mitajimi.dshbot;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;

public class DshNavPluginTest {
    @Test
    public void anyHttpOrHttpsServerHasAnOrigin() {
        assertEquals("https://dsh.example.com", DshNavPlugin.originOf("https", "dsh.example.com", -1, null));
        assertEquals("https://dsh.example.com", DshNavPlugin.originOf("https", "DSH.Example.com", -1, null));
        assertEquals("http://192.168.1.20:3080", DshNavPlugin.originOf("http", "192.168.1.20", 3080, null));
        assertEquals("https://dsh.example.com:8443", DshNavPlugin.originOf("https", "dsh.example.com", 8443, null));
    }

    @Test
    public void defaultPortsAreDropped() {
        assertEquals("https://h.example", DshNavPlugin.originOf("https", "h.example", 443, null));
        assertEquals("http://h.example", DshNavPlugin.originOf("http", "h.example", 80, null));
    }

    @Test
    public void otherSchemesMissingHostsAndUserInfoAreRefused() {
        assertNull(DshNavPlugin.originOf("javascript", "x", -1, null));
        assertNull(DshNavPlugin.originOf("file", "", -1, null));
        assertNull(DshNavPlugin.originOf("intent", "x", -1, null));
        assertNull(DshNavPlugin.originOf("https", null, -1, null));
        assertNull(DshNavPlugin.originOf("https", "", -1, null));
        assertNull(DshNavPlugin.originOf("https", "evil.com", -1, "dsh.example.com"));
    }
}
