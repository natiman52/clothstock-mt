from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    CategoryViewSet,
    StoreViewSet,
    ProductViewSet,
    VariantViewSet,
    StoreInventoryViewSet,
    ServerEventViewSet,
    SyncEventViewSet,
    StockLedgerEntryViewSet,
    SaleViewSet,
    SaleItemViewSet,
    SyncPullView,
    SyncPushView,
    SyncBundleView,
    AnalyticsSummaryView,
)

app_name = 'inventory'

router = DefaultRouter()
router.register(r'categories',   CategoryViewSet,       basename='category')
router.register(r'stores',        StoreViewSet,          basename='store')
router.register(r'products',      ProductViewSet,        basename='product')
router.register(r'variants',      VariantViewSet,        basename='variant')
router.register(r'inventory',     StoreInventoryViewSet, basename='inventory')
router.register(r'server-events', ServerEventViewSet,    basename='server-event')
router.register(r'sync-events',   SyncEventViewSet,      basename='sync-event')
router.register(r'ledger',        StockLedgerEntryViewSet, basename='stock-ledger')
router.register(r'sales',         SaleViewSet,           basename='sale')
router.register(r'sale-items',    SaleItemViewSet,       basename='sale-item')

urlpatterns = [
    # Dedicated Analytics KPI Summary Endpoint
    path('analytics/summary/', AnalyticsSummaryView.as_view(), name='analytics-summary'),
    # Dedicated Synchronization Endpoints
    path('sync/pull/',   SyncPullView.as_view(),   name='sync-pull'),
    path('sync/push/',   SyncPushView.as_view(),   name='sync-push'),
    path('sync/bundle/', SyncBundleView.as_view(), name='sync-bundle'),
    # ViewSet routes
    path('', include(router.urls)),
]
