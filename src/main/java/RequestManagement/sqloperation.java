package RequestManagement;

import java.sql.*;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import sharedmodel.*;

public class sqloperation {
    public static String JDBC_URL = "jdbc:h2:~/accounting_db";
    public static String JDBC_USER = "sa";
    public static String JDBC_PASSWORD = "";
    public Connection conn;

    public sqloperation() {
    }

    public void initialize() throws ClassNotFoundException, SQLException{
        Class.forName("org.h2.Driver");
        conn = DriverManager.getConnection(JDBC_URL, JDBC_USER, JDBC_PASSWORD);
        Statement stmt = conn.createStatement();
        stmt.execute("""
            CREATE TABLE IF NOT EXISTS users (
                username VARCHAR(255) PRIMARY KEY,
                password VARCHAR(255) NOT NULL
            )
            """);
        stmt.execute("""
            CREATE TABLE IF NOT EXISTS entries (
                username VARCHAR(255) NOT NULL,
                amount DOUBLE NOT NULL,
                date VARCHAR(64),
                subject VARCHAR(255),
                note VARCHAR(1024)
            )
            """);
        stmt.close();
    }
    
    public Boolean solveAdd(addrequest Add) throws SQLException {
        Entry entry = Add.entry;
        String username = entry.username;
        double amount = entry.amount;
        String date = entry.date;
        String subject = entry.subject;
        String note = entry.note;
        PreparedStatement insert = conn.prepareStatement(
            "INSERT INTO entries (username, amount, date, subject, note) VALUES (?, ?, ?, ?, ?)");
        insert.setString(1, username);
        insert.setDouble(2, amount);
        insert.setString(3, date);
        insert.setString(4, subject);
        insert.setString(5, note);
        insert.executeUpdate();
        insert.close();
        return Boolean.valueOf(true);
    }

    public Boolean solveRegister(registerrequest Register) throws SQLException {
        String username= Register.username;
        String password= Register.password;
        PreparedStatement insert = conn.prepareStatement(
            "INSERT INTO users (username, password) VALUES (?, ?)");
        insert.setString(1, username);
        insert.setString(2, password);
        insert.executeUpdate();
        insert.close();
        return Boolean.valueOf(true);
    }

    public Boolean solveLogin(loginrequest Login) throws SQLException {
        String username= Login.username;
        String password= Login.password;
        PreparedStatement query = conn.prepareStatement(
                "SELECT password FROM users WHERE username = ?");
        query.setString(1, username);
        ResultSet rs = query.executeQuery();
        boolean success = false;
        if (rs.next()) {
            String storedPassword = rs.getString(1);
            success = storedPassword != null && storedPassword.equals(password);
        }
        rs.close();
        query.close();
        return Boolean.valueOf(success);
    }

    public List<Entry> solveSearch(searchrequest Search) throws SQLException {
        String username= Search.username;
        String startDate= Search.startDate;
        String endDate= Search.endDate;
        LocalDate start = parseDateOrNull(startDate);
        LocalDate end = parseDateOrNull(endDate);

        PreparedStatement query = conn.prepareStatement(
                "SELECT username, amount, date, subject, note FROM entries WHERE username = ?");
        query.setString(1, username);
        ResultSet rs = query.executeQuery();

        List<Entry> results = new ArrayList<>();
        while (rs.next()) {
            String rowDateStr = rs.getString("date");
            LocalDate rowDate = parseDateOrNull(rowDateStr);

            boolean withinLower = (start == null) || !rowDate.isBefore(start);
            boolean withinUpper = (end == null) || !rowDate.isAfter(end);

           if (withinLower && withinUpper) {
                results.add(new Entry(
                    rs.getString("username"),
                    rs.getDouble("amount"),
                    rowDateStr,
                    rs.getString("subject"),
                    rs.getString("note")));
            }
        }
        rs.close();
        query.close();
        return results;
    }

    private LocalDate parseDateOrNull(String date) {
        if(date == null) {
            return null;
        }
        String[] parts = date.split("/");
        int year = Integer.parseInt(parts[0]);
        int month = Integer.parseInt(parts[1]);
        int day = Integer.parseInt(parts[2]);
        return LocalDate.of(year, month, day);
    }
}