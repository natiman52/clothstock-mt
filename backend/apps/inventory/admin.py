from django.contrib import admin
from .models import (
    Store,
    Product,
    Variant,
    StoreInventory,
    ServerEvent,
    SyncEvent,
    StockLedgerEntry,
    Category,
    Sale,
    SaleItem
)


class VariantInline(admin.TabularInline):
    model = Variant
    extra = 1
    fields = ('sku', 'barcode', 'size', 'color', 'price', 'cost', 'is_active')


@admin.register(Store)
class StoreAdmin(admin.ModelAdmin):
    list_display = ('name', 'code', 'phone', 'is_active', 'created_at')
    list_filter = ('is_active',)
    search_fields = ('name', 'code', 'phone')


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ('name', 'style_code', 'category', 'is_active', 'created_at')
    list_filter = ('category', 'is_active')
    search_fields = ('name', 'style_code', 'description')
    inlines = [VariantInline]


@admin.register(Variant)
class VariantAdmin(admin.ModelAdmin):
    list_display = ('sku', 'product', 'size', 'color', 'price', 'cost', 'barcode', 'is_active')
    list_filter = ('is_active', 'size', 'color', 'product__category')
    search_fields = ('sku', 'barcode', 'product__name', 'product__style_code')
    autocomplete_fields = ('product',)


@admin.register(StoreInventory)
class StoreInventoryAdmin(admin.ModelAdmin):
    list_display = ('store', 'variant', 'get_product', 'quantity_on_hand', 'updated_at')
    list_filter = ('store', 'variant__product__category')
    search_fields = ('store__name', 'store__code', 'variant__sku', 'variant__barcode', 'variant__product__name')
    autocomplete_fields = ('store', 'variant')

    @admin.display(description='Product', ordering='variant__product__name')
    def get_product(self, obj):
        return obj.variant.product.name
@admin.register(Category)
class CatagoryAdmin(admin.ModelAdmin):
    list_display=("code","name",)

@admin.register(ServerEvent)
class ServerEventAdmin(admin.ModelAdmin):
    list_display = ('seq_id', 'get_store_code', 'event_type', 'created_at')
    list_filter = ('event_type', 'store')
    search_fields = ('event_type', 'store__name', 'store__code')
    readonly_fields = ('seq_id', 'created_at')

    @admin.display(description='Target Store', ordering='store__code')
    def get_store_code(self, obj):
        return obj.store.code if obj.store else 'GLOBAL'


@admin.register(SyncEvent)
class SyncEventAdmin(admin.ModelAdmin):
    list_display = ('event_id', 'store', 'event_type', 'status', 'processed_at', 'created_at')
    list_filter = ('status', 'event_type', 'store')
    search_fields = ('event_id', 'event_type', 'store__name', 'store__code')
    readonly_fields = ('event_id', 'created_at')


@admin.register(StockLedgerEntry)
class StockLedgerEntryAdmin(admin.ModelAdmin):
    list_display = (
        'timestamp',
        'store',
        'get_sku',
        'delta',
        'resulting_balance',
        'reason',
        'sync_source',
    )
    list_filter = ('reason', 'sync_source', 'store')
    search_fields = (
        'store__name',
        'store__code',
        'variant__sku',
        'variant__barcode',
        'notes',
    )
    readonly_fields = ('timestamp',)
    autocomplete_fields = ('store', 'variant', 'sync_event', 'server_event')

    @admin.display(description='SKU', ordering='variant__sku')
    def get_sku(self, obj):
        if hasattr(obj.variant,"sku"):
            sku = obj.variant.sku 
        else:
            sku = "xxx-xxx-xxxxx"
        return sku

@admin.register(Sale)
class SaleAdmin(admin.ModelAdmin):
    list_display=("sold_at",)

@admin.register(SaleItem)
class SaleItemAdmin(admin.ModelAdmin):
    list_display = ("sale",)