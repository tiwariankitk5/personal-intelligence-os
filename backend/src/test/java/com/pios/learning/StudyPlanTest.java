package com.pios.learning;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class StudyPlanTest {
    @Test void splitsLongLessonsAcrossDaysAndSkipsCompletedOrKnownMaterial(){
        UUID longId=UUID.randomUUID(),shortId=UUID.randomUUID();
        var plan=StudyPlan.build(List.of(new StudyPlan.Lesson(UUID.randomUUID(),"Completed",40,true,false),new StudyPlan.Lesson(longId,"Long",75,false,false),new StudyPlan.Lesson(UUID.randomUUID(),"Known",60,false,true),new StudyPlan.Lesson(shortId,"Short",10,false,false)),30);
        assertEquals(List.of(1,2,3,3),plan.stream().map(StudyPlan.Block::day).toList());
        assertEquals(List.of(30,30,15,10),plan.stream().map(StudyPlan.Block::minutes).toList());
        assertEquals(List.of(0,30,60,0),plan.stream().map(StudyPlan.Block::offsetMinutes).toList());
        assertEquals(85,plan.stream().mapToInt(StudyPlan.Block::minutes).sum());
    }
    @Test void paceChangesReflowTheSameRemainingWork(){
        var lessons=List.of(new StudyPlan.Lesson(UUID.randomUUID(),"Topic",75,false,false));
        assertEquals(3,StudyPlan.build(lessons,30).size());assertEquals(2,StudyPlan.build(lessons,60).size());
        assertTrue(StudyPlan.build(List.of(new StudyPlan.Lesson(UUID.randomUUID(),"Done",10,true,false)),30).isEmpty());
    }
    @Test void invalidDailyBudgetsAreRejected(){assertThrows(IllegalArgumentException.class,()->StudyPlan.build(List.of(),0));assertThrows(IllegalArgumentException.class,()->StudyPlan.build(List.of(),241));}
}
