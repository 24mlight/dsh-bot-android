package com.mitajimi.dshbot;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class DisplayModesTest {
    @Test
    public void picksTheFastestModeAtTheCurrentResolution() {
        int[] ids = {1, 2, 3, 4};
        int[] w = {1080, 1080, 1440, 1080};
        int[] h = {2400, 2400, 3200, 2400};
        float[] hz = {60f, 120f, 144f, 90f};
        assertEquals(2, DisplayModes.fastest(1, ids, w, h, hz));
        assertEquals("never switches resolution", 2, DisplayModes.fastest(4, ids, w, h, hz));
        assertEquals("already the fastest at that size", 3, DisplayModes.fastest(3, ids, w, h, hz));
    }

    @Test
    public void keepsTheCurrentModeWhenNothingIsFaster() {
        assertEquals(7, DisplayModes.fastest(7, new int[] {7}, new int[] {1080}, new int[] {2400}, new float[] {60f}));
        // 60.0 and 59.94 are the same rate as far as smoothness goes.
        assertEquals(1, DisplayModes.fastest(1, new int[] {1, 2}, new int[] {1, 1}, new int[] {1, 1}, new float[] {60f, 60.2f}));
    }

    @Test
    public void unexpectedInputKeepsTheCurrentMode() {
        assertEquals(5, DisplayModes.fastest(5, null, null, null, null));
        assertEquals(5, DisplayModes.fastest(5, new int[] {1}, new int[] {1}, new int[] {1}, new float[] {120f}));
        assertEquals(5, DisplayModes.fastest(5, new int[] {5, 6}, new int[] {1}, new int[] {1, 1}, new float[] {60f, 120f}));
    }
}
