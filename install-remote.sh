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
    rm -rf "$INSTALL_DIR"
    git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
  }
else
  echo "Cloning vibecosystem..."
  git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
fi

echo ""

# Run main installer
cd "$INSTALL_DIR"
bash install.sh --non-interactive

# Profile selection
echo ""
echo "Choose a profile (saves tokens by loading only what you need):"
echo ""
echo "  1) minimal    - Core only (~15 agents, ~40 skills)"
echo "  2) frontend   - React/Next.js focused (~30 agents)"
echo "  3) backend    - API/DB/infra focused (~40 agents)"
echo "  4) fullstack  - Frontend + Backend (~60 agents)"
echo "  5) devops     - CI/CD/Cloud focused (~33 agents)"
echo "  6) all        - Everything (139 agents, 293 skills)"
echo ""
read -p "Select [1-6, default 6]: " CHOICE

case "$CHOICE" in
  1) PROFILE="minimal" ;;
  2) PROFILE="frontend" ;;
  3) PROFILE="backend" ;;
  4) PROFILE="fullstack" ;;
  5) PROFILE="devops" ;;
  *) PROFILE="all" ;;
esac

# Apply profile
VIBECO="$HOME/.local/bin/vibeco"
if [ -x "$VIBECO" ] || command -v vibeco >/dev/null 2>&1; then
  vibeco profile "$PROFILE" 2>/dev/null || node "$INSTALL_DIR/tools/vibeco/vibeco.mjs" profile "$PROFILE"
else
  node "$INSTALL_DIR/tools/vibeco/vibeco.mjs" profile "$PROFILE"
fi

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
