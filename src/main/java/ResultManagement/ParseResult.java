package ResultManagement;
import java.util.List;
import java.util.stream.Collectors;
import sharedmodel.*;

public class ParseResult{
    public String action;
    public Boolean success;
    public String message;
    public List<Entry> entries;
    
    public ParseResult(String action, Boolean success, String message, List<Entry> entries) {
        this.action = action;
        this.success = success;
        this.message = message;
        this.entries = entries;
    }
    
    public String toString() {
        String successStr = (success == null) ? "null" : (success ? "1" : "0");
        String entriesStr = (entries == null || entries.isEmpty())? "null": 
            entries.stream()
                   .map(Entry::toString)
                   .collect(Collectors.joining("|"));
        return action + "~" + successStr + "~" + 
               (message == null ? "null" : message.replace("~", "\\~")) + "~" + 
               entriesStr;
    }
}