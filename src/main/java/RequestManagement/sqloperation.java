package RequestManagement;

import java.nio.file.Path;
import java.nio.file.Paths;
import java.sql.*;
import java.util.ArrayList;
import java.util.List;

import java.util.logging.Logger;
import sharedmodel.*;

public class sqloperation {
    private static final Logger LOGGER = Logger.getLogger(sqloperation.class.getName());
    private static final Path DB_PATH = Paths.get(System.getProperty("user.dir"), "accounting_db").toAbsolutePath();
    public static final String JDBC_URL = "jdbc:h2:file:" + DB_PATH.toString().replace("\\", "/") + ";DB_CLOSE_DELAY=-1";
    public static String JDBC_USER = System.getenv("DB_USER") != null ? System.getenv("DB_USER") : "sa";
    public static String JDBC_PASSWORD = System.getenv("DB_PASSWORD") != null ? System.getenv("DB_PASSWORD") : "";
    
    // 简单的连接缓存，避免频繁创建连接
    private static final ThreadLocal<Connection> connectionThreadLocal = new ThreadLocal<>();

    public sqloperation() {
    }

    public void initialize() throws ClassNotFoundException, SQLException {
        Class.forName("org.h2.Driver");
        // 使用临时连接来创建表
        try (Connection initConn = DriverManager.getConnection(JDBC_URL, JDBC_USER, JDBC_PASSWORD);
             Statement stmt = initConn.createStatement()) {
            
            // 批量执行创建语句
            String[] initSQLs = {
                """
                CREATE TABLE IF NOT EXISTS users (
                    username VARCHAR(255) PRIMARY KEY,
                    password VARCHAR(255) NOT NULL
                )
                """,
                """
                CREATE TABLE IF NOT EXISTS entries (
                    id BIGINT AUTO_INCREMENT PRIMARY KEY,
                    username VARCHAR(255) NOT NULL,
                    amount DOUBLE NOT NULL,
                    type VARCHAR(32),
                    date VARCHAR(64),
                    subject VARCHAR(255),
                    note VARCHAR(1024)
                )
                """,
                "ALTER TABLE entries ADD COLUMN IF NOT EXISTS id BIGINT AUTO_INCREMENT",
                "ALTER TABLE entries ADD COLUMN IF NOT EXISTS type VARCHAR(32)",
                "UPDATE entries SET type = 'expense' WHERE type IS NULL",
                "CREATE INDEX IF NOT EXISTS idx_entries_username ON entries(username)",
                "CREATE INDEX IF NOT EXISTS idx_entries_date ON entries(date)",
                "CREATE INDEX IF NOT EXISTS idx_entries_type ON entries(type)"
            };
            
            for (String sql : initSQLs) {
                try {
                    stmt.execute(sql);
                } catch (SQLException e) {
                    // 忽略重复创建索引等错误
                }
            }
        }
    }
    
    private Connection getConnection() throws SQLException {
        Connection conn = connectionThreadLocal.get();
        if (conn == null || conn.isClosed()) {
            conn = DriverManager.getConnection(JDBC_URL, JDBC_USER, JDBC_PASSWORD);
            connectionThreadLocal.set(conn);
        }
        return conn;
    }
    
    private void closeThreadConnection() {
        try {
            Connection conn = connectionThreadLocal.get();
            if (conn != null && !conn.isClosed()) {
                conn.close();
            }
        } catch (SQLException e) {
            // 忽略关闭异常
        } finally {
            connectionThreadLocal.remove();
        }
    }

    public Boolean solveAdd(addrequest Add) throws SQLException {
        Entry entry = Add.entry;
        try {
            Connection c = getConnection();
            try (PreparedStatement insert = c.prepareStatement(
                    "INSERT INTO entries (username, amount, type, date, subject, note) VALUES (?, ?, ?, ?, ?, ?)")) {
                insert.setString(1, entry.username);
                insert.setDouble(2, entry.amount);
                insert.setString(3, normalizeType(entry.type));
                insert.setString(4, entry.date);
                insert.setString(5, entry.subject);
                insert.setString(6, entry.note);
                insert.executeUpdate();
            }
            return Boolean.TRUE;
        } finally {
            closeThreadConnection();
        }
    }

    public Boolean solveRegister(registerrequest Register) throws SQLException {
        try {
            Connection c = getConnection();
            try (PreparedStatement insert = c.prepareStatement(
                    "INSERT INTO users (username, password) VALUES (?, ?)")) {
                insert.setString(1, Register.username);
                insert.setString(2, Register.password);
                insert.executeUpdate();
                return Boolean.TRUE;
            } catch (SQLException e) {
                // 用户已存在时返回false
                if (e.getErrorCode() == 23505) {
                    return Boolean.FALSE;
                }
                throw e;
            }
        } finally {
            closeThreadConnection();
        }
    }

