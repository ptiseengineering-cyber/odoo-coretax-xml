import { appConfig } from '../../config/app.config.js';
import { verifyInvoiceToken } from '../../utils/security.utils.js';

/**
 * Controller untuk menangani HTTP request ekspor XML Coretax
 * Mendukung Accounting Invoice (account.move) maupun Sales Quotation/Order (sale.order),
 * baik single maupun multiple (bulk).
 */
export class InvoiceExportController {
  /**
   * @param {import('./invoice-export.service.js').InvoiceExportService} service
   */
  constructor(service) {
    this.service = service;
  }

  _buildExportOptions(query = {}, sourceType = 'account_move') {
    const { opt, strategy, vatRate } = query;
    return {
      sourceType,
      defaultOpt: opt ? opt.toUpperCase() : 'A',
      taxStrategy: strategy || appConfig.taxCalculationStrategy,
      vatRate: vatRate ? Number(vatRate) : appConfig.defaultVatRate
    };
  }

  _resolveErrorStatusCode(err) {
    if (err.code === 'VALIDATION_FAILED' || err.code === 'BULK_VALIDATION_FAILED') {
      return 422;
    }
    if (err.code === 'INVOICE_NOT_FOUND' || err.code === 'ORDER_NOT_FOUND') {
      return 404;
    }
    if (err.code === 'INVALID_INVOICE_ID' || err.code === 'INVALID_ORDER_ID') {
      return 400;
    }
    return 500;
  }

  _sendXmlDownload(res, result) {
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.status(200).send(result.xml);
  }

  async _handleBulkExport(req, res, sourceType) {
    try {
      const idsParam = req.query.ids || req.body?.ids || req.params?.invoiceId || req.params?.orderId;
      const { token } = req.query;

      if (!idsParam) {
        return res.status(400).json({
          success: false,
          error: sourceType === 'sale_order' ? 'MISSING_ORDER_IDS' : 'MISSING_INVOICE_IDS',
          message: 'Parameter "ids" wajib disertakan (contoh: ?ids=18,19,20,21).'
        });
      }

      // Validasi Token Keamanan jika diwajibkan
      if (appConfig.requireTokenAuth) {
        if (!token || !verifyInvoiceToken('bulk', token, appConfig.securitySecret)) {
          return res.status(401).json({
            success: false,
            error: 'UNAUTHORIZED_ACCESS',
            message: 'Token otentikasi tidak valid atau sudah kedaluwarsa.'
          });
        }
      }

      const options = this._buildExportOptions(req.query, sourceType);
      const result = await this.service.exportBulkInvoicesToXml(idsParam, options);

      return this._sendXmlDownload(res, result);
    } catch (err) {
      return res.status(this._resolveErrorStatusCode(err)).json({
        success: false,
        error: err.code || 'EXPORT_ERROR',
        message: err.message,
        details: err.details || undefined
      });
    }
  }

  async _handleSingleExport(req, res, rawId, sourceType) {
    try {
      // Jika ID berupa "bulk" atau berisi koma (misal "18,19,20"), delegasikan ke bulk handler
      if (rawId === 'bulk' || String(rawId).includes(',')) {
        return this._handleBulkExport(req, res, sourceType);
      }

      const { token } = req.query;

      // 1. Validasi ID dokumen
      const numId = Number(rawId);
      if (!numId || isNaN(numId)) {
        return res.status(400).json({
          success: false,
          error: sourceType === 'sale_order' ? 'INVALID_ORDER_ID' : 'INVALID_INVOICE_ID',
          message: 'Parameter ID dokumen harus berupa angka yang valid.'
        });
      }

      // 2. Validasi Token Keamanan jika diwajibkan (Cegah IDOR)
      if (appConfig.requireTokenAuth) {
        if (!token || !verifyInvoiceToken(numId, token, appConfig.securitySecret)) {
          return res.status(401).json({
            success: false,
            error: 'UNAUTHORIZED_ACCESS',
            message: 'Token otentikasi tidak valid atau sudah kedaluwarsa.'
          });
        }
      }

      // 3. Eksekusi service ekspor
      const options = this._buildExportOptions(req.query, sourceType);
      const result = await this.service.exportInvoiceToXml(numId, options);

      // 4. Kirim file XML ke browser
      return this._sendXmlDownload(res, result);
    } catch (err) {
      return res.status(this._resolveErrorStatusCode(err)).json({
        success: false,
        error: err.code || 'EXPORT_ERROR',
        message: err.message,
        details: err.details || undefined
      });
    }
  }

  async _handleGenerateDownloadUrl(req, res, rawId, routeSegment) {
    try {
      const numId = Number(rawId);
      if (!numId || isNaN(numId)) {
        return res.status(400).json({ success: false, message: 'Invalid ID' });
      }

      const { generateInvoiceToken } = await import('../../utils/security.utils.js');
      const token = generateInvoiceToken(numId, appConfig.securitySecret);
      const host = req.get('host');
      const protocol = req.protocol;
      const downloadUrl = `${protocol}://${host}/api/${routeSegment}/${numId}/xml?token=${token}`;

      const payload = {
        success: true,
        downloadUrl,
        token
      };
      if (routeSegment === 'quotations') {
        payload.orderId = numId;
      } else {
        payload.invoiceId = numId;
      }

      return res.json(payload);
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * Handler untuk GET & POST /api/invoices/bulk/xml
   */
  exportBulkXml = async (req, res) => {
    return this._handleBulkExport(req, res, 'account_move');
  };

  /**
   * Handler untuk GET /api/invoices/:invoiceId/xml
   */
  exportXml = async (req, res) => {
    return this._handleSingleExport(req, res, req.params.invoiceId, 'account_move');
  };

  /**
   * Handler untuk generate token download aman invoice
   */
  generateDownloadUrl = async (req, res) => {
    return this._handleGenerateDownloadUrl(req, res, req.params.invoiceId, 'invoices');
  };

  /**
   * Handler untuk GET & POST /api/quotations/bulk/xml
   */
  exportBulkQuotationXml = async (req, res) => {
    return this._handleBulkExport(req, res, 'sale_order');
  };

  /**
   * Handler untuk GET /api/quotations/:orderId/xml
   */
  exportQuotationXml = async (req, res) => {
    return this._handleSingleExport(req, res, req.params.orderId, 'sale_order');
  };

  /**
   * Handler untuk generate token download aman sales quotation/order
   */
  generateQuotationDownloadUrl = async (req, res) => {
    return this._handleGenerateDownloadUrl(req, res, req.params.orderId, 'quotations');
  };
}
