from rest_framework import serializers
from django.db import transaction
from .models import (
    Category,
    Store,
    Product,
    Variant,
    StoreInventory,
    ServerEvent,
    SyncEvent,
    StockLedgerEntry,
    Sale,
    SaleItem,
)


class CategorySerializer(serializers.ModelSerializer):
    product_count = serializers.IntegerField(source='products.count', read_only=True)

    class Meta:
        model = Category
        fields = [
            'id',
            'name',
            'code',
            'description',
            'is_active',
            'product_count',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
        extra_kwargs = {
            'code': {'required': False},
        }


class StoreSerializer(serializers.ModelSerializer):
    class Meta:
        model = Store
        fields = [
            'id',
            'name',
            'code',
            'address',
            'phone',
            'is_warehouse',
            'is_active',
            'created_at',
            'updated_at',
        ]


class VariantSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    product_style_code = serializers.CharField(source='product.style_code', read_only=True)

    class Meta:
        model = Variant
        fields = [
            'id',
            'product',
            'product_name',
            'product_style_code',
            'sku',
            'barcode',
            'size',
            'color',
            'price',
            'cost',
            'is_active',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
        extra_kwargs = {
            'sku': {'required': False},
            'barcode': {'required': False},
        }


class ProductSerializer(serializers.ModelSerializer):
    variants = VariantSerializer(many=True, read_only=True)
    category_name = serializers.CharField(source='category.name', read_only=True, default=None)
    category_code = serializers.CharField(source='category.code', read_only=True, default=None)

    class Meta:
        model = Product
        fields = [
            'id',
            'name',
            'style_code',
            'description',
            'category',
            'category_name',
            'category_code',
            'is_active',
            'variants',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
        extra_kwargs = {
            'style_code': {'required': False},
        }


class StoreInventorySerializer(serializers.ModelSerializer):
    store_name = serializers.CharField(source='store.name', read_only=True, default='Central Storage (Warehouse)')
    store_code = serializers.CharField(source='store.code', read_only=True, default='STORAGE')
    variant_sku = serializers.CharField(source='variant.sku', read_only=True)
    variant_barcode = serializers.CharField(source='variant.barcode', read_only=True)
    variant_size = serializers.CharField(source='variant.size', read_only=True)
    variant_color = serializers.CharField(source='variant.color', read_only=True)
    product_name = serializers.CharField(source='variant.product.name', read_only=True)
    is_storage = serializers.SerializerMethodField()

    class Meta:
        model = StoreInventory
        fields = [
            'id',
            'store',
            'store_name',
            'store_code',
            'is_storage',
            'variant',
            'variant_sku',
            'variant_barcode',
            'variant_size',
            'variant_color',
            'product_name',
            'quantity_on_hand',
            'created_at',
            'updated_at',
        ]

    def get_is_storage(self, obj):
        return obj.store is None or bool(obj.store.is_warehouse)


class InventoryWorkflowSerializer(serializers.Serializer):
    product_id = serializers.PrimaryKeyRelatedField(
        source='product',
        queryset=Product.objects.all(),
    )
    variant_id = serializers.PrimaryKeyRelatedField(
        source='variant',
        queryset=Variant.objects.all(),
    )
    store_id = serializers.PrimaryKeyRelatedField(
        source='store',
        queryset=Store.objects.all(),
        allow_null=True,
    )
    action = serializers.ChoiceField(choices=('create', 'update'))
    inventory_id = serializers.PrimaryKeyRelatedField(
        source='inventory',
        queryset=StoreInventory.objects.select_related('variant', 'store'),
        required=False,
    )
    quantity_on_hand = serializers.IntegerField()
    notes = serializers.CharField(required=False, allow_blank=True, default='')

    def validate(self, attrs):
        product = attrs['product']
        variant = attrs['variant']
        store = attrs['store']
        action = attrs['action']
        inventory = attrs.get('inventory')

        if variant.product_id != product.pk:
            raise serializers.ValidationError({
                'variant_id': {
                    'code': 'product_mismatch',
                    'detail': 'The selected variant does not belong to the selected product.',
                }
            })

        if action == 'update':
            if inventory is None:
                raise serializers.ValidationError({
                    'inventory_id': {
                        'code': 'required_for_update',
                        'detail': 'Select an existing stock record to update.',
                    }
                })
            if inventory.variant_id != variant.pk:
                raise serializers.ValidationError({
                    'inventory_id': {
                        'code': 'variant_mismatch',
                        'detail': 'The selected stock record belongs to a different variant.',
                    }
                })
            if inventory.store_id != (store.pk if store else None):
                raise serializers.ValidationError({
                    'inventory_id': {
                        'code': 'store_mismatch',
                        'detail': 'The selected stock record belongs to a different location.',
                    }
                })
        else:
            if inventory is not None:
                raise serializers.ValidationError({
                    'inventory_id': {
                        'code': 'not_allowed_for_create',
                        'detail': 'Do not select an existing stock record when creating one.',
                    }
                })
            if StoreInventory.objects.filter(store=store, variant=variant).exists():
                raise serializers.ValidationError({
                    'action': {
                        'code': 'stock_record_exists',
                        'detail': 'A stock record already exists for this variant and location. Select it to update.',
                    }
                })

        return attrs


class TransferInventorySerializer(serializers.Serializer):
    variant_id = serializers.CharField(help_text="Variant UUID, SKU, or Barcode")
    from_store = serializers.CharField(required=False, allow_null=True, allow_blank=True, default=None, help_text="Source store ID/code or null/storage for warehouse")
    to_store = serializers.CharField(required=False, allow_null=True, allow_blank=True, default=None, help_text="Target store ID/code or null/storage for warehouse")
    quantity = serializers.IntegerField(min_value=1, help_text="Quantity of units to transfer")
    notes = serializers.CharField(required=False, allow_blank=True, default='')


class AdjustInventorySerializer(serializers.Serializer):
    variant_id = serializers.CharField(help_text="Variant UUID, SKU, or Barcode")
    store = serializers.CharField(required=False, allow_null=True, allow_blank=True, default=None, help_text="Store ID/code or null/storage for central warehouse")
    type = serializers.ChoiceField(choices=['add', 'subtract', 'set'], default='add', help_text="'add' increments stock, 'subtract' decrements stock, 'set' overrides absolute stock")
    quantity = serializers.IntegerField(min_value=0, help_text="Units to add/subtract, or absolute target level when type is 'set'")
    reason = serializers.ChoiceField(
        choices=[
            ('STOCK_ADJUSTMENT', 'Stock Adjustment'),
            ('RETURN', 'Customer Return'),
            ('STOCKTAKE_RECONCILIATION', 'Stocktake Reconciliation'),
            ('WAREHOUSE_TRANSFER', 'Warehouse Transfer'),
        ],
        default='STOCK_ADJUSTMENT'
    )
    notes = serializers.CharField(required=False, allow_blank=True, default='')


class ServerEventSerializer(serializers.ModelSerializer):
    store_code = serializers.CharField(source='store.code', read_only=True, allow_null=True)

    class Meta:
        model = ServerEvent
        fields = [
            'seq_id',
            'store',
            'store_code',
            'event_type',
            'payload',
            'created_at',
        ]
        read_only_fields = ['seq_id', 'created_at']


class SyncEventSerializer(serializers.ModelSerializer):
    store_code = serializers.CharField(source='store.code', read_only=True)

    class Meta:
        model = SyncEvent
        fields = [
            'event_id',
            'store',
            'store_code',
            'event_type',
            'payload',
            'status',
            'processed_at',
            'created_at',
        ]
        read_only_fields = ['processed_at', 'created_at']


class SyncSignatureSerializer(serializers.Serializer):
    algorithm = serializers.ChoiceField(choices=['HMAC-SHA256'])
    value = serializers.RegexField(regex=r'^[a-f0-9]{64}$')


class StoreExportEventSerializer(serializers.Serializer):
    event_id = serializers.UUIDField()
    local_seq = serializers.IntegerField(min_value=0, required=False, allow_null=True)
    event_type = serializers.CharField(max_length=100)
    created_at = serializers.DateTimeField()
    payload = serializers.DictField()


class StoreExportSerializer(serializers.Serializer):
    schema_version = serializers.ChoiceField(choices=['1.0'])
    file_type = serializers.ChoiceField(choices=['clothstock.store-export'])
    batch_id = serializers.UUIDField()
    store_id = serializers.CharField(max_length=100)
    device_id = serializers.CharField(max_length=128)
    app_version = serializers.CharField(max_length=64, allow_blank=True)
    exported_at = serializers.DateTimeField()
    last_applied_seq = serializers.IntegerField(min_value=0)
    pending_events = StoreExportEventSerializer(many=True, max_length=1000)
    signature = SyncSignatureSerializer()


class SyncRegisterSerializer(serializers.Serializer):
    store_id = serializers.CharField(max_length=100)
    device_id = serializers.CharField(max_length=128)
    app_version = serializers.CharField(max_length=64, required=False, allow_blank=True, default='')


class SyncStateUpdateSerializer(serializers.Serializer):
    device_id = serializers.CharField(max_length=128)
    last_applied_seq = serializers.IntegerField(min_value=0)
    app_version = serializers.CharField(max_length=64, required=False, allow_blank=True)


class StockLedgerEntrySerializer(serializers.ModelSerializer):
    store_name = serializers.CharField(source='store.name', read_only=True, default=None)
    store_code = serializers.CharField(source='store.code', read_only=True, default=None)
    variant_sku = serializers.CharField(source='variant.sku', read_only=True, default=None)
    variant_barcode = serializers.CharField(source='variant.barcode', read_only=True, default=None)
    product_name = serializers.CharField(source='variant.product.name', read_only=True, default=None)

    class Meta:
        model = StockLedgerEntry
        fields = [
            'id',
            'store',
            'store_name',
            'store_code',
            'variant',
            'variant_sku',
            'variant_barcode',
            'product_name',
            'delta',
            'resulting_balance',
            'unit_price',
            'unit_cost',
            'reason',
            'sync_source',
            'timestamp',
            'sync_event',
            'server_event',
            'notes',
        ]
        read_only_fields = ['id', 'timestamp']


# ─────────────────────────────────────────────────────────────────────────────
# Sale & SaleItem Serializers
# ─────────────────────────────────────────────────────────────────────────────

class SaleItemSerializer(serializers.ModelSerializer):
    """
    Serializer for individual line items within a Sale.
    - Read: enriched with variant SKU, size, color, and product name.
    - Write: accepts variant (FK), quantity, unit_price, unit_cost, discount_amount.
      line_total is auto-computed if not provided.
    """
    variant_sku      = serializers.CharField(source='variant.sku',          read_only=True)
    variant_size     = serializers.CharField(source='variant.size',         read_only=True)
    variant_color    = serializers.CharField(source='variant.color',        read_only=True)
    product_name     = serializers.CharField(source='variant.product.name', read_only=True)

    class Meta:
        model  = SaleItem
        fields = [
            'id',
            'variant',
            'variant_sku',
            'variant_size',
            'variant_color',
            'product_name',
            'quantity',
            'unit_price',
            'unit_cost',
            'discount_amount',
            'line_total',
            'ledger_entry',
        ]
        read_only_fields = ['id', 'ledger_entry']

    def validate(self, attrs):
        # Auto-compute line_total when not explicitly provided
        if 'line_total' not in attrs or attrs.get('line_total') is None:
            unit_price      = attrs.get('unit_price', 0)
            quantity        = attrs.get('quantity', 1)
            discount_amount = attrs.get('discount_amount', 0)
            attrs['line_total'] = (unit_price * quantity) - discount_amount
        return attrs


class SaleItemWriteSerializer(SaleItemSerializer):
    """Write-only alias used inside SaleWriteSerializer (no nested read fields needed)."""
    pass


class SaleSerializer(serializers.ModelSerializer):
    """
    Read serializer — includes nested items and store_code for display.
    """
    items      = SaleItemSerializer(many=True, read_only=True)
    store_code = serializers.CharField(source='store.code', read_only=True)
    store_name = serializers.CharField(source='store.name', read_only=True)
    item_count = serializers.IntegerField(source='items.count',            read_only=True)

    class Meta:
        model  = Sale
        fields = [
            'id',
            'store',
            'store_code',
            'store_name',
            'sync_event',
            'receipt_number',
            'sold_at',
            'payment_method',
            'status',
            'subtotal',
            'discount_amount',
            'tax_amount',
            'total_amount',
            'cashier_name',
            'customer_name',
            'notes',
            'item_count',
            'items',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class SaleWriteSerializer(serializers.ModelSerializer):
    """
    Write serializer — accepts nested items and auto-computes monetary totals
    when subtotal / total_amount are omitted.

    Atomic: the Sale and all SaleItems are saved in a single DB transaction.
    """
    items = SaleItemWriteSerializer(many=True)

    class Meta:
        model  = Sale
        fields = [
            'id',
            'store',
            'sync_event',
            'receipt_number',
            'sold_at',
            'payment_method',
            'status',
            'subtotal',
            'discount_amount',
            'tax_amount',
            'total_amount',
            'cashier_name',
            'customer_name',
            'notes',
            'items',
        ]
        read_only_fields = ['id']
        extra_kwargs = {
            'subtotal':        {'required': False},
            'discount_amount': {'required': False},
            'tax_amount':      {'required': False},
            'total_amount':    {'required': False},
        }

    def _compute_totals(self, items_data, validated):
        """Fill in subtotal / total_amount from line items when caller omits them."""
        subtotal        = sum((i.get('line_total', 0) for i in items_data), 0)
        discount_amount = validated.get('discount_amount', 0)
        tax_amount      = validated.get('tax_amount', 0)
        total_amount    = subtotal - discount_amount + tax_amount

        if not validated.get('subtotal'):
            validated['subtotal'] = subtotal
        if not validated.get('total_amount'):
            validated['total_amount'] = total_amount
        return validated

    @transaction.atomic
    def create(self, validated_data):
        items_data = validated_data.pop('items', [])
        validated_data = self._compute_totals(items_data, validated_data)
        sale = Sale.objects.create(**validated_data)
        for item in items_data:
            SaleItem.objects.create(sale=sale, **item)
        return sale

    @transaction.atomic
    def update(self, instance, validated_data):
        items_data = validated_data.pop('items', None)
        for attr, val in validated_data.items():
            setattr(instance, attr, val)
        instance.save()

        if items_data is not None:
            # Replace all items on update (full replace semantics)
            instance.items.all().delete()
            for item in items_data:
                SaleItem.objects.create(sale=instance, **item)

        return instance
