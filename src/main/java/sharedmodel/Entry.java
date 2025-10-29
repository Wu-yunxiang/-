package sharedmodel;

public class Entry {
    public Long id;
    public String username;
    public double amount;
    public String type;
    public String date;
    public String subject;
    public String note;
    public Entry(Long id, String username, double amount, String type, String date, String subject, String note) {
        this.id = id;
        this.username = username;
    this.amount = amount;
    this.type = (type == null || type.isBlank()) ? "expense" : type;
        this.date = date;
        this.subject = subject;
        this.note = note;
    }
    public Entry(String username, double amount, String type, String date, String subject, String note) {
        this(null, username, amount, type, date, subject, note);
    }
    public String toString() {
        StringBuilder builder = new StringBuilder();
        builder.append(id == null ? "null" : id.toString());
        builder.append(',');
        builder.append(username);
        builder.append(',');
        builder.append(String.valueOf(amount));
        builder.append(',');
        builder.append(type == null ? "" : type);
        builder.append(',');
        builder.append(date == null ? "" : date);
        builder.append(',');
        builder.append(subject == null ? "" : subject);
        builder.append(',');
        builder.append(note == null ? "" : note);
        return builder.toString();
    }
}
