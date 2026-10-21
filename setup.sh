#!/bin/bash
# ========================================================
# NetFlow MikroTik Billing & OpenWA Deployment Script
# ========================================================

set -e

echo "===================================================="
echo "🚀 Memulai Instalasi NetFlow MikroTik Billing & OpenWA"
echo "===================================================="

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker belum terpasang. Menginstall Docker sekarang..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm get-docker.sh
    echo "✅ Docker berhasil diinstall."
fi

# Check Docker Compose plugin
if ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose plugin belum terpasang. Menginstall docker-compose-plugin..."
    apt-get update && apt-get install -y docker-compose-plugin || yum install -y docker-compose-plugin
fi

# Setup .env file
if [ ! -f .env ]; then
    echo "📋 Membuat file .env dari template .env.example..."
    cp .env.example .env
    echo "✅ File .env berhasil dibuat. Silakan sesuaikan IP MikroTik Anda dengan: nano .env"
fi

# Create data directories with permissions
mkdir -p data openwa_data
chmod -R 775 data openwa_data

echo "🐳 Menjalankan Container (Billing App + OpenWA Gateway)..."
docker compose down || true
docker compose up -d --build

echo ""
echo "===================================================="
echo "🎉 INSTALASI SELESAI & CONTAINER BERJALAN!"
echo "===================================================="
echo ""
echo "🌐 Web Billing & Hotspot Portal: http://$(curl -s ifconfig.me || echo 'IP_VPS'):3000"
echo "📱 OpenWA WhatsApp Gateway API:  http://$(curl -s ifconfig.me || echo 'IP_VPS'):2785"
echo ""
echo "📌 Langkah Selanjutnya:"
echo "1. Cek API Key OpenWA:"
echo "   docker exec openwa-api cat /app/data/.api-key"
echo "2. Scan QR Code WhatsApp di Dashboard Admin menu 'OpenWA Gateway'"
echo "3. Upload folder 'hotspot/' ke Winbox MikroTik menu 'Files'"
echo "4. Import Walled Garden di Terminal Winbox:"
echo "   /import hotspot/rsc/walled-garden.rsc"
echo ""
echo "Periksa log secara real-time dengan: docker compose logs -f"
echo "===================================================="
