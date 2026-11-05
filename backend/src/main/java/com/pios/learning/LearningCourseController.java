package com.pios.learning;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.pios.auth.UserPrincipal;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/learning")
public class LearningCourseController {
    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;
    private final LearningDraftService drafts;
    public LearningCourseController(JdbcTemplate jdbc,ObjectMapper mapper,LearningDraftService drafts){this.jdbc=jdbc;this.mapper=mapper;this.drafts=drafts;}
    private UUID user(){return ((UserPrincipal)SecurityContextHolder.getContext().getAuthentication().getPrincipal()).id();}
    private record Course(int dailyMinutes,int progress) { }
    private Course ownCourse(UUID id,boolean lock){
        Course result=jdbc.query("SELECT daily_minutes,progress FROM learning_objectives WHERE id=? AND user_id=?"+(lock?" FOR UPDATE":""),rs->rs.next()?new Course(rs.getInt(1),rs.getInt(2)):null,id,user());
        if(result==null)throw missing();return result;
    }
    private UUID ownLesson(UUID id,boolean lock){
        UUID course=jdbc.query("SELECT l.objective_id FROM learning_lessons l JOIN learning_objectives o ON o.id=l.objective_id AND o.user_id=l.user_id WHERE l.id=? AND l.user_id=?",rs->rs.next()?rs.getObject(1,UUID.class):null,id,user());
        if(course==null)throw missing();ownCourse(course,lock);return course;
    }
    private static ResponseStatusException missing(){return new ResponseStatusException(HttpStatus.NOT_FOUND,"Learning item not found.");}
    private void progress(UUID course){jdbc.update("""
        UPDATE learning_objectives SET progress=coalesce((SELECT round(100.0*count(*) FILTER(WHERE completed OR known)/nullif(count(*),0))::integer
        FROM learning_lessons WHERE objective_id=? AND user_id=?),0),updated_at=now() WHERE id=? AND user_id=?
        """,course,user(),course,user());}
    private List<String> options(String json){try{return mapper.readValue(json,new TypeReference<List<String>>(){});}catch(Exception ex){throw new IllegalStateException("Stored checkpoint could not be read.");}}
    private String json(Object value){try{return mapper.writeValueAsString(value);}catch(Exception ex){throw new IllegalArgumentException("Checkpoint options could not be saved.");}}

