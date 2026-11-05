package com.pios.learning;

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

public final class LearningVideo {
    private LearningVideo() { }
    public record Reference(String id,int startSeconds) { }
    public static Reference parse(String input) {
        if(input==null || input.isBlank())return new Reference(null,0);
        try {
            URI uri=URI.create(input.trim());String host=uri.getHost()==null?"":uri.getHost().toLowerCase(Locale.ROOT);
            if(!Set.of("https","http").contains(uri.getScheme()) || uri.getUserInfo()!=null || uri.getPort()!=-1
                    || !Set.of("youtube.com","www.youtube.com","m.youtube.com","youtu.be","www.youtube-nocookie.com").contains(host))throw new IllegalArgumentException();
            var query=new HashMap<String,String>();
            if(uri.getRawQuery()!=null)for(String part:uri.getRawQuery().split("&")){String[] pair=part.split("=",2);query.putIfAbsent(URLDecoder.decode(pair[0],StandardCharsets.UTF_8),pair.length==2?URLDecoder.decode(pair[1],StandardCharsets.UTF_8):"");}
            String path=uri.getPath(),id=host.equals("youtu.be")?path.substring(1):path.startsWith("/embed/")?path.substring(7):query.get("v");
            if(id==null || !id.matches("[A-Za-z0-9_-]{11}"))throw new IllegalArgumentException();
            String time=query.getOrDefault("start",query.getOrDefault("t","0"));
            int seconds=0;
            if(time.matches("\\d+"))seconds=Integer.parseInt(time);
            else {var match=Pattern.compile("^(?:(\\d+)h)?(?:(\\d+)m)?(?:(\\d+)s)?$").matcher(time);if(!match.matches()||time.isEmpty())throw new IllegalArgumentException();for(int i=1;i<=3;i++)if(match.group(i)!=null)seconds+=Integer.parseInt(match.group(i))*new int[]{3600,60,1}[i-1];}
            if(seconds<0||seconds>86400)throw new IllegalArgumentException();
            return new Reference(id,seconds);
        } catch(Exception ex){throw new IllegalArgumentException("Use an individual YouTube watch/share/embed URL. Automatic playlist import is not connected yet.");}
    }
}
