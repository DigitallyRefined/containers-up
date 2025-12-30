# Containers Up!

[![Build and push workflow](https://github.com/DigitallyRefined/containers-up/actions/workflows/build-and-push.yml/badge.svg)](https://github.com/DigitallyRefined/containers-up/actions/workflows/build-and-push.yml)
[![Container registry](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fipitio.github.io%2Fbackage%2FDigitallyRefined%2Fcontainers-up%2Fcontainers-up.json&query=%24.downloads&label=Pulls)](https://github.com/DigitallyRefined/containers-up/pkgs/container/containers-up)
[![Container registry](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fipitio.github.io%2Fbackage%2FDigitallyRefined%2Fcontainers-up%2Fcontainers-up.json&query=%24.downloads_month&label=Pulls%20per%20month)](https://github.com/DigitallyRefined/containers-up/pkgs/container/containers-up)

Containers Up! is a web-based container management platform designed to simplify the administration of containers across multiple remote hosts.

It provides a unified interface for managing containerized applications, and automating updates with minimal manual intervention.

## Key Features

- 🖥️ **Multi-Host Management**: Manage containers on multiple hosts via SSH connections
- 🎛️ **Granular Control**:
  - 📦 Control stacks/services via compose files
  - 🐳 Manage individual containers
  - 🖼️ Container image management
  - 📑 Container log viewer
  - 🗑️ Cleanup of unused images
- 🔄 **Automated Updates**: Container updates via GitHub/Forgejo webhooks (via Dependabot/Renovate Bot pull requests) & image tag updates via a schedule
- 📩 **Notifications**: When a new Dependabot PR is created or a new container image is available (via [Apprise](https://github.com/caronc/apprise#supported-notifications))
- 🌐 **Service Discovery**: Display [web app icons](https://dashboardicons.com) and URLs (via existing Traefik labels)
- 🧹 **Resource Management**: Cleanup of older images
- 📱 **Responsive Design**: Works seamlessly on desktop and mobile devices
- 🌓 **Modern UX**: Automatic light and dark mode (based on system settings)
- 📊 **Job Tracking**: Monitor update jobs with detailed logs and retry capabilities
- 🔐 **Security**: Secure SSH connections, webhook signature verification and OIDC authentication

## Screenshot

![screenshot](./screenshot.webp)

## Installation

The app can be started using the following `compose.yml`:

```yaml
services:
  containers-up:
    # https://github.com/DigitallyRefined/containers-up/releases
    image: ghcr.io/digitallyrefined/containers-up:1.3.3
    restart: unless-stopped
    ports:
      - 3000:3000
      - 3001:3001
    volumes:
      - ./storage:/storage
      - ./storage/.ssh:/root/.ssh
      - ./storage/.docker:/root/.docker
```

Open `http://localhost:3000` to set up a new host. Set a name, SSH host and private key to display a dashboard of running composed containers, individual containers, images and actions.

Optional system wide configuration can be changed by copying `.env.default` to `.env` and adding `env_file: ./.env` to the compose file.

<details>
<summary>compose.yml example with HTTPS & OIDC authentication (via Pocket ID & Traefik)</summary>

1. See [Simple HTTPS Traefik Tutorial](https://www.youtube.com/watch?v=-hfejNXqOzA) and [Pocket ID walkthrough](https://www.youtube.com/watch?v=GKyMXguNcos)

```yaml
services:
  containers-up:
    # https://github.com/DigitallyRefined/containers-up/releases
    image: ghcr.io/digitallyrefined/containers-up:1.3.3
    restart: unless-stopped
    volumes:
      - ./containers-up/storage:/storage
      - ./containers-up/storage/.ssh:/root/.ssh
      - ./containers-up/storage/.docker:/root/.docker
    env_file:
      - ./.env # < Create this file based on the .env.default instructions
    networks:
      - traefik
    labels:
      traefik.enable: true

      traefik.http.routers.containers-up.entrypoints: websecure
      traefik.http.routers.containers-up.rule: Host(`containers-up.example.com`) # < Update this
      traefik.http.routers.containers-up.tls: true
      traefik.http.routers.containers-up.tls.certresolver: production-cloudflare-dns
      traefik.http.routers.containers-up.service: containers-up
      traefik.http.services.containers-up.loadbalancer.server.port: 3000

      traefik.http.routers.containers-up-webhook.entrypoints: websecure
      traefik.http.routers.containers-up-webhook.rule: Host(`containers-up.example.com`) && PathPrefix(`/api/webhook`) # < Update this
      traefik.http.routers.containers-up-webhook.tls: true
      traefik.http.routers.containers-up-webhook.tls.certresolver: production-cloudflare-dns
      traefik.http.routers.containers-up-webhook.service: containers-up-webhook
      traefik.http.services.containers-up-webhook.loadbalancer.server.port: 3001

  pocket-id:
    # https://github.com/pocket-id/pocket-id/releases
    image: ghcr.io/pocket-id/pocket-id:v1.13.1
    restart: unless-stopped
    volumes:
      - './pocket-id/data:/app/data'
    environment:
      - APP_URL=https://id.example.com # < Update this
      - TRUST_PROXY=true
    networks:
      - 'traefik'
    labels:
      traefik.enable: true
      traefik.http.routers.pocketid.entrypoints: websecure
      traefik.http.routers.pocketid.rule: Host(`id.example.com`) # < Update this
      traefik.http.routers.pocketid.tls: true
      traefik.http.routers.pocketid.tls.certresolver: production-cloudflare-dns

  traefik:
    # Check migration guide first: https://doc.traefik.io/traefik/master/migration/v3/
    # https://github.com/traefik/traefik/releases
    image: docker.io/traefik:3.5.0
    container_name: 'traefik'
    restart: unless-stopped
    ports:
      - '80:80'
      - '443:443' # To setup HTTPS see: https://www.youtube.com/watch?v=-hfejNXqOzA
    volumes:
      - ./traefik/config:/etc/traefik
      - /var/run/docker.sock:/var/run/docker.sock:ro
    networks:
      - 'traefik'

networks:
  traefik:
    external: true
```

2. Create the network `docker network create traefik` and start the services `docker compose up -d`
3. Once Traefik and Pocket ID are up and running, set up a [new user via Pocket ID](https://pocket-id.org/docs/setup/installation) and optionally add them to an admin group
4. In the Pocket ID admin account create a new OIDC client and set up the callback URL as `https://containers-up.example.com/auth-callback*` and optionally only allow the admin group
5. In the Containers Up! `.env` file (see `.env.default`) uncomment the OIDC config section, add the URI of Pocket ID (without any trailing paths) then copy and paste the client ID and secret (JWKS certificate URL can be set manually if auto-discovery fails via `OIDC_JWKS_URL`)
6. After restarting the app, accessing `https://containers-up.example.com` should now require you to login

</details>

## Setting up automatic `compose.yml` updates

1. Make sure that your Containers Up! instance is available online publicly via HTTPS, sharing only the webhook port `3001`. E.g. via a [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) or a [Docker Wireguard Tunnel](https://github.com/DigitallyRefined/docker-wireguard-tunnel)

2. Create a repository with your container `compose.yml` files

3. Each of your `compose.yml` files must use the full image version (**not** `:latest`) to receive updates to the files from a bot (below)

<details>
<summary>A) Via Dependabot (GitHub)</summary>

4. Under the **Settings > Actions**, enable **Allow all actions and reusable workflows** and under **Workflow permissions** allow **Read and write permissions**

5. In your repo add `.github/dependabot.template.yml`:

```yaml
version: 2
enable-beta-ecosystems: true # Remove once docker-compose updates become stable
updates:
  - package-ecosystem: 'docker-compose'
    directory: '**/compose.yml' # change this based on if you call your files compose.yml or docker-compose.yml

  - package-ecosystem: 'github-actions'
    directory: '/'
```

6. Create a `.github/workflows/generate_dependabot.yml` file with the following content:

```yaml
name: Generate dependabot.yml

on:
  push:
    branches:
      - main
  repository_dispatch:
  workflow_dispatch:

jobs:
  generate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6

      - name: Generate dependabot.yml
        uses: Makeshift/generate-dependabot-glob-action@master

      - name: Create Pull Request
        uses: peter-evans/create-pull-request@v8
```

7. This will automatically create a PR that will create a GitHub action managed `.github/dependabot.yml` file, which will automatically be updated for each of your `compose.yml` files. If it doesn't, click **Actions > Generate dependabot.yml > Run workflow**

8. Next edit your host in Containers Up! and add the working folder where your repo is checked out on your server and add your GitHub repo URL `user/repo`, generate a random webhook secret and click the ℹ️ info icon copy the base URL to the webhook (removing `forgejo` e.g. `https://containers-up.example.com/api/webhook/github/host/YOUR_HOST`)

9. Back on GitHub, go to your repo **Settings > Webhooks > Add webhook**, add your public webhook domain and base **URL** (listed on the Containers Up! edit webhook info screen) and select `application/json` as the **Content Type**. Use the same random **webhook secret** from your repo settings and choose **Let me select individual events > Pull requests**

</details>

<details>
<summary>B) Via Renovate Bot (Forgejo)</summary>

4. Under **Settings > Application**, create a new Access token (with at least permissions to Read and write to issues, package and repository)

5. Copy the token and under **Actions > Secrets** create a new token called `ACTIONS_TOKEN` with the token value

6. Create an `EXTERNAL_GITHUB_TOKEN` secret with your GitHub personal access token (PAT)

7. Create a `.forgejo/workflows/renovate.yml` file with the following content:

```yaml
name: Renovate

on:
  push:
    branches:
      - main
      - 'renovate/**'
  schedule:
    # At 02:00, only on Saturday
    - cron: "0 2 * * 6"
  issues:
    types:
      - edited
  workflow_dispatch: # Allow manual trigger

jobs:
  renovate:
    runs-on: docker
    container:
      image: renovate/renovate:42.64.1

    steps:
      - name: Set Git identity
        run: |
          git config --global user.name "Renovate Bot"
          git config --global user.email "renovate@localhost"

      - name: Run Renovate
        env:
          LOG_LEVEL: info
          RENOVATE_PLATFORM: forgejo
          RENOVATE_ENDPOINT: ${{ github.api_url }} # GitHub variables still work in Forgejo
          RENOVATE_TOKEN: ${{ secrets.ACTIONS_TOKEN }}
          RENOVATE_REPOSITORIES: ${{ github.repository }}
          RENOVATE_GITHUB_COM_TOKEN: ${{ secrets.EXTERNAL_GITHUB_TOKEN }}
        run: renovate
```

8. Next edit your host in Containers Up! and add the working folder where your repo is checked out on your server and add your Forgejo repo URL `user/repo`, generate a random webhook secret and click the ℹ️ info icon copy the base URL to the webhook (removing `github` e.g. `https://containers-up.example.com/api/webhook/forgejo/host/YOUR_HOST`)

9. Back on Forgejo, go to your repo **Settings > Webhooks > Add a Forgejo webhook**, add your public webhook domain and base **URL** (listed on the Containers Up! edit webhook info screen) and select `POST` as the **Method** and `application/json` as the **Content Type**. Use the same random **webhook secret** from your repo settings and choose **Custom events > Pull requests Modifications**

</details>

If everything has been set up correctly the next time Dependabot or Renovate Bot creates a PR to update a `compose.yml` file an update will also appear on the Containers Up! dashboard.

## Environment variables

All environment variables are _optional_ and can be set in the `compose.yml` file via an `env_file: ./.env` or using the `environment:` array. Environment variables starting with `ENV_PUBLIC_` are also embedded in the public HTML output.

| Key                           | Description                                                                                                                                                                                                                     | Default         |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| `APP_URL`                     | App URL to used by links in notifications                                                                                                                                                                                       |                 |
| `APPRISE_NOTIFICATION`        | Apprise is used for container update notifications. See Apprise syntax, see: [Apprise Supported Notifications syntax](https://github.com/caronc/apprise#supported-notifications)                                                |                 |
| `RUN_COMPOSE_MAX_DEPTH`       | How many folders deep to search for compose files                                                                                                                                                                               | `3`             |
| `SSH_CONTROL_PERSIST`         | How long SSH connections should persist after last request                                                                                                                                                                      | `20m`           |
| `ENV_PUBLIC_OIDC_ISSUER_URI`  | OpenID Connect base URI                                                                                                                                                                                                         | Auth disabled   |
| `ENV_PUBLIC_OIDC_CLIENT_ID`   | OpenID Connect client ID                                                                                                                                                                                                        |                 |
| `OIDC_CLIENT_SECRET`          | OpenID Connect client secret                                                                                                                                                                                                    |                 |
| `OIDC_JWKS_URL`               | _Optional_ OpenID Connect JSON Web Key Set (file URL)                                                                                                                                                                           | Auto discovered |
| `MAX_QUEUE_TIME_MINS`         | Max time in minutes a queued update can wait for                                                                                                                                                                                | `10`            |
| `LOG_LINES`                   | Number of previous log lines shown when viewing a containers logs                                                                                                                                                               | `500`           |
| `DOCKER_USERNAME`             | [Docker Hub](https://hub.docker.com) username - used to check for image updates (use if [rate limited by Docker](https://docs.docker.com/docker-hub/usage/))                                                                    |                 |
| `DOCKER_TOKEN`                | Docker Hub token                                                                                                                                                                                                                |                 |
| `GHCR_USERNAME`               | [GitHub Container Registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry) username - used to check for image updates on GHCR (use if rate limited by GitHub) |                 |
| `GHCR_TOKEN`                  | GitHub Container Registry token                                                                                                                                                                                                 |                 |
| `CONTAINER_REGISTRY_USERNAME` | Custom container image registry username                                                                                                                                                                                        |                 |
| `CONTAINER_REGISTRY_TOKEN`    | Custom container image registry token                                                                                                                                                                                           |                 |
