package acounting_system;

import com.code_intelligence.jazzer.api.FuzzedDataProvider;
import com.code_intelligence.jazzer.junit.FuzzTest;
import RequestManagement.parser;
import org.junit.jupiter.api.BeforeAll;

public class ParserFuzzTest {

    private static parser p;

    @BeforeAll
    public static void setUp() {
        p = new parser();
        try {
            // Initialize DB once
            p.sql.initialize();
        } catch (Exception e) {
            // Ignore DB init errors in fuzzing context if environment is not perfect
        }
    }

    @FuzzTest(maxDuration = "10s")
    public void fuzzerTestOneInput(FuzzedDataProvider data) {
        String input = data.consumeRemainingAsString();
        // 不要吞掉异常：让 Jazzer 捕获并最小化能触发崩溃的输入
        p.parseRequest(input);
    }
}
