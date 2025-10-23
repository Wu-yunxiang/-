package sharedmodel;

public class Entry {
    public String username;
    public double amount;
    public String date;
    public String subject;
    public String note;
    public Entry(String username, double amount, String date, String subject, String note) {
        this.username = username;
        this.amount = amount;
        this.date = date;
        this.subject = subject;
        this.note = note;
    }
    public String toString() {
        return username + ',' +String.valueOf(amount) + ','
         + date + ',' + subject + ',' + note;
    }
}
