package com.pios.ai;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;

/** Reciprocal rank fusion: scores are ranks, never advertised as factual confidence. */
public final class RagRanking {
    private RagRanking() { }
    public record Passage(UUID chunkId,UUID id,String title,String type,int chunkIndex,String excerpt) { }
    public static List<Passage> fuse(List<Passage> lexical,List<Passage> semantic,int limit) {
        Map<UUID,Passage> passages=new LinkedHashMap<>();Map<UUID,Double> scores=new HashMap<>();
        for(var list:List.of(lexical,semantic)) for(int i=0;i<list.size();i++) {
            Passage p=list.get(i);passages.putIfAbsent(p.chunkId(),p);scores.merge(p.chunkId(),1.0/(60+i+1),Double::sum);
        }
        Map<String,Integer> perDocument=new HashMap<>();var result=new ArrayList<Passage>();
        for(var entry:passages.entrySet().stream().sorted(Comparator.<Map.Entry<UUID,Passage>>comparingDouble(e->scores.get(e.getKey())).reversed()
                .thenComparing(e->e.getKey().toString())).toList()) {
            Passage p=entry.getValue();String key=p.type()+":"+p.id();
            if(perDocument.getOrDefault(key,0)>=2)continue;
            result.add(p);perDocument.merge(key,1,Integer::sum);if(result.size()>=limit)break;
        }
        return result;
    }
    public record Citation(int number,UUID id,String title,String type,UUID chunkId,int chunkIndex,String excerpt) { }
    public record VerifiedAnswer(String answer,List<Citation> citations) { }
    public static VerifiedAnswer verify(String answer,List<Passage> passages) {
        var matcher=Pattern.compile("\\[(\\d+)\\]").matcher(answer);
        var numbers=new java.util.TreeSet<Integer>();var cleaned=new StringBuilder();
        while(matcher.find()) {
            int n=matcher.group(1).length()>9?0:Integer.parseInt(matcher.group(1));
            if(n>0 && n<=passages.size()) {numbers.add(n);matcher.appendReplacement(cleaned,java.util.regex.Matcher.quoteReplacement(matcher.group()));}
            else matcher.appendReplacement(cleaned,"[unsupported citation]");
        }
        matcher.appendTail(cleaned);
        var citations=numbers.stream().map(n->{Passage p=passages.get(n-1);return new Citation(n,p.id(),p.title(),p.type(),p.chunkId(),p.chunkIndex(),p.excerpt());}).toList();
        if(!passages.isEmpty() && citations.isEmpty()) cleaned.append("\n\nNo workspace passage was cited. Treat this answer as unverified general information.");
        return new VerifiedAnswer(cleaned.toString(),citations);
    }
}
