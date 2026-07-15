package com.wholesalepos.offline;

import static org.junit.Assert.assertTrue;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import org.junit.Test;

public class ApplicationConfigTest {
    @Test
    public void releaseUsesStableApplicationId() throws Exception {
        String buildFile = new String(
            Files.readAllBytes(Paths.get("build.gradle")),
            StandardCharsets.UTF_8
        );
        assertTrue(buildFile.contains("applicationId \"com.wholesalepos.offline\""));
    }
}
