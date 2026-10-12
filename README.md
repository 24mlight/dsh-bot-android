<p align="center">
  <img src="docs/icon/app-icon.svg" width="112" height="112" alt="DSH Bot icon">
</p>

<h1 align="center">DSH Bot for Android</h1>

<p align="center">
  <a href="https://github.com/24mlight/dsh-bot-android/releases/latest"><img alt="Release" src="https://img.shields.io/github/v/release/24mlight/dsh-bot-android?label=release&color=5b7bff"></a>
  <a href="https://github.com/24mlight/dsh-bot-android/actions/workflows/android.yml"><img alt="Build" src="https://img.shields.io/github/actions/workflow/status/24mlight/dsh-bot-android/android.yml?branch=main&label=build"></a>
  <img alt="Android 10+" src="https://img.shields.io/badge/Android-10%2B-3DDC84?logo=android&logoColor=white">
  <img alt="Capacitor 8" src="https://img.shields.io/badge/Capacitor-8-119EFF?logo=capacitor&logoColor=white">
  <a href="LICENSE"><img alt="License: GPL-3.0" src="https://img.shields.io/github/license/24mlight/dsh-bot-android?color=blue"></a>
</p>

<p align="center"><b>English</b> · <a href="README.zh-CN.md">简体中文</a></p>

