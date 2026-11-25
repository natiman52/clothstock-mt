import re
import uuid
import random
from django.db import models
from django.utils import timezone


class Category(models.Model):
    """
    Category represents a selectable product grouping (e.g., Tops, Footwear, Outerwear).
    """
    name = models.CharField(max_length=100, unique=True)
    code = models.CharField(max_length=50, unique=True, blank=True, db_index=True)
    description = models.TextField(blank=True, default='')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']
        verbose_name = 'Category'
        verbose_name_plural = 'Categories'

    def save(self, *args, **kwargs):
        if not self.code:
            base_code = re.sub(r'[^A-Za-z0-9]+', '', self.name).upper()[:10]
            if not base_code:
                base_code = "CAT"
            candidate = base_code
            counter = 1
            while Category.objects.filter(code=candidate).exclude(pk=self.pk).exists():
                candidate = f"{base_code}{counter}"
                counter += 1
            self.code = candidate
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.name} ({self.code})"


class Store(models.Model):
    name = models.CharField(max_length=255)
    code = models.CharField(max_length=50, unique=True, db_index=True)
    address = models.TextField(blank=True, default='')
    phone = models.CharField(max_length=50, blank=True, default='')
    is_warehouse = models.BooleanField(
        default=False,
        help_text='True if this location is a central warehouse or storage facility.'
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']
        verbose_name = 'Store'
        verbose_name_plural = 'Stores'

    def __str__(self):
        tag = ' [Warehouse]' if self.is_warehouse else ''
        return f"{self.name} ({self.code}){tag}"


class Product(models.Model):
    """
    Product represents a clothing style (e.g. Overland Tech Trench Coat).
    Uses UUID primary key for identical IDs across offline stores and server.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    style_code = models.CharField(max_length=100, blank=True, default='', db_index=True)
    description = models.TextField(blank=True, default='')
    category = models.ForeignKey(
        Category,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='products'
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']
        verbose_name = 'Product'
        verbose_name_plural = 'Products'

    def save(self, *args, **kwargs):
        if not self.style_code:
            self.style_code = self.generate_style_code(self.name)
        super().save(*args, **kwargs)

    @classmethod
    def generate_style_code(cls, name=None):
        prefix = 'STY'
        if name:
            words = re.findall(r'[A-Za-z0-9]+', name)
            if words:
                prefix = ''.join(w[0] for w in words[:3]).upper()
                if len(prefix) < 2:
                    prefix = (prefix + 'XX')[:3]
        while True:
            candidate = f"{prefix}-{random.randint(1000, 9999)}"
            if not cls.objects.filter(style_code=candidate).exists():
                return candidate

    def __str__(self):
        if self.style_code:
            return f"{self.name} [{self.style_code}]"
        return self.name


class Variant(models.Model):
    """
    Variant represents a specific SKU/barcode item under a Product style,
    with distinct size, color, price, and cost.
    Uses UUID primary key for identical IDs across offline stores and server.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name='variants'
    )
    sku = models.CharField(max_length=100, unique=True, blank=True, db_index=True)
    barcode = models.CharField(
        max_length=100,
        unique=True,
        blank=True,
        null=True,
        db_index=True
    )
    size = models.CharField(max_length=50)
    color = models.CharField(max_length=50)
    price = models.DecimalField(max_digits=12, decimal_places=2)
    cost = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['product', 'size', 'color']
        verbose_name = 'Variant'
        verbose_name_plural = 'Variants'

    def save(self, *args, **kwargs):
        if not self.sku:
            self.sku = self.generate_sku()
        if not self.barcode:
            self.barcode = self.generate_barcode()
        super().save(*args, **kwargs)

    def generate_sku(self):
        style = self.product.style_code if self.product and self.product.style_code else 'VAR'
        clean_color = re.sub(r'[^A-Za-z0-9]', '', self.color or '').upper()[:3] or 'STD'
        clean_size = re.sub(r'[^A-Za-z0-9]', '', self.size or '').upper() or 'OS'
        base_sku = f"{style}-{clean_color}-{clean_size}"
        candidate = base_sku
        counter = 1
        while Variant.objects.filter(sku=candidate).exclude(pk=self.pk).exists():
            candidate = f"{base_sku}-{counter}"
            counter += 1
        return candidate

    @classmethod
    def generate_barcode(cls, prefix='20'):
        """
        Generate a unique 13-digit EAN-13 barcode standard for internal retail.
        Calculates standard GS1 modulo-10 check digit.
        """
        while True:
            needed = 12 - len(prefix)
            body = prefix + ''.join(str(random.randint(0, 9)) for _ in range(needed))
            checksum = sum(int(digit) * (3 if idx % 2 == 1 else 1) for idx, digit in enumerate(body))
            check_digit = (10 - (checksum % 10)) % 10
            candidate = f"{body}{check_digit}"
            if not cls.objects.filter(barcode=candidate).exists():
                return candidate

    def __str__(self):
        return f"{self.product.name} - {self.sku} ({self.size} / {self.color})"


