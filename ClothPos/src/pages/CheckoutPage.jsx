import { useOutletContext } from 'react-router';
import CheckoutModal from '../components/CheckoutModal';
import CheckoutView from '../components/CheckoutView';

export default function CheckoutPage() {
  const {
    query,
    scanRef,
    products,
    selectedProductId,
    setSelectedProductId,
    cart,
    checkoutOpen,
    completedSale,
    busy,
    setCheckoutOpen,
    onQuery,
    onScan,
    onAdd,
    onQty,
    onRemove,
    onClear,
    onStartCheckout,
    onConfirmCheckout,
  } = useOutletContext();
  console.log(products)
  return (
    <>
      <CheckoutView
        query={query}
        scanRef={scanRef}
        products={products}
        selectedProductId={selectedProductId}
        setSelectedProductId={setSelectedProductId}
        cart={cart}
        onQuery={onQuery}
        onScan={onScan}
        onAdd={onAdd}
        onQty={onQty}
        onRemove={onRemove}
        onClear={onClear}
        onPay={onStartCheckout}
      />
      {checkoutOpen && (
        <CheckoutModal
          cart={cart}
          busy={busy}
          onClose={() => setCheckoutOpen(false)}
          onConfirm={onConfirmCheckout}
          completedSale={completedSale}
        />
      )}
    </>
  );
}
