package RequestManagement;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.sql.SQLException;

import java.util.ArrayList;
import java.util.List;

import org.junit.Before;
import org.junit.Test;

import ResultManagement.ParseResult;
import sharedmodel.Entry;


public class ParserTest {

    private parser p;
    private MockSqlOperation mockSql;

    // Mock class extending sqloperation to avoid DB dependency
    class MockSqlOperation extends sqloperation {
        public boolean addSuccess = true;
        public boolean registerSuccess = true;
        public boolean loginSuccess = true;
        public boolean userExists = true;
        public boolean deleteSuccess = true;
        public int clearCount = 5;
        public List<Entry> searchResults = new ArrayList<>();
        public List<Entry> listResults = new ArrayList<>();

        @Override
        public Boolean solveAdd(addrequest Add) throws SQLException {
            return addSuccess;
        }

        @Override
        public Boolean solveRegister(registerrequest Register) throws SQLException {
            return registerSuccess;
        }

        @Override
        public Boolean solveLogin(loginrequest Login) throws SQLException {
            return loginSuccess;
        }

        @Override
        public boolean userExists(String username) throws SQLException {
            return userExists;
        }
        
        @Override
        public Boolean solveDelete(deleterequest Delete) throws SQLException {
            return deleteSuccess;
        }

        @Override
        public int solveClear(String username) throws SQLException {
            return clearCount;
        }

        @Override
        public List<Entry> solveSearch(searchrequest Search) throws SQLException {
            return searchResults;
        }

        @Override
        public List<Entry> solveList(String username) throws SQLException {
            return listResults;
        }

        @Override
        public void initialize() throws ClassNotFoundException, SQLException {
            // Do nothing
        }
    }

    @Before
    public void setUp() {
        p = new parser();
        mockSql = new MockSqlOperation();
        p.sql = mockSql; // Inject mock
    }

    @Test
    public void testParseRequestNull() {
        ParseResult result = p.parseRequest(null);
        assertEquals("unknown", result.action);
        assertFalse(result.success);
        assertEquals("空请求", result.message);
    }

    @Test
    public void testParseRequestEmpty() {
        ParseResult result = p.parseRequest("   ");
        assertEquals("unknown", result.action);
        assertFalse(result.success);
        assertEquals("空请求", result.message);
    }

    @Test
    public void testParseRequestInvalidFormat() {
        ParseResult result = p.parseRequest("user");
        assertEquals("unknown", result.action);
        assertFalse(result.success);
        assertEquals("请求格式错误", result.message);
    }

    @Test
    public void testHandleAddRequestSuccess() {
        String request = "user,add,100,2023-01-01,expense,food,lunch";
        ParseResult result = p.parseRequest(request);
        assertEquals("add", result.action);
        assertTrue(result.success);
    }

    @Test
    public void testHandleAddRequestInsufficientParams() {
        String request = "user,add,100";
        ParseResult result = p.parseRequest(request);
        assertEquals("add", result.action);
        assertFalse(result.success);
        assertEquals("参数不足", result.message);
    }

    @Test
    public void testHandleAddRequestInvalidAmount() {
        String request = "user,add,not_a_number,2023-01-01";
        ParseResult result = p.parseRequest(request);
        assertEquals("add", result.action);
        assertFalse(result.success);
        assertEquals("金额格式错误", result.message);
    }

    @Test
    public void testHandleRegisterRequestSuccess() {
        String request = "user,register,pass";
        ParseResult result = p.parseRequest(request);
        assertEquals("register", result.action);
        assertTrue(result.success);
    }

    @Test
    public void testHandleLoginRequestSuccess() {
        String request = "user,login,pass";
        ParseResult result = p.parseRequest(request);
        assertEquals("login", result.action);
        assertTrue(result.success);
    }

    @Test
    public void testHandleLoginRequestUserNotFound() {
        mockSql.userExists = false;
        String request = "user,login,pass";
        ParseResult result = p.parseRequest(request);
        assertEquals("login", result.action);
        assertFalse(result.success);
        assertEquals("用户名不存在", result.message);
    }

    @Test
    public void testUnknownAction() {
        String request = "user,unknownAction,param";
        ParseResult result = p.parseRequest(request);
        assertEquals("unknown", result.action);
        assertFalse(result.success);
        assertTrue(result.message.startsWith("未知操作"));
    }

    @Test
    public void testActionTrimmed() {
        String request = "user,  login  ,pass";
        ParseResult result = p.parseRequest(request);
        assertEquals("login", result.action);
        assertTrue(result.success);
    }

    @Test
    public void testHandleSearchRequest() {
        String request = "user,search,2023-01-01,2023-12-31,expense,0,1000";
        ParseResult result = p.parseRequest(request);
        assertEquals("search", result.action);
        assertTrue(result.success);
        assertEquals(mockSql.searchResults, result.entries);
    }

    @Test
    public void testHandleListRequest() {
        String request = "user,list";
        ParseResult result = p.parseRequest(request);
        assertEquals("list", result.action);
        assertTrue(result.success);
        assertEquals(mockSql.listResults, result.entries);
    }

    @Test
    public void testHandleDeleteRequestSuccess() {
        String request = "user,delete,123";
        ParseResult result = p.parseRequest(request);
        assertEquals("delete", result.action);
        assertTrue(result.success);
        assertEquals("删除成功", result.message);
    }

    @Test
    public void testHandleDeleteRequestInvalidId() {
        String request = "user,delete,abc";
        ParseResult result = p.parseRequest(request);
        assertEquals("delete", result.action);
        assertFalse(result.success);
        assertEquals("记录ID无效", result.message);
    }

    @Test
    public void testHandleDeleteRequestMissingId() {
        String request = "user,delete";
        ParseResult result = p.parseRequest(request);
        assertEquals("delete", result.action);
        assertFalse(result.success);
        assertEquals("缺少要删除的记录ID", result.message);
    }

    @Test
    public void testHandleClearRequest() {
        String request = "user,clear";
        ParseResult result = p.parseRequest(request);
        assertEquals("clear", result.action);
        assertTrue(result.success);
        assertEquals("5", result.message);
    }
}
