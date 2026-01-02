package acounting_system;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.sql.SQLException;
import java.util.List;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;

import RequestManagement.parser;
import RequestManagement.sqloperation;
import ResultManagement.ParseResult;
import sharedmodel.Entry;

public class IntegrationTest {

    private parser p;
    private String originalUserDir;

    @Before
    public void setUp() throws Exception {
        // Set a temporary directory for the database to avoid affecting the real DB
        originalUserDir = System.getProperty("user.dir");
        System.setProperty("user.dir", System.getProperty("java.io.tmpdir"));
        
        p = new parser();
        // Initialize the database (create tables)
        p.sql.initialize();
        
        // Clear any existing data for the test user
        p.parseRequest("testuser,clear");
        p.parseRequest("testuser,register,password");
    }

    @After
    public void tearDown() throws SQLException {
        // Clean up
        if (p != null) {
            p.parseRequest("testuser,clear");
        }
        // Restore user.dir
        if (originalUserDir != null) {
            System.setProperty("user.dir", originalUserDir);
        }
    }

    @Test
    public void testAddAndListFlow() {
        // 1. Add an entry
        String addRequest = "testuser,add,50.0,2023-10-27,expense,Lunch,Sandwich";
        ParseResult addResult = p.parseRequest(addRequest);
        
        assertEquals("add", addResult.action);
        assertTrue("Add should succeed", addResult.success);

        // 2. List entries
        String listRequest = "testuser,list";
        ParseResult listResult = p.parseRequest(listRequest);
        
        assertEquals("list", listResult.action);
        assertTrue("List should succeed", listResult.success);
        
        List<Entry> entries = listResult.entries;
        assertEquals(1, entries.size());
        Entry entry = entries.get(0);
        assertEquals("testuser", entry.username);
        assertEquals(50.0, entry.amount, 0.001);
        assertEquals("Lunch", entry.subject);
    }

    @Test
    public void testLoginFlow() {
        // 1. Try to login with correct password
        String loginRequest = "testuser,login,password";
        ParseResult loginResult = p.parseRequest(loginRequest);
        
        assertEquals("login", loginResult.action);
        assertTrue("Login should succeed", loginResult.success);

        // 2. Try to login with wrong password
        String wrongLoginRequest = "testuser,login,wrongpass";
        ParseResult wrongLoginResult = p.parseRequest(wrongLoginRequest);
        
        assertEquals("login", wrongLoginResult.action);
        // Note: The parser/sqloperation implementation returns false for wrong password
        // but parser.handleLoginRequest returns Boolean.FALSE if sql.solveLogin returns false/null
        // Wait, let's check parser.java logic:
        // Boolean ok = sql.solveLogin(Login);
        // if (ok != null && ok) { return new ParseResult("login", true, "登录成功", null); }
        // else { return new ParseResult("login", Boolean.FALSE, "密码错误", null); }
        
        // However, sql.solveLogin returns false if password mismatch.
        
        assertEquals("密码错误", wrongLoginResult.message);
    }

    @Test
    public void testSearchFlow() {
        // 1. Add two entries
        p.parseRequest("testuser,add,100.0,2023-01-01,expense,Food,Lunch");
        p.parseRequest("testuser,add,200.0,2023-01-02,income,Salary,Bonus");

        // 2. Search for income
        String searchRequest = "testuser,search,,,income,,";
        ParseResult searchResult = p.parseRequest(searchRequest);
        
        assertEquals("search", searchResult.action);
        assertTrue(searchResult.success);
        assertEquals(1, searchResult.entries.size());
        assertEquals("income", searchResult.entries.get(0).type);
        assertEquals(200.0, searchResult.entries.get(0).amount, 0.001);
    }

    @Test
    public void testDeleteFlow() {
        // 1. Add an entry
        p.parseRequest("testuser,add,100.0,2023-01-01,expense,Food,Lunch");
        
        // 2. List to get ID
        ParseResult listResult = p.parseRequest("testuser,list");
        Long id = listResult.entries.get(0).id;

        // 3. Delete it
        String deleteRequest = "testuser,delete," + id;
        ParseResult deleteResult = p.parseRequest(deleteRequest);
        
        assertEquals("delete", deleteResult.action);
        assertTrue(deleteResult.success);

        // 4. List again to verify empty
        listResult = p.parseRequest("testuser,list");
        assertTrue(listResult.entries.isEmpty());
    }
}
