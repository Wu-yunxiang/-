package RequestManagement;
import sharedmodel.*;

class addrequest {
    Entry entry;
    public addrequest(String username, double amount, String date, String subject, String note) {
        this.entry = new Entry(username, amount, date, subject, note);
    }
}
class registerOrloginrequest {
    String username;
    String password;
}
class registerrequest extends registerOrloginrequest {
    public registerrequest(String username, String password) {
        this.username = username;
        this.password = password;
    }
}
class loginrequest extends registerOrloginrequest {
    public loginrequest(String username, String password) {
        this.username = username;
        this.password = password;
    }
}
class searchrequest {
    String username;
    String startDate;
    String endDate;
    public searchrequest(String username, String startDate, String endDate) {
        this.username = username;
        this.startDate = startDate;
        this.endDate = endDate;
    }
}   
