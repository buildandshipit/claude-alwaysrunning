#!/bin/bash
#
# Whisper.cpp Installation Script
#
# Installs whisper.cpp for local speech recognition.
# Supports Linux (x64/ARM64) and macOS.
#

set -e

echo "========================================"
echo "  Whisper.cpp Installation"
echo "========================================"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info() { echo -e "${GREEN}[INFO]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }

# Detect platform
OS=$(uname -s)
ARCH=$(uname -m)

info "Detected: $OS $ARCH"

# Install directory
INSTALL_DIR="$HOME/whisper.cpp"

# Clone or update repository
if [ -d "$INSTALL_DIR" ]; then
  info "Updating existing installation..."
  cd "$INSTALL_DIR"
  git pull
else
  info "Cloning whisper.cpp..."
  git clone https://github.com/ggerganov/whisper.cpp.git "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

# Install build dependencies
if [ "$OS" = "Linux" ]; then
  info "Installing build dependencies..."
  if command -v apt-get &> /dev/null; then
    sudo apt-get update
    sudo apt-get install -y build-essential
  elif command -v dnf &> /dev/null; then
    sudo dnf install -y gcc-c++ make
  fi
fi

# Build whisper.cpp
info "Building whisper.cpp..."
make clean
make -j$(nproc 2>/dev/null || sysctl -n hw.ncpu)

# Download base.en model
info "Downloading base.en model..."
bash ./models/download-ggml-model.sh base.en

# Create symlink
info "Creating symlink..."
if [ -d "/usr/local/bin" ]; then
  sudo ln -sf "$INSTALL_DIR/main" /usr/local/bin/whisper
  info "Whisper installed to /usr/local/bin/whisper"
else
  warn "Add $INSTALL_DIR to your PATH"
fi

# Test installation
echo ""
info "Testing installation..."
"$INSTALL_DIR/main" --help | head -5

echo ""
echo "========================================"
echo "  Installation Complete"
echo "========================================"
echo ""
echo "Whisper installed at: $INSTALL_DIR"
echo "Model downloaded: base.en"
echo ""
echo "Usage:"
echo "  whisper -m $INSTALL_DIR/models/ggml-base.en.bin -f audio.wav"
echo ""
echo "Or use with claude-always voice:"
echo "  claude-always voice --model base.en"
echo ""
