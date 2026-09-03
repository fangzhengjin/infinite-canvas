import { expect, test } from "bun:test";

test("URL credential import requires both Base URL and API key", async () => {
    Object.defineProperty(globalThis, "localStorage", { value: { getItem: () => null } });
    const { defaultConfig, upsertChannelCredentials } = await import("../src/stores/use-config-store");

    const missingBaseUrl = upsertChannelCredentials(defaultConfig, { apiKey: "key" });
    expect(missingBaseUrl.status).toBe("missing-base-url");
    expect(missingBaseUrl.config).toBe(defaultConfig);

    const missingApiKey = upsertChannelCredentials(defaultConfig, { baseUrl: "https://example.com/v1" });
    expect(missingApiKey.status).toBe("missing-api-key");
    expect(missingApiKey.config).toBe(defaultConfig);

    const complete = upsertChannelCredentials(defaultConfig, { baseUrl: "https://example.com/v1", apiKey: " key " });
    expect(complete.status).toBe("created");
    expect(complete.config.channels).toHaveLength(defaultConfig.channels.length + 1);
    expect(complete.config.channels.at(-1)?.apiKey).toBe("key");
});