    public Boolean solveLogin(loginrequest Login) throws SQLException {
        try {
            Connection c = getConnection();
            try (PreparedStatement query = c.prepareStatement("SELECT password FROM users WHERE username = ?")) {
                query.setString(1, Login.username);
                try (ResultSet rs = query.executeQuery()) {
                    if (rs.next()) {
                        String storedPassword = rs.getString(1);
                        boolean ok = storedPassword != null && storedPassword.equals(Login.password);
                        if (ok) {
                            LOGGER.info("登录成功: 用户名='" + Login.username + "'");
                        } else {
                            // 用户存在但密码不匹配
                            LOGGER.info("登录失败: 密码错误, 用户名='" + Login.username + "'");
                        }
                        return ok;
                    } else {
                        // 用户名不存在
                        LOGGER.info("登录失败: 用户名不存在, 用户名='" + Login.username + "'");
                    }
                }
            }
            return Boolean.FALSE;
        } finally {
            closeThreadConnection();
        }
    }

    /**
     * 检查指定用户名是否存在于 users 表中。
     */
    public boolean userExists(String username) throws SQLException {
        try {
            Connection c = getConnection();
            try (PreparedStatement query = c.prepareStatement("SELECT 1 FROM users WHERE username = ?")) {
                query.setString(1, username);
                try (ResultSet rs = query.executeQuery()) {
                    return rs.next();
                }
            }
        } finally {
            closeThreadConnection();
        }
    }

    public List<Entry> solveSearch(searchrequest Search) throws SQLException {
        List<Entry> results = new ArrayList<>();
        try {
            Connection c = getConnection();
            
            // 构建动态SQL，在数据库层面进行过滤
            StringBuilder sql = new StringBuilder(
                "SELECT id, username, amount, type, date, subject, note FROM entries WHERE username = ?");
            List<Object> parameters = new ArrayList<>();
            parameters.add(Search.username);
            
            if (Search.startDate != null && !Search.startDate.isEmpty()) {
                sql.append(" AND date >= ?");
                parameters.add(Search.startDate);
            }
            if (Search.endDate != null && !Search.endDate.isEmpty()) {
                sql.append(" AND date <= ?");
                parameters.add(Search.endDate);
            }
            if (Search.typeFilter != null && !Search.typeFilter.isEmpty()) {
                sql.append(" AND type = ?");
                parameters.add(normalizeType(Search.typeFilter));
            }
            if (Search.minAmount != null) {
                sql.append(" AND amount >= ?");
                parameters.add(Search.minAmount);
            }
            if (Search.maxAmount != null) {
                sql.append(" AND amount <= ?");
                parameters.add(Search.maxAmount);
            }
            
            sql.append(" ORDER BY id");
            
            try (PreparedStatement query = c.prepareStatement(sql.toString())) {
                for (int i = 0; i < parameters.size(); i++) {
                    query.setObject(i + 1, parameters.get(i));
                }
                
                try (ResultSet rs = query.executeQuery()) {
                    while (rs.next()) {
                        results.add(mapEntry(rs));
                    }
                }
            }
        } finally {
            closeThreadConnection();
        }
        return results;
    }

    public List<Entry> solveList(String username) throws SQLException {
        List<Entry> results = new ArrayList<>();
        try {
            Connection c = getConnection();
            try (PreparedStatement query = c.prepareStatement(
                    "SELECT id, username, amount, type, date, subject, note FROM entries WHERE username = ? ORDER BY id")) {
                query.setString(1, username);
                try (ResultSet rs = query.executeQuery()) {
                    while (rs.next()) {
                        results.add(mapEntry(rs));
                    }
                }
            }
        } finally {
            closeThreadConnection();
        }
        return results;
    }

    public Boolean solveDelete(deleterequest Delete) throws SQLException {
        try {
            Connection c = getConnection();
            try (PreparedStatement delete = c.prepareStatement(
                    "DELETE FROM entries WHERE id = ? AND username = ?")) {
                delete.setLong(1, Delete.entryId);
                delete.setString(2, Delete.username);
                int affected = delete.executeUpdate();
                return affected > 0;
            }
        } finally {
            closeThreadConnection();
        }
    }

    public int solveClear(String username) throws SQLException {
        try {
            Connection c = getConnection();
            try (PreparedStatement clear = c.prepareStatement(
                    "DELETE FROM entries WHERE username = ?")) {
                clear.setString(1, username);
                return clear.executeUpdate();
            }
        } finally {
            closeThreadConnection();
        }
    }

    private Entry mapEntry(ResultSet rs) throws SQLException {
        Long id = rs.getObject("id", Long.class);
        return new Entry(
                id,
                rs.getString("username"),
                rs.getDouble("amount"),
                normalizeType(rs.getString("type")),
                rs.getString("date"),
                rs.getString("subject"),
                rs.getString("note"));
    }

    private String normalizeType(String raw) {
        if (raw == null || raw.isBlank()) {
            return "expense";
        }
        String normalized = raw.trim().toLowerCase();
        if (!normalized.equals("income") && !normalized.equals("expense")) {
            return "expense";
        }
        return normalized;
    }
}