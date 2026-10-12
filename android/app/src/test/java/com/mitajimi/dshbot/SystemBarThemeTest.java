package com.mitajimi.dshbot;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class SystemBarThemeTest {
    @Test
    public void parsesQuotedHexFromEvaluateJavascript() {
        assertEquals(0xFFDCE3EE, SystemBarTheme.parse("\"#dce3ee\""));
        assertEquals(0xFF000000, SystemBarTheme.parse("\"#000000\""));
        assertEquals(0xFFFFFFFF, SystemBarTheme.parse("\"#FFFFFF\""));
    }

    @Test
    public void emptyOrUnexpectedResultsMeanNoColour() {
        assertEquals(0, SystemBarTheme.parse(null));
        assertEquals(0, SystemBarTheme.parse("null"));
        assertEquals(0, SystemBarTheme.parse("\"\""));
        assertEquals(0, SystemBarTheme.parse("\"#fff\""));
        assertEquals(0, SystemBarTheme.parse("\"#12345g\""));
        assertEquals(0, SystemBarTheme.parse("\"rgb(1, 2, 3)\""));
    }

    @Test
    public void lightAndDarkBackgroundsPickMatchingIconStyle() {
        assertTrue(SystemBarTheme.isLight(0xFFDCE3EE));
        assertTrue(SystemBarTheme.isLight(0xFFFFFFFF));
        assertFalse(SystemBarTheme.isLight(0xFF000000));
        assertFalse(SystemBarTheme.isLight(0xFF0F1220));
    }
}
