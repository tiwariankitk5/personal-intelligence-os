package com.pios.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import org.springframework.http.MediaType;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

class EmbeddingGatewayTest {
    ObjectMapper mapper=new ObjectMapper();
    @Test void outOfOrderBatchResultsAreReorderedAndTokensReported() throws Exception {
        var result=EmbeddingGateway.parse(mapper.readTree("{\"data\":[{\"index\":1,\"embedding\":[0,1]},{\"index\":0,\"embedding\":[1,0]}],\"usage\":{\"total_tokens\":12}}"),2,2);
        assertArrayEquals(new float[]{1,0},result.vectors().get(0));assertEquals(12,result.reportedTokens());
    }
    @Test void rejectsWrongDimensionsDuplicateIndicesZeroAndInvalidVectors() throws Exception {
        for(String json:List.of(
                "{\"data\":[{\"index\":0,\"embedding\":[1]}]}",
                "{\"data\":[{\"index\":0,\"embedding\":[0,0]}]}",
                "{\"data\":[{\"index\":0,\"embedding\":[\"1\",1]}]}",
                "{\"data\":[{\"index\":0,\"embedding\":[1e100,1]}]}",
                "{\"data\":[{\"index\":1,\"embedding\":[1,0]}]}")) {
            var node=mapper.readTree(json);assertThrows(EmbeddingGateway.EmbeddingException.class,()->EmbeddingGateway.parse(node,1,2));
        }
        var duplicate=mapper.readTree("{\"data\":[{\"index\":0,\"embedding\":[1,0]},{\"index\":0,\"embedding\":[1,0]}]}");
        assertThrows(EmbeddingGateway.EmbeddingException.class,()->EmbeddingGateway.parse(duplicate,2,2));
    }
    @Test void usesCompatibleEmbeddingProtocolAndSanitizesProviderFailures() {
        var builder=RestClient.builder();var server=MockRestServiceServer.bindTo(builder).build();
        var encryption=new SecretEncryptionService("MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=");
        var endpoints=new ProviderEndpointPolicy(false,"api.openai.com");
        var gateway=new EmbeddingGateway(mapper,encryption,endpoints,builder);
        var config=new EmbeddingGateway.Config("https://api.openai.com/v1",encryption.encrypt("test-secret"),"embedding-model",2,true);
        server.expect(requestTo("https://api.openai.com/v1/embeddings")).andExpect(header("Authorization","Bearer test-secret"))
                .andExpect(content().json("{\"model\":\"embedding-model\",\"input\":[\"passage\"],\"encoding_format\":\"float\",\"dimensions\":2}"))
                .andRespond(withSuccess("{\"data\":[{\"index\":0,\"embedding\":[1,0]}]}",MediaType.APPLICATION_JSON));
        assertEquals(1,gateway.embed(config,List.of("passage")).vectors().size());server.verify();
        server.reset();server.expect(requestTo("https://api.openai.com/v1/embeddings")).andRespond(withStatus(org.springframework.http.HttpStatus.UNAUTHORIZED).body("private provider error test-secret"));
        var error=assertThrows(EmbeddingGateway.EmbeddingException.class,()->gateway.embed(config,List.of("passage")));
        assertFalse(error.getMessage().contains("test-secret"));server.verify();
    }
}
