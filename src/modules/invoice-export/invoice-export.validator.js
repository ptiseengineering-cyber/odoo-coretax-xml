/**
 * Validator bisnis untuk ekspor dokumen Odoo (Invoice / Sales Quotation) ke Coretax
 */
export class InvoiceExportValidator {
  /**
   * Validasi kelayakan data dokumen sebelum diproses
   * @param {object} param0
   * @param {object} param0.invoice - Data dari account.move atau normalized sale.order
   * @param {object} param0.company - Data dari res.company
   * @param {object} param0.partner - Data dari res.partner
   * @param {Array<object>} param0.lines - Data dari account.move.line atau normalized sale.order.line
   * @param {object} options
   */
  static validateRawData({ invoice, company, partner, lines }, options = {}) {
    const errors = [];
    const sourceType = options.sourceType || invoice?.source_model || 'account_move';
    const isSaleOrder = sourceType === 'sale_order' || sourceType === 'sale.order';

    // 1. Validasi Header Dokumen
    if (!invoice) {
      errors.push(
        isSaleOrder
          ? 'ORDER_NOT_FOUND: Sales Quotation/Order tidak ditemukan di sistem Odoo.'
          : 'INVOICE_NOT_FOUND: Invoice tidak ditemukan di sistem Odoo.'
      );
      return { isValid: false, errors };
    }

    if (isSaleOrder) {
      if (invoice.state === 'cancel') {
        errors.push('INVALID_ORDER_STATE: Sales Quotation/Order berstatus dibatalkan (cancel) dan tidak dapat diekspor.');
      }

      if (!invoice.invoice_date && !invoice.date_order) {
        errors.push('MISSING_ORDER_DATE: Order Date belum diisi pada Sales Quotation/Order Odoo.');
      }
    } else {
      if (invoice.move_type !== 'out_invoice') {
        errors.push(`INVALID_MOVE_TYPE: Dokumen harus bertipe Customer Invoice (out_invoice), tipe saat ini: ${invoice.move_type}`);
      }

      if (!invoice.invoice_date) {
        errors.push('MISSING_INVOICE_DATE: Invoice Date belum diisi pada invoice Odoo.');
      }
    }

    // 2. Validasi Perusahaan Penjual (ISE)
    if (!company) {
      errors.push('SELLER_COMPANY_MISSING: Data perusahaan penerbit tidak ditemukan.');
    } else {
      if (options.expectedCompanyName && !company.name?.toLowerCase().includes(options.expectedCompanyName.toLowerCase())) {
        errors.push(`INVALID_COMPANY: Invoice bukan diterbitkan oleh perusahaan ${options.expectedCompanyName} (Perusahaan: ${company.name}).`);
      }
      if (!company.vat) {
        errors.push('SELLER_TIN_MISSING: NPWP Perusahaan penjual (Seller TIN) belum diisi pada setting Company.');
      }
    }

    // 3. Validasi Data Buyer (Pelanggan)
    if (!partner) {
      errors.push('BUYER_PARTNER_MISSING: Data pelanggan (Customer) tidak terhubung.');
    } else {
      if (!partner.name || !partner.name.trim()) {
        errors.push('BUYER_NAME_MISSING: Nama pelanggan wajib diisi.');
      }
    }

    // 4. Validasi Lines Produk
    if (!lines || lines.length === 0) {
      errors.push('EMPTY_INVOICE_LINES: Dokumen tidak memiliki baris produk / layanan aktif.');
    } else {
      lines.forEach((line, index) => {
        const lineNum = index + 1;
        const lineQty = line.quantity !== undefined ? line.quantity : line.product_uom_qty;
        if (line.price_unit === undefined || line.price_unit === null || Number(line.price_unit) < 0) {
          errors.push(`INVALID_LINE_PRICE: Baris #${lineNum} (${line.name || 'Produk'}) memiliki harga satuan tidak valid.`);
        }
        if (lineQty === undefined || lineQty === null || Number(lineQty) <= 0) {
          errors.push(`INVALID_LINE_QTY: Baris #${lineNum} (${line.name || 'Produk'}) memiliki kuantitas kurang dari atau sama dengan nol.`);
        }
      });
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

