package sharedmodel;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;

import org.junit.Test;

public class EntryTest {

    @Test
    public void testConstructorFull() {
        Entry entry = new Entry(1L, "user", 100.0, "income", "2023-01-01", "sub", "note");
        assertEquals(Long.valueOf(1), entry.id);
        assertEquals("user", entry.username);
        assertEquals(100.0, entry.amount, 0.001);
        assertEquals("income", entry.type);
        assertEquals("2023-01-01", entry.date);
        assertEquals("sub", entry.subject);
        assertEquals("note", entry.note);
    }

    @Test
    public void testConstructorWithoutId() {
        Entry entry = new Entry("user", 100.0, "expense", "2023-01-01", "sub", "note");
        assertEquals(null, entry.id);
        assertEquals("user", entry.username);
    }

    @Test
    public void testTypeNormalizationNull() {
        Entry entry = new Entry("user", 100.0, null, "2023-01-01", "sub", "note");
        assertEquals("expense", entry.type);
    }

    @Test
    public void testTypeNormalizationEmpty() {
        Entry entry = new Entry("user", 100.0, "   ", "2023-01-01", "sub", "note");
        assertEquals("expense", entry.type);
    }

    @Test
    public void testToStringFull() {
        Entry entry = new Entry(1L, "user", 100.0, "income", "2023-01-01", "sub", "note");
        String expected = "1,user,100.0,income,2023-01-01,sub,note";
        assertEquals(expected, entry.toString());
    }

    @Test
    public void testToStringNullFields() {
        Entry entry = new Entry(null, "user", 100.0, null, null, null, null);
        // id=null -> "null"
        // type=null -> "expense" (constructor logic)
        // date=null -> ""
        // subject=null -> ""
        // note=null -> ""
        String expected = "null,user,100.0,expense,,,";
        assertEquals(expected, entry.toString());
    }
}