class StoreInventory(models.Model):
    """
    StoreInventory tracks quantity on hand for a (store, variant) pair.
    store = null represents unassigned central storage / warehouse inventory.
    """
    store = models.ForeignKey(
        Store,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='inventories',
        help_text='Null represents unassigned central storage / warehouse inventory.'
    )
    variant = models.ForeignKey(
        Variant,
        on_delete=models.CASCADE,
        related_name='store_inventories'
    )
    quantity_on_hand = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Store Inventory'
        verbose_name_plural = 'Store Inventories'
        constraints = [
            models.UniqueConstraint(
                fields=['store', 'variant'],
                name='unique_store_variant_inventory',
                condition=models.Q(store__isnull=False),
            ),
            models.UniqueConstraint(
                fields=['variant'],
                name='unique_warehouse_storage_inventory',
                condition=models.Q(store__isnull=True),
            ),
        ]

    def __str__(self):
        store_label = self.store.name if self.store else 'Central Storage (Warehouse)'
        return f"{store_label} | {self.variant.sku}: {self.quantity_on_hand} on hand"


class ServerEvent(models.Model):
    """
    ServerEvent represents authoritative changes generated on the server (e.g. global
    catalog or price updates, store-specific stock transfers).
    Uses monotonically increasing seq_id as the primary key so edge nodes can track
    their replication cursor and pull changes incrementally.
    """
    seq_id = models.BigAutoField(primary_key=True)
    store = models.ForeignKey(
        Store,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='server_events',
        help_text='Null for global updates (catalog, prices); set for store-specific events (transfers, dispatches).'
    )
    event_type = models.CharField(max_length=100, db_index=True)
    payload = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['seq_id']
        verbose_name = 'Server Event'
        verbose_name_plural = 'Server Events'
        indexes = [
            models.Index(fields=['seq_id', 'store']),
            models.Index(fields=['event_type', 'created_at']),
        ]

    def __str__(self):
        target = self.store.code if self.store else 'GLOBAL'
        return f"ServerEvent #{self.seq_id} [{target}] {self.event_type}"


class SyncEvent(models.Model):
    """
    SyncEvent represents store-generated mutations (sales, returns, adjustments)
    uploaded by offline or online store terminals.
    Uses UUID event_id as primary key to guarantee idempotent processing.
    """
    class Status(models.TextChoices):
        PENDING = 'PENDING', 'Pending'
        PROCESSED = 'PROCESSED', 'Processed'
        CONFLICT = 'CONFLICT', 'Conflict'
        FAILED = 'FAILED', 'Failed'

    event_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    store = models.ForeignKey(
        Store,
        on_delete=models.CASCADE,
        related_name='sync_events'
    )
    event_type = models.CharField(max_length=100, db_index=True)
    payload = models.JSONField(default=dict)
    status = models.CharField(
        max_length=50,
        choices=Status.choices,
        default=Status.PENDING,
        db_index=True
    )
    processed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Sync Event'
        verbose_name_plural = 'Sync Events'
        indexes = [
            models.Index(fields=['store', 'status']),
            models.Index(fields=['event_type', 'created_at']),
        ]

    def __str__(self):
        return f"SyncEvent {self.event_id} ({self.store.code}) [{self.status}] {self.event_type}"


