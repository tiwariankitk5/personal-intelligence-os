package com.pios.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

@Service
public class EmbeddingGateway {
    private final ObjectMapper mapper;
    private final SecretEncryptionService encryption;
    private final ProviderEndpointPolicy endpoints;
    private final RestClient.Builder clients;
    @Autowired
    public EmbeddingGateway(ObjectMapper mapper, SecretEncryptionService encryption, ProviderEndpointPolicy endpoints) {
        this(mapper,encryption,endpoints,defaultClient());
    }
    EmbeddingGateway(ObjectMapper mapper, SecretEncryptionService encryption, ProviderEndpointPolicy endpoints, RestClient.Builder clients) {
        this.mapper=mapper;this.encryption=encryption;this.endpoints=endpoints;this.clients=clients;
    }
    private static RestClient.Builder defaultClient() {
        var factory=new JdkClientHttpRequestFactory(java.net.http.HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10))
                .followRedirects(java.net.http.HttpClient.Redirect.NEVER).build());
        factory.setReadTimeout(Duration.ofSeconds(30));
        return RestClient.builder().requestFactory(factory);
    }
    public Result embed(Config config,List<String> input) {
        if(input.isEmpty() || input.size()>16 || input.stream().anyMatch(s->s.isBlank() || s.getBytes(StandardCharsets.UTF_8).length>7000))
            throw new EmbeddingException("Embedding input is outside the supported batch limits.");
        try {
            String base=endpoints.validate(config.baseUrl());
            var body=new LinkedHashMap<String,Object>();
            body.put("model",config.model());body.put("input",input);body.put("encoding_format","float");
            if(config.requestDimensions()) body.put("dimensions",config.dimensions());
            var request=clients.clone().baseUrl(base).build().post().uri("/embeddings").contentType(MediaType.APPLICATION_JSON);
            String key=encryption.decrypt(config.encryptedKey());
            if(key!=null && !key.isBlank()) request.header("Authorization","Bearer "+key);
            return request.body(body).exchange((req,response)->{
                if(!response.getStatusCode().is2xxSuccessful()) throw new EmbeddingException("Embedding provider rejected the request. Check its model, credentials and quota.");
                byte[] bytes=response.getBody().readNBytes(2_000_001);
                if(bytes.length>2_000_000) throw new EmbeddingException("Embedding provider response exceeded the size limit.");
                return parse(mapper.readTree(bytes),input.size(),config.dimensions());
            });
        } catch(EmbeddingException ex) {throw ex;}
        catch(Exception ex) {throw new EmbeddingException("Could not obtain embeddings. Check provider access, model and vector dimensions.");}
    }
    static Result parse(JsonNode response,int count,int dimensions) {
        JsonNode data=response.path("data");
        if(!data.isArray() || data.size()!=count) throw new EmbeddingException("Embedding provider returned an invalid batch.");
        var vectors=new ArrayList<float[]>(java.util.Collections.nCopies(count,null));
        for(JsonNode item:data) {
            JsonNode index=item.path("index"),vector=item.path("embedding");
            if(!index.isIntegralNumber() || !index.canConvertToInt() || index.intValue()<0 || index.intValue()>=count
                    || vectors.get(index.intValue())!=null || !vector.isArray() || vector.size()!=dimensions)
                throw new EmbeddingException("Embedding provider returned incompatible vector dimensions or indices.");
            float[] values=new float[dimensions];double norm=0;
            for(int i=0;i<dimensions;i++) {
                if(!vector.get(i).isNumber()) throw new EmbeddingException("Embedding provider returned a nonnumeric vector.");
                values[i]=(float)vector.get(i).doubleValue();
                if(!Float.isFinite(values[i])) throw new EmbeddingException("Embedding provider returned a nonfinite vector.");
                norm+=(double)values[i]*values[i];
            }
            if(norm==0) throw new EmbeddingException("Embedding provider returned a zero vector.");
            vectors.set(index.intValue(),values);
        }
        JsonNode tokens=response.path("usage").path("total_tokens");
        long used=tokens.isIntegralNumber() && tokens.canConvertToLong() ? Math.max(0,tokens.longValue()) : 0;
        return new Result(List.copyOf(vectors),used);
    }
    public static String vectorLiteral(float[] vector) {
        var out=new StringBuilder("[");
        for(int i=0;i<vector.length;i++){if(i>0)out.append(',');out.append(Float.toString(vector[i]));}
        return out.append(']').toString();
    }
    public record Config(String baseUrl,String encryptedKey,String model,int dimensions,boolean requestDimensions) { }
    public record Result(List<float[]> vectors,long reportedTokens) { }
    public static class EmbeddingException extends RuntimeException { public EmbeddingException(String message){super(message);} }
}
