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
        // 使用StringBuilder提高字符串拼接性能
        return new StringBuilder()
            .append(id == null ? "null" : id.toString()).append(',')
            .append(username).append(',')
            .append(amount).append(',')
            .append(type == null ? "" : type).append(',')
            .append(date == null ? "" : date).append(',')
            .append(subject == null ? "" : subject).append(',')
            .append(note == null ? "" : note)
            .toString();
    }
}