class StoreSyncState(models.Model):
    """Last known sync state and per-device signing key for one store terminal."""
    store = models.ForeignKey(Store, on_delete=models.CASCADE, related_name='sync_states')
    device_id = models.CharField(max_length=128)
    device_secret = models.CharField(max_length=128)
    app_version = models.CharField(max_length=64, blank=True, default='')
    last_applied_seq = models.PositiveBigIntegerField(default=0)
    last_seen_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['store', 'device_id'], name='unique_store_sync_device'),
        ]
        indexes = [models.Index(fields=['store', 'last_seen_at'])]

    def __str__(self):
        return f"{self.store.code} / {self.device_id}"


class StockLedgerEntry(models.Model):
    """
    StockLedgerEntry records every immutable stock delta (+ or -), resulting balance,
    reason, sync source, and timestamp for complete auditability across offline and online stores.
    """
    class Reason(models.TextChoices):
        SALE = 'SALE', 'Sale'
        RETURN = 'RETURN', 'Return'
        WAREHOUSE_TRANSFER = 'WAREHOUSE_TRANSFER', 'Warehouse Transfer'
        STOCK_ADJUSTMENT = 'STOCK_ADJUSTMENT', 'Stock Adjustment'
        STOCKTAKE_RECONCILIATION = 'STOCKTAKE_RECONCILIATION', 'Stocktake Reconciliation'
        SERVER_EVENT = 'SERVER_EVENT', 'Server Event'
        SYNC_EVENT = 'SYNC_EVENT', 'Sync Event'

    class SyncSource(models.TextChoices):
        AUTO_SYNC = 'AUTO_SYNC', 'Auto Sync'
        MANUAL_FILE = 'MANUAL_FILE', 'Manual File'
        WEB_ADMIN = 'WEB_ADMIN', 'Web Admin'

    store = models.ForeignKey(
        Store,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='ledger_entries'
    )
    variant = models.ForeignKey(
        Variant,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='ledger_entries'
    )
    delta = models.IntegerField(default=0, help_text='Stock quantity delta (+ or -)')
    resulting_balance = models.IntegerField(default=0, help_text='Stock quantity balance after this transaction')
    unit_price = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0.00,
        help_text='Selling price per unit snapshot at time of transaction'
    )
    unit_cost = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0.00,
        help_text='Cost price per unit snapshot at time of transaction'
    )
    reason = models.CharField(
        max_length=50,
        choices=Reason.choices,
        default=Reason.STOCK_ADJUSTMENT,
        db_index=True
    )
    sync_source = models.CharField(
        max_length=50,
        choices=SyncSource.choices,
        default=SyncSource.AUTO_SYNC,
        db_index=True
    )
    timestamp = models.DateTimeField(default=timezone.now, db_index=True)
    sync_event = models.ForeignKey(
        SyncEvent,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='ledger_entries',
        help_text='The originating SyncEvent if from store sync'
    )
    server_event = models.ForeignKey(
        ServerEvent,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='ledger_entries',
        help_text='The originating ServerEvent if from server dispatch/transfer'
    )
    notes = models.TextField(blank=True, default='')

    class Meta:
        ordering = ['-timestamp', '-id']
        verbose_name = 'Stock Ledger Entry'
        verbose_name_plural = 'Stock Ledger Entries'
        indexes = [
            models.Index(fields=['store', 'variant', '-timestamp']),
            models.Index(fields=['reason', '-timestamp']),
            models.Index(fields=['reason', 'timestamp', 'store']),
        ]

    def __str__(self):
        sign = '+' if self.delta > 0 else ''
        if hasattr(self.variant,"sku"):
            sku = self.variant.sku 
        else:
            sku = "xxx-xxx-xxxxx"
        return f"{self.id} | {sku}: {sign}{self.delta} -> {self.resulting_balance} ({self.reason})"


# ─────────────────────────────────────────────────────────────────────────────
# Sale & SaleItem — first-class sell tracking
# ─────────────────────────────────────────────────────────────────────────────

