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
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const config = useConfigStore((state) => state.config);
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
            if (baseUrl || apiKey || apiFormat || hasModelConfig) {
                const defaultChannelIndex = config.channels.findIndex((channel) => channel.id === "default");
                const defaultChannel =
                    defaultChannelIndex >= 0
                        ? config.channels[defaultChannelIndex]
                        : createModelChannel({
                              id: "default",
                              name: t("config.channels.defaultName"),
                              baseUrl: baseUrl || config.baseUrl,
                              apiKey: apiKey || config.apiKey,
                              apiFormat: apiFormat || config.apiFormat,
                          });
                const models = hasModelConfig
                    ? normalizeChannelModels(modelParams.flatMap(({ capability, values }) => values.map((name) => ({ name, capability }))))
                    : [...defaultChannel.models];
                const nextDefaultChannel = {
                    ...defaultChannel,
                    ...(baseUrl ? { baseUrl } : {}),
                    ...(apiKey ? { apiKey } : {}),
                    ...(apiFormat ? { apiFormat } : {}),
                    models,
                };
                const channels = defaultChannelIndex >= 0 ? config.channels.map((channel, index) => (index === defaultChannelIndex ? nextDefaultChannel : channel)) : [nextDefaultChannel, ...config.channels];
                updateConfig("channels", channels);
                if (hasModelConfig) {
                    updateConfig("models", modelOptionsFromChannels(channels));
                    modelParams.forEach(({ key, values }) => updateConfig(key, values[0] ? encodeChannelModel(nextDefaultChannel.id, values[0]) : ""));
                }
            }

            if (baseUrl) updateConfig("baseUrl", baseUrl);
            if (apiKey) updateConfig("apiKey", apiKey);
            if (apiFormat) updateConfig("apiFormat", apiFormat);
            if (canvasImageCount !== null) updateConfig("canvasImageCount", String(Math.max(1, Math.min(15, Math.floor(Math.abs(Number(canvasImageCount)) || 3)))));
            if (audioVoice !== null) updateConfig("audioVoice", normalizeAudioVoiceValue(audioVoice));
            if (audioFormat !== null) updateConfig("audioFormat", normalizeAudioFormatValue(audioFormat));
            if (audioSpeed !== null) updateConfig("audioSpeed", normalizeAudioSpeedValue(audioSpeed));
            if (hasApiConfig) {
                if (!silent) openConfigDialog(false);
                message.success(t(exchanged ? "config.codeExchange.success" : "config.importedDirectConfig"));
            }
        }

        void importLaunchConfig();
    }, [config, message, openConfigDialog, t, updateConfig]);

    return <>{children}</>;
}
