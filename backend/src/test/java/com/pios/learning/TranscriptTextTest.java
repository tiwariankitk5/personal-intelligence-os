package com.pios.learning;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
class TranscriptTextTest {
    @Test void parsesCopiedTimestampLinesAndInlineTextWithoutInventingTimes(){
        var result=TranscriptText.parse("00:00\nIntroduction.\n[03:12] Atomic writes.\nMore context.\n1:02:03 Final topic.");
        assertTrue(result.timestamped());assertEquals(3,result.segments().size());assertEquals(192,result.segments().get(1).seconds());
        assertEquals("Atomic writes.\nMore context.",result.segments().get(1).text());assertEquals(3723,result.segments().get(2).seconds());
    }
    @Test void plainTextIsExplicitlyUntimed(){var result=TranscriptText.parse("A readable transcript without time markers.");assertFalse(result.timestamped());assertEquals(0,result.segments().get(0).seconds());}
    @Test void rejectsInvalidOrBackwardsTimeAndEmptyContent(){for(String text:new String[]{"00:60 bad","03:12 Topic\n00:01 Earlier","00:00\n"})assertThrows(IllegalArgumentException.class,()->TranscriptText.parse(text));}
}
