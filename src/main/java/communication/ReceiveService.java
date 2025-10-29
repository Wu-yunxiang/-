package communication;

import java.io.BufferedReader;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.function.BiFunction;

public final class ReceiveService {
    private final int port;
    private final BiFunction<Socket, String, String> handler;
    private ServerSocket serverSocket;
    private volatile boolean running;
    private ExecutorService executor;

    public ReceiveService(int port, BiFunction<Socket, String, String> handler) {
        if (port <= 0 || port > 65535) {
            throw new IllegalArgumentException("port out of range: " + port);
        }
        if (handler == null) {
            throw new IllegalArgumentException("handler must not be null");
        }
        this.port = port;
        this.handler = handler;
    }

    public void start() throws Exception {
        if (running) {
            throw new IllegalStateException("service already running");
        }
        serverSocket = new ServerSocket(port);
        running = true;
        // 使用缓存线程池为每个连接提供并发处理能力（轻量级、适合短连接）
        executor = Executors.newCachedThreadPool();
        while (running) {
            final Socket client = serverSocket.accept();
            // 提交到线程池处理，避免阻塞 accept() 从而支持并发客户端
            executor.submit(() -> {
                try (BufferedReader reader = new BufferedReader(
                        new java.io.InputStreamReader(client.getInputStream(), StandardCharsets.UTF_8));
                     Writer writer = new OutputStreamWriter(client.getOutputStream(), StandardCharsets.UTF_8)) {

                    String line = reader.readLine();
                    while (line != null) {
                        String reply = handler.apply(client, line);
                        if (reply != null) {
                            writer.write(reply);
                            writer.write('\n');
                            writer.flush();
                        }
                        line = reader.readLine();
                    }
                } catch (Throwable t) {
                    // 日志打印（如果需要）或静默失败以防单个连接影响其它连接
                    // t.printStackTrace();
                } finally {
                    try {
                        client.close();
                    } catch (Throwable ignored) {
                    }
                }
            });
        }
    }

    public void stop() throws Exception {
        running = false;
        if (serverSocket != null) {
            serverSocket.close();
            serverSocket = null;
        }
        if (executor != null) {
            executor.shutdown();
            try {
                if (!executor.awaitTermination(2, TimeUnit.SECONDS)) {
                    executor.shutdownNow();
                }
            } catch (InterruptedException e) {
                executor.shutdownNow();
                Thread.currentThread().interrupt();
            }
            executor = null;
        }
    }
}
