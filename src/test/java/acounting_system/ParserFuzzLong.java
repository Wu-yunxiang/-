package acounting_system;

import com.code_intelligence.jazzer.api.FuzzedDataProvider;
import com.code_intelligence.jazzer.junit.FuzzTest;
import RequestManagement.parser;
import RequestManagement.sqloperation;
import org.junit.jupiter.api.BeforeAll;

public class ParserFuzzLong {

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

    // 用于“至少运行 5 小时”的模糊测试证明（按需手动运行，不应纳入日常 CI）
    @FuzzTest(maxDuration = "5h")
    public void fuzzerTestOneInput(FuzzedDataProvider data) {
        String input = data.consumeRemainingAsString();
        // 不要吞掉异常：让 Jazzer 捕获并最小化能触发崩溃的输入
        p.parseRequest(input);
    }
}
