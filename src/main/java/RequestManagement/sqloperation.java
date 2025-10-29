package RequestManagement;

import java.nio.file.Path;
import java.nio.file.Paths;
import java.sql.*;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import sharedmodel.*;

public class sqloperation {
    private static final Path DB_PATH = Paths.get(System.getProperty("user.dir"), "accounting_db").toAbsolutePath();
    public static final String JDBC_URL = "jdbc:h2:file:" + DB_PATH.toString().replace("\\", "/");
    public static String JDBC_USER = "sa";
    public static String JDBC_PASSWORD = "";
    public Connection conn;

    public sqloperation() {
    }

    public void initialize() throws ClassNotFoundException, SQLException{
        Class.forName("org.h2.Driver");
        // 使用临时连接来创建表（初始化）。后续操作每次请求都会创建独立连接以保证并发安全
        try (Connection initConn = DriverManager.getConnection(JDBC_URL, JDBC_USER, JDBC_PASSWORD);
             Statement stmt = initConn.createStatement()) {
            stmt.execute("""
            CREATE TABLE IF NOT EXISTS users (
                username VARCHAR(255) PRIMARY KEY,
                password VARCHAR(255) NOT NULL
            )
            """);
            stmt.execute("""
            CREATE TABLE IF NOT EXISTS entries (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(255) NOT NULL,
                amount DOUBLE NOT NULL,
                date VARCHAR(64),
                subject VARCHAR(255),
                note VARCHAR(1024)
            )
            """);
            stmt.execute("ALTER TABLE entries ADD COLUMN IF NOT EXISTS id BIGINT AUTO_INCREMENT");
            stmt.execute("CREATE INDEX IF NOT EXISTS idx_entries_username ON entries(username)");
        }
    }
    
    public Boolean solveAdd(addrequest Add) throws SQLException {
        Entry entry = Add.entry;
        String username = entry.username;
        double amount = entry.amount;
        String date = entry.date;
        String subject = entry.subject;
        String note = entry.note;
        try (Connection c = DriverManager.getConnection(JDBC_URL, JDBC_USER, JDBC_PASSWORD);
             PreparedStatement insert = c.prepareStatement(
                     "INSERT INTO entries (username, amount, date, subject, note) VALUES (?, ?, ?, ?, ?)") ) {
            insert.setString(1, username);
            insert.setDouble(2, amount);
            insert.setString(3, date);
            insert.setString(4, subject);
            insert.setString(5, note);
            insert.executeUpdate();
        }
        return Boolean.valueOf(true);
    }

    public Boolean solveRegister(registerrequest Register) throws SQLException {
        String username= Register.username;
        String password= Register.password;
        try (Connection c = DriverManager.getConnection(JDBC_URL, JDBC_USER, JDBC_PASSWORD);
             PreparedStatement insert = c.prepareStatement(
                     "INSERT INTO users (username, password) VALUES (?, ?)") ) {
            insert.setString(1, username);
            insert.setString(2, password);
            insert.executeUpdate();
        }
        return Boolean.valueOf(true);
    }

    public Boolean solveLogin(loginrequest Login) throws SQLException {
        String username= Login.username;
        String password= Login.password;
        boolean success = false;
        try (Connection c = DriverManager.getConnection(JDBC_URL, JDBC_USER, JDBC_PASSWORD);
             PreparedStatement query = c.prepareStatement("SELECT password FROM users WHERE username = ?") ) {
            query.setString(1, username);
            try (ResultSet rs = query.executeQuery()) {
                if (rs.next()) {
                    String storedPassword = rs.getString(1);
                    success = storedPassword != null && storedPassword.equals(password);
                }
            }
        }
        return Boolean.valueOf(success);
    }

    public List<Entry> solveSearch(searchrequest Search) throws SQLException {
        String username= Search.username;
        String startDate= Search.startDate;
        String endDate= Search.endDate;
        LocalDate start = parseDateOrNull(startDate);
        LocalDate end = parseDateOrNull(endDate);

        List<Entry> results = new ArrayList<>();
        try (Connection c = DriverManager.getConnection(JDBC_URL, JDBC_USER, JDBC_PASSWORD);
             PreparedStatement query = c.prepareStatement(
                     "SELECT id, username, amount, date, subject, note FROM entries WHERE username = ? ORDER BY id") ) {
            query.setString(1, username);
            try (ResultSet rs = query.executeQuery()) {
                while (rs.next()) {
                    String rowDateStr = rs.getString("date");
                    LocalDate rowDate = parseDateOrNull(rowDateStr);
                    if ((rowDate == null) && (start != null || end != null)) {
                        continue;
                    }

                    boolean withinLower = (start == null) || (rowDate != null && !rowDate.isBefore(start));
                    boolean withinUpper = (end == null) || (rowDate != null && !rowDate.isAfter(end));

                    if (withinLower && withinUpper) {
                        results.add(mapEntry(rs));
                    }
                }
            }
        }
        return results;
    }

    public List<Entry> solveList(String username) throws SQLException {
        List<Entry> results = new ArrayList<>();
        try (Connection c = DriverManager.getConnection(JDBC_URL, JDBC_USER, JDBC_PASSWORD);
             PreparedStatement query = c.prepareStatement(
                     "SELECT id, username, amount, date, subject, note FROM entries WHERE username = ? ORDER BY id") ) {
            query.setString(1, username);
            try (ResultSet rs = query.executeQuery()) {
                while (rs.next()) {
                    results.add(mapEntry(rs));
                }
            }
        }
        return results;
    }

    public Boolean solveDelete(deleterequest Delete) throws SQLException {
        try (Connection c = DriverManager.getConnection(JDBC_URL, JDBC_USER, JDBC_PASSWORD);
             PreparedStatement delete = c.prepareStatement(
                     "DELETE FROM entries WHERE id = ? AND username = ?") ) {
            delete.setLong(1, Delete.entryId);
            delete.setString(2, Delete.username);
            int affected = delete.executeUpdate();
            return affected > 0;
        }
    }

    public int solveClear(String username) throws SQLException {
        try (Connection c = DriverManager.getConnection(JDBC_URL, JDBC_USER, JDBC_PASSWORD);
             PreparedStatement clear = c.prepareStatement(
                     "DELETE FROM entries WHERE username = ?") ) {
            clear.setString(1, username);
            return clear.executeUpdate();
        }
    }

    private LocalDate parseDateOrNull(String date) {
        if (date == null || date.isEmpty()) {
            return null;
        }

        String[] parts = date.split("/");
        if (parts.length != 3) {
            return null;
        }

        int year = Integer.parseInt(parts[0]);
        int month = Integer.parseInt(parts[1]);
        int day = Integer.parseInt(parts[2]);
        return LocalDate.of(year, month, day);
    }

    private Entry mapEntry(ResultSet rs) throws SQLException {
        Long id = rs.getObject("id", Long.class);
        return new Entry(
                id,
                rs.getString("username"),
                rs.getDouble("amount"),
                rs.getString("date"),
                rs.getString("subject"),
                rs.getString("note"));
    }
}