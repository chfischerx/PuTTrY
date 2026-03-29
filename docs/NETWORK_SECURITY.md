# Network and Infrastructure Security

PuTTrY's built-in authentication (session password, 2FA, and passkeys) protects your instance from unauthorized access at the application level. However, to reach your PuTTrY instance from a browser, your server must accept incoming connections over a network. Depending on how your server is reachable, additional infrastructure-level security measures are essential.

## HTTPS vs HTTP

**Always use HTTPS in production**, unless your PuTTrY server lives on a completely private network with no external access:

- **HTTP (unencrypted)**: Your session password and authentication tokens are transmitted in plaintext. Anyone on the network path can intercept them. Only acceptable for local development or fully isolated private networks.
- **HTTPS (encrypted)**: Your credentials and session data are encrypted in transit. This is the minimum requirement for any internet-facing or partially exposed server.

## Certificates: Self-Signed vs Official

**Self-Signed Certificates**
- Generated on your server, free, no external approval needed
- Suitable for personal use, internal infrastructure, or when you control both server and client
- Browsers will warn that the certificate is untrusted (you'll see a security warning)
- Perfectly valid for encryption—the warning is about certificate provenance, not encryption strength
- Good starting point for testing HTTPS locally

**Official (CA-Signed) Certificates**
- Issued by a Certificate Authority and recognized by browsers
- No browser warnings; seamless user experience
- Required if you share your PuTTrY link with others or access from unfamiliar networks
- Free options: [Let's Encrypt](https://letsencrypt.org/) (automated, 90-day renewal) or paid services

## Setting Up HTTPS with nginx

If your PuTTrY server runs on a machine with public IP or internal network access, use nginx as a reverse proxy to handle HTTPS:

**1. Install nginx**
```bash
# macOS
brew install nginx

# Ubuntu/Debian
sudo apt-get install nginx

# Other systems: see https://nginx.org/en/download.html
```

**2. Generate a self-signed certificate** (or obtain one from Let's Encrypt)
```bash
# Self-signed cert (valid for 365 days)
openssl req -x509 -newkey rsa:4096 -keyout /etc/nginx/puttry.key -out /etc/nginx/puttry.crt -days 365 -nodes -subj "/CN=your-server-hostname"
```

**3. Configure nginx as a reverse proxy**
Create `/etc/nginx/sites-available/puttry`:
```nginx
upstream puttry {
    server 127.0.0.1:3000;  # Adjust port if PuTTrY runs on a different port
}

server {
    listen 443 ssl;
    server_name your-server-hostname;

    ssl_certificate /etc/nginx/puttry.crt;
    ssl_certificate_key /etc/nginx/puttry.key;

    # Recommended SSL settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    location / {
        proxy_pass http://puttry;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name your-server-hostname;
    return 301 https://$server_name$request_uri;
}
```

Enable the site and restart nginx:
```bash
sudo ln -s /etc/nginx/sites-available/puttry /etc/nginx/sites-enabled/
sudo nginx -s reload
```

**With Let's Encrypt (Certbot)**
For automatic certificate management, use Certbot:
```bash
# Install Certbot
sudo apt-get install certbot python3-certbot-nginx  # Ubuntu/Debian

# Obtain and install certificate
sudo certbot certonly --standalone -d your-server-hostname

# Update nginx config to use Certbot's certificates
ssl_certificate /etc/letsencrypt/live/your-server-hostname/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/your-server-hostname/privkey.pem;

# Certbot auto-renews certificates before expiry
```

## Cloud Provider HTTPS Options

Most cloud providers make HTTPS setup straightforward:

**AWS (EC2 + Load Balancer)**
- Use AWS Certificate Manager (ACM) for free SSL certificates
- Add an Application Load Balancer (ALB) in front of your PuTTrY instance
- ALB terminates HTTPS and proxies HTTP to your server
- No certificate renewal overhead—AWS handles it

**Google Cloud (Compute Engine + Cloud Load Balancing)**
- Google Cloud Armor + Cloud Load Balancer for HTTPS termination
- Integrates with Google-managed SSL certificates
- Automatic renewal and no manual certificate management

**Azure (App Service or Container Instances)**
- Azure App Service includes built-in HTTPS with managed certificates
- Custom domain support with automatic certificate provisioning
- Ideal if you containerize PuTTrY

**DigitalOcean (Droplet + App Platform)**
- App Platform handles HTTPS automatically with free SSL certificates
- Or use a Droplet with nginx and Let's Encrypt (as shown above)
- Spaces (object storage) can also serve static content via HTTPS

## VPN as an Alternative

Instead of exposing PuTTrY over HTTPS to the internet, you can tunnel access through a VPN:

**Benefits**
- No public IP exposure; no port forwarding needed
- Strong encryption layer on top of application auth
- Works seamlessly on mobile phones (via VPN apps)
- Prevents casual port scans from discovering your service

**Options**
- **WireGuard** (lightweight, modern, fast; excellent mobile support)
- **OpenVPN** (widely supported, battle-tested)
- **Tailscale** (WireGuard-based, zero-config, works across NAT and firewalls; recommended for personal use)
- **Cloud VPN** (AWS Client VPN, Azure VPN Gateway, Google Cloud VPN)

**Typical Setup**
1. Run PuTTrY on your server (no public exposure; localhost or private network only)
2. Connect to your VPN from your device
3. Access PuTTrY via its private IP address within the VPN
4. Optional: still use HTTPS within the VPN for defense-in-depth

**For Mobile**: Install WireGuard, Tailscale, or OpenVPN on your phone, connect to your VPN, and access PuTTrY in your browser—just like from a desktop. The VPN keeps all traffic encrypted and authenticated.

## Bastion Host Reverse Proxy

A **bastion host** (also called a jump host) is a hardened server that acts as a gatekeeper between the internet and your internal infrastructure. You can use it as a reverse proxy to shield your PuTTrY server from direct internet exposure while keeping HTTPS access available.

**Architecture**
```
Internet → Bastion Host (nginx/reverse proxy) → Internal PuTTrY Server (private network)
           (public IP, TLS termination)         (no public IP, internal only)
```

**Benefits**
- **Shielded server**: Your PuTTrY server has no public IP and no inbound internet routes; it only connects outward to the bastion
- **Single hardened entry point**: Only the bastion is exposed; easier to monitor, patch, and secure
- **Centralized HTTPS**: Certificate management, TLS version control, and cipher suites are handled on the bastion
- **Added security layers**: Run WAF, rate limiting, DDoS protection, and request logging on the bastion
- **Network isolation**: PuTTrY server can restrict SSH/admin access to only the bastion
- **Easy monitoring**: Log all access at the reverse proxy layer

**Setup Steps**

**1. Network Configuration**
- Bastion host: Public IP, accessible from internet (ports 80/443 open)
- PuTTrY server: Private IP on internal network, firewall rules allow only bastion → PuTTrY (port 3000)
- PuTTrY server cannot be reached directly from the internet (no public IP, firewall blocks external)

**2. Install and configure nginx on bastion**

Modify the nginx config shown earlier, but point to your internal PuTTrY server's private IP:

```nginx
upstream puttry_internal {
    server 10.0.1.50:3000;  # Internal private IP of PuTTrY server
}

server {
    listen 443 ssl;
    server_name puttry.example.com;  # Your bastion's public domain

    ssl_certificate /etc/letsencrypt/live/puttry.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/puttry.example.com/privkey.pem;

    # Recommended SSL settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Optional: Rate limiting and basic protection
    limit_req_zone $binary_remote_addr zone=puttry_limit:10m rate=10r/s;
    limit_req zone=puttry_limit burst=20 nodelay;

    location / {
        proxy_pass http://puttry_internal;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket timeouts
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name puttry.example.com;
    return 301 https://$server_name$request_uri;
}
```

**3. Firewall rules on PuTTrY server**

```bash
# Allow only bastion to reach PuTTrY (example with iptables)
iptables -A INPUT -p tcp -s 203.0.113.10 --dport 3000 -j ACCEPT  # Bastion IP
iptables -A INPUT -p tcp --dport 3000 -j DROP  # Block all other access

# Or with ufw (Ubuntu/Debian)
sudo ufw default deny incoming
sudo ufw allow from 203.0.113.10 to any port 3000  # Bastion IP
```

**4. Start PuTTrY normally on internal server**
```bash
puttry  # Runs on localhost:3000, accessible only to bastion
```

**5. Access from client browsers**
Users connect to `https://puttry.example.com` (bastion's public domain), nginx reverse proxies to the internal PuTTrY server, and authentication is enforced by PuTTrY's session password and 2FA.

**Adding Extra Security Layers on Bastion**

Once your bastion is set up, you can add more protections:

**Rate Limiting** (already shown in nginx config above)
- Prevents brute-force password attempts
- Limits WebSocket reconnections

**Request Logging**
```nginx
access_log /var/log/nginx/puttry_access.log;
error_log /var/log/nginx/puttry_error.log;
```

**IP Whitelist** (if you have fixed IPs)
```nginx
location / {
    allow 198.51.100.0/24;   # Office IP range
    allow 203.0.113.5;        # Your home IP
    deny all;

    proxy_pass http://puttry_internal;
    # ... rest of config
}
```

**Web Application Firewall (WAF)**
- ModSecurity for nginx
- Cloud WAF services (AWS WAF, Cloudflare, etc.)

**When to Use Bastion Reverse Proxy**

- **Multi-user, corporate environment**: Bastion is the hardened entry point; PuTTrY servers are in private subnets
- **High-security requirements**: Comply with network segmentation policies; log all access at a single point
- **Shared infrastructure**: Multiple services behind the bastion (PuTTrY, APIs, dashboards); centralized TLS management
- **Easy privilege separation**: Bastion runs as a service account; PuTTrY server runs as your user; minimal blast radius if one is compromised

**Bastion vs VPN: When to Choose Each**

| Approach | Best For | Complexity | Accessibility |
|----------|----------|-----------|----------------|
| **Bastion Reverse Proxy** | Corporate, multi-service infrastructure | Medium | Browser (HTTPS), public domain |
| **VPN** | Personal, cross-network tunneling | Low-Medium | Any IP on private network, mobile apps |
| **Both** | Maximum security + ease-of-access | Higher | VPN + bastion double-shields PuTTrY |

## Summary: Choose Your Model

| Scenario | Model | Setup Complexity |
|----------|-------|------------------|
| Personal, fully private network | HTTP locally, no public access | Low |
| Shared internal network | HTTPS + self-signed cert + nginx | Medium |
| Personal, internet-facing | HTTPS + Let's Encrypt + nginx | Medium |
| Multiple users, production | HTTPS + official cert + cloud load balancer | Medium-High |
| Secure cross-network access | VPN (WireGuard/Tailscale) + local HTTP | Low-Medium |
