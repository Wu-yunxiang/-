package server.resource;

import java.io.File;
import java.io.FileInputStream;
import java.io.OutputStream;
import java.net.Socket;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;

public final class ResourceService {
    private final Path baseDir;
    private static final Map<String, String> MIME_TYPES = new HashMap<>();

    static {
        MIME_TYPES.put(".html", "text/html; charset=UTF-8");
        MIME_TYPES.put(".css", "text/css; charset=UTF-8");
        MIME_TYPES.put(".js", "application/javascript; charset=UTF-8");
        MIME_TYPES.put(".json", "application/json; charset=UTF-8");
        MIME_TYPES.put(".png", "image/png");
        MIME_TYPES.put(".jpg", "image/jpeg");
        MIME_TYPES.put(".jpeg", "image/jpeg");
        MIME_TYPES.put(".gif", "image/gif");
        MIME_TYPES.put(".svg", "image/svg+xml");
    }

    public ResourceService(String baseDir) {
        this.baseDir = Path.of(baseDir).toAbsolutePath().normalize();
    }

    public void handle(Socket client, String resourcePath) throws Exception {
        Path target = resolvePath(resourcePath);
        byte[] body = Files.readAllBytes(target);

        String mime = guessMime(target.toFile());
        OutputStream out = client.getOutputStream();
        out.write(("HTTP/1.1 200 OK\r\n" +
                "Content-Type: " + mime + "\r\n" +
                "Content-Length: " + body.length + "\r\n" +
                "Connection: close\r\n\r\n").getBytes());
        out.write(body);
    }

    private Path resolvePath(String resourcePath) throws Exception {
        if (resourcePath == null || resourcePath.isBlank() || resourcePath.equals("/")) {
            resourcePath = "/index.html";
        }
        Path resolved = baseDir.resolve(resourcePath.substring(1)).normalize();
        if (!resolved.startsWith(baseDir) || !Files.exists(resolved) || Files.isDirectory(resolved)) {
            return baseDir.resolve("index.html");
        }
        return resolved;
    }

    private String guessMime(File file) {
        String name = file.getName();
        int idx = name.lastIndexOf('.');
        if (idx != -1) {
            String ext = name.substring(idx).toLowerCase();
            String mime = MIME_TYPES.get(ext);
            if (mime != null) {
                return mime;
            }
        }
        return "application/octet-stream";
    }
}
