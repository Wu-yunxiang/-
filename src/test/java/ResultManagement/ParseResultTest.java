package ResultManagement;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.util.ArrayList;
import java.util.List;

import org.junit.Test;

import sharedmodel.Entry;

public class ParseResultTest {

    @Test
    public void testToStringSuccess() {
        List<Entry> entries = new ArrayList<>();
        entries.add(new Entry(1L, "user", 100.0, "expense", "2023-01-01", "food", "lunch"));
        ParseResult result = new ParseResult("add", true, "Success", entries);
        
        // Entry.toString() uses commas
        String expected = "add~1~Success~1,user,100.0,expense,2023-01-01,food,lunch";
        assertEquals(expected, result.toString());
    }

    @Test
    public void testToStringFailure() {
        ParseResult result = new ParseResult("login", false, "Failed", null);
        String expected = "login~0~Failed~null";
        assertEquals(expected, result.toString());
    }

    @Test
    public void testToStringNullMessage() {
        ParseResult result = new ParseResult("clear", true, null, null);
        String expected = "clear~1~null~null";
        assertEquals(expected, result.toString());
    }

    @Test
    public void testToStringEscapedMessage() {
        ParseResult result = new ParseResult("add", false, "Error~1", null);
        String expected = "add~0~Error\\~1~null";
        assertEquals(expected, result.toString());
    }
}