An Android app for your own [DeepSeek Harness](https://www.npmjs.com/package/@deepseek-ai/dsh) (DSH) server. It opens your DSH web UI full screen, styled by the Liquid Glass skin and fitted to a phone screen in light and dark mode. It also shows a notification, as a banner and on the lock screen, when a reply is ready or a question is waiting for you, even while the app is closed.

The app is not tied to any server: you paste your server's address once, and that server is the one it opens.

<p align="center">
  <img src="docs/screenshots/chat-dark.jpg" width="300" alt="A chat in dark mode">
  &nbsp;&nbsp;
  <img src="docs/screenshots/chat-light.jpg" width="300" alt="A chat in light mode">
</p>

## What you need

1. **A DSH web server reachable from the internet** (see [Server address](#server-address)).
2. **Two plugins on that server**: the Liquid Glass skin and dsh-notify (see [Server plugins](#server-plugins)).
3. **An Android phone**, Android 10 or newer.

## Server address

The address you paste into the app must be a **public internet address** of the machine that runs `dsh web`. The phone uses it everywhere: on mobile data, on other Wi-Fi networks, and from the background service that brings notifications. A LAN address such as `http://192.168.1.20:8080` only works at home, and notifications stop as soon as you leave.

The recommended setup is your own domain behind a **Cloudflare Tunnel**. You get HTTPS, you don't need to open any port on your router, and you don't need a fixed IP:

1. Register a domain and add it to Cloudflare. Any registrar works; Cloudflare also sells domains.
2. On the DSH machine, install [`cloudflared`](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) and create a tunnel:

   ```bash
   cloudflared tunnel login
   cloudflared tunnel create dsh
   cloudflared tunnel route dns dsh dsh.example.com
   ```

3. Point the tunnel at your DSH web port (here `8080`, as in `dsh --profile web --port 8080`) in `~/.cloudflared/config.yml`:

   ```yaml
   tunnel: <TUNNEL-ID>
   credentials-file: /root/.cloudflared/<TUNNEL-ID>.json
   ingress:
     - hostname: dsh.example.com
       service: http://localhost:8080
     - service: http_status:404
   ```

4. Run it as a service: `cloudflared service install`, or `cloudflared tunnel run dsh` to try it first.

Your address is now `https://dsh.example.com`. Open it in a phone browser on mobile data to check that it loads.

### Recommended: require a login token

Once the address is public, anyone who finds it can open your DSH, and DSH can run commands on that machine. So make DSH web require a login token, so that only a link with `?token=…` gets in. The app works either way, but a token is strongly recommended.

If you are not sure how to set it up for your DSH version and deployment, ask a coding agent (Claude Code, Codex, Cursor…) on that machine to do it, for example:

```text
My DSH web (dsh --profile web) is reachable from the internet through a
Cloudflare Tunnel. Configure it so that it requires a login token, keep it
running as a service, and give me the login link with ?token=….
```

## Server plugins

Install both plugins into your DSH web profile on the server. Both are **required**. Run these on the machine that runs `dsh web` (it needs `git`). Replace `web` with your profile's name.

```bash
# required: the Liquid Glass skin (the app's look)
dsh plugin --profile web add github:24mlight/dsh-liquid-glass

# required: dsh-notify (notifications for the app)
dsh plugin --profile web add github:24mlight/dsh-notify-plugin

# optional: the ds-bot multi-bot plugin (Bots and groups)
dsh plugin --profile web add ds-bot

systemctl restart dsh-web
```

Restart DSH however you normally do; `systemctl restart dsh-web` is what a systemd setup uses.

- [dsh-liquid-glass](https://github.com/24mlight/dsh-liquid-glass): an Apple-style Liquid Glass skin for the DSH web UI, adapted for ds-bot and for this app's WebView. Its package name is `dsh-glass-skin`.
- [dsh-notify-plugin](https://github.com/24mlight/dsh-notify-plugin): tells the app when a reply is ready. Its package name is `dsh-notify`.

To update them later:

```bash
dsh plugin --profile web update dsh-glass-skin
dsh plugin --profile web update dsh-notify
systemctl restart dsh-web
```

## Install the app

Download the latest `dsh-bot-vX.Y.Z.apk` from [Releases](https://github.com/24mlight/dsh-bot-android/releases/latest) and install it. Android asks you to allow installs from your browser or file manager the first time. Newer versions install over older ones and keep your login.

## Log in

1. Copy your DSH web address. With a login token (recommended), copy the full login link with `?token=…`.
2. Open DSH Bot, paste it into **服务地址** (server address) and tap **登录** (log in).

![The setup page, light and dark](docs/screenshots/setup-390.png)

The address is saved on the phone only. If your token changes (for example when DSH restarts), press Back in the app to return to the setup page, paste the new link and log in again.

## Notifications

On the setup page, turn on **消息通知** (notifications); Android 13+ asks for the notification permission. Then:

- **Background and auto-start (后台与自启动):** allow the app to run in the background. On phones with strict battery management (ColorOS / OxygenOS, MIUI / HyperOS, OriginOS, EMUI…), also open the app's **battery** settings and allow **all** background activity, and turn on auto-start. Without this the system freezes the app a few seconds after you leave it, and notifications only arrive when you open it again.
- **Notification style (通知样式):** banners, lock screen and sound are set per channel in the system settings.
- **Test notification (发送测试通知):** the server sends one notification through the whole path.
- **Diagnostics (诊断记录):** shows what the server decided for the last replies (sent, or why not) and what the phone received, with times. Use it when a notification is missing.
- **No ongoing notice:** the background service posts nothing of its own, so nothing sits in the status bar or the shade. In exchange it relies on the app being allowed to run in the background (the setting above); without it, notifications only arrive while the app is open.

When notifications arrive:

| Where | When |
|---|---|
| A Bot's own chat | each reply (failed replies too) |
| A group (ds-bot) | each message a member posts |
| DSH Agent or a plain DSH session | when a turn you (or a scheduled task) started ends |
| Any | a Bot asks you a question (`ask_user`) |

Bot-to-Bot exchanges, sub-agents, stopped and empty replies stay quiet.

How it works: the app runs a background service (no notification of its own) that keeps a long poll open on `POST /api/dsh-notify` with the same login cookie as the WebView. Pauses and a watchdog run on `AlarmManager`, so they keep time while the phone sleeps. The service restarts after a reboot or an app update.

## Build from source

```bash
npm ci
node --test              # unit tests
npx cap sync android
cd android && ./gradlew assembleDebug
```

Capacitor 8, compileSdk 36, minSdk 29, JDK 21.

```
www/                    setup page (one address field, notification settings)
android/                native project: DshNavPlugin (opens and keeps your server
                        in the app), NotifyService + DshNotifyPlugin (notifications)
docs/icon/              app icon sources (Orbit: a ring with a dot stepping out)
.github/workflows/      CI: tests, signed release APK, GitHub release
```

Release builds are signed in CI from four repository secrets: `ANDROID_KEYSTORE_BASE64` (the PKCS12 keystore, base64), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD`. Run the **Android APK** workflow with a `release_tag` (e.g. `v0.1.19`) to publish a release. A fork must use its own keystore, so its APKs cannot install over these.

## Recommended

- **[dsh-liquid-glass](https://github.com/24mlight/dsh-liquid-glass):** the Apple-style Liquid Glass skin, which also looks good in a desktop browser.
- **[ds-bot](https://www.npmjs.com/package/ds-bot):** a multi-bot plugin for DSH, with several Bots and group chats. It works in the app too, and Bot replies and group messages come as notifications.

Their install commands are under [Server plugins](#server-plugins) above.

## License

[GNU GPL v3](LICENSE). You may use, study, change and share this app. If you distribute it or a modified version, you must release the complete source under the same license.
