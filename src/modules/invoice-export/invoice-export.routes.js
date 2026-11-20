import { Router } from 'express';

/**
 * Setup routes untuk modul Invoice & Sales Quotation Export
 * @param {import('./invoice-export.controller.js').InvoiceExportController} controller
 * @returns {Router}
 */
export function createInvoiceExportRoutes(controller) {
  const router = Router();

  // Endpoint download XML multiple invoices (bulk)
  router.get('/invoices/bulk/xml', controller.exportBulkXml);
  router.post('/invoices/bulk/xml', controller.exportBulkXml);

  // Endpoint download langsung XML satu invoice
  router.get('/invoices/:invoiceId/xml', controller.exportXml);

  // Endpoint untuk generate URL download bertoken aman (opsional jika dibutuhkan server action)
  router.get('/invoices/:invoiceId/token', controller.generateDownloadUrl);

  // Endpoint download XML multiple sales quotations/orders (bulk)
  router.get('/quotations/bulk/xml', controller.exportBulkQuotationXml);
  router.post('/quotations/bulk/xml', controller.exportBulkQuotationXml);

  // Endpoint download langsung XML satu sales quotation/order
  router.get('/quotations/:orderId/xml', controller.exportQuotationXml);

  // Endpoint untuk generate URL download bertoken aman untuk sales quotation/order
  router.get('/quotations/:orderId/token', controller.generateQuotationDownloadUrl);

  return router;
}
