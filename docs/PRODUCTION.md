# PuTTrY Production Deployment Guide

This guide covers deploying PuTTrY in a production environment.

## Quick Start

```bash
puttry configure          # First-run: interactive setup wizard
puttry start              # Start server in background
puttry status             # Check if server is running
puttry password rotate    # Rotate to a new session password
puttry stop               # Stop the server
```

## Production Setup (Systemd)

For automatic startup and restart on system boot, use systemd.

### Installation Steps

1. **Install Node.js** (if not already installed):
   ```bash
   # On macOS (using Homebrew)
   brew install node

   # On Debian/Ubuntu
   sudo apt-get update
   sudo apt-get install nodejs npm
   ```

2. **Install PuTTrY globally**:
   ```bash
   npm install -g @chfischerx/puttry
   ```

3. **Setup systemd user service** (optional, for auto-start on system boot):

   Create the directory:

   ```bash
   mkdir -p ~/.config/systemd/user
   ```

   Create `~/.config/systemd/user/puttry.service` with the following content:

   ```ini
   [Unit]
   Description=PuTTrY Web Terminal Service
   After=network-online.target
   Wants=network-online.target
   Documentation=https://github.com/yourusername/puttry
   
   [Service]
   Type=simple
   Environment="NODE_ENV=production"
   EnvironmentFile=%h/.puttry/.env
   ExecStart=/usr/local/bin/node /usr/local/lib/node_modules/@chfischerx/puttry/dist-server/server.js
   Restart=always
   RestartSec=10
   
   [Install]
   WantedBy=default.target
   ```

   Then enable and start:

   ```bash
   systemctl --user daemon-reload      # Reload systemd configuration
   systemctl --user enable puttry      # Auto-start service on login
   systemctl --user start puttry       # Start the service now
   ```

4. **Verify service**:
   ```bash
   systemctl --user status puttry
   journalctl --user -u puttry -f  # Follow logs
   ```

## Configuration

### Environment Variables

Configure via `~/.puttry/.env`:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 5174 | Server port |
| `HOST` | 0.0.0.0 | Bind address |
| `AUTH_DISABLED` | 0 | Disable authentication (0=enabled, 1=disabled) |
| `SESSION_PASSWORD_TYPE` | xkcd | Password format: `xkcd` or `random` |
| `SESSION_PASSWORD_LENGTH` | 4 | Number of words/chars |
| `TOTP_ENABLED` | 0 | Enable TOTP 2FA |
| `PASSKEY_RP_ORIGIN` | (empty) | Passkey origin (auto-detect if empty) |
| `PASSKEY_AS_2FA` | true | Require passkey as 2FA (true) or allow as standalone login (false) |
| `RATE_LIMIT_GLOBAL_MAX` | 500 | Max HTTP requests per 15 minutes per IP |
| `RATE_LIMIT_SESSION_PASSWORD_MAX` | 10 | Max login attempts per hour per IP |
| `RATE_LIMIT_TOTP_MAX` | 5 | Max 2FA/passkey verification attempts per 10 minutes per IP |
| `RATE_LIMIT_PASSKEY_CHALLENGE_MAX` | 10 | Max passkey challenge creation requests per 15 minutes per IP |
| `SCROLLBACK_LINES` | 10000 | Terminal scrollback buffer |

### Using CLI to Configure

After deployment, use the CLI to manage settings:

```bash
# Interactive configuration wizard (recommended for initial setup)
puttry configure

# List current configuration
puttry config list

# Update a setting
puttry config set SCROLLBACK_LINES 5000

# Rotate session password
puttry password rotate

# Check server status
puttry status
```

## Managing the Service

### Systemd Commands

```bash
# Start service
systemctl --user start puttry

# Stop service
systemctl --user stop puttry

# Restart service
systemctl --user restart puttry

# View status
systemctl --user status puttry

# View logs
journalctl --user -u puttry -f

# Disable auto-start on boot
systemctl --user disable puttry

# Enable auto-start on boot
systemctl --user enable puttry
```

## Reverse Proxy Setup

