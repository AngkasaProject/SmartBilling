#!/usr/bin/env bash
# ========================================================
# SmartBilling deployment script
# ========================================================

set -Eeuo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

if [[ "${EUID}" -ne 0 ]]; then
    echo "Jalankan script sebagai root, contoh: sudo bash setup.sh" >&2
    exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
    echo "curl diperlukan oleh setup untuk memeriksa kesehatan aplikasi dan alamat server." >&2
    exit 1
fi

echo "===================================================="
echo "🚀 Memulai instalasi SmartBilling"
echo "===================================================="

if ! command -v docker >/dev/null 2>&1; then
    if ! command -v curl >/dev/null 2>&1; then
        echo "curl diperlukan untuk mengunduh installer Docker." >&2
        exit 1
    fi
    echo "Docker belum terpasang. Mengunduh installer resmi Docker..."
    docker_install_script="$(mktemp)"
    trap 'rm -f "$docker_install_script"' EXIT
    curl -fsSL https://get.docker.com -o "$docker_install_script"
    sh "$docker_install_script"
    rm -f "$docker_install_script"
    trap - EXIT
fi

if ! docker compose version >/dev/null 2>&1; then
    echo "Docker Compose plugin belum tersedia. Mencoba memasang plugin..."
    if command -v apt-get >/dev/null 2>&1; then
        apt-get update
        apt-get install -y docker-compose-plugin
    elif command -v dnf >/dev/null 2>&1; then
        dnf install -y docker-compose-plugin
    elif command -v yum >/dev/null 2>&1; then
        yum install -y docker-compose-plugin
    else
        echo "Package manager apt-get, dnf, atau yum tidak ditemukan." >&2
        exit 1
    fi
fi

if ! docker compose version >/dev/null 2>&1; then
    echo "Docker Compose plugin gagal dipasang atau tidak dapat dijalankan." >&2
    exit 1
fi

docker compose config --quiet

if ! docker info >/dev/null 2>&1; then
    if command -v systemctl >/dev/null 2>&1; then
        systemctl enable --now docker
    fi
    if ! docker info >/dev/null 2>&1; then
        echo "Docker daemon tidak berjalan. Jalankan Docker terlebih dahulu, lalu ulangi setup." >&2
        exit 1
    fi
fi

if [ ! -f .env ]; then
    if [ ! -f .env.example ]; then
        echo "File .env.example tidak ditemukan; setup dihentikan." >&2
        exit 1
    fi
    echo "📋 Membuat file .env dari template .env.example..."
    cp .env.example .env
    chmod 600 .env
    echo "File .env dibuat. Sesuaikan MIKROTIK_* dan pengaturan lain sebelum dipakai."
fi

echo "🐳 Membangun dan menjalankan container SmartBilling..."
if ! docker compose up -d --build; then
    docker compose logs --tail=80 mikrotik-billing >&2 || true
    exit 1
fi

app_port="$(docker compose port mikrotik-billing 1707 | sed -n 's/.*:\([0-9][0-9]*\)$/\1/p' | head -n 1)"
if [[ -z "$app_port" ]]; then
    echo "Port publik container tidak dapat diketahui dari Docker Compose." >&2
    docker compose ps
    exit 1
fi

echo "Menunggu endpoint health aplikasi..."
healthy=false
for attempt in $(seq 1 30); do
    if curl -fsS --max-time 3 "http://127.0.0.1:${app_port}/api/health" >/dev/null; then
        healthy=true
        break
    fi
    sleep 2
done

if [[ "$healthy" != true ]]; then
    echo "Aplikasi belum merespons setelah 60 detik. Log container terakhir:" >&2
    docker compose logs --tail=80 mikrotik-billing >&2
    exit 1
fi

public_ip="$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || true)"
if [[ -z "$public_ip" ]]; then
    public_ip="IP_VPS"
fi

echo ""
echo "===================================================="
echo "🎉 INSTALASI SELESAI & APLIKASI SEHAT!"
echo "===================================================="
echo ""
echo "🌐 Web Billing & Hotspot Portal: http://${public_ip}:${app_port}"
echo ""
echo "📌 Langkah Selanjutnya:"
echo "1. Periksa konfigurasi .env. Perubahan environment diterapkan dengan docker compose up -d."
echo "2. Atur provider WhatsApp eksternal Fonnte/OpenWA jika diperlukan; tidak ada server WhatsApp yang dibundel."
echo "3. Ganti DOMAIN_PORTAL_ANDA pada hotspot/rsc/walled-garden.rsc sebelum mengimpornya."
echo "4. Ganti BILLING_DOMAIN pada hotspot/login.html, lalu upload template hotspot melalui Winbox."
echo ""
echo "Periksa log secara real-time dengan: docker compose logs -f"
echo "===================================================="
