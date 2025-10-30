package RequestManagement;
import sharedmodel.*;

class addrequest {
    Entry entry;
    public addrequest(String username, double amount, String type, String date, String subject, String note) {
        this.entry = new Entry(username, amount, type, date, subject, note);
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
    String typeFilter;
    Double minAmount;
    Double maxAmount;
    public searchrequest(String username, String startDate, String endDate, String typeFilter, Double minAmount, Double maxAmount) {
        this.username = username;
        this.startDate = startDate;
        this.endDate = endDate;
        this.typeFilter = typeFilter;
        this.minAmount = minAmount;
        this.maxAmount = maxAmount;
    }
}

class deleterequest {
    String username;
    long entryId;
    public deleterequest(String username, long entryId) {
        this.username = username;
        this.entryId = entryId;
    }
}