    @GetMapping("/objectives/{id}/course")
    @Transactional(readOnly=true,isolation=org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
    public CourseView course(@PathVariable UUID id){
        Course course=ownCourse(id,false);
        var lessons=jdbc.query("SELECT * FROM learning_lessons WHERE objective_id=? AND user_id=? ORDER BY position,created_at,id",(rs,n)->{
            UUID lesson=rs.getObject("id",UUID.class);
            var questions=jdbc.query("SELECT id,prompt,options,passed FROM learning_questions WHERE lesson_id=? ORDER BY position,id",
                    (q,i)->new QuestionView(q.getObject(1,UUID.class),q.getString(2),options(q.getString(3)),q.getBoolean(4)),lesson);
            var notes=jdbc.query("SELECT id,seconds,body,exported_note_id,created_at FROM learning_lesson_notes WHERE lesson_id=? AND user_id=? ORDER BY seconds,created_at,id",
                    (note,i)->new TimedNote(note.getObject(1,UUID.class),note.getInt(2),note.getString(3),note.getObject(4,UUID.class),note.getTimestamp(5).toInstant()),lesson,user());
            return new LessonView(lesson,rs.getString("title"),rs.getInt("position"),rs.getInt("duration_minutes"),rs.getString("video_id"),rs.getInt("start_seconds"),
                    rs.getObject("end_seconds",Integer.class),rs.getString("article"),rs.getBoolean("completed"),rs.getBoolean("known"),questions,notes);
        },id,user());
        var plan=StudyPlan.build(lessons.stream().map(l->new StudyPlan.Lesson(l.id(),l.title(),l.durationMinutes(),l.completed(),l.known())).toList(),course.dailyMinutes());
        Integer used=jdbc.query("SELECT calls FROM learning_generation_usage WHERE user_id=? AND usage_day=?",rs->{return rs.next()?rs.getInt(1):0;},user(),LocalDate.now(ZoneOffset.UTC));
        return new CourseView(id,course.dailyMinutes(),course.progress(),lessons,plan,used==null?0:used);
    }
    @PutMapping("/objectives/{id}/pace") @Transactional
    public CourseView pace(@PathVariable UUID id,@Valid @RequestBody PaceRequest body){ownCourse(id,true);jdbc.update("UPDATE learning_objectives SET daily_minutes=?,updated_at=now() WHERE id=? AND user_id=?",body.dailyMinutes(),id,user());return course(id);}

    @PostMapping("/objectives/{id}/lessons") @Transactional
    public Map<String,UUID> addLesson(@PathVariable UUID id,@Valid @RequestBody LessonRequest body){
        ownCourse(id,true);
        if(body.aiDraft()&&!body.reviewed())throw new IllegalArgumentException("Review the AI lesson draft before saving it.");
        Integer count=jdbc.queryForObject("SELECT COUNT(*) FROM learning_lessons WHERE objective_id=? AND user_id=?",Integer.class,id,user());
        if(count!=null&&count>=50)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"A course currently supports up to 50 lessons.");
        Integer position=jdbc.queryForObject("SELECT coalesce(max(position),-1)+1 FROM learning_lessons WHERE objective_id=? AND user_id=?",Integer.class,id,user());
        UUID lesson=UUID.randomUUID();var video=LearningVideo.parse(body.videoUrl());int start=body.startSeconds()==null?video.startSeconds():body.startSeconds();validateRange(start,body.endSeconds());
        int duration=body.endSeconds()==null?body.durationMinutes():Math.max(1,(body.endSeconds()-start+59)/60);
        jdbc.update("INSERT INTO learning_lessons(id,user_id,objective_id,title,position,duration_minutes,video_id,start_seconds,end_seconds,article) VALUES (?,?,?,?,?,?,?,?,?,?)",
                lesson,user(),id,body.title().trim(),position,duration,video.id(),start,body.endSeconds(),body.article()==null?"":body.article());
        for(var question:body.questions()==null?List.<QuestionRequest>of():body.questions())insertQuestion(lesson,question);
        progress(id);return Map.of("id",lesson);
    }
    @PutMapping("/lessons/{id}") @Transactional
    public CourseView editLesson(@PathVariable UUID id,@Valid @RequestBody LessonRequest body){
        UUID course=ownLesson(id,true);if(body.aiDraft()&&!body.reviewed())throw new IllegalArgumentException("Review the AI lesson draft before saving it.");var video=LearningVideo.parse(body.videoUrl());int start=body.startSeconds()==null?video.startSeconds():body.startSeconds();validateRange(start,body.endSeconds());
        int duration=body.endSeconds()==null?body.durationMinutes():Math.max(1,(body.endSeconds()-start+59)/60);
        jdbc.update("UPDATE learning_lessons SET title=?,duration_minutes=?,video_id=?,start_seconds=?,end_seconds=?,article=?,completed=false,known=false WHERE id=? AND user_id=?",
                body.title().trim(),duration,video.id(),start,body.endSeconds(),body.article()==null?"":body.article(),id,user());
        if(body.questions()!=null){
            jdbc.update("DELETE FROM learning_questions WHERE lesson_id=?",id);
            for(var question:body.questions())insertQuestion(id,question);
        }else jdbc.update("UPDATE learning_questions SET passed=false,last_choice=NULL WHERE lesson_id=?",id);
        progress(course);return course(course);
    }
    private void validateRange(int start,Integer end){if(start<0||start>86400||end!=null&&(end<=start||end>86400))throw new IllegalArgumentException("The end time must follow the lesson start and stay within 24 hours.");}
    @DeleteMapping("/lessons/{id}") @Transactional
    public CourseView deleteLesson(@PathVariable UUID id){UUID course=ownLesson(id,true);jdbc.update("DELETE FROM learning_lessons WHERE id=? AND user_id=?",id,user());progress(course);return course(course);}
    @PatchMapping("/lessons/{id}/state") @Transactional
    public CourseView state(@PathVariable UUID id,@RequestBody StateRequest body){
        UUID course=ownLesson(id,true);
        Integer unanswered=jdbc.queryForObject("SELECT COUNT(*) FROM learning_questions WHERE lesson_id=? AND NOT passed",Integer.class,id);
        if(body.completed()&&unanswered!=null&&unanswered>0)throw new ResponseStatusException(HttpStatus.CONFLICT,"Pass the lesson checkpoints before marking it complete.");
        jdbc.update("UPDATE learning_lessons SET completed=?,known=false WHERE id=? AND user_id=?",body.completed(),id,user());progress(course);return course(course);
    }
    private void insertQuestion(UUID lesson,QuestionRequest body){
        if(body.options().stream().map(String::trim).distinct().count()!=body.options().size())throw new IllegalArgumentException("Checkpoint answer options must be different.");
        if(body.correctIndex()<0||body.correctIndex()>=body.options().size())throw new IllegalArgumentException("Choose a valid correct answer.");
        var range=jdbc.queryForMap("SELECT start_seconds,end_seconds FROM learning_lessons WHERE id=? AND user_id=?",lesson,user());
        if(body.replaySeconds()<(Integer)range.get("start_seconds")||range.get("end_seconds")!=null&&body.replaySeconds()>(Integer)range.get("end_seconds"))throw new IllegalArgumentException("Checkpoint replay time must be inside the lesson range.");
        Integer position=jdbc.queryForObject("SELECT coalesce(max(position),-1)+1 FROM learning_questions WHERE lesson_id=?",Integer.class,lesson);
        jdbc.update("INSERT INTO learning_questions(id,lesson_id,prompt,options,correct_index,explanation,replay_seconds,source_quote,position) VALUES (?,?,?,?::jsonb,?,?,?,?,?)",
                UUID.randomUUID(),lesson,body.prompt().trim(),json(body.options()),body.correctIndex(),body.explanation()==null?"":body.explanation(),body.replaySeconds(),body.sourceQuote()==null?"":body.sourceQuote(),position);
    }
    @PostMapping("/lessons/{id}/questions") @Transactional
    public CourseView addQuestion(@PathVariable UUID id,@Valid @RequestBody QuestionRequest body){
        UUID course=ownLesson(id,true);Integer count=jdbc.queryForObject("SELECT COUNT(*) FROM learning_questions WHERE lesson_id=?",Integer.class,id);
        if(count!=null&&count>=5)throw new IllegalArgumentException("Each lesson currently supports up to five checkpoints.");
        insertQuestion(id,body);jdbc.update("UPDATE learning_lessons SET completed=false,known=false WHERE id=? AND user_id=?",id,user());progress(course);return course(course);
    }
    @DeleteMapping("/questions/{id}") @Transactional
    public CourseView deleteQuestion(@PathVariable UUID id){UUID lesson=questionLesson(id);UUID course=ownLesson(lesson,true);jdbc.update("DELETE FROM learning_questions WHERE id=? AND lesson_id=?",id,lesson);return course(course);}
    private UUID questionLesson(UUID id){UUID lesson=jdbc.query("SELECT q.lesson_id FROM learning_questions q JOIN learning_lessons l ON l.id=q.lesson_id WHERE q.id=? AND l.user_id=?",rs->rs.next()?rs.getObject(1,UUID.class):null,id,user());if(lesson==null)throw missing();return lesson;}
    @PostMapping("/questions/{id}/answer") @Transactional
    public Feedback answer(@PathVariable UUID id,@Valid @RequestBody AnswerRequest body){
        UUID lesson=questionLesson(id);UUID course=ownLesson(lesson,true);
        var question=jdbc.queryForMap("SELECT options,correct_index,explanation,replay_seconds,source_quote FROM learning_questions WHERE id=? AND lesson_id=?",id,lesson);
        if(body.choice()>=options(question.get("options").toString()).size())throw new IllegalArgumentException("Choose one of the provided answers.");
        boolean correct=body.choice()==(Integer)question.get("correct_index");
        jdbc.update("UPDATE learning_questions SET passed=passed OR ?,last_choice=? WHERE id=?",correct,body.choice(),id);
        Integer remaining=jdbc.queryForObject("SELECT COUNT(*) FROM learning_questions WHERE lesson_id=? AND NOT passed",Integer.class,lesson);
        boolean known=body.placement()&&correct&&remaining!=null&&remaining==0;
        if(known)jdbc.update("UPDATE learning_lessons SET known=true,completed=false WHERE id=? AND user_id=?",lesson,user());
        progress(course);
        return new Feedback(correct,(Integer)question.get("correct_index"),(String)question.get("explanation"),(Integer)question.get("replay_seconds"),(String)question.get("source_quote"),known);
    }
    @PostMapping("/lessons/{id}/notes") @Transactional
    public CourseView addNote(@PathVariable UUID id,@Valid @RequestBody TimedNoteRequest body){
        UUID course=ownLesson(id,true);
        Integer count=jdbc.queryForObject("SELECT COUNT(*) FROM learning_lesson_notes n JOIN learning_lessons l ON l.id=n.lesson_id WHERE l.objective_id=? AND n.user_id=?",Integer.class,course,user());
        if(count!=null&&count>=200)throw new IllegalArgumentException("A course currently supports up to 200 timestamped notes.");
        var range=jdbc.queryForMap("SELECT start_seconds,end_seconds FROM learning_lessons WHERE id=? AND user_id=?",id,user());
        if(body.seconds()<(Integer)range.get("start_seconds")||range.get("end_seconds")!=null&&body.seconds()>(Integer)range.get("end_seconds"))throw new IllegalArgumentException("The note timestamp must be inside the lesson range.");
        jdbc.update("INSERT INTO learning_lesson_notes(id,user_id,lesson_id,seconds,body) VALUES (?,?,?,?,?)",UUID.randomUUID(),user(),id,body.seconds(),body.body().trim());return course(course);
    }
    private UUID noteLesson(UUID id){UUID lesson=jdbc.query("SELECT n.lesson_id FROM learning_lesson_notes n JOIN learning_lessons l ON l.id=n.lesson_id AND l.user_id=n.user_id WHERE n.id=? AND n.user_id=?",rs->rs.next()?rs.getObject(1,UUID.class):null,id,user());if(lesson==null)throw missing();return lesson;}
    @DeleteMapping("/lesson-notes/{id}") @Transactional
    public CourseView deleteNote(@PathVariable UUID id){UUID course=ownLesson(noteLesson(id),true);jdbc.update("DELETE FROM learning_lesson_notes WHERE id=? AND user_id=?",id,user());return course(course);}
    @PostMapping("/lesson-notes/{id}/save-note") @Transactional
    public Map<String,UUID> exportNote(@PathVariable UUID id){
        UUID lesson=noteLesson(id);ownLesson(lesson,true);
        var row=jdbc.queryForMap("SELECT n.body,n.seconds,n.exported_note_id,l.title,l.video_id FROM learning_lesson_notes n JOIN learning_lessons l ON l.id=n.lesson_id WHERE n.id=? AND n.user_id=? FOR UPDATE OF n",id,user());
        if(row.get("exported_note_id")!=null)return Map.of("id",(UUID)row.get("exported_note_id"));
        int seconds=(Integer)row.get("seconds");String text=(String)row.get("body");String title=row.get("title")+" @ "+seconds/60+":"+String.format("%02d",seconds%60);
        title=title.substring(0,Math.min(240,title.length()));String html="<p>"+org.jsoup.nodes.Entities.escape(text)+"</p>";
        if(row.get("video_id")!=null)html+="<p><a href=\"https://www.youtube.com/watch?v="+row.get("video_id")+"&amp;t="+seconds+"s\">Watch this moment</a></p>";
        UUID note=UUID.randomUUID();jdbc.update("INSERT INTO notes(id,user_id,title,body_html,plain_text,color) VALUES (?,?,?,?,?,'sage')",note,user(),title,html,text);
        jdbc.update("UPDATE learning_lesson_notes SET exported_note_id=? WHERE id=? AND user_id=?",note,id,user());return Map.of("id",note);
    }
    @PostMapping("/objectives/{id}/lesson-draft")
    public LearningDraftService.Draft generate(@PathVariable UUID id,@Valid @RequestBody DraftRequest body){ownCourse(id,false);return drafts.generate(user(),body.title().trim(),body.transcript());}

