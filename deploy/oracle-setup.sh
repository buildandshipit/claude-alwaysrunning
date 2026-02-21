#!/bin/bash
#
# Oracle Cloud Free Tier Setup Script
#
# This script sets up claude-alwaysrunning on an Oracle Cloud ARM instance.
# Designed for Ubuntu 22.04 ARM64 on Oracle Cloud Free Tier.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/buildandshipit/claude-alwaysrunning/main/deploy/oracle-setup.sh | bash
#
# Or manually:
#   chmod +x oracle-setup.sh
#   ./oracle-setup.sh
#

set -e

echo "========================================"
echo "  Claude Always Running - VPS Setup"
echo "  Oracle Cloud Free Tier (ARM64)"
echo "========================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

info() { echo -e "${GREEN}[INFO]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# Check if running as root
if [ "$EUID" -eq 0 ]; then
  warn "Running as root. Creating a non-root user is recommended."
fi

# Update system
info "Updating system packages..."
sudo apt-get update
sudo apt-get upgrade -y

# Install Node.js 20
info "Installing Node.js 20..."
if ! command -v node &> /dev/null || [[ $(node -v | cut -d. -f1 | tr -d 'v') -lt 20 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
node -v
npm -v

# Install PM2 globally
info "Installing PM2..."
sudo npm install -g pm2

# Install build tools for native modules (node-pty)
info "Installing build tools..."
sudo apt-get install -y build-essential python3

# Install Git if not present
if ! command -v git &> /dev/null; then
  info "Installing Git..."
  sudo apt-get install -y git
fi

# Create installation directory
INSTALL_DIR="/opt/claude-alwaysrunning"
info "Setting up installation directory: $INSTALL_DIR"

if [ -d "$INSTALL_DIR" ]; then
  warn "Directory exists. Pulling latest changes..."
  cd "$INSTALL_DIR"
  git pull
else
  info "Cloning repository..."
  sudo mkdir -p "$INSTALL_DIR"
  sudo chown $USER:$USER "$INSTALL_DIR"
  git clone https://github.com/buildandshipit/claude-alwaysrunning.git "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

# Install dependencies
info "Installing npm dependencies..."
npm install

# Create log directory
info "Creating log directory..."
sudo mkdir -p /var/log/claude-always
sudo chown $USER:$USER /var/log/claude-always

# Generate API key
info "Generating API key for remote access..."
API_KEY_OUTPUT=$(./bin/claude-always.js keys add "vps-$(hostname)" 2>&1) || true
echo "$API_KEY_OUTPUT"

# Extract the key from output
API_KEY=$(echo "$API_KEY_OUTPUT" | grep "Key:" | awk '{print $2}')
if [ -n "$API_KEY" ]; then
  info "API Key saved. Keep this safe!"
  echo ""
  echo "========================================"
  echo "  YOUR API KEY (save this!):"
  echo "  $API_KEY"
  echo "========================================"
  echo ""
fi

# Start with PM2
info "Starting service with PM2..."
cd "$INSTALL_DIR"
pm2 start deploy/ecosystem.config.js

# Save PM2 process list
info "Saving PM2 process list..."
pm2 save

# Setup PM2 startup script
info "Setting up PM2 startup..."
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u $USER --hp $HOME
pm2 save

# Print status
echo ""
info "Setup complete!"
echo ""
echo "========================================"
echo "  Service Status"
echo "========================================"
pm2 status

echo ""
echo "========================================"
echo "  Firewall Configuration Required"
echo "========================================"
echo ""
echo "Open port 3377 in your Oracle Cloud VCN:"
echo ""
echo "1. Go to Oracle Cloud Console"
echo "2. Navigate to: Networking > Virtual Cloud Networks"
echo "3. Click on your VCN"
echo "4. Click on Security Lists"
echo "5. Add Ingress Rule:"
echo "   - Source CIDR: 0.0.0.0/0 (or your IP)"
echo "   - Destination Port: 3377"
echo "   - Protocol: TCP"
echo ""
echo "Also ensure iptables allows the port:"
echo "  sudo iptables -I INPUT -p tcp --dport 3377 -j ACCEPT"
echo "  sudo netfilter-persistent save"
echo ""

echo "========================================"
echo "  Useful Commands"
echo "========================================"
echo ""
echo "  pm2 status              # Check status"
echo "  pm2 logs claude-always  # View logs"
echo "  pm2 restart claude-always # Restart"
echo "  pm2 stop claude-always  # Stop"
echo ""
echo "  # Manage API keys:"
echo "  claude-always keys list"
echo "  claude-always keys add <name>"
echo "  claude-always keys remove <name>"
echo ""

echo "========================================"
echo "  Connect from your local machine"
echo "========================================"
echo ""
echo "  # Test connection"
echo "  nc <your-vps-ip> 3377"
echo ""
echo "  # Authenticate (send as JSON)"
echo "  {\"type\":\"auth\",\"key\":\"<your-api-key>\"}"
echo ""
