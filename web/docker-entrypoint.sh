#!/bin/sh
set -e

# Executed automatically by the official nginx image entrypoint through /docker-entrypoint.d/*.sh before nginx starts.
# Generate the runtime base path, nginx route, and config.js from environment variables.

fail_base_path() {
    printf 'APP_BASE_PATH 配置失败：%s\n' "$1" >&2
    exit 1
}

RAW_BASE_PATH=${APP_BASE_PATH:-/}
if [ "$RAW_BASE_PATH" = "/" ]; then
    APP_BASE_PATH=/
elif printf '%s\n' "$RAW_BASE_PATH" | grep -Eq '^/([A-Za-z0-9_-]+/)*[A-Za-z0-9_-]+/?$'; then
    APP_BASE_PATH=${RAW_BASE_PATH%/}
else
    fail_base_path '只允许以 / 开头的英文字母、数字、下划线或连字符路径段，例如 /tools/canvas。'
fi

BASE_PATH_FIRST_SEGMENT=${APP_BASE_PATH#/}
BASE_PATH_FIRST_SEGMENT=${BASE_PATH_FIRST_SEGMENT%%/*}
case "$BASE_PATH_FIRST_SEGMENT" in
    image|video|assets|prompts|canvas|config)
        fail_base_path "首段 ${BASE_PATH_FIRST_SEGMENT} 与现有根路径路由冲突。"
        ;;
esac

INDEX_TEMPLATE=/usr/share/nginx/index.template.html
INDEX_OUTPUT=/usr/share/nginx/html/index.html
BASE_PATH_CONFIG=/etc/nginx/app-base-path.conf

[ -f "$INDEX_TEMPLATE" ] || fail_base_path "未找到构建模板 ${INDEX_TEMPLATE}，无法生成 index.html。"
grep -q '__APP_BASE_PATH__' "$INDEX_TEMPLATE" || fail_base_path '构建模板缺少 __APP_BASE_PATH__ 占位符，无法注入挂载路径。'

sed "s|__APP_BASE_PATH__|${APP_BASE_PATH}|g" "$INDEX_TEMPLATE" > "${INDEX_OUTPUT}.tmp"
mv "${INDEX_OUTPUT}.tmp" "$INDEX_OUTPUT"

if [ "$APP_BASE_PATH" = "/" ]; then
    printf '%s\n' '# Root-only deployment.' > "${BASE_PATH_CONFIG}.tmp"
else
    cat > "${BASE_PATH_CONFIG}.tmp" <<EOF
location = ${APP_BASE_PATH} {
    return 308 ${APP_BASE_PATH}/;
}

location = ${APP_BASE_PATH}/config.js {
    alias /usr/share/nginx/html/config.js;
    add_header Cache-Control "no-store";
}

location ^~ ${APP_BASE_PATH}/ {
    rewrite ^${APP_BASE_PATH}/(.*)\$ /\$1 break;
    try_files \$uri \$uri/ /index.html;
}
EOF
fi
mv "${BASE_PATH_CONFIG}.tmp" "$BASE_PATH_CONFIG"

# GA4 and Baidu IDs contain only letters, numbers, and hyphens. Remove other characters
# so quotes and similar values cannot break the JavaScript strings in config.js as a defense-in-depth measure.
sanitize_id() {
    printf '%s' "$1" | tr -cd 'A-Za-z0-9-'
}

escape_js_string() {
    printf '%s' "$1" | tr -d '\r\n' | sed 's/\\/\\\\/g; s/"/\\"/g'
}

GA4_ID=$(sanitize_id "${ANALYTICS_GA4_ID:-}")
BAIDU_ID=$(sanitize_id "${ANALYTICS_BAIDU_ID:-}")
GITHUB_PROXY=$(escape_js_string "${GITHUB_PROXY_URL:-}")

cat > /usr/share/nginx/html/config.js <<EOF
window.__RUNTIME_CONFIG__ = {
  ANALYTICS_GA4_ID: "${GA4_ID}",
  ANALYTICS_BAIDU_ID: "${BAIDU_ID}",
  GITHUB_PROXY_URL: "${GITHUB_PROXY}"
};
EOF
