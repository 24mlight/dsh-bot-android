package com.mitajimi.dshbot;

/**
 * Pure helpers (no Android types, so plain JUnit can test them) for painting the
 * status bar and gesture bar with the page's own background colour.
 */
final class SystemBarTheme {
    private SystemBarTheme() {}

    /**
     * Parses the result of evaluateJavascript for dsh-bar-color.js, a JSON string
     * such as "\"#dce3ee\"". Returns an opaque ARGB int, or 0 when the page
     * reported no opaque background (or anything unexpected).
     */
    static int parse(String jsResult) {
        if (jsResult == null) return 0;
        String s = jsResult.trim();
        if (s.length() >= 2 && s.charAt(0) == '"' && s.charAt(s.length() - 1) == '"') {
            s = s.substring(1, s.length() - 1);
        }
        if (s.length() != 7 || s.charAt(0) != '#') return 0;
        try {
            return 0xFF000000 | Integer.parseInt(s.substring(1), 16);
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    /** True when the colour is light, so the bar icons should be dark. */
    static boolean isLight(int argb) {
        double r = channel((argb >> 16) & 0xFF);
        double g = channel((argb >> 8) & 0xFF);
        double b = channel(argb & 0xFF);
        return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5;
    }

    private static double channel(int value) {
        double c = value / 255.0;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }
}
