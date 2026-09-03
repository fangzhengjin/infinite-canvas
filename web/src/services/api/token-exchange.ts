import i18n from "@/i18n";
import type { ApiCallFormat } from "@/stores/use-config-store";

const EXCHANGE_TIMEOUT_MS = 15_000;
const exchangeText = (key: string) => i18n.t(`config.codeExchange.${key}`);

export type ExchangedApiConfig = {
    baseUrl: string;
    apiKey: string;
    apiFormat: ApiCallFormat;
};

export async function exchangeAuthorizationCode(baseUrl: string, code: string): Promise<ExchangedApiConfig> {
    const exchangeUrl = buildExchangeUrl(baseUrl);
    const normalizedCode = code.trim();
    if (!normalizedCode) throw new Error(exchangeText("missingParams"));

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), EXCHANGE_TIMEOUT_MS);
    let response: Response | undefined;
    let result: unknown = null;
    try {
        response = await fetch(exchangeUrl, {
            method: "POST",
            credentials: "omit",
            redirect: "error",
            referrerPolicy: "no-referrer",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code: normalizedCode }),
            signal: controller.signal,
        });
        result = await response.json();
    } catch (error) {
        if (controller.signal.aborted) throw new Error(exchangeText("timeout"), { cause: error });
        throw new Error(exchangeText(response ? "invalidResponse" : "requestFailed"), { cause: error });
    } finally {
        window.clearTimeout(timer);
    }

    if (!response || !isRecord(result)) throw new Error(exchangeText("invalidResponse"));
    if (!response.ok || result.success !== true) throw new Error(exchangeText("failed"));
    if (!isRecord(result.data)) throw new Error(exchangeText("invalidResponse"));

    const returnedBaseUrl = typeof result.data.base_url === "string" ? result.data.base_url.trim() : "";
    const apiKey = typeof result.data.api_key === "string" ? result.data.api_key.trim() : "";
    const apiFormat = result.data.api_format;
    if (!isHttpUrl(returnedBaseUrl) || !apiKey || apiFormat !== "openai") throw new Error(exchangeText("invalidResponse"));
    return { baseUrl: returnedBaseUrl, apiKey, apiFormat };
}

function buildExchangeUrl(baseUrl: string) {
    let url: URL;
    try {
        url = new URL(baseUrl.trim());
    } catch (error) {
        throw new Error(exchangeText("invalidBaseUrl"), { cause: error });
    }
    if (!isAllowedHttpUrl(url)) throw new Error(exchangeText("invalidBaseUrl"));
    url.pathname = "/api/integrations/exchange";
    url.search = "";
    url.hash = "";
    return url.toString();
}

function isHttpUrl(value: string) {
    try {
        return isAllowedHttpUrl(new URL(value));
    } catch {
        return false;
    }
}

function isAllowedHttpUrl(url: URL) {
    return (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}
