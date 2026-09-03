import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { App } from "antd";
import { useTranslation } from "react-i18next";

import { normalizeAudioFormatValue, normalizeAudioSpeedValue, normalizeAudioVoiceValue } from "@/lib/audio-generation";
import { exchangeAuthorizationCode } from "@/services/api/token-exchange";
import { createModelChannel, encodeChannelModel, modelOptionsFromChannels, normalizeChannelModels, useConfigStore, type ApiCallFormat, type ModelCapability } from "@/stores/use-config-store";
import { usePromptSourceScheduler } from "@/hooks/use-prompt-source-scheduler";

const MODEL_PARAMS = [
    ["imageModel", "image"],
    ["textModel", "text"],
    ["videoModel", "video"],
    ["audioModel", "audio"],
] as const satisfies ReadonlyArray<readonly ["imageModel" | "textModel" | "videoModel" | "audioModel", ModelCapability]>;

export function ClientRootInit({ children }: { children: ReactNode }) {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const handledConfigParams = useRef(false);
    const importChannelCredentials = useConfigStore((state) => state.importChannelCredentials);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);

    usePromptSourceScheduler();

    useEffect(() => {
        if (handledConfigParams.current) return;
        const searchParams = new URLSearchParams(window.location.search);
        let baseUrl = searchParams.get("baseUrl") || searchParams.get("baseurl");
        let apiKey = searchParams.get("apiKey") || searchParams.get("apikey");
        const code = searchParams.get("code");
        const apiFormatParam = searchParams.get("apiFormat");
        let apiFormat: ApiCallFormat | null = apiFormatParam === "openai" || apiFormatParam === "gemini" ? apiFormatParam : null;
        const canvasImageCount = searchParams.get("canvasImageCount");
        const audioVoice = searchParams.get("audioVoice");
        const audioFormat = searchParams.get("audioFormat");
        const audioSpeed = searchParams.get("audioSpeed");
        const silent = searchParams.get("silent") === "1";
        const hasCredentialParams = ["baseUrl", "baseurl", "apiKey", "apikey"].some((key) => searchParams.has(key));
        const modelParams = MODEL_PARAMS.map(([key, capability]) => ({
            key,
            capability,
            values: (searchParams.get(key) || "")
                .split(",")
                .map((value) => value.trim())
                .filter(Boolean),
        }));
        const configParamNames = ["baseUrl", "baseurl", "apiKey", "apikey", "apiFormat", "code", "canvasImageCount", "audioVoice", "audioFormat", "audioSpeed", "silent", ...MODEL_PARAMS.map(([key]) => key)];
        if (!configParamNames.some((key) => searchParams.has(key))) return;

        handledConfigParams.current = true;
        configParamNames.forEach((key) => searchParams.delete(key));
        window.history.replaceState(null, "", `${window.location.pathname}${searchParams.size ? `?${searchParams}` : ""}${window.location.hash}`);

        async function importLaunchConfig() {
            let exchanged = false;
            if (code !== null) {
                if (!baseUrl || !code.trim()) {
                    message.error(t("config.codeExchange.missingParams"));
                    return;
                }
                try {
                    const exchangedConfig = await exchangeAuthorizationCode(baseUrl, code);
                    baseUrl = exchangedConfig.baseUrl;
                    apiKey = exchangedConfig.apiKey;
                    apiFormat = exchangedConfig.apiFormat;
                    exchanged = true;
                } catch (error) {
                    message.error(error instanceof Error ? error.message : t("config.codeExchange.failed"));
                    return;
                }
            }

            const hasModelConfig = modelParams.some((item) => item.values.length);
            const hasApiConfig = Boolean(baseUrl || apiKey || apiFormat);
            let importedChannel: Extract<ReturnType<typeof importChannelCredentials>, { status: "created" | "updated" }> | null = null;
            let channelId: string | undefined;

            if (code === null && hasCredentialParams) {
                const result = importChannelCredentials({ baseUrl, apiKey });
                if (result.status === "missing-base-url") {
                    if (!silent) openConfigDialog(false, "channels");
                    message.error(t("config.importedChannelBaseUrlRequired"));
                    return;
                }
                if (result.status === "missing-api-key") {
                    if (!silent) openConfigDialog(false, "channels");
                    message.error(t("config.importedChannelApiKeyRequired"));
                    return;
                }
                if (result.status === "invalid-base-url") {
                    if (!silent) openConfigDialog(false, "channels");
                    message.error(t("config.importedChannelBaseUrlInvalid"));
                    return;
                }
                importedChannel = result;
                channelId = result.channelId;
            }

            const { config, updateConfig } = useConfigStore.getState();
            if (exchanged || apiFormat || hasModelConfig) {
                const targetChannelId = channelId || "default";
                const channelIndex = config.channels.findIndex((channel) => channel.id === targetChannelId);
                const channel =
                    channelIndex >= 0
                        ? config.channels[channelIndex]
                        : createModelChannel({
                              id: targetChannelId,
                              name: t("config.channels.defaultName"),
                              baseUrl: baseUrl || config.baseUrl,
                              apiKey: apiKey || config.apiKey,
                              apiFormat: apiFormat || config.apiFormat,
                          });
                const models = hasModelConfig ? normalizeChannelModels(modelParams.flatMap(({ capability, values }) => values.map((name) => ({ name, capability })))) : [...channel.models];
                const nextChannel = {
                    ...channel,
                    ...(exchanged && baseUrl ? { baseUrl } : {}),
                    ...(exchanged && apiKey ? { apiKey } : {}),
                    ...(apiFormat ? { apiFormat } : {}),
                    models,
                };
                const channels = channelIndex >= 0 ? config.channels.map((item, index) => (index === channelIndex ? nextChannel : item)) : [nextChannel, ...config.channels];
                updateConfig("channels", channels);
                if (hasModelConfig) {
                    updateConfig("models", modelOptionsFromChannels(channels));
                    modelParams.forEach(({ key, values }) => updateConfig(key, values[0] ? encodeChannelModel(nextChannel.id, values[0]) : ""));
                }
            }

            if (exchanged) {
                if (baseUrl) updateConfig("baseUrl", baseUrl);
                if (apiKey) updateConfig("apiKey", apiKey);
                if (apiFormat) updateConfig("apiFormat", apiFormat);
            } else if (!hasCredentialParams && apiFormat) updateConfig("apiFormat", apiFormat);
            if (canvasImageCount !== null) updateConfig("canvasImageCount", String(Math.max(1, Math.min(15, Math.floor(Math.abs(Number(canvasImageCount)) || 3)))));
            if (audioVoice !== null) updateConfig("audioVoice", normalizeAudioVoiceValue(audioVoice));
            if (audioFormat !== null) updateConfig("audioFormat", normalizeAudioFormatValue(audioFormat));
            if (audioSpeed !== null) updateConfig("audioSpeed", normalizeAudioSpeedValue(audioSpeed));
            if (importedChannel) {
                if (!silent) openConfigDialog(false, "channels");
                message.success(t(importedChannel.status === "created" ? "config.importedChannelCreated" : "config.importedChannelUpdated", { name: importedChannel.channelName }));
            } else if (hasApiConfig) {
                if (!silent) openConfigDialog(false, "channels");
                message.success(t(exchanged ? "config.codeExchange.success" : "config.importedDirectConfig"));
            }
        }

        void importLaunchConfig();
    }, [importChannelCredentials, message, openConfigDialog, t]);

    return <>{children}</>;
}
