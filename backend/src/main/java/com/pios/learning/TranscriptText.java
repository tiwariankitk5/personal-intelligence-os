package com.pios.learning;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

public final class TranscriptText {
    private TranscriptText() { }
    public record Segment(int number,int seconds,String text) { }
    public record Parsed(List<Segment> segments,boolean timestamped) { }
    public static Parsed parse(String source) {
        var segments=new ArrayList<Segment>();var text=new StringBuilder();int seconds=0;boolean timestamped=false;
        var time=Pattern.compile("^\\s*\\[?(?:(\\d{1,2}):)?(\\d{1,2}):(\\d{2})\\]?\\s*(.*)$");
        for(String line:source.replace("\r","").split("\n")) {
            var match=time.matcher(line);
            if(match.matches()) {
                int hours=match.group(1)==null?0:Integer.parseInt(match.group(1)),minutes=Integer.parseInt(match.group(2)),sec=Integer.parseInt(match.group(3));
                int next=hours*3600+minutes*60+sec;
                if(sec>=60 || match.group(1)!=null&&minutes>=60 || next>86400 || next<seconds)throw new IllegalArgumentException("Transcript timestamps must be valid and in increasing order.");
                if(!text.toString().isBlank())segments.add(new Segment(segments.size()+1,seconds,text.toString().trim()));
                text.setLength(0);text.append(match.group(4));seconds=next;timestamped=true;
            } else if(!line.isBlank()){if(!text.isEmpty())text.append('\n');text.append(line);}
        }
        if(!text.toString().isBlank())segments.add(new Segment(segments.size()+1,seconds,text.toString().trim()));
        if(segments.isEmpty()||segments.size()>100)throw new IllegalArgumentException("Provide a readable transcript with no more than 100 timestamp segments per lesson draft.");
        return new Parsed(List.copyOf(segments),timestamped);
    }
}