### Nginx

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/ssl/certs/your-cert.crt;
    ssl_certificate_key /etc/ssl/private/your-key.key;

    location / {
        proxy_pass http://localhost:5174;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    location /terminal {
        proxy_pass http://localhost:5174;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    location /sync {
        proxy_pass http://localhost:5174;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400s;
    }
}
```

### Apache

```apache
<VirtualHost *:80>
    ServerName your-domain.com
    Redirect permanent / https://your-domain.com/
</VirtualHost>

<VirtualHost *:443>
    ServerName your-domain.com

    SSLEngine on
    SSLCertificateFile /etc/ssl/certs/your-cert.crt
    SSLCertificateKeyFile /etc/ssl/private/your-key.key

    ProxyPreserveHost On
    ProxyRequests Off

    # WebSocket support
    RewriteEngine On
    RewriteCond %{HTTP:Upgrade} websocket [NC]
    RewriteCond %{HTTP:Connection} upgrade [NC]
    RewriteRule ^/(.*)$ "ws://localhost:5174/$1" [P,L]

    # Regular proxying
    ProxyPass / http://localhost:5174/
    ProxyPassReverse / http://localhost:5174/
</VirtualHost>
```

## Monitoring

### Check Service Health

```bash
# View service status
systemctl --user status puttry

# Follow real-time logs
journalctl --user -u puttry -f

# View recent errors
journalctl --user -u puttry -p err
```

### Monitor Port Availability

```bash
# Check if port 5174 is listening
lsof -i :5174
ss -tlnp | grep 5174
```

### Database/State Directory

PuTTrY stores state in `~/.puttry/`:

```bash
# View configuration
cat ~/.puttry/.env

# View session password
cat ~/.puttry/session-password.txt

# View 2FA state
cat ~/.puttry/2fa-state.json
```

## Troubleshooting

### Service won't start

```bash
# Check systemd errors
systemctl --user status puttry
journalctl --user -u puttry -n 50

# Check configuration directory
ls -la ~/.puttry

# Manually test the server
puttry start
```

### Port already in use

```bash
# Find what's using the port
lsof -i :5174

# Kill the process (if needed)
kill -9 <PID>

# Or change the port
echo "PORT=5175" >> ~/.puttry/.env
systemctl --user restart puttry
```

### Authentication issues

```bash
# Reset session password
rm ~/.puttry/session-password.txt
systemctl --user restart puttry

# Check new password in logs
journalctl --user -u puttry | grep "Session Password"
```

## Backup and Recovery

### Backup configuration

```bash
tar -czf puttry-backup-$(date +%Y%m%d).tar.gz ~/.puttry/
```

### Restore configuration

```bash
tar -xzf puttry-backup-20240101.tar.gz -C ~/
systemctl --user restart puttry
```

## Updates

### Update to new version

```bash
npm install -g @chfischerx/puttry@latest
systemctl --user restart puttry

# Verify
systemctl --user status puttry
```

## Performance Tuning

### Node.js options

Edit `~/.config/systemd/user/puttry.service` and modify the ExecStart line:

```ini
[Service]
ExecStart=/usr/local/bin/node --max-old-space-size=2048 /usr/local/lib/node_modules/@chfischerx/puttry/dist-server/server.js
```

Then reload:

```bash
systemctl --user daemon-reload
systemctl --user restart puttry
```

Note: The Node.js and npm paths may vary depending on your system. Check your global npm location with `npm config get prefix`.

### Increase file descriptor limits

Edit `/etc/security/limits.conf` to set limits for your user:

```
youruser soft nofile 65536
youruser hard nofile 65536
```

Then log out and back in, then restart the service:

```bash
systemctl --user restart puttry
```

## Security Considerations

**Deployment-specific security:**

1. **Always use HTTPS** in production — configure your reverse proxy with valid SSL certificates
2. **Firewall rules** — only expose to trusted networks or VPNs if needed
3. **Regular backups** of `~/.puttry/` directory to protect authentication state and configurations

**For a comprehensive security analysis, including authentication flows, rate limiting, and environment variable management, see [Security Architecture](./SECURITY_ARCHITECTURE.md).**
