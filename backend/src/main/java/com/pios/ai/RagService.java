package com.pios.ai;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

@Service
public class RagService {
    private final JdbcTemplate jdbc;
    private final EmbeddingGateway gateway;
    private final TransactionTemplate tx;
    private final boolean workerEnabled;
    private static final org.slf4j.Logger log=org.slf4j.LoggerFactory.getLogger(RagService.class);
    private static final String PASSAGES="""
        SELECT c.id AS chunk_id,coalesce(n.id,k.id) AS item_id,coalesce(n.title,k.title) AS title,
        CASE WHEN n.id IS NOT NULL THEN 'note' ELSE 'source' END AS kind,c.chunk_index,c.content
        FROM content_chunks c LEFT JOIN notes n ON n.id=c.note_id AND n.user_id=c.user_id
        LEFT JOIN knowledge_sources k ON k.id=c.source_id AND k.user_id=c.user_id
        WHERE c.user_id=? AND (n.id IS NOT NULL AND n.is_archived=false OR k.id IS NOT NULL)
        """;
    private static final RowMapper<RagRanking.Passage> PASSAGE=(rs,row)->new RagRanking.Passage(rs.getObject("chunk_id",UUID.class),
            rs.getObject("item_id",UUID.class),rs.getString("title"),rs.getString("kind"),rs.getInt("chunk_index"),rs.getString("content"));

