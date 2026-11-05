package com.pios.learning;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/** Plans remaining work without pretending that merely watching a player proves mastery. */
public final class StudyPlan {
    private StudyPlan() { }
    public record Lesson(UUID id,String title,int minutes,boolean completed,boolean known) { }
    public record Block(int day,UUID lessonId,String title,int minutes,int offsetMinutes) { }
    public static List<Block> build(List<Lesson> lessons,int dailyMinutes) {
        if(dailyMinutes<15 || dailyMinutes>240)throw new IllegalArgumentException("Daily study time must be between 15 and 240 minutes.");
        var blocks=new ArrayList<Block>();int day=1,used=0;
        for(var lesson:lessons) {
            if(lesson.completed()||lesson.known())continue;
            int remaining=lesson.minutes(),offset=0;
            while(remaining>0) {
                if(used==dailyMinutes){day++;used=0;}
                int minutes=Math.min(remaining,dailyMinutes-used);
                blocks.add(new Block(day,lesson.id(),lesson.title(),minutes,offset));
                remaining-=minutes;offset+=minutes;used+=minutes;
            }
        }
        return blocks;
    }
}
