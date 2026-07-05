#!/usr/bin/env bash
# Deploy na VPS (srv1800774) — chamado pelo GitHub Actions após o git reset,
# mas também pode ser rodado à mão, de qualquer diretório:
#   bash /root/scraping-imoveis/scripts/deploy.sh
#
# O .env NÃO é tocado (gitignorado; sobrevive a git reset --hard).
set -euo pipefail

# Independe do cwd: opera sempre na raiz DESTE repo. Na VPS convivem outros stacks
# compose (traefik, n8n, db/) — rodar no diretório errado recriaria o stack errado.
cd "$(dirname "$0")/.."

echo "==> build + up (sem --build o compose reusa a imagem velha)"
# --remove-orphans: derruba containers de serviços que saíram do compose
# (ex.: o antigo cache-api — senão ele fica de zumbi com rota no Traefik).
docker compose up -d --build --remove-orphans

# O Traefik só roteia containers com healthcheck "healthy"; logo após o up
# existe uma janela de ~30-60s em "starting". Esperamos ficar saudável.
espera_200() {
  local nome="$1" url="$2" code=""
  for _ in $(seq 1 18); do
    code=$(curl -sk -o /dev/null -w '%{http_code}' --max-time 5 "$url" || true)
    if [ "$code" = "200" ]; then
      echo "==> $nome ok (200)"
      return 0
    fi
    sleep 10
  done
  echo "ERRO: $nome não respondeu 200 em 3min (último status: $code)" >&2
  return 1
}

espera_200 "scraper (direto :3000)"  "http://127.0.0.1:3000/health"
espera_200 "scraper (via traefik)"   "https://scraper.srv1800774.hstgr.cloud/health"

# Cada build deixa a imagem anterior dangling; sem prune o disco da VPS enche.
docker image prune -f >/dev/null

echo "==> deploy concluído: $(git rev-parse --short HEAD)"
