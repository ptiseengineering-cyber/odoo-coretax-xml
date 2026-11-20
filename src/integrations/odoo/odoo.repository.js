/**
 * Repository untuk pengambilan data invoice (account.move), sales quotation/order (sale.order),
 * lines, partner, dan company dari Odoo 19
 */
export class OdooRepository {
  /**
   * @param {import('./odoo.client.js').OdooClient} odooClient
   */
  constructor(odooClient) {
    this.client = odooClient;
    this._fieldsCache = {};
  }

  /**
   * Memeriksa field yang tersedia pada model Odoo agar kompatibel lintas versi (misal Odoo 17/18 vs 19)
   * @param {string} model
   * @param {Array<string>} candidateFields
   * @returns {Promise<Array<string>>}
   */
  async _resolveAvailableFields(model, candidateFields) {
    if (!this._fieldsCache[model]) {
      const fieldMeta = await this.client.executeKw(model, 'fields_get', [[]], {
        attributes: ['type']
      });
      if (fieldMeta && typeof fieldMeta === 'object') {
        this._fieldsCache[model] = new Set(Object.keys(fieldMeta));
      }
    }

    const available = this._fieldsCache[model];
    if (!available || available.size === 0) {
      return candidateFields;
    }

    return candidateFields.filter(field => available.has(field));
  }

  /**
   * Mengambil data invoice account.move berdasarkan ID
   * @param {number|string} invoiceId
   * @returns {Promise<object|null>}
   */
  async getInvoiceById(invoiceId) {
    const id = Number(invoiceId);
    if (!id || isNaN(id)) {
      throw new Error('INVALID_INVOICE_ID: Format ID invoice tidak valid.');
    }

    const fields = [
      'id',
      'name',
      'move_type',
      'state',
      'invoice_date',
      'ref',
      'partner_id',
      'company_id',
      'invoice_line_ids',
      'currency_id',
      'amount_untaxed',
      'amount_tax',
      'amount_total'
    ];

    const records = await this.client.executeKw('account.move', 'read', [[id]], { fields });
    if (!records || records.length === 0) {
      return null;
    }
    return records[0];
  }

  /**
   * Mengambil data account.move.line berdasarkan array of line IDs
   * @param {Array<number>} lineIds
   * @returns {Promise<Array<object>>}
   */
  async getInvoiceLines(lineIds = []) {
    if (!lineIds || lineIds.length === 0) {
      return [];
    }

    const fields = [
      'id',
      'name',
      'product_id',
      'quantity',
      'price_unit',
      'discount',
      'price_subtotal',
      'price_total',
      'tax_ids',
      'product_uom_id',
      'display_type'
    ];

    const records = await this.client.executeKw('account.move.line', 'read', [lineIds], { fields });
    
    // Filter out note/section lines (hanya ambil baris produk nyata)
    return (records || []).filter(line => !line.display_type || line.display_type === 'product');
  }

  /**
   * Mengambil data sales quotation / sales order (sale.order) berdasarkan ID
   * dan menormalisasi field agar seragam dengan pipeline ekspor Coretax
   * @param {number|string} orderId
   * @returns {Promise<object|null>}
   */
  async getSaleOrderById(orderId) {
    const id = Number(orderId);
    if (!id || isNaN(id)) {
      throw new Error('INVALID_ORDER_ID: Format ID sales quotation/order tidak valid.');
    }

    const candidateFields = [
      'id',
      'name',
      'state',
      'date_order',
      'client_order_ref',
      'origin',
      'partner_id',
      'company_id',
      'order_line',
      'currency_id',
      'amount_untaxed',
      'amount_tax',
      'amount_total'
    ];

    const fields = await this._resolveAvailableFields('sale.order', candidateFields);
    const records = await this.client.executeKw('sale.order', 'read', [[id]], { fields });
    if (!records || records.length === 0) {
      return null;
    }

    const order = records[0];
    return {
      ...order,
      source_model: 'sale.order',
      invoice_date: order.date_order ? String(order.date_order).slice(0, 10) : null,
      ref: order.client_order_ref || order.origin || '',
      invoice_line_ids: order.order_line || []
    };
  }

  /**
   * Mengambil data sale.order.line berdasarkan array of line IDs
   * dan menormalisasi field kuantitas & UoM (hanya memfilter baris section/note)
   * @param {Array<number>} lineIds
   * @returns {Promise<Array<object>>}
   */
  async getSaleOrderLines(lineIds = []) {
    if (!lineIds || lineIds.length === 0) {
      return [];
    }

    const candidateFields = [
      'id',
      'name',
      'product_id',
      'product_uom_qty',
      'price_unit',
      'discount',
      'price_subtotal',
      'price_total',
      'tax_ids',
      'tax_id',
      'product_uom_id',
      'product_uom',
      'display_type'
    ];

    const fields = await this._resolveAvailableFields('sale.order.line', candidateFields);
    const records = await this.client.executeKw('sale.order.line', 'read', [lineIds], { fields });

    return (records || [])
      .filter(line => !line.display_type || line.display_type === 'product')
      .map((line) => ({
        ...line,
        quantity: line.product_uom_qty !== undefined ? line.product_uom_qty : line.quantity,
        product_uom_id: line.product_uom_id || line.product_uom || null,
        tax_ids: line.tax_ids || line.tax_id || []
      }));
  }

  /**
   * Mengambil data pelanggan res.partner
   * @param {number} partnerId
   * @returns {Promise<object|null>}
   */
  async getPartnerById(partnerId) {
    if (!partnerId) return null;

    const fields = [
      'id',
      'name',
      'vat',
      'street',
      'street2',
      'city',
      'state_id',
      'zip',
      'country_id',
      'email',
      'phone'
    ];

    const records = await this.client.executeKw('res.partner', 'read', [[partnerId]], { fields });
    return records && records.length > 0 ? records[0] : null;
  }

  /**
   * Mengambil data perusahaan penerbit res.company
   * @param {number} companyId
   * @returns {Promise<object|null>}
   */
  async getCompanyById(companyId) {
    if (!companyId) return null;

    const fields = ['id', 'name', 'partner_id', 'vat'];
    const records = await this.client.executeKw('res.company', 'read', [[companyId]], { fields });
    return records && records.length > 0 ? records[0] : null;
  }
}

