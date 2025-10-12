#!/bin/bash

# YouTube Offline - Installation Script for Ultraseedbox
# This script installs and sets up the YouTube Offline application

set -e

echo "========================================="
echo "YouTube Offline - Installation Script"
echo "========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running on Ultraseedbox or similar environment
echo "Checking prerequisites..."

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is not installed${NC}"
    echo "Please install Node.js first"
    exit 1
fi

NODE_VERSION=$(node --version)
echo -e "${GREEN}✓${NC} Node.js found: $NODE_VERSION"

# Check npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}Error: npm is not installed${NC}"
    exit 1
fi

NPM_VERSION=$(npm --version)
echo -e "${GREEN}✓${NC} npm found: $NPM_VERSION"

# Check yt-dlp
if ! command -v yt-dlp &> /dev/null; then
    echo -e "${YELLOW}Warning: yt-dlp is not installed${NC}"
    echo ""
    echo "Installing yt-dlp to ~/.local/bin/..."
    mkdir -p ~/.local/bin

    # Download yt-dlp
    curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o ~/.local/bin/yt-dlp
    chmod +x ~/.local/bin/yt-dlp

    # Add to PATH if not already there
    if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
        echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
        export PATH="$HOME/.local/bin:$PATH"
    fi

    echo -e "${GREEN}✓${NC} yt-dlp installed successfully"
else
    YTDLP_VERSION=$(yt-dlp --version)
    echo -e "${GREEN}✓${NC} yt-dlp found: $YTDLP_VERSION"
fi

echo ""
echo "Installing dependencies..."
npm install

echo ""
echo "Building application..."
npm run build

echo ""
echo "Creating directories..."
mkdir -p downloads

echo ""
echo "Setting up systemd service..."

# Detect Node.js path
NODE_PATH=$(which node)
NODE_DIR=$(dirname "$NODE_PATH")

# Get current working directory (where script is run from)
WORKING_DIR=$(pwd)

echo "Detected Node.js at: $NODE_PATH"
echo "Node.js bin directory: $NODE_DIR"
echo "Working directory: $WORKING_DIR"

# Copy service file to user systemd directory
mkdir -p ~/.config/systemd/user
cp youtube-offline.service ~/.config/systemd/user/

# Replace placeholders with actual paths
sed -i "s|NODE_PATH_PLACEHOLDER|$NODE_PATH|g" ~/.config/systemd/user/youtube-offline.service
sed -i "s|PATH_PLACEHOLDER|$NODE_DIR|g" ~/.config/systemd/user/youtube-offline.service
sed -i "s|WORKING_DIR_PLACEHOLDER|$WORKING_DIR|g" ~/.config/systemd/user/youtube-offline.service

# Reload systemd
systemctl --user daemon-reload

echo -e "${GREEN}✓${NC} Service file installed"

echo ""
echo "========================================="
echo "Installation completed successfully!"
echo "========================================="
echo ""
echo "Next steps:"
echo ""
echo "1. Enable the service to start on boot:"
echo "   systemctl --user enable youtube-offline"
echo ""
echo "2. Start the service:"
echo "   systemctl --user start youtube-offline"
echo ""
echo "3. Check service status:"
echo "   systemctl --user status youtube-offline"
echo ""
echo "4. View logs:"
echo "   journalctl --user -u youtube-offline -f"
echo ""
echo "5. Access the web interface:"
echo "   http://localhost:36660"
echo ""
echo "   (Change port in config if needed)"
echo ""
echo "========================================="
echo ""
echo "Useful commands:"
echo "  Start:   systemctl --user start youtube-offline"
echo "  Stop:    systemctl --user stop youtube-offline"
echo "  Restart: systemctl --user restart youtube-offline"
echo "  Logs:    journalctl --user -u youtube-offline -f"
echo ""
