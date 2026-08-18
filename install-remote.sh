#!/bin/bash
# vibecosystem remote installer
# Usage: curl -fsSL https://raw.githubusercontent.com/vibeeval/vibecosystem/main/install-remote.sh | bash
set -e

INSTALL_DIR="$HOME/.vibecosystem"
REPO_URL="https://github.com/vibeeval/vibecosystem.git"

echo ""
echo "  vibecosystem remote installer"
echo "  =============================="
echo ""

# Check prerequisites
if ! command -v git >/dev/null 2>&1; then
  echo "Error: git is required. Install it first."
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js is required. Install it first."
  echo "  https://nodejs.org/"
  exit 1
fi

NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VER" -lt 18 ]; then
  echo "Warning: Node.js >= 18 recommended (you have $(node -v))"
fi

# Clone or update
if [ -d "$INSTALL_DIR" ]; then
  echo "Updating existing installation..."
  git -C "$INSTALL_DIR" pull --ff-only 2>/dev/null || {
    echo "Pull failed, re-cloning..."
    if [ -z "$INSTALL_DIR" ] || [ "$INSTALL_DIR" = "/" ] || [ "$INSTALL_DIR" = "$HOME" ]; then
      echo "FATAL: INSTALL_DIR is unsafe: '$INSTALL_DIR'"
      exit 1
    fi
    rm -rf "$INSTALL_DIR"
    git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
  }
else
  echo "Cloning vibecosystem..."
  git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
fi

echo ""

# Profile selection happens before installation so the installer never copies
# the full runtime and then tries to disable it after the fact.
echo ""
echo "Choose a profile (saves tokens by loading only what you need):"
echo ""
echo "  1) core        - Low-noise default runtime"
echo "  2) frontend    - React/Next.js focused"
echo "  3) backend     - API/DB/infra focused"
echo "  4) fullstack   - Frontend + backend"
echo "  5) devops      - CI/CD/cloud focused"
echo "  6) orchestration - Explicit multi-agent workflows"
echo "  7) full        - Every legacy capability"
echo ""
if [ -t 0 ]; then
  read -p "Select [1-7, default 1]: " CHOICE
else
  CHOICE="1"
fi

case "$CHOICE" in
  1) PROFILE="core" ;;
  2) PROFILE="frontend" ;;
  3) PROFILE="backend" ;;
  4) PROFILE="fullstack" ;;
  5) PROFILE="devops" ;;
  6) PROFILE="orchestration" ;;
  7) PROFILE="full" ;;
  *) PROFILE="core" ;;
esac

# Run the selected profile directly. Prune only removes previously owned files.
cd "$INSTALL_DIR"
bash install.sh --profile "$PROFILE" --prune --non-interactive

echo ""
echo "Done! vibecosystem is ready."
echo ""
echo "Commands:"
echo "  vibeco help       Show all commands"
echo "  vibeco stats      Ecosystem statistics"
echo "  vibeco doctor     Health check"
echo "  vibeco dashboard  Start monitoring UI"
echo ""

# PATH hint
if ! echo "$PATH" | grep -q "$HOME/.local/bin"; then
  echo "Note: Add ~/.local/bin to your PATH:"
  echo "  echo 'export PATH=\"\$HOME/.local/bin:\$PATH\"' >> ~/.$(basename "$SHELL")rc"
  echo ""
fi

echo "github.com/vibeeval/vibecosystem"
echo ""
