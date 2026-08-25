#!/bin/bash
set -euo pipefail

# Log all output
exec > >(tee /var/log/user-data.log)
exec 2>&1

echo "Starting EC2 instance setup..."

# Update system
dnf update -y

# Install Node.js 20.x (LTS)
curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
dnf install -y nodejs

# Install PM2 globally
npm install -g pm2

# Install Nginx
dnf install -y nginx

# Install Git
dnf install -y git

# Install PostgreSQL client
dnf install -y postgresql15

# Create application directory
mkdir -p /opt/ssabi
cd /opt/ssabi

# Create deploy user
useradd -r -s /bin/bash -d /opt/ssabi deploy || true
chown -R deploy:deploy /opt/ssabi

# Configure Nginx
cat > /etc/nginx/conf.d/ssabi.conf << 'EOF'
server {
    listen 80;
    server_name _;

    # SSE streaming configuration (architecture doc 2.4)
    location /api/ {
        proxy_pass http://127.0.0.1:3000/;

        # Disable buffering for SSE
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding on;
        proxy_read_timeout 300s;

        # Required for SSE
        proxy_set_header X-Accel-Buffering no;
        proxy_set_header Connection '';
        proxy_http_version 1.1;

        # Forward headers
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Health check endpoint (no rewrite)
    location /health {
        proxy_pass http://127.0.0.1:3000/health;
        proxy_set_header Host $host;
    }

    # Default location
    location / {
        return 404;
    }
}
EOF

# Start and enable Nginx
systemctl enable nginx
systemctl start nginx

# Store database password in SSM Parameter Store (will be done separately)
# For now, create a placeholder .env file
cat > /opt/ssabi/.env << 'ENVEOF'
NODE_ENV=production
MOCK_MODE=false
PORT=3000

DB_HOST=${db_host}
DB_PORT=${db_port}
DB_NAME=${db_name}
DB_USER=${db_user}
DB_PASSWORD=PLACEHOLDER

AWS_REGION=${aws_region}

# 단일 기본 모델 (2026-08-25) — 난이도 분기 폐지, 챗봇·리캡·배치 전부 이 하나를 쓴다.
# 4개 구성 60회 실측으로 Haiku 4.5 선정: 전 구간 최속(요약 11초 vs Sonnet 5 18초)이고,
# 근거 부재 질문에 고정 문구로 3/3 수렴한다(Sonnet 5는 매번 달라져 FR-QNA-004 🚦 위반).
BEDROCK_MODEL=global.anthropic.claude-haiku-4-5-20251001-v1:0

# 추론 강도. 비워 두면 output_config 자체를 안 싣는다.
# ⚠️ Sonnet 5 이상에서만 유효하다 — Haiku 4.5·Sonnet 4.5는 이 필드를 거절한다.
BEDROCK_EFFORT=
BEDROCK_EMBED_MODEL=amazon.titan-embed-text-v2:0

DEVICE_ID_HEADER=X-Device-Id

LOG_LEVEL=info
ENVEOF

chown deploy:deploy /opt/ssabi/.env
chmod 600 /opt/ssabi/.env

# Create systemd service for PM2
cat > /etc/systemd/system/ssabi.service << 'SVCEOF'
[Unit]
Description=SSABI Application
After=network.target

[Service]
Type=forking
User=deploy
WorkingDirectory=/opt/ssabi
Environment=PATH=/usr/bin:/bin
ExecStart=/usr/bin/pm2 start ecosystem.config.js
ExecReload=/usr/bin/pm2 reload ecosystem.config.js
ExecStop=/usr/bin/pm2 stop ecosystem.config.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
SVCEOF

systemctl daemon-reload

echo "EC2 instance setup complete. Application deployment should be done separately."
echo "Instance: ${project_name}-${instance_index}"
echo "Region: ${aws_region}"
echo "DB Host: ${db_host}"
