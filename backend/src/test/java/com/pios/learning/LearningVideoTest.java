package com.pios.learning;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
class LearningVideoTest {
    @Test void canonicalVideoReferencesPreserveShareTimestamps(){
        assertEquals(new LearningVideo.Reference("M7lc1UVf-VE",192),LearningVideo.parse("https://youtu.be/M7lc1UVf-VE?t=3m12s"));
        assertEquals(3723,LearningVideo.parse("https://www.youtube.com/watch?v=M7lc1UVf-VE&t=1h2m3s").startSeconds());
        assertEquals("M7lc1UVf-VE",LearningVideo.parse("https://www.youtube-nocookie.com/embed/M7lc1UVf-VE").id());
        assertNull(LearningVideo.parse("").id());
    }
    @Test void rejectsLookalikeHostsSchemesInvalidIdsAndPlaylistOnlyLinks(){
        for(String url:new String[]{"javascript:alert(1)","https://youtube.com.evil/watch?v=M7lc1UVf-VE","https://youtube.com@127.0.0.1/watch?v=M7lc1UVf-VE","https://www.youtube.com/watch?v=bad","https://youtube.com/playlist?list=PL123","https://youtu.be/M7lc1UVf-VE?t=99h"})assertThrows(IllegalArgumentException.class,()->LearningVideo.parse(url));
    }
}
