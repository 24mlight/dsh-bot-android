package com.mitajimi.dshbot;

/**
 * Pure helper (no Android types, so plain JUnit can test it) for choosing the
 * screen mode the app asks for: the fastest refresh rate at the resolution the
 * screen already uses.
 */
final class DisplayModes {
    private DisplayModes() {}

    /**
     * Returns the id of the fastest mode with the current mode's resolution, or
     * {@code currentId} when no mode is faster (or the lists don't line up).
     */
    static int fastest(int currentId, int[] ids, int[] widths, int[] heights, float[] rates) {
        if (ids == null || widths == null || heights == null || rates == null) return currentId;
        int n = ids.length;
        if (widths.length != n || heights.length != n || rates.length != n) return currentId;
        int cur = -1;
        for (int i = 0; i < n; i++) if (ids[i] == currentId) cur = i;
        if (cur < 0) return currentId;
        int best = cur;
        for (int i = 0; i < n; i++) {
            if (widths[i] != widths[cur] || heights[i] != heights[cur]) continue;
            if (rates[i] > rates[best] + 0.5f) best = i;
        }
        return ids[best];
    }
}
