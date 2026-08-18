import { GITHUB_PROXY_URL } from "@/constant/runtime-config";

const GITHUB_PROXY_HOSTS = new Set([
    "github.com",
    "raw.githubusercontent.com",
    "gist.githubusercontent.com",
    "api.github.com",
    "avatars.githubusercontent.com",
    "desktop.githubusercontent.com",
]);

export function resolveGithubUrl(url: string) {
    const proxy = GITHUB_PROXY_URL.replace(/\/+$/, "");
    if (!proxy || url.startsWith(`${proxy}/`)) return url;

    try {
        const target = new URL(url);
        const proxyUrl = new URL(proxy);
        if (target.protocol !== "https:" || !GITHUB_PROXY_HOSTS.has(target.hostname)) return url;
        if (proxyUrl.protocol !== "http:" && proxyUrl.protocol !== "https:") return url;
        return `${proxy}/${url}`;
    } catch {
        return url;
    }
}
