package RequestManagement;
import java.sql.SQLException;
import ResultManagement.*;
public class parser {
    public sqloperation sql;
    public parser() {
        sql = new sqloperation();
    }
    public ParseResult parseRequest(String request) {
        String[] parts = request.split(",");
        String username = parts[0];
        String action = parts[1];
        if (action.equals("add")) {
            double amount = Double.parseDouble(parts[2]);
            String date = parts[3];
            String subject = parts[4];
            String note = parts[5];
            addrequest Add = new addrequest(username, amount, date, subject, note);
            try {
                return new ParseResult("add", sql.solveAdd(Add), null, null);
            } catch (SQLException e) {
                return null;
            }
        }
        else if(action.equals("register")) {
            String password = parts[2];
            registerrequest Register = new registerrequest(username, password);
            try {
                return new ParseResult("register", sql.solveRegister(Register), null, null);
            } catch (SQLException e) {
                return null;
            }
        }
        else if(action.equals("login")) {
            String password = parts[2];
            loginrequest Login = new loginrequest(username, password);
            try {
                return new ParseResult("login", sql.solveLogin(Login), null, null);
            } catch (SQLException e) {
                return null;
            }
        }
        else if(action.equals("search")) {
            String startDate = parts[2];
            String endDate = parts[3];
            searchrequest Search = new searchrequest(username, startDate, endDate);
            try {
                return new ParseResult("search", null, null, sql.solveSearch(Search));
            } catch (SQLException e) {
                return null;
            }
        }
        else {
            return null;
        }
    }
}
