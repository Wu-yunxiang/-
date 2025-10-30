package RequestManagement;
import java.sql.SQLException;
import ResultManagement.*;

public class parser {
    public sqloperation sql;
    public parser() {
        sql = new sqloperation();
    }
    
        public ParseResult parseRequest(String request) {
        if (request == null || request.trim().isEmpty()) {
            return new ParseResult("unknown", Boolean.FALSE, "空请求", null);
        }
        
        String[] parts = request.split(",", -1);
        if (parts.length < 2) {
            return new ParseResult("unknown", Boolean.FALSE, "请求格式错误", null);
        }
        
        String username = parts[0];
        String action = parts[1];
        
        try {
            if (action.equals("add")) {
                return handleAddRequest(username, parts);
            } else if(action.equals("register")) {
                return handleRegisterRequest(username, parts);
            } else if(action.equals("login")) {
                return handleLoginRequest(username, parts);
            } else if(action.equals("search")) {
                return handleSearchRequest(username, parts);
            } else if(action.equals("list")) {
                return handleListRequest(username);
            } else if(action.equals("clear")) {
                return handleClearRequest(username);
            } else if(action.equals("delete")) {
                return handleDeleteRequest(username, parts);
            } else {
                return new ParseResult("unknown", Boolean.FALSE, "未知操作: " + action, null);
            }
        } catch (SQLException e) {
            return new ParseResult(action, Boolean.FALSE, "数据库错误: " + e.getMessage(), null);
        } catch (Exception e) {
            return new ParseResult(action, Boolean.FALSE, "处理错误: " + e.getMessage(), null);
        }
    }
    
    private ParseResult handleAddRequest(String username, String[] parts) throws SQLException {
        if (parts.length < 4) {
            return new ParseResult("add", Boolean.FALSE, "参数不足", null);
        }
        
        double amount = Double.parseDouble(parts[2]);
        String date = parts[3];
        String type = "expense";
        String subject = "";
        String note = "";
        
        if (parts.length >= 7) {
            type = parts[4];
            subject = parts[5];
            note = parts[6];
        } else {
            if (parts.length >= 5) {
                subject = parts[4];
            }
            if (parts.length >= 6) {
                note = parts[5];
            }
        }
        
        addrequest Add = new addrequest(username, amount, type, date, subject, note);
        return new ParseResult("add", sql.solveAdd(Add), null, null);
    }
    
    private ParseResult handleRegisterRequest(String username, String[] parts) throws SQLException {
        if (parts.length < 3) {
            return new ParseResult("register", Boolean.FALSE, "参数不足", null);
        }
        
        String password = parts[2];
        registerrequest Register = new registerrequest(username, password);
        return new ParseResult("register", sql.solveRegister(Register), null, null);
    }
    
    private ParseResult handleLoginRequest(String username, String[] parts) throws SQLException {
        if (parts.length < 3) {
            return new ParseResult("login", Boolean.FALSE, "参数不足", null);
        }
        
        String password = parts[2];
        loginrequest Login = new loginrequest(username, password);
        return new ParseResult("login", sql.solveLogin(Login), null, null);
    }
    
    private ParseResult handleSearchRequest(String username, String[] parts) throws SQLException {
        String startDate = parts.length > 2 ? parts[2] : "";
        String endDate = parts.length > 3 ? parts[3] : "";
        String typeFilter = parts.length > 4 ? parts[4] : "";
        Double minAmount = parseNullableDouble(parts.length > 5 ? parts[5] : "");
        Double maxAmount = parseNullableDouble(parts.length > 6 ? parts[6] : "");
        
        searchrequest Search = new searchrequest(username, startDate, endDate, typeFilter, minAmount, maxAmount);
        return new ParseResult("search", null, null, sql.solveSearch(Search));
    }
    
    private ParseResult handleListRequest(String username) throws SQLException {
        return new ParseResult("list", null, null, sql.solveList(username));
    }
    
    private ParseResult handleClearRequest(String username) throws SQLException {
        int removed = sql.solveClear(username);
        return new ParseResult("clear", Boolean.TRUE, Integer.toString(removed), null);
    }
    
    private ParseResult handleDeleteRequest(String username, String[] parts) throws SQLException {
        if (parts.length < 3) {
            return new ParseResult("delete", Boolean.FALSE, "缺少要删除的记录ID", null);
        }
        
        try {
            long entryId = Long.parseLong(parts[2]);
            deleterequest Delete = new deleterequest(username, entryId);
            Boolean success = sql.solveDelete(Delete);
            String message = (success != null && success) ? "删除成功" : "未找到要删除的记录";
            return new ParseResult("delete", success, message, null);
        } catch (NumberFormatException ex) {
            return new ParseResult("delete", Boolean.FALSE, "记录ID无效", null);
        }
    }

    private Double parseNullableDouble(String raw) {
        if (raw == null || raw.isEmpty()) {
            return null;
        }
        try {
            return Double.valueOf(raw);
        } catch (NumberFormatException ex) {
            return null;
        }
    }
}