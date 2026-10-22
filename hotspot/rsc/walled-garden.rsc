# Ganti DOMAIN_PORTAL_ANDA dengan hostname portal billing sebelum dijalankan.
/ip hotspot walled-garden
add dst-host=DOMAIN_PORTAL_ANDA action=allow comment="Portal Billing"