class Sale(models.Model):
    """
    A Sale groups one or more SaleItems into a single customer transaction.

    - UUID primary key so offline POS terminals generate IDs without a server round-trip.
    - Links back to the SyncEvent that uploaded it (nullable for server-originated sales).
    - Tracks payment method, discount, tax, and final total.
    - 'sold_at' records when the transaction actually happened (can be in the past for
      offline stores syncing up), while 'created_at' tracks when the server first saw it.
    """
    class PaymentMethod(models.TextChoices):
        CASH   = 'CASH',   'Cash'
        CARD   = 'CARD',   'Card'
        MOBILE = 'MOBILE', 'Mobile Money'
        MIXED  = 'MIXED',  'Mixed'
        OTHER  = 'OTHER',  'Other'

    class Status(models.TextChoices):
        COMPLETED = 'COMPLETED', 'Completed'
        VOIDED    = 'VOIDED',    'Voided'
        RETURNED  = 'RETURNED',  'Returned'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    store = models.ForeignKey(
        Store,
        on_delete=models.CASCADE,
        related_name='sales'
    )
    # Optional link to the SyncEvent batch that brought this sale in
    sync_event = models.ForeignKey(
        SyncEvent,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='sales'
    )
    receipt_number = models.CharField(
        max_length=100,
        blank=True,
        default='',
        db_index=True,
        help_text='Human-readable receipt / invoice number (store-assigned)'
    )
    sold_at = models.DateTimeField(
        default=timezone.now,
        db_index=True,
        help_text='Timestamp of the actual transaction (may pre-date server receipt for offline stores)'
    )
    payment_method = models.CharField(
        max_length=20,
        choices=PaymentMethod.choices,
        default=PaymentMethod.CASH,
        db_index=True
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.COMPLETED,
        db_index=True
    )
    # Monetary summary (all in the store's local currency)
    subtotal        = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    discount_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    tax_amount      = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    total_amount    = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    cashier_name  = models.CharField(max_length=150, blank=True, default='')
    customer_name = models.CharField(max_length=150, blank=True, default='')
    notes         = models.TextField(blank=True, default='')
    created_at    = models.DateTimeField(auto_now_add=True)
    updated_at    = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-sold_at', '-created_at']
        verbose_name = 'Sale'
        verbose_name_plural = 'Sales'
        indexes = [
            models.Index(fields=['store', '-sold_at']),
            models.Index(fields=['store', 'status']),
            models.Index(fields=['receipt_number']),
        ]

    def __str__(self):
        receipt = self.receipt_number or str(self.id)[:8]
        return f"Sale {receipt} @ {self.store.code} — {self.total_amount} ({self.status})"


class SaleItem(models.Model):
    """
    A single line within a Sale: which Variant was sold, at what unit price,
    how many units, and how much discount was applied to that line.

    'unit_price' captures the price at time-of-sale even if Variant.price changes later.
    """
    sale = models.ForeignKey(
        Sale,
        on_delete=models.CASCADE,
        related_name='items'
    )
    variant = models.ForeignKey(
        Variant,
        on_delete=models.CASCADE,
        related_name='sale_items'
    )
    quantity    = models.PositiveIntegerField(default=1)
    unit_price  = models.DecimalField(
        max_digits=12, decimal_places=2,
        help_text='Selling price per unit at time of sale'
    )
    unit_cost   = models.DecimalField(
        max_digits=12, decimal_places=2, default=0,
        help_text='Cost price per unit at time of sale (for margin calculation)'
    )
    discount_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    line_total  = models.DecimalField(
        max_digits=14, decimal_places=2,
        help_text='(unit_price * quantity) - discount_amount'
    )
    # Back-link to the ledger entry that reduced stock for this line
    ledger_entry = models.OneToOneField(
        StockLedgerEntry,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='sale_item'
    )

    class Meta:
        ordering = ['id']
        verbose_name = 'Sale Item'
        verbose_name_plural = 'Sale Items'
        indexes = [
            models.Index(fields=['sale', 'variant']),
        ]

    def __str__(self):
        if hasattr(self.variant,"sku"):
            sku = self.variant.sku 
        else:
            sku = "xxx-xxx-xxxxx"
        return f"{self.sale_id} × {sku} ×{self.quantity} @ {self.unit_price}"