    public record PaceRequest(@Min(15) @Max(240) int dailyMinutes) { }
    public record StateRequest(boolean completed) { }
    public record AnswerRequest(@Min(0) @Max(4) int choice,boolean placement) { }
    public record TimedNoteRequest(@Min(0) @Max(86400) int seconds,@NotBlank @Size(max=4000) String body) { }
    public record DraftRequest(@NotBlank @Size(max=240) String title,@NotBlank @Size(max=20000) String transcript) { }
    public record QuestionRequest(@NotBlank @Size(max=1500) String prompt,@NotNull @Size(min=2,max=5) List<@NotBlank @Size(max=500) String> options,
                                  @Min(0) @Max(4) int correctIndex,@Size(max=2000) String explanation,@Min(0) @Max(86400) int replaySeconds,@Size(max=500) String sourceQuote) { }
    public record LessonRequest(@NotBlank @Size(max=240) String title,@Size(max=2000) String videoUrl,@Min(1) @Max(1440) int durationMinutes,
                                @Min(0) @Max(86400) Integer startSeconds,@Min(1) @Max(86400) Integer endSeconds,@Size(max=20000) String article,@Size(max=5) List<@Valid QuestionRequest> questions,boolean aiDraft,boolean reviewed) { }
    public record QuestionView(UUID id,String prompt,List<String> options,boolean passed) { }
    public record TimedNote(UUID id,int seconds,String body,UUID exportedNoteId,Instant createdAt) { }
    public record LessonView(UUID id,String title,int position,int durationMinutes,String videoId,int startSeconds,Integer endSeconds,String article,boolean completed,boolean known,List<QuestionView> questions,List<TimedNote> notes) { }
    public record CourseView(UUID objectiveId,int dailyMinutes,int progress,List<LessonView> lessons,List<StudyPlan.Block> plan,int draftRequestsToday) { }
    public record Feedback(boolean correct,int correctIndex,String explanation,int replaySeconds,String sourceQuote,boolean known) { }
}
