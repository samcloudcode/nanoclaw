# Proton Bridge Setup (Ubuntu Server + VNC)

## Install

```bash
wget "https://proton.me/download/bridge/protonmail-bridge_3.21.2-1_amd64.deb" -O /tmp/protonmail-bridge.deb
sudo apt install -y /tmp/protonmail-bridge.deb
```

## Qt Dependencies

The bundled Qt needs system xcb libraries that aren't installed by default on a headless server:

```bash
sudo apt install -y libxcb-cursor0 libxcb-icccm4 libxcb-image0 libxcb-keysyms1 \
  libxcb-render-util0 libxcb-xinerama0 libxcb-shape0 libxkbcommon-x11-0
```

## Keyring Setup

Bridge requires a D-Bus secret service (gnome-keyring). On a VNC-based server, the "login" keyring collection doesn't get auto-created because there's no PAM login session.

**Fix (run in VNC terminal):**

1. Install tools:
   ```bash
   sudo apt install -y libsecret-tools
   ```

2. Start the keyring daemon:
   ```bash
   gnome-keyring-daemon --replace --components=secrets,pkcs11 &
   ```

3. Store a dummy secret to trigger keyring creation:
   ```bash
   echo -n "test" | secret-tool store --label="test" test test
   ```

4. When prompted to create a new keyring, **set an empty password** (hit Enter twice) so it unlocks automatically on boot.

## Browser for CAPTCHA

Bridge needs a browser for human verification on first login. Snap browsers (Firefox, Chromium) don't work inside VNC. Install a non-snap browser:

```bash
sudo apt install -y epiphany-browser
```

Create a wrapper so Bridge can find it:

```bash
mkdir -p ~/bin
cat > ~/bin/xdg-open << 'EOF'
#!/bin/bash
DISPLAY=:1 /usr/bin/epiphany-browser "$@" &
EOF
chmod +x ~/bin/xdg-open
```

## First Launch (GUI)

Run in VNC terminal to log in and complete CAPTCHA:

```bash
export PATH=~/bin:$PATH DISPLAY=:1
protonmail-bridge
```

## Systemd Service

Once logged in and synced, run Bridge as a background service:

```bash
pkill -x bridge-gui; pkill -x bridge
systemctl --user start proton-bridge
```

Service file is at `~/.config/systemd/user/proton-bridge.service`. It runs in `--noninteractive` mode and auto-starts on boot.

```bash
systemctl --user status proton-bridge   # Check status
systemctl --user restart proton-bridge  # Restart
journalctl --user -u proton-bridge -f   # Tail logs
```

To re-open the GUI (e.g. to change settings), stop the service first:

```bash
systemctl --user stop proton-bridge
export PATH=~/bin:$PATH DISPLAY=:1
protonmail-bridge
```

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Could not load the Qt platform plugin "xcb"` | Missing xcb libraries | Install Qt dependencies above |
| `Failed to add test credentials to keychain` / `Object does not exist at path "/org/freedesktop/secrets/collection/login"` | No "login" keyring collection | Follow keyring setup above |
| `another instance is already running` | Stale lock file | `pkill -x bridge-gui; pkill -x bridge; rm -f ~/.cache/protonmail/bridge-v3/bridge*.lock` |
| `Couldn't find a suitable web browser` / `is not a snap cgroup` | Snap browsers don't work in VNC | Install epiphany and use the xdg-open wrapper (see Browser section above) |
