import React from "react";
import { createRoot } from "react-dom/client";
import "antd/dist/reset.css";
import "streamdown/styles.css";
import "./styles/globals.css";
import { RouterProvider } from "react-router-dom";

import { AppProviders } from "@/components/layout/app-providers";
import "@/i18n";
import { initAnalytics } from "@/lib/analytics";
import { router } from "@/router";
import { type ThemeName, useThemeStore } from "@/stores/use-theme-store";

const isThemeName = (value: unknown): value is ThemeName => value === "light" || value === "dark";
const initialTheme = new URLSearchParams(window.location.search).get("theme");
if (isThemeName(initialTheme)) useThemeStore.getState().setTheme(initialTheme);

window.addEventListener("message", (event) => {
    if (event.source !== window.parent) return;
    const message = event.data;
    if (message?.type !== "theme" || !isThemeName(message.value)) return;
    useThemeStore.getState().setTheme(message.value);
});

initAnalytics();

document.body.style.fontFamily = '"SF Pro Display","SF Pro Text","PingFang SC","Microsoft YaHei","Helvetica Neue",sans-serif';

createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <AppProviders>
            <RouterProvider router={router} />
        </AppProviders>
    </React.StrictMode>,
);