    public RagService(JdbcTemplate jdbc,EmbeddingGateway gateway,PlatformTransactionManager manager,
            @Value("${app.rag.worker-enabled:true}") boolean workerEnabled) {
        this.jdbc=jdbc;this.gateway=gateway;this.workerEnabled=workerEnabled;
        tx=new TransactionTemplate(manager);tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        tx.setTimeout(10);
    }
    record Settings(UUID user,UUID provider,String model,int dimensions,boolean requestDimensions,boolean enabled,
                    UUID profile,int callLimit,int inputLimit,EmbeddingGateway.Config config) { }
    private Settings settings(UUID user) {
        return jdbc.query("""
            SELECT s.*,p.base_url,p.encrypted_api_key,p.provider_type FROM rag_settings s
            LEFT JOIN ai_provider_connections p ON p.id=s.provider_id AND p.user_id=s.user_id WHERE s.user_id=?
            """,rs->rs.next()?new Settings(user,rs.getObject("provider_id",UUID.class),rs.getString("model_name"),rs.getInt("dimensions"),
                rs.getBoolean("request_dimensions"),rs.getBoolean("enabled"),rs.getObject("profile",UUID.class),
                rs.getInt("daily_call_limit"),rs.getInt("daily_input_limit"),
                "OPENAI_COMPATIBLE".equals(rs.getString("provider_type"))?new EmbeddingGateway.Config(rs.getString("base_url"),rs.getString("encrypted_api_key"),
                        rs.getString("model_name"),rs.getInt("dimensions"),rs.getBoolean("request_dimensions")):null):null,user);
    }
    public void configure(UUID user,UUID provider,String model,int dimensions,boolean requestDimensions,boolean enabled,
                          int callLimit,int inputLimit,boolean consent) {
        if(enabled && (!consent || provider==null)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Choose a provider and consent to embedding processing before enabling semantic retrieval.");
        if(provider!=null) {
            Integer count=jdbc.queryForObject("SELECT COUNT(*) FROM ai_provider_connections WHERE id=? AND user_id=? AND provider_type='OPENAI_COMPATIBLE'",Integer.class,provider,user);
            if(count==null || count==0) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Choose an OpenAI-compatible embedding provider from your own connections.");
        }
        tx.execute(status->{
            Settings old=settings(user);
            boolean changed=old==null || !java.util.Objects.equals(provider,old.provider()) || !model.equals(old.model())
                    || dimensions!=old.dimensions() || requestDimensions!=old.requestDimensions();
            UUID profile=changed?UUID.randomUUID():old.profile();
            jdbc.update("""
                INSERT INTO rag_settings(user_id,provider_id,model_name,dimensions,request_dimensions,enabled,profile,daily_call_limit,daily_input_limit)
                VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET provider_id=excluded.provider_id,model_name=excluded.model_name,
                dimensions=excluded.dimensions,request_dimensions=excluded.request_dimensions,enabled=excluded.enabled,profile=excluded.profile,
                daily_call_limit=excluded.daily_call_limit,daily_input_limit=excluded.daily_input_limit
                """,user,provider,model,dimensions,requestDimensions,enabled,profile,callLimit,inputLimit);
            jdbc.update("UPDATE rag_documents SET state='pending',failure_count=0,last_error=NULL,retry_after=NULL,lease_id=NULL,lease_until=NULL,version=gen_random_uuid(),updated_at=now() WHERE user_id=?",user);
            return null;
        });
    }
    public Map<String,Object> status(UUID user) {
        Settings s=settings(user);
        var result=new java.util.LinkedHashMap<String,Object>();
        result.put("enabled",s!=null && s.enabled());result.put("providerId",s==null?null:s.provider());
        result.put("model",s==null?"text-embedding-3-small":s.model());result.put("dimensions",s==null?1536:s.dimensions());
        result.put("requestDimensions",s!=null && s.requestDimensions());
        result.put("dailyCallLimit",s==null?100:s.callLimit());result.put("dailyInputLimit",s==null?100000:s.inputLimit());
        result.put("configured",s!=null && s.enabled() && s.config()!=null);
        result.put("documents",jdbc.queryForObject("SELECT COUNT(*) FROM rag_documents WHERE user_id=?",Integer.class,user));
        result.put("truncatedDocuments",jdbc.queryForObject("SELECT COUNT(*) FROM rag_documents WHERE user_id=? AND truncated",Integer.class,user));
        result.put("states",jdbc.queryForList("SELECT state,COUNT(*) AS count FROM rag_documents WHERE user_id=? GROUP BY state",user));
        result.put("chunks",jdbc.queryForObject("SELECT COUNT(*) FROM content_chunks WHERE user_id=?",Integer.class,user));
        result.put("embeddedChunks",s==null?0:jdbc.queryForObject("SELECT COUNT(*) FROM content_chunks WHERE user_id=? AND embedding_profile=? AND embedding IS NOT NULL",Integer.class,user,s.profile()));
        result.put("lastError",jdbc.query("SELECT last_error FROM rag_documents WHERE user_id=? AND last_error IS NOT NULL ORDER BY updated_at DESC LIMIT 1",rs->{return rs.next()?rs.getString(1):null;},user));
        var usage=jdbc.queryForList("SELECT calls,reserved_input,reported_tokens,failed_calls FROM rag_daily_usage WHERE user_id=? AND usage_day=?",user,LocalDate.now(ZoneOffset.UTC));
        result.put("usage",usage.isEmpty()?Map.of("calls",0,"reserved_input",0,"reported_tokens",0,"failed_calls",0):usage.get(0));
        return result;
    }
    public void retry(UUID user) {
        jdbc.update("UPDATE rag_documents SET state='pending',failure_count=0,last_error=NULL,retry_after=NULL,lease_id=NULL,lease_until=NULL,version=gen_random_uuid(),updated_at=now() WHERE user_id=? AND state<>'ready'",user);
    }
    public void rebuild(UUID user) {
        tx.execute(status->{
            Settings s=settings(user);
            if(s==null || !s.enabled() || s.config()==null) throw new ResponseStatusException(HttpStatus.PRECONDITION_FAILED,"Enable an available embedding provider before rebuilding.");
            jdbc.update("UPDATE rag_settings SET profile=? WHERE user_id=?",UUID.randomUUID(),user);
            jdbc.update("UPDATE rag_documents SET state='pending',failure_count=0,last_error=NULL,retry_after=NULL,lease_id=NULL,lease_until=NULL,version=gen_random_uuid(),updated_at=now() WHERE user_id=?",user);
            return null;
        });
    }
    private record Ticket(UUID user,LocalDate day) { }
    private Ticket reserve(Settings s,List<String> input) {
        long units=input.stream().mapToLong(v->v.getBytes(StandardCharsets.UTF_8).length+16L).sum();
        LocalDate day=LocalDate.now(ZoneOffset.UTC);
        Boolean accepted=tx.execute(status->jdbc.query("""
            INSERT INTO rag_daily_usage(user_id,usage_day,calls,reserved_input) SELECT ?,?,1,? WHERE ?<=?
            ON CONFLICT(user_id,usage_day) DO UPDATE SET calls=rag_daily_usage.calls+1,reserved_input=rag_daily_usage.reserved_input+excluded.reserved_input
            WHERE rag_daily_usage.calls<? AND rag_daily_usage.reserved_input+excluded.reserved_input<=? RETURNING calls
            """,rs->{return rs.next();},s.user(),day,units,units,s.inputLimit(),s.callLimit(),s.inputLimit()));
        if(!Boolean.TRUE.equals(accepted)) throw new BudgetException();
        return new Ticket(s.user(),day);
    }
    private EmbeddingGateway.Result embed(Settings s,List<String> input) {
        Ticket ticket=reserve(s,input);
        try {
            var result=gateway.embed(s.config(),input);
            tx.execute(status->{jdbc.update("UPDATE rag_daily_usage SET reported_tokens=reported_tokens+? WHERE user_id=? AND usage_day=?",result.reportedTokens(),ticket.user(),ticket.day());return null;});
            return result;
        } catch(RuntimeException ex) {
            tx.execute(status->{jdbc.update("UPDATE rag_daily_usage SET failed_calls=failed_calls+1 WHERE user_id=? AND usage_day=?",ticket.user(),ticket.day());return null;});
            throw ex;
        }
    }
    public record SearchResult(String mode,String warning,List<RagRanking.Passage> passages) { }
    public SearchResult search(UUID user,String query) {
        String terms=Arrays.stream(query.toLowerCase(Locale.ROOT).split("[^\\p{L}\\p{N}_]+"))
                .filter(v->v.length()>2).distinct().limit(32).collect(java.util.stream.Collectors.joining(" OR "));
        List<RagRanking.Passage> lexical=terms.isBlank()?List.of():jdbc.query(PASSAGES+" AND c.search_vector @@ websearch_to_tsquery('english',?) ORDER BY ts_rank_cd(c.search_vector,websearch_to_tsquery('english',?)) DESC,c.id LIMIT 20",PASSAGE,user,terms,terms);
        Settings s=settings(user);
        if(s==null || !s.enabled() || s.config()==null) return new SearchResult("keyword","Semantic retrieval is not enabled with an available embedding provider.",RagRanking.fuse(lexical,List.of(),5));
        Integer indexed=jdbc.queryForObject("SELECT COUNT(*) FROM content_chunks WHERE user_id=? AND embedding_profile=? AND embedding IS NOT NULL",Integer.class,user,s.profile());
        if(indexed==null || indexed==0) return new SearchResult("keyword","Embeddings are not ready yet. Using keyword matches.",RagRanking.fuse(lexical,List.of(),5));
        try {
            int end=query.offsetByCodePoints(0,Math.min(1600,query.codePointCount(0,query.length())));
            float[] vector=embed(s,List.of(query.substring(0,end))).vectors().get(0);
            String literal=EmbeddingGateway.vectorLiteral(vector);
            var semantic=jdbc.query(PASSAGES+" AND c.embedding_profile=? AND c.embedding IS NOT NULL AND vector_dims(c.embedding)=? AND (c.embedding <=> ?::vector)<=0.65 ORDER BY c.embedding <=> ?::vector,c.id LIMIT 20",PASSAGE,user,s.profile(),s.dimensions(),literal,literal);
            Integer total=jdbc.queryForObject("SELECT COUNT(*) FROM content_chunks WHERE user_id=?",Integer.class,user);
            String warning=total!=null && indexed<total?"The semantic index is partial. Unindexed passages are searched by keywords.":null;
            return new SearchResult("hybrid",warning,RagRanking.fuse(lexical,semantic,5));
        } catch(BudgetException ex) {
            return new SearchResult("keyword","Daily embedding budget reached. Using keyword matches.",RagRanking.fuse(lexical,List.of(),5));
        } catch(EmbeddingGateway.EmbeddingException ex) {
            return new SearchResult("keyword",ex.getMessage()+" Using keyword matches.",RagRanking.fuse(lexical,List.of(),5));
        }
    }
    private record Job(UUID id,UUID user,UUID version,UUID lease,Settings settings) { }
    private record Chunk(UUID id,String content) { }
    private Job claim() {
        return tx.execute(status->{
            var rows=jdbc.query("""
                SELECT d.id,d.user_id,d.version FROM rag_documents d JOIN rag_settings s ON s.user_id=d.user_id
                JOIN ai_provider_connections p ON p.id=s.provider_id AND p.user_id=s.user_id AND p.provider_type='OPENAI_COMPATIBLE'
                WHERE s.enabled AND (d.state='pending' OR d.state='failed' AND d.failure_count<3 AND d.retry_after<=now()
                    OR d.state='budget' AND d.retry_after<=now() OR d.state='processing' AND d.lease_until<now())
                ORDER BY d.updated_at,d.id LIMIT 1 FOR UPDATE OF d SKIP LOCKED
                """,(rs,n)->new UUID[]{rs.getObject(1,UUID.class),rs.getObject(2,UUID.class),rs.getObject(3,UUID.class)});
            if(rows.isEmpty())return null;
            UUID[] row=rows.get(0);UUID lease=UUID.randomUUID();Settings s=settings(row[1]);
            jdbc.update("UPDATE rag_documents SET state='processing',lease_id=?,lease_until=now()+interval '2 minutes',profile=? WHERE id=?",lease,s.profile(),row[0]);
            return new Job(row[0],row[1],row[2],lease,s);
        });
    }
    @Scheduled(fixedDelayString="${app.rag.worker-delay-ms:3000}",initialDelayString="${app.rag.worker-delay-ms:3000}")
    public void processNext() {
        if(!workerEnabled)return;
        try {Job job=claim();if(job!=null)process(job);}
        catch(Exception ex){log.warn("rag_event=worker_unavailable");}
    }
    private void process(Job job) {
        try {
            var chunks=jdbc.query("SELECT c.id,c.content FROM content_chunks c JOIN rag_documents d ON d.id=c.document_id WHERE c.user_id=? AND c.document_id=? AND d.version=? AND d.lease_id=? AND (c.embedding IS NULL OR c.embedding_profile IS DISTINCT FROM ?) ORDER BY c.chunk_index LIMIT 8",
                    (rs,n)->new Chunk(rs.getObject(1,UUID.class),rs.getString(2)),job.user(),job.id(),job.version(),job.lease(),job.settings().profile());
            EmbeddingGateway.Result result=chunks.isEmpty()?null:embed(job.settings(),chunks.stream().map(Chunk::content).toList());
            tx.execute(status->{
                Integer current=jdbc.query("""
                    SELECT 1 FROM rag_documents d JOIN rag_settings s ON s.user_id=d.user_id
                    WHERE d.id=? AND d.user_id=? AND d.version=? AND d.lease_id=? AND s.profile=? AND s.enabled AND s.provider_id=? FOR UPDATE OF d
                    """,rs->rs.next()?1:0,job.id(),job.user(),job.version(),job.lease(),job.settings().profile(),job.settings().provider());
                if(current==null || current==0)return null;
                for(int i=0;i<chunks.size();i++) jdbc.update("UPDATE content_chunks SET embedding=?::vector,embedding_profile=?,embedded_at=now() WHERE id=? AND user_id=? AND document_id=?",
                        EmbeddingGateway.vectorLiteral(result.vectors().get(i)),job.settings().profile(),chunks.get(i).id(),job.user(),job.id());
                Integer remaining=jdbc.queryForObject("SELECT COUNT(*) FROM content_chunks WHERE document_id=? AND user_id=? AND (embedding IS NULL OR embedding_profile IS DISTINCT FROM ?)",Integer.class,job.id(),job.user(),job.settings().profile());
                jdbc.update("UPDATE rag_documents SET state=?,failure_count=0,last_error=NULL,retry_after=NULL,lease_id=NULL,lease_until=NULL,updated_at=now() WHERE id=?",remaining!=null && remaining==0?"ready":"pending",job.id());
                return null;
            });
        } catch(Exception ex) {
            boolean budget=ex instanceof BudgetException;
            String error=budget?"Daily embedding budget reached. Retry tomorrow or increase the limit.":"Embedding indexing failed. Check provider access, model and dimensions; then retry.";
            jdbc.update("""
                UPDATE rag_documents SET state=?,failure_count=failure_count+?,last_error=?,
                retry_after=CASE WHEN ? THEN (date_trunc('day',now() AT TIME ZONE 'UTC')+interval '1 day') AT TIME ZONE 'UTC'
                    ELSE now()+interval '60 seconds' * power(2,least(failure_count,3)) END,
                lease_id=NULL,lease_until=NULL,updated_at=now() WHERE id=? AND user_id=? AND version=? AND lease_id=?
                """,budget?"budget":"failed",budget?0:1,error,budget,job.id(),job.user(),job.version(),job.lease());
        }
    }
    private static class BudgetException extends RuntimeException { }
}
