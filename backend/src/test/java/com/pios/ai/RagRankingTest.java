package com.pios.ai;

import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class RagRankingTest {
    RagRanking.Passage passage(UUID document,int index){return new RagRanking.Passage(UUID.randomUUID(),document,"Document","note",index,"Exact passage "+index);}
    @Test void overlapBetweenLexicalAndSemanticRanksWinsWithoutTreatingRanksAsConfidence(){
        var a=passage(UUID.randomUUID(),0);var b=passage(UUID.randomUUID(),0);var shared=passage(UUID.randomUUID(),0);
        var result=RagRanking.fuse(List.of(a,shared),List.of(b,shared),5);
        assertEquals(shared,result.get(0));assertEquals(3,result.size());
    }
    @Test void fusionCapsPassagesPerDocumentAndPreservesOtherDocuments(){
        UUID doc=UUID.randomUUID();var other=passage(UUID.randomUUID(),0);
        var result=RagRanking.fuse(List.of(passage(doc,0),passage(doc,1),passage(doc,2),other),List.of(),5);
        assertEquals(3,result.size());assertTrue(result.contains(other));
    }
    @Test void citationsContainOnlyReferencedPassagesWithOriginalNumbersAndExactExcerpts(){
        var passages=List.of(passage(UUID.randomUUID(),0),passage(UUID.randomUUID(),1),passage(UUID.randomUUID(),2));
        var result=RagRanking.verify("Evidence supports this [3]. Invalid [9] and [999999999999].",passages);
        assertEquals(1,result.citations().size());assertEquals(3,result.citations().get(0).number());
        assertEquals(passages.get(2).excerpt(),result.citations().get(0).excerpt());assertFalse(result.answer().contains("[9]"));
        assertFalse(result.answer().contains("[999999999999]"));
    }
    @Test void uncitedAnswersAreMarkedUnverifiedAndEmptyRetrievalCannotInventSources(){
        var result=RagRanking.verify("General answer.",List.of(passage(UUID.randomUUID(),0)));
        assertTrue(result.answer().contains("unverified"));assertTrue(result.citations().isEmpty());
        assertEquals("Claim [unsupported citation]",RagRanking.verify("Claim [1]",List.of()).answer());
    }
}
