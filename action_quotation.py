# Server Action di Odoo 19: Convert to XML (Sales Quotations / Orders)
# Model: sale.order / Sales Order
# Kompatibel untuk List View (Multiple Quotations terpilih) maupun Form View (Single Quotation)

BASE_BACKEND_URL = "https://odoo-coretax-xml.vercel.app"
API_SECRET = "secret_coretax_hanifa_2026"

# Ambil seluruh ID Sales Quotation / Order yang dipilih
if records:
    ids_str = ",".join(str(r.id) for r in records)
else:
    ids_str = str(record.id)

download_url = f"{BASE_BACKEND_URL}/api/quotations/bulk/xml?ids={ids_str}&token={API_SECRET}"

action = {
    'type': 'ir.actions.act_url',
    'url': download_url,
    'target': 'self',  # Langsung memicu unduhan file XML di browser pengguna
}
