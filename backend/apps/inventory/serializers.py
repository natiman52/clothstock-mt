from rest_framework import serializers
from django.db import transaction
from .models import (
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


class StoreSerializer(serializers.ModelSerializer):
    class Meta:
        model = Store
        fields = [
            'id',
            'name',
            'code',
            'address',
            'phone',
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


class ProductSerializer(serializers.ModelSerializer):
    variants = VariantSerializer(many=True, read_only=True)

    class Meta:
        model = Product
        fields = [
            'id',
            'name',
            'style_code',
            'description',
            'category',
            'is_active',
            'variants',
            'created_at',
            'updated_at',
        ]


class StoreInventorySerializer(serializers.ModelSerializer):
    store_name = serializers.CharField(source='store.name', read_only=True)
    store_code = serializers.CharField(source='store.code', read_only=True)
    variant_sku = serializers.CharField(source='variant.sku', read_only=True)
    variant_barcode = serializers.CharField(source='variant.barcode', read_only=True)
    variant_size = serializers.CharField(source='variant.size', read_only=True)
    variant_color = serializers.CharField(source='variant.color', read_only=True)
    product_name = serializers.CharField(source='variant.product.name', read_only=True)

    class Meta:
        model = StoreInventory
        fields = [
            'id',
            'store',
            'store_name',
            'store_code',
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
