# Haossh — Architecture Overview

## System Architecture

```
┌─────────────────────────────────────────────────┐
│                    Browser                        │
│  ┌───────────────────────────────────────────┐   │
│  │          Vue 3 SPA (Haossh Frontend)       │   │
│  │  ┌─────┐ ┌──────┐ ┌─────┐ ┌──────────┐   │   │
│  │  │Views│ │Stores│ │Comps│ │ Services │   │   │
│  │  └─────┘ └──────┘ └─────┘ └──────────┘   │   │
│  └───────────────────────────────────────────┘   │
│              ↕ WebSocket / HTTP                   │
└─────────────────────────────────────────────────┘
         ↕                         ↕
┌────────────────┐   ┌────────────────────────┐
│  Node.js Backend│   │  External SSH Targets  │
│  (ssh2, guacd)  │   │  (servers, VPS, etc.)  │
└────────────────┘   └────────────────────────┘
```

## Directory Structure

```
src/
├── assets/          # SCSS, fonts, images
│   └── scss/        # Global styles (main.scss)
├── components/      # Vue components
│   ├── connection/  # Server connect form
│   ├── docker/      # Docker/Podman panels
│   ├── global/      # Shared components (Modal, TabBar, etc.)
│   ├── sftp/        # File browser
│   ├── terminal/    # xterm.js + split-pane
│   └── tunnel/      # SSH tunnel manager
├── composables/     # Vue composables
├── layouts/         # Layout components (WorkbenchLayout)
├── router/          # Vue Router config
├── services/        # API + WebSocket services
├── stores/          # Pinia stores
├── utils/           # Constants, crypto utilities
└── views/           # Page-level views
```

## Data Flow

1. **Connection**: User fills ServerConnectForm → connectionStore → WebSocket/API → SSH target
2. **Terminal**: WebSocket binary stream → xterm.js render (decoupled via callbacks)
3. **Credentials**: AES-256-GCM encrypted before sessionStorage, in-memory key per session

## Key Technologies

- **Frontend**: Vue 3 + Composition API + Pinia
- **Terminal**: xterm.js + addon-fit + addon-web-links
- **Styling**: Bulma + SCSS + CSS custom properties (4 theme presets)
- **Testing**: vitest + @vue/test-utils
- **Auth**: In-memory AES key derivation (PBKDF2 + 600K iterations)
