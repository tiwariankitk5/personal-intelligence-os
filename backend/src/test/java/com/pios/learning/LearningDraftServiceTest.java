package com.pios.learning;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import static org.junit.jupiter.api.Assertions.*;
class LearningDraftServiceTest {
    ObjectMapper mapper=new ObjectMapper();
    String valid="""
      {"article":"Study the transaction.","questions":[{"prompt":"What is stored together?","options":["Event and business row","Neither"],"correctIndex":0,"explanation":"The transcript describes atomic writes.","evidenceSegment":2,"sourceQuote":"event and business row","replaySeconds":9999}]}
      """;
    @Test void replayTimesComeFromVerifiedSourceSegmentsAndDraftRequiresReview()throws Exception{
        var source=TranscriptText.parse("00:00 Introduction.\n03:12 Write the event and business row together.");
        var draft=LearningDraftService.validate("Transactions",mapper.readTree(valid),source);
        assertTrue(draft.reviewRequired());assertTrue(draft.timestamped());assertEquals(192,draft.questions().get(0).replaySeconds());
        assertEquals("event and business row",draft.questions().get(0).sourceQuote());
    }
    @Test void refusesInventedQuotesSegmentsAndAnswerIndices()throws Exception{
        var source=TranscriptText.parse("00:00 Introduction.\n03:12 Write the event and business row together.");
        for(String json:new String[]{valid.replace("event and business row\"","made-up quote\""),valid.replace("\"evidenceSegment\":2","\"evidenceSegment\":3"),valid.replace("\"correctIndex\":0","\"correctIndex\":7")}){
            var node=mapper.readTree(json);assertThrows(ResponseStatusException.class,()->LearningDraftService.validate("Transactions",node,source));
        }
    }
}
