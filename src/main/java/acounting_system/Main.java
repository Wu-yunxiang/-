package acounting_system;

import RequestManagement.*;
import communication.*;
import ResultManagement.*;

public class Main {
    public static void main(String[] args) throws Exception {
        parser requestParser = new parser();
        requestParser.sql.initialize();

        ReceiveService service = new ReceiveService(8080, (socket, rawRequest) -> {
            ParseResult result = requestParser.parseRequest(rawRequest);
            if (result == null) {
                return "unknown_request";
            }
            return result.toString();
        });

        service.start();
    }
}
