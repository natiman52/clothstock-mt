/**
 * Frontend shapes mirroring ClothStock Variant / Sale / SaleItem and the local POS cart.
 * Rust commands serialize these with camelCase field names.
 *
 * @typedef {Object} CatalogVariant
 * @property {string} id
 * @property {string} productId
 * @property {string} productName
 * @property {string} styleCode
 * @property {string} categoryName
 * @property {string} sku
 * @property {string|null} barcode
 * @property {string} size
 * @property {string} color
 * @property {string} price
 * @property {string} cost
 * @property {number} quantityOnHand
 * @property {boolean} isActive
 *
 * @typedef {Object} CartLine
 * @property {string} variantId
 * @property {string} productName
 * @property {string} sku
 * @property {string|null} barcode
 * @property {string} size
 * @property {string} color
 * @property {number} quantity
 * @property {string} unitPrice
 * @property {string} discountAmount
 * @property {string} lineTotal
 * @property {number} quantityOnHand
 *
 * @typedef {Object} CartSnapshot
 * @property {CartLine[]} items
 * @property {number} itemCount
 * @property {string} subtotal
 * @property {string} discountAmount
 * @property {string} taxAmount
 * @property {string} totalAmount
 *
 * @typedef {Object} SaleItemRow
 * @property {number} id
 * @property {string} saleId
 * @property {string} variantId
 * @property {string} sku
 * @property {string} productName
 * @property {string} size
 * @property {string} color
 * @property {number} quantity
 * @property {string} unitPrice
 * @property {string} unitCost
 * @property {string} discountAmount
 * @property {string} lineTotal
 *
 * @typedef {Object} SaleRow
 * @property {string} id
 * @property {string} receiptNumber
 * @property {string} soldAt
 * @property {string} paymentMethod
 * @property {string} status
 * @property {string} subtotal
 * @property {string} totalAmount
 * @property {string} amountTendered
 * @property {string} changeDue
 * @property {string} cashierName
 * @property {string} customerName
 * @property {string} notes
 * @property {string} syncStatus
 * @property {number} itemCount
 * @property {SaleItemRow[]} items
 *
 * @typedef {Object} TerminalSettings
 * @property {string} apiUrl
 * @property {string} storeId
 * @property {string} storeCode
 * @property {string} storeName
 * @property {string} username
 * @property {string} cashierName
 * @property {number} lastAppliedSeq
 * @property {boolean} hasToken
 */

export {};
