package RequestManagement;
import java.sql.SQLException;
import ResultManagement.*;

public class parser {
    public sqloperation sql;
    public parser() {
        sql = new sqloperation();
    }
    
        public ParseResult parseRequest(String request) {
        // 仅在 Jazzer 真正 fuzz 模式 + 演示开关同时开启时触发的“植入崩溃”。默认关闭。
        // 这样可用于快速生成 crash artifact 作为实验截图证据，同时避免默认 mvn test/生产运行被影响。
        boolean demoCrashEnabled = Boolean.getBoolean("fuzz.demo.crash") && Boolean.getBoolean("jazzer.fuzz");
        if (demoCrashEnabled && request != null) {
            // 让 fuzz 秒级触发：空/空白输入通常是 Jazzer 的初始最小样本。
            if (request.trim().isEmpty() || request.contains("CRASH")) {
                throw new RuntimeException("Fuzzing discovered implanted crash: " + request);
            }
        }

        if (request == null || request.trim().isEmpty()) {
            return new ParseResult("unknown", Boolean.FALSE, "空请求", null);
        }
        
        String[] parts = request.split(",", -1);
        if (parts.length < 2) {
            return new ParseResult("unknown", Boolean.FALSE, "请求格式错误", null);
        }
        
        String username = parts[0] == null ? "" : parts[0].trim();
        String action = parts[1] == null ? "" : parts[1].trim();
        
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

        double amount;
        try {
            amount = Double.parseDouble(parts[2]);
        } catch (NumberFormatException ex) {
            return new ParseResult("add", Boolean.FALSE, "金额格式错误", null);
        }
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
        // 先判断用户名是否存在，再判断密码，确保可以向客户端返回更明确的错误信息
        if (!sql.userExists(username)) {
            return new ParseResult("login", Boolean.FALSE, "用户名不存在", null);
        }

        loginrequest Login = new loginrequest(username, password);
        Boolean ok = sql.solveLogin(Login);
        if (ok != null && ok) {
            return new ParseResult("login", Boolean.TRUE, null, null);
        } else {
            return new ParseResult("login", Boolean.FALSE, "密码错误", null);
        }
    }
    
    private ParseResult handleSearchRequest(String username, String[] parts) throws SQLException {
        String startDate = parts.length > 2 ? parts[2] : "";
        String endDate = parts.length > 3 ? parts[3] : "";
        String typeFilter = parts.length > 4 ? parts[4] : "";
        Double minAmount = parseNullableDouble(parts.length > 5 ? parts[5] : "");
        Double maxAmount = parseNullableDouble(parts.length > 6 ? parts[6] : "");
        
        searchrequest Search = new searchrequest(username, startDate, endDate, typeFilter, minAmount, maxAmount);
        return new ParseResult("search", Boolean.TRUE, null, sql.solveSearch(Search));
    }
    
    private ParseResult handleListRequest(String username) throws SQLException {
        return new ParseResult("list", Boolean.TRUE, null, sql.solveList(username));
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